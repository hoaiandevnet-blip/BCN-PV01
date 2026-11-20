import { dashboardShell, dashboardContent, loadingView } from './view.js';
import { renderUnits } from './units.js';
import { escape, time, icon } from './format.js';
import { mountTrendChart } from './trend-interaction.js';
import { unitContent } from './unit/view.js';
import { mountUnitTopbar } from './unit/topbar.js';
import { reportingDashboard } from './reporting-units.js';
import { selectedTrend } from './domain-selection.js';
import { trendPanel } from './trend-panel.js';
import { mountDashboardEntrance } from './entrance.js';

let cleanup;
export function stopDashboard() {
  cleanup?.();
  cleanup = null;
}

export async function renderDashboard({ account, allowed, api, open }) {
  stopDashboard();
  const host = document.getElementById('home');
  host.innerHTML = dashboardShell(account, allowed);
  const root = host.querySelector('.bcn-dashboard');
  const content = root.querySelector('#dashData');
  const refreshTime = root.querySelector('#dashRefreshTime');
  const header = root.querySelector('.dash-header');
  const commandHeader = header.innerHTML;
  const topbar = mountUnitTopbar();
  header.querySelector('.dash-overline').textContent = 'TỔNG QUAN BÁO CÁO';
  const state = { day: '', span: 1, status: 'all', search: '', domain: '', expanded: new Set(), page: 1 };
  let data;
  let disposeTrend;
  let finishEntrance;
  let entered = false;
  let controller;
  let disposed = false;
  let serial = 0;
  const drawIcons = () => window.lucide?.createIcons({ root });
  const filter = status => {
    state.status = status;
    state.page = 1;
    root.querySelectorAll('[data-status-filter]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.statusFilter === status));
    });
    renderUnits(root, data, state);
  };
  const render = () => {
    finishEntrance?.();
    disposeTrend?.();
    const trend = selectedTrend(data, state.domain);
    const unit = data.audience === 'unit';
    root.dataset.audience = data.audience || 'command';
    header.hidden = unit;
    header.innerHTML = unit ? '' : commandHeader;
    topbar.update(unit ? data.unitDashboard.unit : null);
    const periodLabel = unit ? 'Kỳ thống kê' : 'Kỳ thống kê vụ việc';
    root.querySelector('.dash-period > span').textContent = periodLabel;
    root.querySelector('.dash-period [role=group]').setAttribute('aria-label', periodLabel);
    const focusedUnit = document.activeElement?.dataset?.unitDetail;
    content.innerHTML = unit ? unitContent(data, trend) : dashboardContent(data, trend);
    disposeTrend = mountTrendChart(root, trend);
    const search = root.querySelector('#dashUnitSearch');
    if (search) {
      search.value = state.search;
      search.oninput = event => {
        state.search = event.target.value;
        state.page = 1;
        renderUnits(root, data, state);
      };
    }
    root.querySelectorAll('[data-status-filter]').forEach(button => {
      button.onclick = () => filter(button.dataset.statusFilter);
    });
    root.querySelector('[data-jump-missing]')?.addEventListener('click', () => {
      state.search = '';
      state.page = 1;
      root.querySelector('#dashUnitSearch').value = '';
      filter('missing');
      root.querySelector('#dashUnitsTitle').scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    if (unit) {
      state.search = '';
      state.page = 1;
    }
    if (root.querySelector('#dashUnitRows')) filter(unit ? 'all' : state.status);
    drawIcons();
    if (!entered) {
      entered = true;
      finishEntrance = mountDashboardEntrance(content);
    }
    if (focusedUnit) root.querySelector(`[data-unit-detail="${focusedUnit}"]`)?.focus({ preventScroll: true });
  };
  async function load({ background = false } = {}) {
    controller?.abort();
    controller = new AbortController();
    const request = ++serial;
    content.setAttribute('aria-busy', 'true');
    if (!data) {
      finishEntrance?.();
      disposeTrend?.();
      disposeTrend = null;
      content.innerHTML = loadingView();
    }
    refreshTime.textContent = 'Đang cập nhật…';
    drawIcons();
    try {
      const query = new URLSearchParams({ span: state.span });
      if (state.day) query.set('day', state.day);
      const result = await api('/api/bao-cao-ngay/dashboard?' + query, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])
      });
      if (disposed || request !== serial) return;
      data = reportingDashboard(result);
      state.day = result.day;
      root.querySelector('#dashDay').value = result.day;
      refreshTime.textContent = 'Cập nhật lúc ' + time(result.generatedAt);
      render();
    } catch (error) {
      if (disposed || request !== serial) return;
      if (background && data && ![401, 403].includes(error.status)) {
        refreshTime.textContent = 'Chưa cập nhật được · Số liệu lúc ' + time(data.generatedAt);
      } else {
        finishEntrance?.();
        disposeTrend?.();
        disposeTrend = null;
        const forbidden = error.status === 403;
        if (forbidden || error.status === 401) {
          data = null;
          topbar.update(null);
          header.hidden = false;
          header.innerHTML = '<div><span class="dash-overline">TỔNG QUAN BÁO CÁO</span><h1>Tổng quan</h1></div>';
        }
        content.innerHTML = `<div class="dash-empty" role="${forbidden ? 'status' : 'alert'}">
          ${icon(forbidden ? 'shield' : 'cloud-off')}
          <h2>${forbidden ? 'Chưa có quyền xem dashboard' : 'Chưa tải được số liệu'}</h2>
          <p>${escape(forbidden ? 'Liên hệ quản trị viên để được giao quyền nhập, tra cứu hoặc tổng hợp báo cáo.'
            : error.name === 'TimeoutError' ? 'Kết nối quá thời gian. Vui lòng thử lại.' : error.message)}</p>
          ${forbidden ? '' : '<button class="ghost" id="dashRetry">Thử lại</button>'}</div>`;
        root.querySelector('#dashRetry')?.addEventListener('click', () => load());
        refreshTime.textContent = 'Chưa có dữ liệu';
        drawIcons();
      }
    } finally {
      if (!disposed && request === serial) content.setAttribute('aria-busy', 'false');
    }
  }
  root.addEventListener('click', event => {
    const domainButton = event.target.closest('[data-domain-select], [data-domain-reset]');
    if (domainButton && root.contains(domainButton) && data) {
      const code = domainButton.dataset.domainSelect || '';
      const previous = state.domain;
      state.domain = code === state.domain ? '' : code;
      const trend = selectedTrend(data, state.domain);
      disposeTrend?.();
      const panel = root.querySelector('#dashTrendPanel');
      finishEntrance?.(panel);
      panel.outerHTML = trendPanel(trend);
      root.querySelectorAll('[data-domain-select]').forEach(item => {
        item.setAttribute('aria-pressed', String(item.dataset.domainSelect === state.domain));
      });
      disposeTrend = mountTrendChart(root, trend);
      const newPanel = root.querySelector('#dashTrendPanel');
      if (newPanel) mountDashboardEntrance(newPanel);
      drawIcons();
      if (domainButton.hasAttribute('data-domain-reset')) {
        root.querySelector(`[data-domain-select="${previous}"]`)?.focus({ preventScroll: true });
      }
      return;
    }
    const button = event.target.closest('[data-dashboard-open]');
    if (button && root.contains(button)) open(button.dataset.dashboardOpen);
  });
  root.querySelector('#dashDay').onchange = event => {
    if (!event.target.reportValidity()) return;
    state.day = event.target.value;
    state.expanded.clear();
    entered = false;
    load();
  };
  root.querySelectorAll('[data-span]').forEach(button => {
    button.onclick = () => {
      state.span = Number(button.dataset.span);
      root.querySelectorAll('[data-span]').forEach(item => {
        item.setAttribute('aria-pressed', String(item === button));
      });
      entered = false;
      load();
    };
  });
  root.querySelector('#dashRefresh').onclick = () => load({ background: Boolean(data) });
  const timer = setInterval(() => {
    const interacting = root.contains(document.activeElement)
      && document.activeElement.matches('input, [data-trend-point], [data-domain-select], [data-domain-reset]');
    if (!document.hidden && !disposed && !interacting && host.classList.contains('active')) load({ background: true });
  }, 60000);
  cleanup = () => {
    disposed = true;
    topbar.reset();
    finishEntrance?.();
    controller?.abort();
    disposeTrend?.();
    clearInterval(timer);
  };
  await load();
}
