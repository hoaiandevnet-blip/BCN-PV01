import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { comparisonWindow, readMapReports } from './digital-map-reports.js';

const boundaryFile = process.env.DIGITAL_MAP_BOUNDARY_FILE
  ? resolve(process.env.DIGITAL_MAP_BOUNDARY_FILE)
  : new URL('../assets/geo/dong-nai-wards.geojson', import.meta.url);
let wardIndexCache;

export function normalizeDigitalMapText(value) {
  return String(value ?? '').trim().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/\s+/g, ' ');
}

function normalizeDigitalMapExactName(value) {
  return String(value ?? '').trim().toLocaleLowerCase('vi-VN').replace(/\s+/g, ' ');
}

function normalizeDigitalMapWardExactName(value) {
  return normalizeDigitalMapExactName(value)
    .replace(/^(phường|xã|thị trấn|thị xã)\s+/i, '')
    .trim();
}

function normalizeDigitalMapWardName(value) {
  return normalizeDigitalMapText(value)
    .replace(/^(phuong|xa|thi tran|thi xa)\s+/, '')
    .trim();
}

export function getDigitalMapBoundaries() {
  const geojson = JSON.parse(readFileSync(boundaryFile, 'utf8'));
  if (!Array.isArray(geojson.features) || geojson.features.length !== 95) {
    throw new Error('Dữ liệu ranh giới chưa đủ 95 phường/xã Đồng Nai');
  }
  return geojson;
}

export function getDigitalMapWardIndex() {
  if (wardIndexCache) return wardIndexCache;
  const geojson = getDigitalMapBoundaries();
  const byCode = new Map();
  const byName = new Map();
  const byExactName = new Map();
  for (const feature of geojson.features || []) {
    const code = String(feature.properties?.code || '').trim();
    const name = String(feature.properties?.name || '').trim();
    if (!/^r\d+$/.test(code) || !name || byCode.has(code)) throw new Error('Dữ liệu ranh giới phường/xã không hợp lệ');
    const ward = { code, name };
    byCode.set(code, ward);
    const exactNameKey = normalizeDigitalMapExactName(name);
    if (!byExactName.has(exactNameKey)) byExactName.set(exactNameKey, []);
    byExactName.get(exactNameKey).push(ward);
    const looseExactNameKey = normalizeDigitalMapWardExactName(name);
    if (!byExactName.has(looseExactNameKey)) byExactName.set(looseExactNameKey, []);
    if (!byExactName.get(looseExactNameKey).some(item => item.code === ward.code)) byExactName.get(looseExactNameKey).push(ward);
    const nameKey = normalizeDigitalMapText(name);
    if (!byName.has(nameKey)) byName.set(nameKey, []);
    byName.get(nameKey).push(ward);
    const looseNameKey = normalizeDigitalMapWardName(name);
    if (!byName.has(looseNameKey)) byName.set(looseNameKey, []);
    if (!byName.get(looseNameKey).some(item => item.code === ward.code)) byName.get(looseNameKey).push(ward);
  }
  if (byCode.size !== 95) throw new Error('Thiếu ranh giới phường/xã Đồng Nai');
  wardIndexCache = { byCode, byName, byExactName };
  return wardIndexCache;
}

function isoDate(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw ? null : raw;
}

