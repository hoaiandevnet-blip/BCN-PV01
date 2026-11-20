export function confirmAccountDeletion({ accounts, api, escapeHtml: escape, notify, onDeleted, trigger }) {
  if (!accounts.length) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'bcn-dialog bcn-account-delete-dialog';
  dialog.setAttribute('aria-labelledby', 'accountDeleteTitle');
  const title = accounts.length === 1 ? 'Xóa tài khoản?' : `Xóa ${accounts.length} tài khoản?`;
  dialog.innerHTML = `<h2 id="accountDeleteTitle">${title}</h2>
    <p>Tài khoản đã xóa không thể đăng nhập. Báo cáo và lịch sử đã tạo vẫn được giữ nguyên.</p>
    <ul class="bcn-account-delete-list">${accounts.map(account => `<li>
      <strong>${escape(account.full_name)}</strong><span>${escape(account.username)}</span>
    </li>`).join('')}</ul>
    <p class="bcn-error" role="alert"></p>
    <footer><button type="button" class="ghost" data-cancel autofocus>Hủy</button>
      <button type="button" class="ghost bcn-account-danger" data-confirm-delete>
        ${accounts.length === 1 ? 'Xóa tài khoản' : `Xóa ${accounts.length} tài khoản`}
      </button></footer>`;
  let busy = false;
  dialog.addEventListener('cancel', event => {
    if (busy) event.preventDefault();
  });
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (trigger?.isConnected) trigger.focus();
  }, { once: true });
  dialog.querySelector('[data-confirm-delete]').onclick = async () => {
    if (busy) return;
    busy = true;
    const buttons = [...dialog.querySelectorAll('button')];
    buttons.forEach(button => { button.disabled = true; });
    const error = dialog.querySelector('[role=alert]');
    error.textContent = '';
    try {
      const result = accounts.length === 1
        ? await api(`/api/accounts/${accounts[0].id}`, { method: 'DELETE' })
        : await api('/api/accounts/bulk-delete', {
          method: 'POST', body: JSON.stringify({ ids: accounts.map(account => String(account.id)) })
        });
      dialog.close();
      onDeleted(result.deleted_ids);
      notify(`Đã xóa ${result.deleted_count} tài khoản.`);
    } catch (failure) {
      error.textContent = failure.message;
    } finally {
      busy = false;
      buttons.forEach(button => { button.disabled = false; });
    }
  };
  document.body.append(dialog);
  dialog.showModal();
}
