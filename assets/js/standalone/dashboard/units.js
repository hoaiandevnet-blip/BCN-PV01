import { escape, date, time, timestampDate, icon, states } from './format.js';
import { sourceDetails } from './source-cards.js';

const normalize = value => value.toLocaleLowerCase('vi').normalize('NFD')
  .replace(/\p{Diacritic}/gu, '').replaceAll('đ', 'd');
const PAGE_SIZE = 10;

export function pageNumbers(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, '...', total];
  }
  if (current >= total - 3) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, '...', current - 1, current, current + 1, '...', total];
}

export function renderUnits(root, data, state) {
  const filtered = data.units.filter(unit => {
    const matchesStatus = state.status === 'all' || (state.status === 'sent' ? unit.status !== 'missing'
      : unit.status === state.status);
    return matchesStatus && normalize(unit.name).includes(normalize(state.search));
  });
  const priorities = { missing: 0, returned: 1, partial: 2, complete: 3 };
  filtered.sort((first, second) => priorities[first.status] - priorities[second.status]
    || first.name.localeCompare(second.name, 'vi'));

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, Number(state.page) || 1), totalPages);
  state.page = currentPage;

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageUnits = filtered.slice(start, start + PAGE_SIZE);

  const body = root.querySelector('#dashUnitRows');
  root.querySelector('#dashUnitCount').textContent = `${filtered.length} / ${data.units.length} đơn vị`;
  body.innerHTML = pageUnits.length ? pageUnits.map(unit => {
    const [label, symbol] = states[unit.status];
    const opened = state.expanded.has(unit.id);
    const isNormal = unit.counts.cases === 0 && (unit.counts.situations > 0
      || unit.items?.some(it => it.kind === 'SITUATION' || it.summary?.includes('bình thường')));
    const content = [unit.counts.cases ? `${unit.counts.cases} vụ việc` : (isNormal ? '✓ Tình hình ngày bình thường' : ''),
      unit.counts.work ? `${unit.counts.work} kết quả công tác` : '',
      !isNormal && unit.counts.situations ? `${unit.counts.situations} báo cáo tình hình` : ''].filter(Boolean);
    const sublabel = unit.expected ? '' : 'Ngoài danh sách giao nhập';
    const verified = unit.items.filter(item => item.state === 'VERIFIED').length;
    const pending = unit.counts.pending || 0;
    const returned = unit.counts.returned || 0;
    const reviews = [];
    if (verified) {
      reviews.push(`<span class="dash-review-tag verified">${icon('circle-check')} ${verified} đã duyệt</span>`);
    }
    if (pending) {
      reviews.push(`<span class="dash-review-tag pending">${icon('clock-3')} ${pending} chờ duyệt</span>`);
    }
    if (returned) {
      reviews.push(`<span class="dash-review-tag returned">${icon('circle-alert')} ${returned} cần bổ sung</span>`);
    }
    const reviewStatus = reviews.length ? `<div class="dash-review-status">${reviews.join('')}</div>` : '';
    return `<tr data-unit="${unit.id}" data-status="${unit.status}">
      <td data-label="Đơn vị"><div class="dash-unit-name">${icon('building-2')}<div>
        <strong>${escape(unit.name)}</strong>${sublabel ? `<small>${sublabel}</small>` : ''}</div></div></td>
      <td data-label="Trạng thái"><span class="dash-status" data-status="${unit.status}">
        ${icon(symbol)}${label}</span></td>
      <td data-label="Đã gửi"><div class="dash-submission-cell">
        <div class="dash-content-tags">${content.length
          ? content.map(text => `<span class="dash-content-pill${text.includes('bình thường') ? ' dash-content-normal' : ''}">${text}</span>`).join('')
          : '<span class="dash-muted">Chưa nhận nội dung</span>'}</div>
        ${reviewStatus}</div></td>
      <td data-label="Ghi nhận"><time datetime="${unit.recordedAt || ''}">${time(unit.recordedAt)}</time>
        <small>${timestampDate(unit.recordedAt)}</small></td>
      <td>${unit.items.length ? `<button class="ghost dash-detail-button" data-unit-detail="${unit.id}"
        aria-expanded="${opened}" aria-controls="dashDetail${unit.id}"
        aria-label="Nội dung ${escape(unit.name)} đã gửi">
        ${icon(opened ? 'chevron-up' : 'chevron-down')}<span>${opened ? 'Thu gọn' : 'Chi tiết'}</span></button>` : ''}
      </td>
      </tr>${unit.items.length ? `<tr class="dash-detail-row" id="dashDetail${unit.id}" ${opened ? '' : 'hidden'}>
        <td colspan="5">${opened ? sourceDetails(unit) : ''}</td></tr>` : ''}`;
  }).join('') : `<tr><td colspan="5" class="dash-empty">${data.audience === 'unit'
    ? 'Đơn vị chưa có báo cáo trong ngày đã chọn.' : 'Không có đơn vị phù hợp với bộ lọc.'}</td></tr>`;
  body.querySelectorAll('[data-unit-detail]').forEach(button => {
    button.onclick = () => {
      const id = button.dataset.unitDetail;
      if (state.expanded.has(id)) state.expanded.delete(id);
      else state.expanded.add(id);
      renderUnits(root, data, state);
      root.querySelector(`[data-unit-detail="${id}"]`)?.focus({ preventScroll: true });
    };
  });
  if (typeof window !== 'undefined') window.lucide?.createIcons({ root: body });

  const paginationEl = root.querySelector('#dashUnitPagination');
  if (paginationEl) {
    if (!total) {
      paginationEl.innerHTML = '';
      paginationEl.hidden = true;
    } else {
      paginationEl.hidden = false;
      const from = start + 1;
      const to = Math.min(start + PAGE_SIZE, total);
      const pages = pageNumbers(currentPage, totalPages);
      const pageButtons = pages.map(p => (p === '...'
        ? '<span class="dash-page-ellipsis" aria-hidden="true">…</span>'
        : `<button type="button" class="dash-page-btn${p === currentPage ? ' active' : ''}" `
          + `data-page="${p}" aria-current="${p === currentPage ? 'page' : 'false'}" `
          + `aria-label="Trang ${p}">${p}</button>`)).join('');
      paginationEl.innerHTML = `<span class="dash-page-info">`
        + `Hiển thị <strong>${from}–${to}</strong> trên <strong>${total}</strong> đơn vị</span>`
        + `<div class="dash-page-controls" role="navigation" aria-label="Phân trang danh sách đơn vị">`
        + `<button type="button" class="dash-page-btn dash-page-nav" data-page="${currentPage - 1}" `
        + `${currentPage <= 1 ? 'disabled' : ''} aria-label="Trang trước">`
        + `${icon('chevron-left')}<span>Trước</span></button>`
        + pageButtons
        + `<button type="button" class="dash-page-btn dash-page-nav" data-page="${currentPage + 1}" `
        + `${currentPage >= totalPages ? 'disabled' : ''} aria-label="Trang sau">`
        + `<span>Sau</span>${icon('chevron-right')}</button></div>`;
      paginationEl.querySelectorAll('[data-page]').forEach(button => {
        button.onclick = () => {
          const targetPage = Number(button.dataset.page);
          if (!targetPage || targetPage === state.page || button.disabled) return;
          state.page = targetPage;
          renderUnits(root, data, state);
          root.querySelector('#dashUnitsTitle')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        };
      });
      if (typeof window !== 'undefined') window.lucide?.createIcons({ root: paginationEl });
    }
  }
}