function countValue(value, label, nullable = false) {
  if (value === null || value === undefined || String(value).trim() === '') {
    if (nullable) return null;
    throw new Error(`${label} là bắt buộc`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 10000000) {
    throw new Error(`${label} phải là số nguyên từ 0 đến 10.000.000`);
  }
  return number;
}

export function validateDigitalMapRows(input, wardIndex = getDigitalMapWardIndex()) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 5000) {
    return { rows: [], errors: [{ row: 0, error: 'File cần có từ 1 đến 5.000 dòng dữ liệu' }] };
  }
  const rows = [], errors = [], seen = new Set();
  input.forEach((raw, index) => {
    try {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Dòng dữ liệu không hợp lệ');
      const code = String(raw.wardCode ?? '').trim();
      const givenName = String(raw.wardName ?? '').trim();
      let ward = code ? wardIndex.byCode.get(code) : null;
      if (code && !ward) throw new Error(`Mã khu vực ${code} không thuộc 95 phường/xã Đồng Nai`);
      if (!ward && givenName) {
        const exactNameMatches = wardIndex.byExactName?.get(normalizeDigitalMapExactName(givenName))
          || wardIndex.byExactName?.get(normalizeDigitalMapWardExactName(givenName))
          || [];
        const matches = exactNameMatches.length ? exactNameMatches : (wardIndex.byName.get(normalizeDigitalMapText(givenName))
          || wardIndex.byName.get(normalizeDigitalMapWardName(givenName))
          || []);
        if (matches.length !== 1) throw new Error(`Tên khu vực ${givenName} không khớp duy nhất`);
        ward = matches[0];
      }
      if (!ward) throw new Error('Thiếu mã hoặc tên phường/xã');
      if (givenName
        && normalizeDigitalMapText(givenName) !== normalizeDigitalMapText(ward.name)
        && normalizeDigitalMapWardName(givenName) !== normalizeDigitalMapWardName(ward.name)) {
        throw new Error(`Tên khu vực không khớp mã ${ward.code} (${ward.name})`);
      }
      const reportDate = isoDate(raw.reportDate);
      if (!reportDate) throw new Error('Ngày báo cáo không hợp lệ, cần YYYY-MM-DD');
      const category = String(raw.category ?? '').trim() || 'Chưa phân loại';
      const severity = String(raw.severity ?? '').trim() || 'Chưa cập nhật';
      const metricType = ['case', 'subject', 'vehicle'].includes(String(raw.metricType || '').trim())
        ? String(raw.metricType).trim() : 'case';
      const note = String(raw.note ?? '').trim();
      if (category.length > 120 || severity.length > 120 || note.length > 500) {
        throw new Error('Loại vụ việc, tính chất hoặc ghi chú quá dài');
      }
      const key = [reportDate, ward.code, normalizeDigitalMapText(category), normalizeDigitalMapText(severity)].join('|');
      if (seen.has(key)) throw new Error('Trùng phường/xã, ngày, loại vụ việc và tính chất trong file');
      seen.add(key);
      rows.push({
        reportDate, wardCode: ward.code, wardName: ward.name,
        category, categoryKey: normalizeDigitalMapText(category),
        severity, severityKey: normalizeDigitalMapText(severity),
        metricType,
        caseCount: countValue(raw.caseCount, 'Số vụ việc'),
        subjectCount: countValue(raw.subjectCount, 'Số đối tượng', true),
        vehicleCount: countValue(raw.vehicleCount, 'Số phương tiện', true), note
      });
    } catch (error) {
      errors.push({ row: Number.isSafeInteger(raw?.excelRow) && raw.excelRow >= 2 && raw.excelRow <= 100000 ? raw.excelRow : index + 2, error: error.message });
    }
  });
  return { rows, errors };
}

function safePeriodKey(value) {
  const key = String(value ?? '').trim();
  return /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(key) ? key : null;
}

function periodValue(value, label) {
  const parsed = isoDate(value);
  if (!parsed) throw new Error(`${label} không hợp lệ, cần YYYY-MM-DD`);
  return parsed;
}

function readPeriod(input, rows) {
  const source = input && typeof input === 'object' ? input : {};
  const dates = rows.map(row => row.reportDate).filter(Boolean).sort();
  const periodFrom = periodValue(source.from || dates[0], 'Ngày bắt đầu kỳ');
  const periodTo = periodValue(source.to || dates.at(-1), 'Ngày kết thúc kỳ');
  if (periodFrom > periodTo) throw new Error('Ngày bắt đầu kỳ phải trước ngày kết thúc kỳ');
  const key = safePeriodKey(source.key) || `period-${periodTo.replaceAll('-', '')}`;
  const label = String(source.label || '').trim() || `Kỳ dữ liệu đến ${periodTo}`;
  if (label.length > 160) throw new Error('Tên kỳ dữ liệu quá dài');
  return { key, label, from: periodFrom, to: periodTo, isDemo: Boolean(source.isDemo) };
}

