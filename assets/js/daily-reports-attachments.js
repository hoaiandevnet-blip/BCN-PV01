(() => {
  'use strict';
  const pickers = new WeakMap();
  const ui = () => window.DailyReportsUI;
  const accept = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg';
  const size = bytes => bytes < 1024 * 1024
    ? `${Math.max(1, Math.ceil(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  function icons(root) {
    window.lucide?.createIcons({ root, attrs: { 'stroke-width': 1.8, focusable: 'false' } });
  }
  function picker(form, before = null) {
    if (pickers.has(form)) return pickers.get(form);
    const section = document.createElement('fieldset');
    section.className = 'bcn-attachment-picker daily-report-wide';
    section.innerHTML = `<legend>${icon('paperclip')} Văn bản đính kèm <small>Không bắt buộc</small></legend>
      <p>Báo cáo, quyết định và tài liệu liên quan đến nội dung đang nhập.</p>
      <label class="bcn-file-control"><span>${icon('file-up')} Chọn văn bản</span>
        <input type="file" accept="${accept}" multiple aria-label="Chọn văn bản đính kèm"></label>
      <small>PDF, Word, Excel, JPG, PNG · Tối đa 10 tệp, 10 MB/tệp, tổng 20 MB.</small>
      <p class="bcn-attachment-error" role="alert" hidden></p>
      <ul class="bcn-attachment-queue" aria-live="polite"></ul>`;
    form.insertBefore(section, before);
    const input = section.querySelector('input');
    const error = section.querySelector('[role="alert"]');
    let files = [];
    function render() {
      section.querySelector('ul').innerHTML = files.map((file, index) => `<li>
        <span class="bcn-file-icon">${icon('file-text')}</span>
        <span class="bcn-file-copy"><strong>${ui().escape(file.name)}</strong><small>${size(file.size)}</small></span>
        <button type="button" class="ghost" data-remove-file="${index}"
          aria-label="Bỏ tệp ${ui().escape(file.name)}">${icon('x')}</button></li>`).join('');
      section.querySelectorAll('[data-remove-file]').forEach(button => {
        button.onclick = () => {
          files.splice(Number(button.dataset.removeFile), 1);
          error.hidden = true;
          render();
        };
      });
      icons(section);
    }
    input.onchange = () => {
      error.hidden = true;
      const next = [...files];
      for (const file of input.files) {
        if (!next.some(value => value.name === file.name && value.size === file.size
          && value.lastModified === file.lastModified)) next.push(file);
      }
      let message = '';
      if (next.some(file => !/\.(pdf|docx?|xlsx?|png|jpe?g)$/i.test(file.name))) {
        message = 'Chỉ chọn văn bản PDF, Word, Excel hoặc ảnh JPG, PNG.';
      } else if (next.some(file => !file.size || file.size > 10 * 1024 * 1024)) {
        message = 'Tệp phải có nội dung và không vượt quá 10 MB.';
      } else if (next.length > 10 || next.reduce((sum, file) => sum + file.size, 0) > 20 * 1024 * 1024) {
        message = 'Chọn tối đa 10 tệp, tổng dung lượng không quá 20 MB.';
      }
      if (message) {
        error.textContent = message;
        error.hidden = false;
      } else {
        files = next;
        render();
      }
      input.value = '';
    };
    const state = {
      async read() {
        if (!error.hidden) throw new Error(error.textContent);
        return Promise.all(files.map(file => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error(`Không đọc được tệp ${file.name}. Vui lòng chọn lại.`));
          reader.onload = () => resolve({ name: file.name, content: String(reader.result).split(',')[1] });
          reader.readAsDataURL(file);
        })));
      },
      reset() {
        files = [];
        input.value = '';
        error.hidden = true;
        render();
      }
    };
    form.addEventListener('reset', state.reset);
    pickers.set(form, state);
    icons(section);
    return state;
  }
  async function save(form, operation) {
    if (form.dataset.attachmentSaving === 'true') return;
    form.dataset.attachmentSaving = 'true';
    const controls = [...form.querySelectorAll('button:not(:disabled), .bcn-attachment-picker')];
    controls.forEach(control => { control.disabled = true; });
    try {
      return await operation(await read(form));
    } finally {
      controls.forEach(control => { control.disabled = false; });
      delete form.dataset.attachmentSaving;
    }
  }
  async function read(form) {
    return pickers.get(form)?.read() || [];
  }
  function reset(form) {
    pickers.get(form)?.reset();
  }
  async function list(container, { resource, id, request, notify, onChange, current = () => true, readOnly = false }) {
    const endpoint = `/${resource}/${encodeURIComponent(id)}/attachments`;
    container.innerHTML = '<p role="status">Đang tải văn bản…</p>';
    let result;
    try {
      result = await request(endpoint);
    } catch (error) {
      if (!current() || !container.isConnected) return;
      container.innerHTML = `<p class="bcn-attachment-error" role="alert">${ui().escape(error.message)}</p>
        <button class="ghost" type="button">Tải lại văn bản</button>`;
      container.querySelector('button').onclick = () => list(container,
        { resource, id, request, notify, onChange, current, readOnly }).catch(value => notify(value.message));
      return;
    }
    if (!current() || !container.isConnected) return;
    container.classList.add('bcn-attachment-list');
    container.innerHTML = `<h4>${icon('paperclip')} Văn bản đính kèm
      <span>${result.attachments.length}</span></h4><ul>${result.attachments.map(file => {
      const link = '/api/bao-cao-ngay' + endpoint + '/' + encodeURIComponent(file.id);
      const preview = ['application/pdf', 'image/png', 'image/jpeg', 'video/mp4', 'video/quicktime', 'video/webm']
        .includes(file.media_type);
      return `<li data-attachment-id="${ui().escape(file.id)}"><span class="bcn-file-icon">${icon('file-text')}</span>
        <div class="bcn-file-copy"><strong>${ui().escape(file.file_name)}</strong>
          <small>${size(file.byte_size)} · ${file.sealed_at ? 'Đã gửi · lưu đối chiếu' : 'Bản nháp'}</small></div>
        <div class="bcn-file-actions">${preview ? `<a class="ghost" href="${link}?inline=1"
          target="_blank" rel="noopener" aria-label="Xem ${ui().escape(file.file_name)}">${icon('eye')} Xem</a>` : ''}
          <a class="ghost" href="${link}" download>${icon('download')} Tải về</a>
          ${!readOnly && result.can_edit && !file.sealed_at ? `<button type="button" class="ghost"
            data-delete-attachment="${ui().escape(file.id)}">${icon('trash-2')} Xóa</button>` : ''}</div></li>`;
    }).join('') || '<li class="bcn-attachment-empty">Chưa có văn bản đính kèm.</li>'}</ul>`;
    container.querySelectorAll('[data-delete-attachment]').forEach(button => {
      button.onclick = async () => {
        const confirmed = await ui().form({ title: 'Xóa văn bản nháp?',
          description: 'Văn bản chưa gửi sẽ được xóa khỏi hồ sơ. Bạn có thể đính kèm lại nếu cần.',
          fields: '', submit: 'Xóa văn bản' });
        if (!confirmed) return;
        try {
          await request(endpoint + '/' + button.dataset.deleteAttachment, { method: 'DELETE' });
          notify('Đã xóa văn bản nháp.');
          if (onChange) await onChange();
          else await list(container, { resource, id, request, notify, current });
        } catch (error) { notify(error.message); }
      };
    });
    if (!readOnly && result.can_edit) {
      const form = document.createElement('form');
      form.className = 'bcn-attachment-add-form';
      picker(form);
      form.insertAdjacentHTML('beforeend', '<button class="primary" type="submit">Lưu văn bản bổ sung</button>');
      container.append(form);
      form.onsubmit = async event => {
        event.preventDefault();
        try {
          await save(form, async attachments => {
            if (!attachments.length) throw new Error('Chọn ít nhất một văn bản.');
            await request(endpoint, { method: 'POST', body: JSON.stringify({ attachments }) });
            notify('Đã lưu văn bản đính kèm.');
            if (onChange) await onChange();
            else await list(container, { resource, id, request, notify, current });
          });
        } catch (error) { notify(error.message); }
      };
    }
    icons(container);
  }
  window.DailyReportAttachments = { picker, read, reset, save, list };
})();
