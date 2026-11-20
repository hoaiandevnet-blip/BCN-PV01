import { normalizeReportAlignment } from './daily-reports-document-format.mjs';
import { cleanReportText } from './daily-reports-report-text.mjs';

export const templates = {
  BANTIN_24H: { title: 'BẢN TIN 24H', recipient: 'Tổng hợp tình hình trong 24 giờ' },
  BCN_PV01: { title: 'BÁO CÁO', recipient: 'Kính gửi: Ban Giám đốc Công an thành phố', signature: 'PHÓ TRƯỞNG PHÒNG' },
  BCN_BCA: { title: 'BÁO CÁO', recipient: 'Kính gửi: Bộ Công an', signature: 'PHÓ GIÁM ĐỐC' },
  BCN_TUUB: { title: 'BÁO CÁO', recipient: 'Kính gửi: Thành ủy, Ủy ban nhân dân thành phố', signature: 'PHÓ GIÁM ĐỐC' }
};

export function documentDefaults(type) {
  const template = templates[type];
  return { number: '', classification: '', audience: template?.recipient || '',
    recipients: template?.signature ? `${template.recipient.replace(/^Kính gửi:\s*/u, '')};\nLưu: VT, PV01.` : '',
    advisory: '', steering: '', orders: '', duty: '', party: '', requests: '', conclusion: '' };
}

export function buildReportModel({ reportType, reportDay, reportNumber = '', documentFields = {}, items = [], signer }) {
  const template = templates[reportType];
  if (!template) throw new Error('Loại báo cáo không có mẫu.');
  const values = { ...documentDefaults(reportType), ...documentFields };
  const bulletin = reportType === 'BANTIN_24H';
  const pv = reportType === 'BCN_PV01';
  const [year, month, day] = reportDay.split('-');
  const chosen = items.filter(item => item.included !== false)
    .map((item, index) => ({ ...item, sort_index: item.sort_index ?? index }))
    .sort((first, second) => first.sort_index - second.sort_index);
  const content = item => cleanReportText(
    item.edited_text ?? item.text ?? item.narrative ?? item.summary ?? item.source_text ?? ''
  );
  const blocks = [];
  const heading = text => blocks.push({ kind: 'heading', text });
  const paragraph = text => blocks.push({ kind: 'paragraph', text: String(text || 'Không.') });
  const section = (text, list) => {
    heading(text);
    if (!list.length) paragraph('Không.');
    for (const item of list) for (const line of content(item).split('\n')) if (line.trim()) paragraph(line);
  };
  if (bulletin) {
    const categories = [
      ['ANQG', 'I. AN NINH'], ['PPHS', 'II. PHẠM PHÁP HÌNH SỰ'], ['TNXH', 'III. TỆ NẠN XÃ HỘI'],
      ['MA_TUY', 'IV. MA TÚY'], ['KINH_TE', 'V. KINH TẾ'], ['MOI_TRUONG', 'VI. MÔI TRƯỜNG'],
      ['PCCC_CNCH', 'VII. PCCC, CNCH'], ['TNGT', 'VIII. TAI NẠN GIAO THÔNG'],
      ['KHAC', 'IX. TIN BÁO / TÌNH HÌNH KHÁC']
    ];
    const known = new Set(categories.slice(0, -1).map(([key]) => key));
    for (const [code, label] of categories) {
      section(label, chosen.filter(item => code === 'KHAC' ? !known.has(item.business_code) : item.business_code === code));
    }
  } else {
    heading('1. TÌNH HÌNH, KẾT QUẢ CÔNG TÁC ĐẢM BẢO ANTT');
    section('1.1. Tình hình an ninh quốc gia', chosen.filter(item => item.business_code === 'ANQG'
      && item.section_code === 'NOI_DUNG'));
    section('1.2. Tình hình trật tự, an toàn xã hội', chosen.filter(item => item.section_code === 'NOI_DUNG'
      && item.business_code !== 'ANQG'));
    section('Tình hình khác', chosen.filter(item => item.section_code === 'TINH_HINH_KHAC'));
    heading('1.3. Kết quả công tác');
    heading('1.3.1. Công tác tham mưu, triển khai');
    paragraph('Tham mưu Thành ủy: ' + (values.advisory || 'Không.'));
    paragraph('Tham mưu UBND thành phố: ' + (values.steering || 'Không.'));
    paragraph('Văn bản, công tác chỉ đạo: ' + (values.orders || 'Không.'));
    section('1.3.2. Các mặt công tác khác', chosen.filter(item =>
      ['KET_QUA_CONG_TAC', 'CAC_MAT_CONG_TAC_KHAC'].includes(item.section_code)));
    if (pv) {
      heading('2. CÔNG TÁC TRỰC BAN CÔNG AN THÀNH PHỐ');
      paragraph(values.duty);
      for (const item of chosen.filter(item => item.section_code === 'CONG_TAC_TRUC_BAN')) paragraph(content(item));
    }
    heading(`${pv ? '3' : '2'}. CÔNG TÁC XÂY DỰNG ĐẢNG, XÂY DỰNG LỰC LƯỢNG`);
    paragraph(values.party);
    if (pv || values.requests || chosen.some(item => item.section_code === 'KIEN_NGHI')) {
      heading(`${pv ? '4' : '3'}. KIẾN NGHỊ, ĐỀ XUẤT`);
      paragraph(values.requests);
      for (const item of chosen.filter(item => item.section_code === 'KIEN_NGHI')) paragraph(content(item));
    }
    const handled = new Set(['NOI_DUNG', 'TINH_HINH_KHAC', 'KET_QUA_CONG_TAC', 'CAC_MAT_CONG_TAC_KHAC', 'KIEN_NGHI']);
    if (pv) handled.add('CONG_TAC_TRUC_BAN');
    for (const item of chosen.filter(item => !handled.has(item.section_code))) paragraph(content(item));
    paragraph(values.conclusion || 'Trên đây là tình hình, kết quả công tác trong ngày, kính báo cáo./.');
  }
  const title = String(signer?.title || template.signature || '').toLocaleUpperCase('vi');
  const delegation = /^PHÓ /u.test(title) ? pv ? 'KT. TRƯỞNG PHÒNG' : 'KT. GIÁM ĐỐC' : '';
  return { ...template, bulletin, pv, values, blocks, alignment: normalizeReportAlignment(values.alignment),
    issuer: pv ? 'CÔNG AN THÀNH PHỐ ĐỒNG NAI' : 'BỘ CÔNG AN',
    organization: pv ? 'PHÒNG THAM MƯU' : 'CÔNG AN THÀNH PHỐ ĐỒNG NAI',
    number: reportNumber || values.number || `…/BC-${pv ? 'PV01' : 'CATP-PV01'}`,
    dateText: `Đồng Nai, ngày ${day} tháng ${month} năm ${year}`,
    subtitle: bulletin ? `Ngày ${day}/${month}/${year}`
      : `${pv ? 'Tình hình, kết quả công tác Công an' : 'Tình hình'} ngày ${day}/${month}/${year}`,
    signerLines: [delegation, title].filter(Boolean),
    signerName: [signer?.rank_name, signer?.full_name].filter(Boolean).join(' ') };
}
