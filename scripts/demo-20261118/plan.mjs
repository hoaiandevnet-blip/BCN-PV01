import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const day = '2026-11-18';
export const marker = 'BÁO CÁO THỬ — dữ liệu giả lập, không phải vụ việc hoặc danh tính thực tế.';
export const compiler = 'ttttch.pv01';

export async function buildPlan({ local, pool }) {
  const previous = JSON.parse(await readFile(new URL('../../outputs/demo-reports-20261117/plan.json',
    import.meta.url), 'utf8'));
  const directory = JSON.parse(await readFile(new URL('../../assets/data/vietnam-provinces-wards.json',
    import.meta.url), 'utf8'));
  assert.equal(previous.report_day, '2026-11-17');
  assert.equal(previous.cases.length, 20);
  const dashboard = await local.request(compiler, `/dashboard?day=${day}&span=1`);
  const units = dashboard.units.filter(unit => unit.expected && unit.group === 'XA_PHUONG');
  assert.equal(units.length, 7, 'Reporting assignments changed; review the unit list first');
  for (const unit of units) {
    const accounts = await pool.query(`select distinct u.username from users u
      join daily_report_user_roles r on r.user_id=u.id and r.unit_id=u.team_id
      where u.team_id=$1 and not u.is_deleted and u.status='Hoạt động'
        and r.role_code='UNIT_REPORTER'
        and (r.effective_from is null or r.effective_from<=$2)
        and (r.effective_to is null or r.effective_to>=$2)
      order by u.username`, [unit.id, day]);
    assert.equal(accounts.rowCount, 1, `Expected one assigned reporter for ${unit.name}`);
    unit.username = accounts.rows[0].username;
  }
  const province = directory.find(item => Number(item.code) === 75);
  assert.ok(province);
  const cases = Array.from({ length: units.length * 4 }, (_, index) => {
    const unit = units[index % units.length];
    const source = previous.cases[index % previous.cases.length];
    const label = `THU-NGAY-20261118-${String(index + 1).padStart(2, '0')}`;
    const payload = JSON.parse(JSON.stringify(source.payload)
      .replaceAll(source.label, label)
      .replaceAll(source.unit, unit.name)
      .replaceAll('2026-11-17', day)
      .replaceAll('17/11/2026', '18/11/2026'));
    const ward = province.wards.find(item => item.name === unit.name);
    assert.ok(ward, `Missing ward directory entry for ${unit.name}`);
    payload.id = randomUUID();
    payload.unit_id = unit.id;
    payload.report_day = day;
    const timestamp = seconds => `${day}T00:${String(Math.floor(seconds / 60)).padStart(2, '0')}`
      + `:${String(seconds % 60).padStart(2, '0')}+07:00`;
    payload.occurred_at = timestamp(index * 10);
    payload.reference_info.recorded_at = timestamp(index * 10 + 30);
    if (payload.reference_info.ended_at) {
      payload.reference_info.ended_at = `${day}T00:06:00+07:00`;
    }
    payload.location_address.province_code = province.code;
    payload.location_address.ward_code = ward.code;
    payload.reference_info.handling_unit_id = Number(unit.id);
    payload.reference_info.subordinate_unit_id = null;
    for (const [personIndex, person] of payload.reference_info.subject_details.entries()) {
      person.identity_number = `000018${String(index + 1).padStart(3, '0')}`
        + String(personIndex + 1).padStart(3, '0');
    }
    assert.ok(payload.summary.includes(marker));
    assert.ok(payload.reference_info.details.includes(marker));
    assert.doesNotMatch(JSON.stringify(payload), /2026-11-17|20261117|17\/11\/2026/);
    assert.ok(new Date(payload.reference_info.recorded_at).getTime() < Date.now());
    return { label, username: unit.username, unit: unit.name, payload };
  });
  assert.equal(new Set(cases.map(item => item.payload.business_code)).size, 9);
  return { report_day: day, marker, compiler, units, cases };
}
