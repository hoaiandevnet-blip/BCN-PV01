import { renderAccounts } from './accounts.js';
import { renderDirectory } from './directory.js';
import { renderSettings } from './settings.js';
import { initializeAppearance, syncAppearance, cancelAppearancePreview } from './appearance.js';
import { initializePasswordToggle } from './login-password.js';
import { renderDashboard, stopDashboard } from './dashboard/index.js';

const resetPasswordVisibility = initializePasswordToggle();

let account;
let directory;
let activePage = 'home';
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
export const icons = () => window.lucide?.createIcons();
export const notify = message => window.NotificationPopup.getShared().notify(message, { source: 'BÁO CÁO NGÀY' });
export async function api(path, options = {}) {
  const response = await window.BcnSession.fetch(path, { credentials: 'same-origin', cache: 'no-store',
    ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const body = await response.json();
  if (!response.ok) {
    if (response.status === 401 && account) reset();
    throw Object.assign(new Error(body.error || 'Không thực hiện được yêu cầu.'), { status: response.status });
  }
  return body;
}
const titles = { home: 'Tổng quan', dailyReports: 'Báo cáo ngày', digitalMap: 'Bản đồ số',
  accounts: 'Tài khoản & phân quyền', directory: 'Danh mục đơn vị', settings: 'Cài đặt' };
const viewModules = { approval: 'dailyReportApproval', input: 'dailyReportInput',
  registry: 'dailyReportRegistry', legal: 'dailyReportLegal',
  returned: 'dailyReportReturned', updates: 'dailyReportUpdates', unlock: 'dailyReportUnlock',
  duplicates: 'dailyReportDuplicates', composer: 'dailyReportComposer', permissions: 'dailyReportPermissions',
  history: 'dailyReportHistory' };
const allowed = key => account?.is_admin || account?.permissions.some(item => item.module_key === key);
window.DailyReportPermissions = {
  views: () => Object.fromEntries(Object.entries(viewModules).map(([view, key]) => [view, Boolean(allowed(key))]))
};

async function showPage(page, view) {
  if (!account || !titles[page]) return;
  if (['accounts', 'directory', 'digitalMap', 'settings'].includes(page) && !account.is_admin) return;
  if (page === 'dailyReports' && !allowed('dailyReports')) return;
  if (activePage === 'settings') cancelAppearancePreview();
  if (activePage === 'home') stopDashboard();
  if (activePage === 'dailyReports' && page !== activePage) window.DailyReports.deactivate();
  activePage = page;
  document.querySelectorAll('.main > .page').forEach(node => node.classList.toggle('active', node.id === page));
  document.querySelectorAll('[data-page]').forEach(node => {
    node.classList.toggle('active', node.dataset.page === page && (!node.dataset.bcnView || node.dataset.bcnView === view));
  });
  document.getElementById('pageTitle').textContent = titles[page];
  document.getElementById('appShell').classList.remove('menu-open');
  if (page === 'home') await renderDashboard({ account, allowed, api,
    open: async (target, targetView, reference) => {
      const accountId = account?.id;
      const current = () => account?.id === accountId && activePage === target;
      try {
        await showPage(target, targetView);
        if (reference && current()) await window.DailyReports.openNotification(reference, current);
      } catch (error) { notify(error.message); }
    } });
  if (page === 'dailyReports') {
    await window.DailyReports.activate();
    if (view) window.DailyReports.navigate(view);
  }
  if (page === 'digitalMap') await window.DigitalMap.render({ actor: account.username, toast: notify });
  if (page === 'accounts') await renderAccounts({ api, directory, escapeHtml, notify, icons });
  if (page === 'settings') await renderSettings({ api, escapeHtml, icons });
  if (page === 'directory') await renderDirectory({ api, escapeHtml, notify, icons, refresh: async () => {
    directory = await api('/api/directory');
    if (activePage === 'dailyReports') await window.DailyReports.refreshUnits();
    return directory;
  } });
  icons();
}
window.openSeedyReport = async (action, owner, draft, stillCurrent) => {
  const sameSession = () => String(account?.id) === owner && stillCurrent();
  if (!sameSession()) return;
  if (!allowed('dailyReports') || !window.DailyReportPermissions.views().returned) {
    throw new Error('Tài khoản chưa có quyền mở Báo cáo bị trả lại.');
  }
  await showPage('dailyReports');
  if (!sameSession() || activePage !== 'dailyReports') return;
  await window.DailyReports.fromAssistant(action, draft, () => sameSession() && activePage === 'dailyReports');
};

function reset() {
  stopDashboard();
  window.BcnSession.clear();
  account = null;
  resetPasswordVisibility();
  cancelAppearancePreview();
  document.getElementById('settings').replaceChildren();
  document.querySelectorAll('[data-admin]').forEach(node => { node.hidden = true; });
  window.NotificationCenter?.reset();
  window.DailyReports?.deactivate();
  document.getElementById('appShell').hidden = true;
  document.getElementById('loginScreen').hidden = false;
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('loginPassword').value = '';
}
async function enter(user) {
  window.BcnSession.setAccount(user);
  account = user;
  directory = await api('/api/directory', { signal: AbortSignal.timeout(15000) });
  document.getElementById('accountName').textContent = account.full_name;
  document.getElementById('accountName').title = account.full_name;
  document.getElementById('accountUnit').textContent = account.team || 'Quản trị hệ thống';
  document.querySelectorAll('[data-admin]').forEach(node => { node.hidden = !account.is_admin; });
  document.getElementById('dailyReportNavGroup').hidden = !allowed('dailyReports');
  document.querySelectorAll('[data-bcn-view]').forEach(node => {
    node.hidden = !allowed(node.dataset.moduleKey);
  });
  if (allowed('dailyReportApproval')) {
    api('/api/bao-cao-ngay/cases?offset=0').then(data => {
      const badge = document.querySelector('#sidebar [data-approval-badge]');
      if (badge) {
        const count = Number(data?.total ?? (data?.cases ? data.cases.length : 0)) || 0;
        badge.textContent = String(count);
        badge.hidden = count <= 0;
      }
    }).catch(() => {});
  }
  window.NotificationCenter.start({ username: 'bcnpv01:' + account.username, icons,
    refresh: () => {},
    navigate: async (target, item) => {
      if (target !== 'dailyReports') return;
      await showPage('dailyReports');
      if (item.dailyReportRef) await window.DailyReports.openNotification(item.dailyReportRef);
    },
    onSessionExpired: reset
  });
  await showPage('home');
  document.getElementById('loginScreen').hidden = true;
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').hidden = false;
}
window.addEventListener('bcn-session-expired', reset);
document.getElementById('loginForm').onsubmit = async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const errorElement = document.getElementById('loginError');
  errorElement.textContent = '';
  resetPasswordVisibility();
  button.disabled = true;
  try {
    const result = await api('/api/login', { method: 'POST', body: JSON.stringify({
      username: document.getElementById('loginAccount').value,
      password: document.getElementById('loginPassword').value
    }) });
    await enter(result.account);
  } catch (error) {
    errorElement.textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
document.querySelectorAll('[data-page]').forEach(button => {
  button.onclick = () => showPage(button.dataset.page, button.dataset.bcnView).catch(error => notify(error.message));
});
document.getElementById('menuToggle').onclick = () => document.getElementById('appShell').classList.toggle('menu-open');
document.getElementById('logout').onclick = async () => {
  try {
    await api('/api/logout', { method: 'POST' });
    reset();
    location.reload();
  } catch (error) { notify(error.message); }
};
document.getElementById('changePassword').onclick = async () => {
  const values = await window.DailyReportsUI.form({ title: 'Đổi mật khẩu', submit: 'Lưu mật khẩu', parent: document.body, fields: `
    <label>Mật khẩu hiện tại<input name="currentPassword" type="password" autocomplete="current-password" required/></label>
    <label>Mật khẩu mới<input name="password" type="password" minlength="8" autocomplete="new-password" required/></label>` });
  if (!values) return;
  try {
    await api('/api/change-password', { method: 'POST', body: JSON.stringify(values) });
    notify('Đã đổi mật khẩu.');
  } catch (error) { notify(error.message); }
};
icons();
try {
  await initializeAppearance();
  await enter(await api('/api/me', { signal: AbortSignal.timeout(15000) }));
} catch {
  reset();
} finally {
  document.getElementById('appLoading').hidden = true;
}
setInterval(async () => {
  if (document.hidden) return;
  await syncAppearance();
  if (!account) return;
  try {
    const next = await api('/api/me');
    account = next;
    document.querySelectorAll('[data-admin]').forEach(node => { node.hidden = !account.is_admin; });
    if (!account.is_admin) {
      document.getElementById('settings').replaceChildren();
      if (activePage === 'settings') await showPage('home');
    }
  } catch { reset(); }
}, 30000);
