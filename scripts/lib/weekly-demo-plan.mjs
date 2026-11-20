import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { legalEntryOptions } from '../../server/daily-reports/legal-entry.js';

export const marker = 'BÁO CÁO THỬ — dữ liệu giả lập, không phải vụ việc hoặc danh tính thực tế.';
const definitions = [
  ['PPHS', ['173'], 'Tiếp nhận tin báo mất máy tính tại cửa hàng mô phỏng', '01 máy tính mô hình; 02 ảnh hiện trường thử'],
  ['PPHS', ['134'], 'Xác minh xô xát tại khu dân cư mô phỏng', '01 biên bản mô phỏng; 01 bản ghi lời trình bày thử'],
  ['PPHS', ['178'], 'Kiểm tra phản ánh tài sản bị hư hỏng tại kho mô phỏng', '03 ảnh tài sản mẫu; 01 phiếu định giá thử'],
  ['PPHS', ['168'], 'Tiếp nhận phản ánh chiếm đoạt tài sản tại điểm thử', '01 túi vật chứng mô hình; 01 bản tường trình thử'],
  ['PPHS', ['173', '178'], 'Xác minh vụ mất tài sản kèm hư hỏng cửa tại địa điểm thử', '01 khóa mô hình; 02 ảnh dữ liệu thử'],
  ['TNXH', ['321'], 'Kiểm tra tin báo tụ tập đánh bạc tại địa điểm mô phỏng', '01 bộ thẻ mẫu; tiền giấy mô hình'],
  ['TNXH', ['322'], 'Xác minh phản ánh tổ chức đánh bạc tại cơ sở mô phỏng', '01 sổ ghi chép mẫu; 01 điện thoại mô hình'],
  ['MA_TUY', ['249', '251'], 'Tiếp nhận hồ sơ nghi vấn chất cấm tại khu vực thử', '02 gói vật chứng rỗng có nhãn MÔ PHỎNG'],
  ['KINH_TE', ['188'], 'Kiểm tra lô hàng không có chứng từ tại kho mô phỏng', '05 kiện hàng mô hình; 01 bảng kê mẫu'],
  ['KINH_TE', ['190'], 'Xác minh hàng hóa nghi thuộc danh mục cấm tại cơ sở thử', '03 hộp hàng mẫu không có hàng thật'],
  ['KINH_TE', ['192'], 'Tiếp nhận phản ánh hàng giả tại cửa hàng mô phỏng', '04 bao bì mẫu; 01 hóa đơn giả lập'],
  ['MOI_TRUONG', ['235'], 'Kiểm tra phản ánh xả thải tại cơ sở sản xuất mô phỏng', '02 chai mẫu rỗng; 01 sơ đồ vị trí thử'],
  ['MOI_TRUONG', ['236'], 'Xác minh việc tập kết chất thải tại địa điểm thử', '03 ảnh mô phỏng; 01 bảng kê chất thải thử'],
  ['MOI_TRUONG', ['235'], 'Tiếp nhận phản ánh ô nhiễm nguồn nước tại khu vực mô phỏng', '01 báo cáo quan trắc giả lập'],
  ['ANQG', ['110'], 'Diễn tập tiếp nhận thông tin thuộc hệ an ninh quốc gia', '01 tài liệu hoàn toàn hư cấu, không chứa bí mật'],
  ['CONG_NGHE_CAO', ['289'], 'Ghi nhận truy cập không được phép vào hệ thống thử cô lập', '01 nhật ký sự kiện giả lập'],
  ['CONG_NGHE_CAO', ['290'], 'Tiếp nhận phản ánh giao dịch giả mạo trên hệ thống mô phỏng', '02 ảnh giao dịch thử; 01 mã giao dịch giả lập'],
  ['HOAT_DONG_TU_PHAP', ['380'], 'Rà soát phản ánh không chấp hành quyết định giả lập', '01 quyết định mẫu không có giá trị pháp lý'],
  ['HOAT_DONG_TU_PHAP', ['381'], 'Xác minh phản ánh cản trở thi hành án trong tình huống diễn tập', '01 biên bản diễn tập; 02 lời trình bày giả lập'],
  ['TINH_HINH_KHAC', [], 'Tiếp nhận thông tin bất thường và hỗ trợ người dân trong diễn tập', '01 phiếu tiếp nhận mô phỏng']
];
const forms = ['', 'Khởi tố', 'Xử lý hành chính', 'Không khởi tố', 'Tạm đình chỉ', 'Đình chỉ'];
const stages = ['Tiếp nhận vụ việc ban đầu', 'Giải quyết tin báo tố giác tội phạm', 'Giai đoạn điều tra'];
const stateFor = index => index < 10 ? 'VERIFIED' : index < 16 ? 'PENDING_REVIEW'
  : index < 18 ? 'RETURNED' : 'RESUBMITTED';