export function registerDigitalMapRoutes(app, { pool, asyncHandler, getActor, logActivity }) {
  app.get('/api/digital-map/reports', asyncHandler(async (req, res) => {
    const period = comparisonWindow(req.query);
    if (!period) return res.status(422).json({ error: 'Khoảng ngày báo cáo không hợp lệ.' });
    res.set('Cache-Control', 'no-store');
    res.json(await readMapReports(pool, period, getDigitalMapWardIndex()));
  }));
  app.get('/api/digital-map/boundaries', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=86400');
    res.json(getDigitalMapBoundaries());
  });
  app.get('/api/digital-map/periods', asyncHandler(async (req, res) => {
    const result = await pool.query(`
      select period_key, label, to_char(period_from, 'YYYY-MM-DD') as period_from,
        to_char(period_to, 'YYYY-MM-DD') as period_to, is_demo, source_file,
        updated_at
      from digital_map_periods
      order by period_to desc, label
    `);
    res.set('Cache-Control', 'no-store');
    res.json({ periods: result.rows });
  }));

  app.get('/api/digital-map/rows', asyncHandler(async (req, res) => {
    const from = req.query.from ? isoDate(req.query.from) : null;
    const to = req.query.to ? isoDate(req.query.to) : null;
    const period = req.query.period ? safePeriodKey(req.query.period) : null;
    if ((req.query.from && !from) || (req.query.to && !to) || (from && to && from > to)) {
      return res.status(400).json({ error: 'Khoảng ngày báo cáo không hợp lệ' });
    }
    if (req.query.period && !period) return res.status(400).json({ error: 'Kỳ dữ liệu không hợp lệ' });
    const result = await pool.query(`
      select to_char(c.report_date, 'YYYY-MM-DD') as report_date,
        coalesce(c.period_key, 'legacy-' || to_char(c.report_date, 'YYYYMMDD')) as period_key,
        p.label as period_label, c.ward_code, c.ward_name, c.category, c.severity, c.metric_type,
        c.case_count, c.subject_count, c.vehicle_count, c.note, c.updated_at
      from digital_map_cases c
      left join digital_map_periods p on p.period_key = c.period_key
      where ($1::date is null or c.report_date >= $1::date)
        and ($2::date is null or c.report_date <= $2::date)
        and ($3::text is null or c.period_key = $3::text)
      order by c.report_date desc, c.ward_name, c.category, c.severity
    `, [from, to, period]);
    res.set('Cache-Control', 'no-store');
    res.json({ rows: result.rows, wardCount: getDigitalMapWardIndex().byCode.size });
  }));

  app.post('/api/digital-map/import', asyncHandler(async (req, res) => {
    if (!req.cameraUser) return res.status(403).json({ error: 'Chỉ Admin được nhập dữ liệu Bản đồ số' });
    const filename = String(req.body?.filename ?? '').trim();
    if (!filename || filename.length > 180 || /[\\/:\0]/.test(filename)) {
      return res.status(400).json({ error: 'Tên file Excel không hợp lệ' });
    }
    const checked = validateDigitalMapRows(req.body?.rows);
    if (checked.errors.length) {
      return res.status(422).json({ error: 'File có dữ liệu chưa hợp lệ', details: checked.errors.slice(0, 50) });
    }
    let period;
    try {
      period = readPeriod(req.body?.period, checked.rows);
    } catch (error) {
      return res.status(422).json({ error: error.message });
    }
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`
        insert into digital_map_periods (period_key, label, period_from, period_to, is_demo, source_file)
        values ($1,$2,$3,$4,$5,$6)
        on conflict (period_key) do update set label=excluded.label,
          period_from=excluded.period_from, period_to=excluded.period_to,
          is_demo=excluded.is_demo, source_file=excluded.source_file, updated_at=now()
      `, [period.key, period.label, period.from, period.to, period.isDemo, filename]);
      for (const row of checked.rows) {
        await client.query(`
          insert into digital_map_cases (
            report_date, period_key, period_from, period_to, metric_type,
            ward_code, ward_name, category, category_key,
            severity, severity_key, case_count, subject_count,
            vehicle_count, note, source_file
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
          on conflict (report_date, ward_code, category_key, severity_key)
          do update set ward_name=excluded.ward_name, category=excluded.category,
            period_key=excluded.period_key, period_from=excluded.period_from,
            period_to=excluded.period_to, metric_type=excluded.metric_type,
            severity=excluded.severity, case_count=excluded.case_count,
            subject_count=excluded.subject_count, vehicle_count=excluded.vehicle_count,
            note=excluded.note, source_file=excluded.source_file, updated_at=now()
        `, [period.to, period.key, period.from, period.to, row.metricType,
          row.wardCode, row.wardName, row.category, row.categoryKey,
          row.severity, row.severityKey, row.caseCount, row.subjectCount,
          row.vehicleCount, row.note, filename]);
      }
      await logActivity(req, {
        action: 'Nhập dữ liệu Bản đồ số', moduleKey: 'digitalMap', moduleName: 'Bản đồ số',
        detail: `Nhập ${checked.rows.length} dòng từ ${filename}`,
        metadata: { filename, rows: checked.rows.length, period }
      }, client);
      await client.query('commit');
      res.json({ ok: true, imported: checked.rows.length, period });
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }));
}
