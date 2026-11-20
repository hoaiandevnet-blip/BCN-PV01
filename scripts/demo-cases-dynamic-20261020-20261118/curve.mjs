import { scenarioList } from './scenarios.mjs';

const handlingForms = ['Khởi tố', 'Xử lý hành chính', 'Đang giải quyết', 'Không khởi tố', 'Tạm đình chỉ'];

export function getDomainWeights(dayIndex) {
  // 30 days divided into 4 weekly phases:
  // Week 1 (days 0-6: 20/10 - 26/10): PPHS & TNXH surge
  if (dayIndex <= 6) {
    return [
      { domain: 'PPHS', weight: 45 },
      { domain: 'TNXH', weight: 25 },
      { domain: 'MA_TUY', weight: 15 },
      { domain: 'KINH_TE', weight: 5 },
      { domain: 'CONG_NGHE_CAO', weight: 5 },
      { domain: 'TINH_HINH_KHAC', weight: 5 }
    ];
  }
  // Week 2 (days 7-13: 27/10 - 02/11): Drug crackdown campaign (MA_TUY surge)
  if (dayIndex <= 13) {
    return [
      { domain: 'MA_TUY', weight: 45 },
      { domain: 'PPHS', weight: 20 },
      { domain: 'CONG_NGHE_CAO', weight: 15 },
      { domain: 'TNXH', weight: 10 },
      { domain: 'MOI_TRUONG', weight: 5 },
      { domain: 'HOAT_DONG_TU_PHAP', weight: 5 }
    ];
  }
  // Week 3 (days 14-20: 03/11 - 09/11): Economic & Environment inspection campaign
  if (dayIndex <= 20) {
    return [
      { domain: 'KINH_TE', weight: 35 },
      { domain: 'MOI_TRUONG', weight: 25 },
      { domain: 'PPHS', weight: 20 },
      { domain: 'MA_TUY', weight: 10 },
      { domain: 'TNXH', weight: 5 },
      { domain: 'TINH_HINH_KHAC', weight: 5 }
    ];
  }
  // Week 4 (days 21-29: 10/11 - 18/11): Cybercrime, Judicial & General crimes
  return [
    { domain: 'CONG_NGHE_CAO', weight: 30 },
    { domain: 'PPHS', weight: 25 },
    { domain: 'HOAT_DONG_TU_PHAP', weight: 20 },
    { domain: 'MA_TUY', weight: 15 },
    { domain: 'KINH_TE', weight: 5 },
    { domain: 'TINH_HINH_KHAC', weight: 5 }
  ];
}

export function pickDomain(dayIndex, seed) {
  const weights = getDomainWeights(dayIndex);
  const total = weights.reduce((sum, item) => sum + item.weight, 0);
  let threshold = (seed * 37 + dayIndex * 13) % total;
  for (const item of weights) {
    threshold -= item.weight;
    if (threshold <= 0) return item.domain;
  }
  return weights[0].domain;
}

export function pickScenario(domain, seed) {
  const matches = scenarioList.filter(item => item.domain === domain);
  if (!matches.length) return scenarioList[seed % scenarioList.length];
  return matches[seed % matches.length];
}

export function pickTimeOfDay(seed) {
  const slots = [
    { hour: '01', min: '25' },
    { hour: '03', min: '40' },
    { hour: '06', min: '15' },
    { hour: '08', min: '30' },
    { hour: '11', min: '20' },
    { hour: '14', min: '45' },
    { hour: '17', min: '35' },
    { hour: '19', min: '50' },
    { hour: '21', min: '10' },
    { hour: '23', min: '05' }
  ];
  return slots[seed % slots.length];
}

export function pickHandlingForm(seed) {
  const roll = seed % 100;
  if (roll < 45) return 'Khởi tố';
  if (roll < 75) return 'Xử lý hành chính';
  if (roll < 90) return 'Đang giải quyết';
  if (roll < 95) return 'Không khởi tố';
  return 'Tạm đình chỉ';
}

export function buildHandlingDetails({ form, label, unitName, day, seed }) {
  if (form === 'Đang giải quyết') {
    return {
      handling_result: 'Đang giải quyết',
      handling_details: undefined
    };
  }

  const fines = ['1.5', '2.5', '5.0', '7.5', '12.5', '20.0'];
  const fine = form === 'Xử lý hành chính' ? fines[seed % fines.length] : '';

  return {
    handling_result: 'Đã giải quyết',
    handling_details: {
      form,
      resolution: `${form} trong kịch bản kiểm thử ${label}; không phải quyết định thực tế.`,
      reason: 'Kết quả giả lập dùng kiểm tra hiển thị và tổng hợp, không kết luận về người thật.',
      prosecution_authority: `${unitName} — cơ quan mô phỏng, không có giá trị pháp lý`,
      prosecution_decision_number: `QD-THU-${label}`,
      prosecution_date: day,
      fine_million: fine
    }
  };
}

export function pickState(dayIndex, seed) {
  // Recent days (Nov 17, 18): more PENDING_REVIEW & some RETURNED for testing UI
  if (dayIndex >= 28) {
    const roll = seed % 10;
    if (roll < 5) return 'PENDING_REVIEW';
    if (roll < 7) return 'RETURNED';
    return 'VERIFIED';
  }
  // Earlier days: mostly VERIFIED, with a few PENDING_REVIEW and RETURNED
  const roll = seed % 100;
  if (roll < 80) return 'VERIFIED';
  if (roll < 92) return 'PENDING_REVIEW';
  return 'RETURNED';
}
