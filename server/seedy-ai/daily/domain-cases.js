import { normalizeQuestion } from '../questions/date.js';

export const domainKeywords = [
  { code: 'PPHS', label: 'Phạm pháp hình sự', regex: /\b(pham phap hinh su|pphs|hinh su|ttxh|trat tu xa hoi)\b/ },
  { code: 'MA_TUY', label: 'Ma túy', regex: /\b(ma tuy|chat cam|heroin|can sa|ma tuy tong hop)\b/ },
  { code: 'CONG_NGHE_CAO', label: 'Công nghệ cao', regex: /\b(cong nghe cao|lua dao qua mang|mang xa hoi|an ninh mang)\b/ },
  { code: 'KINH_TE', label: 'Kinh tế, chức vụ', regex: /\b(kinh te|chuc vu|tham nhung|buon lau|hang gia|khoang san|hoa don)\b/ },
  { code: 'MOI_TRUONG', label: 'Môi trường', regex: /\b(moi truong|xa thai|o nhiem|chat thai|pha rung|khoang san trai phep)\b/ },
  { code: 'TNXH', label: 'Tệ nạn xã hội', regex: /\b(te nan xa hoi|tnxh|so de|danh bac|co bac|mai dam)\b/ },
  { code: 'ANQG', label: 'An ninh quốc gia', regex: /\b(an ninh quoc gia|anqg|chong pha|phan dong)\b/ },
  { code: 'HOAT_DONG_TU_PHAP', label: 'Hoạt động tư pháp', regex: /\b(hoat dong tu phap|tu phap|thi hanh an)\b/ }
];

export const stateKeywords = [
  { state: 'RETURNED', label: 'bị trả lại (cần bổ sung)', regex: /\b(tra lai|tra ve|bi tra|can bo sung)\b/ },
  { state: 'PENDING_REVIEW', label: 'chờ duyệt', regex: /\b(cho duyet|chua duyet)\b/ },
  { state: 'VERIFIED', label: 'đã duyệt', regex: /\b(da duyet|duoc duyet|da tham dinh)\b/ }
];

export function resolveDomain(query) {
  const normalized = normalizeQuestion(query);
  for (const item of domainKeywords) {
    if (item.regex.test(normalized)) return item;
  }
  return null;
}

export function resolveState(query) {
  const normalized = normalizeQuestion(query);
  for (const item of stateKeywords) {
    if (item.regex.test(normalized)) return item;
  }
  return null;
}

const stateLabels = {
  VERIFIED: 'đã duyệt',
  PENDING_REVIEW: 'chờ duyệt',
  SUBMITTED: 'chờ duyệt',
  RETURNED: 'bị trả lại',
  DRAFT: 'bản nháp'
};

