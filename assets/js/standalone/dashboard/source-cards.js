import { escape, icon, number, sourceStates, time, timestampDate } from './format.js';

const kinds = {
  CASE: { label: 'Vụ việc', icon: 'folder-open' },
  WORK_RESULT: { label: 'Kết quả công tác', icon: 'shield-check' },
  SITUATION: { label: 'Báo cáo tình hình', icon: 'clipboard-list' }
};

const domainIcons = {
  PPHS: 'fingerprint', TNXH: 'users-round', MA_TUY: 'shield-alert', KINH_TE: 'landmark',
  MOI_TRUONG: 'leaf', ANQG: 'shield', CONG_NGHE_CAO: 'monitor',
  HOAT_DONG_TU_PHAP: 'scale', TINH_HINH_KHAC: 'files'
};

const stateIcons = {
  VERIFIED: 'circle-check', RETURNED: 'corner-up-left', PENDING_REVIEW: 'clock-3',
  SUBMITTED: 'send', RESUBMITTED: 'refresh-cw'
};

const workThemes = [
  [/^Thu hồi vũ khí/u, 'weapons', 'shield-check'],
  [/^Kiểm danh/u, 'persons', 'users-round'],
  [/^Kiểm tra cơ sở/u, 'residence', 'building-2'],
  [/^Tuyên truyền, tuần tra/u, 'traffic', 'car-front'],
  [/^Tuyên truyền, kiểm tra/u, 'fire', 'flame'],
  [/^Kết quả Xử lý VPHC/u, 'administrative', 'scale'],
  [/^Tuần tra, kiểm soát/u, 'patrol', 'route']
];

// Only split separators outside parentheses, preserving notes with semicolons.
function splitMetrics(text) {
  const entries = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '(') depth += 1;
    if (character === ')') depth = Math.max(0, depth - 1);
    if (character === ';' && depth === 0) {
      entries.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  entries.push(text.slice(start).trim());
  return entries.filter(Boolean);
}

export function workGroups(summary) {
  return String(summary || '').split(/\r?\n/u).filter(line => line.trim()).map(line => {
    const separator = line.indexOf(':');
    const title = separator < 0 ? '' : line.slice(0, separator).trim();
    const theme = workThemes.find(([pattern]) => pattern.test(title));
    if (!theme) return { text: line };
    const entries = splitMetrics(line.slice(separator + 1)).map(entry => {
      const delimiter = entry.indexOf(':');
      return delimiter < 0 ? { text: entry } : {
        label: entry.slice(0, delimiter).trim(), value: entry.slice(delimiter + 1).trim()
      };
    });
    return { title, theme: theme[1], icon: theme[2], entries };
  });
}

function workValue(value) {
  const amount = value.match(/^(\d+)(\s+đồng)$/u);
  if (!amount) return value;
  // Group the original digits without rounding or changing the stored amount.
  return amount[1].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + amount[2];
}

function workBody(summary) {
  const groups = workGroups(summary);
  if (!groups.length) return '<p class="dash-source-description">Không có nội dung mô tả.</p>';
  return `<div class="dash-source-work">${groups.map(group => group.text !== undefined
    ? `<p class="dash-source-description dash-work-unstructured">${escape(group.text)}</p>`
    : `<section class="dash-work-group" data-work-theme="${group.theme}">
      <h4>${icon(group.icon)}<span>${escape(group.title)}</span></h4>
      <dl>${group.entries.map(entry => entry.text !== undefined
        ? `<div class="dash-work-free"><dt>Nội dung bổ sung</dt><dd>${escape(entry.text)}</dd></div>`
        : `<div><dt>${escape(entry.label)}</dt><dd>${escape(workValue(entry.value))}</dd></div>`).join('')}</dl>
      </section>`).join('')}</div>`;
}

function sourceCard(item) {
  const isNormalSituation = item.kind === 'SITUATION'
    && (item.summary?.toLowerCase().includes('bình thường') || item.category_codes?.includes('NORMAL_DAY'));
  const kind = isNormalSituation
    ? { label: 'Tình hình ngày bình thường', icon: 'shield-check' }
    : kinds[item.kind] || { label: 'Nội dung báo cáo', icon: 'file-text' };
  const domain = item.kind === 'CASE' ? item.business_code || 'TINH_HINH_KHAC' : '';
  const domainLabel = domain
    ? globalThis.DailyReportsUI?.domainName?.(domain) || domain
    : item.kind === 'WORK_RESULT' ? 'Hoạt động của đơn vị'
    : (isNormalSituation ? 'Tình hình ổn định' : 'Tình hình địa bàn');
  const symbol = isNormalSituation ? 'shield-check' : domainIcons[domain] || kind.icon;
  const stateLabel = sourceStates[item.state] || item.state || 'Chưa xác định trạng thái';
  const recorded = item.created_at && Number.isFinite(Date.parse(item.created_at));
  return `<article class="dash-source dash-source-card" data-kind="${escape(item.kind)}"
    data-domain="${escape(domain)}">
    <header class="dash-source-head">
      <span class="dash-source-symbol">${icon(symbol)}</span>
      <div class="dash-source-identity"><h3>${kind.label}${isNormalSituation ? '<span class="dash-source-badge-normal">✓ Ổn định</span>' : ''}</h3>
        <span class="dash-source-domain">${escape(domainLabel)}</span></div>
      <div class="dash-source-meta">
        <span class="dash-source-state" data-state="${escape(item.state)}">
          ${icon(stateIcons[item.state] || 'circle-dot')}<span>${escape(stateLabel)}</span></span>
        ${recorded ? `<time datetime="${escape(item.created_at)}" title="${timestampDate(item.created_at)}">
          ${icon('clock-3')}<span>${time(item.created_at)} · ${timestampDate(item.created_at)}</span></time>` : ''}
      </div>
    </header>
    ${item.duplicate ? `<div class="dash-source-duplicate">${icon('copy-check')}
      <span>Đã loại khỏi số vụ việc đếm mới</span></div>` : ''}
    <div class="dash-source-body">${item.kind === 'WORK_RESULT' ? workBody(item.summary)
      : `<p class="dash-source-description">${escape(item.summary || 'Không có nội dung mô tả.')}</p>`}</div>
  </article>`;
}

export function sourceDetails(unit) {
  const totals = Object.entries(kinds).map(([key, value]) => {
    const count = unit.items.filter(item => item.kind === key).length;
    return count ? `<span data-source-kind="${key}">${icon(value.icon)}
      <b>${number(count)}</b><span>${value.label.toLocaleLowerCase('vi')}</span></span>` : '';
  }).join('');
  return `<div class="dash-unit-detail">
    <div class="dash-detail-title"><div><strong>Nội dung ${escape(unit.name)} đã gửi</strong>
      <span class="dash-detail-count">${number(unit.items.length)} hồ sơ / báo cáo</span></div>
      <div class="dash-source-totals" aria-label="Số lượng theo loại báo cáo">${totals}</div></div>
    <div class="dash-source-list">${unit.items.map(sourceCard).join('')}</div></div>`;
}