export function unitSection(data, contentAfterTable = '') {
  const stats = data.progress;
  const ownUnit = data.audience === 'unit';
  const title = ownUnit ? 'Theo dõi báo cáo của đơn vị' : 'Theo dõi việc chấp hành chế độ báo cáo';
  const filters = [['all', 'Tất cả', data.units.length], ['missing', 'Chưa gửi', stats.missing],
    ['sent', 'Đã gửi', data.units.filter(unit => unit.status !== 'missing').length]];
  return `<section class="dash-panel dash-units" aria-labelledby="dashUnitsTitle">
    <header class="dash-panel-head"><div><span class="dash-overline">${ownUnit
      ? 'BÁO CÁO ĐƠN VỊ' : 'THEO DÕI TIẾP NHẬN'}</span>
      <h2 id="dashUnitsTitle">${title} <span>${date(data.day)}</span></h2></div>
      <span class="dash-updated" id="dashUnitCount"></span></header>
    ${ownUnit ? '' : `<div class="dash-unit-toolbar"><div class="dash-filters"
      role="group" aria-label="Lọc trạng thái gửi báo cáo">
      ${filters.map(([key, label, count]) => `<button data-status-filter="${key}" aria-pressed="false">
        ${label}<span>${count}</span></button>`).join('')}</div>
      <label class="dash-search">${icon('search')}<input id="dashUnitSearch" type="search"
        placeholder="Tìm đơn vị…" aria-label="Tìm đơn vị trên dashboard"/></label></div>`}
    <div class="dash-table-scroll"><table class="dash-table"><thead><tr><th>Đơn vị báo cáo</th><th>Trạng thái</th>
      <th>Nội dung đã gửi</th><th>Ghi nhận gần nhất</th><th><span class="dash-sr-only">Chi tiết</span></th>
      </tr></thead><tbody id="dashUnitRows"></tbody></table></div>
    <nav id="dashUnitPagination" class="dash-pagination" aria-label="Phân trang danh sách đơn vị"></nav>
    ${contentAfterTable}
    ${ownUnit ? '' : `<p class="dash-footnote">Tiến độ tính trên đơn vị có tài khoản hoạt động
      và được phân quyền nhập báo cáo trong ngày đã chọn. Nội dung gửi ngoài danh sách vẫn hiển thị riêng.</p>`}
    </section>`;
}