export async function buildWeeklyDemoPlan(pool) {
  const units = (await pool.query(`select u.username,t.id,t.name from users u join teams t on t.id=u.team_id
    where u.username=any($1::text[]) and not u.is_deleted and u.status='Hoạt động' order by u.username`,
  [Array.from({ length: 7 }, (_, index) => `demo.canbo0${index + 2}`)])).rows;
  assert.equal(units.length, 7);
  const provinces = JSON.parse(await readFile(new URL('../../assets/data/vietnam-provinces-wards.json',
    import.meta.url), 'utf8'));
  const province = provinces.find(item => item.name.includes('Đồng Nai'));
  const catalogue = new Map();
  for (const [domain] of definitions) {
    if (!catalogue.has(domain)) catalogue.set(domain, await legalEntryOptions(pool, '2026-11-10', domain));
  }
  const records = [];
  for (const [dayIndex, count] of [5, 8, 6, 10, 7, 9, 20].entries()) {
    const day = `2026-11-${String(dayIndex + 4).padStart(2, '0')}`;
    for (let index = 0; index < count; index += 1) {
      // Yesterday includes three drug cases and two social-vice cases to exercise decrease and flat comparisons.
      const scenarioIndex = dayIndex === 6 ? index : dayIndex === 5
        ? [7, 7, 7, 0, 5, 6, 8, 11, 19][index] : (dayIndex * 4 + index * 3) % definitions.length;
      const [business, articles, narrative, evidence] = definitions[scenarioIndex];
      const unit = units[(dayIndex + index) % (dayIndex === 6 ? 5 : 7)];
      const ward = province.wards.find(item => item.name === unit.name);
      assert.ok(ward, `Ward exists: ${unit.name}`);
      const ordinal = records.length + 1;
      const label = `THU-TUAN-${day.replaceAll('-', '')}-${String(index + 1).padStart(2, '0')}`;
      const address = `Điểm diễn tập ${label}, ${ward.name}, ${province.name}`;
      const countSubjects = scenarioIndex === 19 ? 0 : index % 3 + 1;
      const subjects = Array.from({ length: countSubjects }, (_, personIndex) => ({
        name: `Người giả lập ${label}-${personIndex + 1}`,
        gender: ['MALE', 'FEMALE', 'OTHER'][personIndex % 3],
        birth_year: 1988 + ordinal % 12,
        birth_month: ordinal % 12 + 1,
        birth_day: ordinal % 27 + 1,
        identity_number: `0000${String(ordinal).padStart(5, '0')}${String(personIndex + 1).padStart(3, '0')}`,
        permanent_address: address,
        current_address: address,
        permanent_detail: `Nhà mô phỏng ${label}`, permanent_ward: ward.name, permanent_province: province.name,
        current_detail: `Nơi ở thử ${label}`, current_ward: ward.name, current_province: province.name
      }));
      const form = forms[index % forms.length];
      const hour = String(1 + index % 7).padStart(2, '0');
      const caseTypes = articles.map(code => {
        const article = catalogue.get(business).find(item => item.article_code === code);
        assert.ok(article, `${business}: article ${code}`);
        return { key: article.source_kind === 'REFERENCE' ? `reference:${article.reference_id}`
          : `published:${article.id}` };
      });
      records.push({ label, username: unit.username, unit: unit.name,
        scenario: dayIndex === 6 ? stateFor(index) : index % 4 === 0 ? 'PENDING_REVIEW' : 'VERIFIED',
        supplement: dayIndex === 6 && index === 1,
        payload: {
          id: randomUUID(), unit_id: String(unit.id), report_day: day, business_code: business,
          title: `[BÁO CÁO THỬ] ${narrative}`,
          summary: `${marker}\nMã tình huống: ${label}. ${narrative}. `
            + `Ghi nhận ${countSubjects} người giả lập; thời gian, tài sản và tài liệu đều dùng cho kiểm thử.`,
          occurred_at: `${day}T${hour}:10:00+07:00`,
          location_address: { province_code: province.code, ward_code: ward.code,
            detail: `Điểm diễn tập ${label} (địa điểm giả lập)` },
          reference_info: {
            subjects: subjects.map(person => person.name), subject_details: subjects, case_types: caseTypes,
            incident_status: stages[index % stages.length], category_group: 'Tình huống kiểm thử nghiệp vụ',
            workflow: 'Tiếp nhận → xác minh → cập nhật → tổng hợp (mô phỏng)',
            nature: ['Ít nghiêm trọng', 'Nghiêm trọng', 'Rất nghiêm trọng'][index % 3],
            recorded_at: `${day}T${hour}:20:00+07:00`,
            ended_at: form ? `${day}T09:00:00+07:00` : null,
            handling_unit_id: Number(unit.id), subordinate_unit_id: null,
            details: `${marker}\n${label}: ${narrative}. Đã lập biên bản tiếp nhận giả lập, `
              + 'đối chiếu lời trình bày mẫu, kiểm tra tài liệu thử và lập hồ sơ chuyển bộ phận tổng hợp. '
              + 'Tất cả thông tin con người, căn cước, địa chỉ chi tiết và tang vật đều hư cấu. '
              + (countSubjects ? 'Thông tin từng người được ghi tại danh sách đối tượng.' : 'Chưa xác định đối tượng.'),
            death_count: scenarioIndex === 3 ? 1 : 0,
            injured_count: scenarioIndex === 1 ? 2 : 0,
            property_damage: ['PPHS', 'KINH_TE', 'CONG_NGHE_CAO'].includes(business) ? (index + 1) * 1500000 : 0,
            evidence: `${evidence}. Mã quản lý thử ${label}; không có tang vật thực tế.`,
            handling_result: form ? 'Đã giải quyết' : 'Đang giải quyết',
            vehicles: index % 2 ? [`BS-THU-${label}`] : [],
            related_vehicles: index % 2 ? ['01 phương tiện mô hình dùng diễn tập'] : [],
            victims: ['PPHS', 'CONG_NGHE_CAO'].includes(business) ? [`Người bị hại giả lập ${label}`] : [],
            handling_details: {
              form, prosecution_decision_number: form && form !== 'Xử lý hành chính' ? `QD-THU-${label}` : '',
              prosecution_date: form ? day : '',
              prosecution_authority: form ? `${unit.name} — cơ quan mô phỏng, không có giá trị pháp lý` : '',
              resolution: form ? `${form} trong kịch bản kiểm thử ${label}; không phải quyết định thực tế.` : '',
              reason: form ? 'Kết quả giả lập dùng kiểm tra hiển thị và tổng hợp, không kết luận về người thật.' : '',
              detail: form === 'Xử lý hành chính' ? 'Phạt tiền và lập biên bản mô phỏng; số liệu dùng kiểm thử.' : '',
              fine_million: form === 'Xử lý hành chính' ? String((index + 1) * 0.5) : ''
            }
          }, attachments: []
        }
      });
    }
  }
  assert.equal(records.length, 65);
  assert.equal(records.filter(item => item.payload.report_day === '2026-11-10').length, 20);
  return { marker, from: '2026-11-04', to: '2026-11-10', records };
}
