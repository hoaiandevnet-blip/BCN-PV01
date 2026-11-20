(() => {
  'use strict';
  const icons = root => window.lucide?.createIcons({ root, attrs: { 'stroke-width': 1.8, focusable: 'false' } });

  function mount(root) {
    const $ = selector => root.querySelector(selector);
    const form = $('#bcnLeaderForm');
    const selected = new Set();
    let currentLeaders = [];
    let loading = false;
    form.addEventListener('reset', () => {
      form.elements.namedItem('id').value = '';
    });
    const card = form.closest('.card');
    card.classList.add('bcn-leader-workspace');
    const editor = document.createElement('section');
    editor.className = 'bcn-leader-editor';
    editor.innerHTML = '<h3>Thông tin người ký</h3><p class="bcn-leader-hint">'
      + 'Nhập chức vụ, phạm vi ký và thời gian áp dụng cho báo cáo.</p>';
    const actions = document.createElement('div');
    actions.className = 'bcn-leader-form-actions';
    const save = form.querySelector('button.primary');
    save.innerHTML = '<i data-lucide="save" aria-hidden="true"></i>Lưu lãnh đạo';
    const reset = form.querySelector('button[type="reset"]');
    reset.innerHTML = '<i data-lucide="plus" aria-hidden="true"></i>Nhập mới';
    actions.append(save, reset);
    form.append(actions);
    for (const [key, label] of [['full_name', 'Họ tên'], ['title', 'Chức danh'], ['effective_from', 'Hiệu lực từ']]) {
      const field = form.elements.namedItem(key).closest('label');
      const text = document.createElement('span');
      text.innerHTML = window.DailyReportsUI.fieldLabel(label + ' *');
      field.replaceChild(text, field.firstChild);
    }
    editor.append(form);
    const list = document.createElement('section');
    list.className = 'bcn-leader-directory';
    list.innerHTML = '<header class="bcn-leader-list-heading"><div><h3>Danh sách lãnh đạo</h3>'
      + '<p class="bcn-leader-hint" id="bcnLeaderCount" role="status">Danh sách tự tải khi mở mục này.</p>'
      + '</div></header>';
    const refresh = $('#bcnLeadersLoad');
    refresh.type = 'button';
    refresh.innerHTML = '<i data-lucide="refresh-cw" aria-hidden="true"></i>Cập nhật';
    refresh.setAttribute('aria-label', 'Cập nhật danh sách lãnh đạo, gồm người đã lưu trữ');
    list.querySelector('header').append(refresh);
    list.insertAdjacentHTML('beforeend', `<div id="bcnLeaderBulk" class="bcn-leader-bulk" hidden>
      <label><input type="checkbox" id="bcnLeaderSelectAll">Chọn tất cả</label>
      <span id="bcnLeaderSelectedCount" role="status">Chưa chọn người ký</span>
      <button type="button" class="ghost bcn-leader-delete" id="bcnLeadersDelete" disabled>
        <i data-lucide="trash-2" aria-hidden="true"></i>Xóa đã chọn</button></div>`);
    list.append($('#bcnLeaderRows'));
    card.replaceChildren(editor, list);
    icons(card);

    function selection() {
      const all = $('#bcnLeaderSelectAll');
      all.checked = currentLeaders.length > 0 && selected.size === currentLeaders.length;
      all.indeterminate = selected.size > 0 && selected.size < currentLeaders.length;
      all.disabled = loading || !currentLeaders.length;
      $('#bcnLeadersDelete').disabled = loading || !selected.size;
      $('#bcnLeaderSelectedCount').textContent = selected.size ? `Đã chọn ${selected.size} người ký` : 'Chưa chọn người ký';
      root.querySelectorAll('[data-leader-select]').forEach(input => {
        input.checked = selected.has(input.dataset.leaderSelect);
        input.disabled = loading;
      });
      root.querySelectorAll('[data-leader-delete]').forEach(button => { button.disabled = loading; });
    }
    $('#bcnLeaderSelectAll').onchange = event => {
      selected.clear();
      if (event.target.checked) currentLeaders.forEach(item => selected.add(item.id));
      selection();
    };
    $('#bcnLeaderRows').addEventListener('change', event => {
      const id = event.target.dataset.leaderSelect;
      if (!id) return;
      if (event.target.checked) selected.add(id);
      else selected.delete(id);
      selection();
    });

    function render(leaders, canManage, reportDay) {
      currentLeaders = leaders;
      for (const id of selected) {
        if (!canManage || !leaders.some(item => item.id === id)) selected.delete(id);
      }
      $('#bcnLeaderBulk').hidden = !canManage || !leaders.length;
      const escape = window.DailyReportsUI.escape;
      const formatDate = value => new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh'
      }).format(new Date(value));
      $('#bcnLeaderCount').textContent = `${leaders.length} người ký · `
        + `${leaders.filter(item => item.archived_at).length} đã lưu trữ`;
      $('#bcnLeaderRows').innerHTML = leaders.map(item => {
        const [status, label] = item.archived_at ? ['archived', 'Đã lưu trữ']
          : item.effective_from > reportDay ? ['upcoming', 'Chưa đến hiệu lực']
            : item.effective_to && item.effective_to < reportDay ? ['expired', 'Hết hiệu lực']
              : ['active', 'Đang áp dụng'];
        return `<article class="bcn-item bcn-leader-row" data-leader-id="${item.id}">
          <div class="bcn-leader-identity">${canManage ? `<input type="checkbox" data-leader-select="${item.id}"
            aria-label="Chọn ${escape(item.full_name)}">` : ''}<span class="bcn-leader-avatar" aria-hidden="true">
            <i data-lucide="contact-round"></i></span><div><strong>${escape(item.full_name)}</strong>
            <p>${escape([item.rank_name, item.title].filter(Boolean).join(' · '))}</p></div></div>
          <div class="bcn-leader-tags"><span class="bcn-leader-scope">${escape(item.signer_scope)}</span>
            <span class="bcn-leader-status" data-state="${status}">${label}</span></div>
          <p class="bcn-leader-period"><i data-lucide="calendar-days" aria-hidden="true"></i>
            <span>Từ ${formatDate(item.effective_from)}${item.effective_to
              ? ' đến ' + formatDate(item.effective_to) : ' · Chưa đặt ngày kết thúc'}</span></p>
          ${canManage ? `<div class="bcn-leader-row-actions">
            <button class="ghost" type="button" data-leader-edit="${item.id}">
              <i data-lucide="pencil" aria-hidden="true"></i>Sửa</button>
            <button class="ghost" type="button" data-leader-state="${item.id}">
              <i data-lucide="${item.archived_at ? 'archive-restore' : 'archive'}" aria-hidden="true"></i>
              ${item.archived_at ? 'Khôi phục' : 'Lưu trữ'}</button>
            <button class="ghost bcn-leader-delete" type="button" data-leader-delete="${item.id}">
              <i data-lucide="trash-2" aria-hidden="true"></i>Xóa</button></div>` : ''}
        </article>`;
      }).join('') || '<p class="bcn-leader-empty">Chưa có người ký. Thêm thông tin để sử dụng khi xuất báo cáo.</p>';
      icons($('#bcnLeaderRows'));
      selection();
    }
    return {
      render,
      selectedIds: () => [...selected],
      setLoading(value) {
        loading = value;
        list.setAttribute('aria-busy', String(value));
        refresh.disabled = value;
        if (value) $('#bcnLeaderCount').textContent = 'Đang tải danh sách lãnh đạo…';
        selection();
      },
      error(message) { $('#bcnLeaderCount').textContent = message; },
      reset() {
        root.querySelectorAll('.bcn-leader-delete-dialog').forEach(dialog => dialog.close());
        selected.clear();
        loading = false;
        render([], false, '');
        refresh.disabled = false;
        list.setAttribute('aria-busy', 'false');
      },
      confirmDelete: (items, action) => confirmDelete(root, items, action)
    };
  }

  function confirmDelete(root, items, action) {
    const escape = window.DailyReportsUI.escape;
    const dialog = document.createElement('dialog');
    dialog.className = 'bcn-dialog bcn-leader-delete-dialog card';
    dialog.setAttribute('aria-labelledby', 'bcnLeaderDeleteTitle');
    dialog.innerHTML = `<h3 id="bcnLeaderDeleteTitle">Xóa ${items.length === 1 ? 'lãnh đạo' : items.length + ' lãnh đạo đã chọn'}?</h3>
      <p>Người đã xóa sẽ không còn trong danh sách hoặc lựa chọn người ký.
        Thông tin người ký trên báo cáo đã xuất vẫn được giữ nguyên.</p>
      <ul>${items.map(item => `<li>${escape(item.full_name)} · ${escape(item.title)}</li>`).join('')}</ul>
      <p data-delete-error role="alert" hidden></p><form>
        <button type="button" class="ghost" data-delete-cancel>Hủy</button>
        <button type="submit" class="primary">Xóa ${items.length} người ký</button></form>`;
    root.append(dialog);
    return new Promise(resolve => {
      let busy = false;
      dialog.querySelector('[data-delete-cancel]').onclick = () => dialog.close();
      dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
      dialog.querySelector('form').onsubmit = async event => {
        event.preventDefault();
        if (busy) return;
        busy = true;
        dialog.querySelectorAll('button').forEach(button => { button.disabled = true; });
        try {
          await action();
          dialog.close('deleted');
        } catch (error) {
          const message = dialog.querySelector('[data-delete-error]');
          message.textContent = error.message;
          message.hidden = false;
        } finally {
          busy = false;
          dialog.querySelectorAll('button').forEach(button => { button.disabled = false; });
        }
      };
      dialog.addEventListener('close', () => {
        const deleted = dialog.returnValue === 'deleted';
        dialog.remove();
        resolve(deleted);
      }, { once: true });
      dialog.showModal();
      dialog.querySelector('[data-delete-cancel]').focus();
    });
  }
  window.DailyReportsLeaders = { mount };
})();