export async function executeDomainCasesTool({ query, period, memory, read, sources }) {
  const explicitDomain = resolveDomain(query);
  const explicitState = resolveState(query);
  const rememberedDomain = memory?.kind === 'cases' || memory?.kind === 'domain_cases' ? memory.domain : null;
  const rememberedState = memory?.kind === 'cases' || memory?.kind === 'domain_cases' ? memory.state : null;

  const targetDomain = explicitDomain
    || (explicitState ? null : domainKeywords.find(item => item.code === rememberedDomain))
    || null;
  const targetState = explicitState
    || (explicitDomain ? null : stateKeywords.find(item => item.state === rememberedState))
    || null;

  const domainCode = targetDomain?.code || null;
  const domainLabel = targetDomain?.label || null;
  const stateCode = targetState?.state || null;
  const stateLabel = targetState?.label || null;

  const params = { from_day: period.from, to_day: period.to };
  if (domainCode) params.business_code = domainCode;
  if (stateCode) params.state = stateCode;

  const data = await read('cases', params);
  const cases = data?.cases || [];
  const dashboard = await read('dashboard', { day: period.to, span: '1' }).catch(() => null);
  const allUnits = dashboard?.units?.filter(u => u.expected) || [];

  const dateLabel = period.from === period.to
    ? `Ngày ${period.to.split('-').reverse().join('/')}`
    : `Từ ngày ${period.from.split('-').reverse().join('/')} đến ${period.to.split('-').reverse().join('/')}`;

  const topicName = domainLabel ? `hệ ${domainLabel}` : 'các hệ nghiệp vụ';
  const filterDesc = stateLabel ? `trạng thái ${stateLabel}` : topicName;

  if (!cases.length) {
    let emptyMsg = `${dateLabel}, trong phạm vi tài khoản của bạn: không có vụ việc nào`;
    if (stateCode === 'RETURNED') {
      emptyMsg = `${dateLabel}, trong phạm vi tài khoản của bạn: không có đơn vị nào có vụ việc bị trả lại `
        + `(tất cả các đơn vị đều không có nội dung cần bổ sung).`;
    } else if (stateLabel) {
      emptyMsg = `${dateLabel}, trong phạm vi tài khoản của bạn: không có vụ việc nào ở trạng thái ${stateLabel}.`;
    } else if (domainLabel) {
      emptyMsg = `${dateLabel}, trong phạm vi tài khoản của bạn: không có đơn vị nào ghi nhận vụ việc thuộc hệ ${domainLabel}.`;
    }
    return {
      text: emptyMsg,
      sources: sources(`Vụ việc · ${dateLabel}`),
      memory: { kind: 'cases', ids: [], domain: domainCode, state: stateCode, date: period.to }
    };
  }

  const byUnit = new Map();
  for (const item of cases) {
    const unitName = item.unit_name || 'Đơn vị không xác định';
    if (!byUnit.has(unitName)) byUnit.set(unitName, []);
    let reason = null;
    if (item.current_state === 'RETURNED') {
      try {
        const detail = await read('cases/' + item.id, {});
        const rawReason = detail?.returns?.at(-1)?.reason || '';
        reason = rawReason.replace(/^BÁO CÁO THỬ[^\n.]*[\n.]+\s*/, '').trim() || rawReason;
      } catch {}
    }
    byUnit.get(unitName).push({ ...item, returnReason: reason });
  }

  const lines = [];
  if (stateCode === 'RETURNED') {
    lines.push(
      `${dateLabel}, trong phạm vi tài khoản của bạn: có ${byUnit.size} đơn vị có vụ việc bị trả lại (cần bổ sung):`,
      ''
    );
    for (const [unitName, unitCases] of byUnit.entries()) {
      lines.push(`• ${unitName} (${unitCases.length} vụ):`);
      for (const c of unitCases) {
        lines.push(`  - ${c.title || c.stable_code} — bị trả lại`);
        if (c.returnReason) lines.push(`    Lý do trả lại: ${c.returnReason}`);
      }
    }
    const otherUnits = allUnits.filter(u => !byUnit.has(u.name)).map(u => u.name);
    if (otherUnits.length) {
      lines.push('', `Các đơn vị còn lại (${otherUnits.length} đơn vị: ${otherUnits.join(', ')}) không có vụ việc bị trả lại.`);
    }
  } else {
    lines.push(
      `${dateLabel}, trong phạm vi tài khoản của bạn: có ${byUnit.size} đơn vị báo cáo ghi nhận `
        + `${cases.length} vụ việc (${filterDesc}):`,
      ''
    );
    for (const [unitName, unitCases] of byUnit.entries()) {
      lines.push(`• ${unitName} (${unitCases.length} vụ):`);
      for (const c of unitCases) {
        const stateStr = stateLabels[c.current_state] || c.current_state;
        const title = c.title || c.stable_code || 'Vụ việc không có tên';
        lines.push(`  - ${title} (${stateStr})`);
      }
    }
  }

  return {
    text: lines.join('\n'),
    sources: sources(`Vụ việc ${domainLabel || stateLabel || ''} · ${dateLabel}`.trim()),
    memory: { kind: 'cases', ids: cases.map(c => c.id), domain: domainCode, state: stateCode, date: period.to },
    action: { type: 'cases', domain: domainCode || '', state: stateCode || '',
      from: period.from, to: period.to, byReturn: stateCode === 'RETURNED' }
  };
}
