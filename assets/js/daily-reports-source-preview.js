(() => {
  'use strict';

  window.DailyReportSourcePreview = {
    mount(root, getScope = () => null) {
      let close = () => {};
      return {
        close() { close(); },
        open(reference) {
          close();
          const source = root.querySelector('#bcnSourceRows');
          const locked = () => root.dataset.bcnEntryLocked === 'true' || reference.readOnly === true
            || Boolean(reference.reportDay && reference.reportDay !== getScope()?.reportDay);
          const marker = document.createComment('source-preview-position');
          source.before(marker);
          const dialog = document.createElement('dialog');
          dialog.className = 'bcn-dialog bcn-source-preview';
          dialog.dataset.sourceType = reference.resourceType;
          dialog.setAttribute('aria-labelledby', 'bcnSourcePreviewTitle');
          dialog.innerHTML = `<header class="bcn-source-preview-header">
            <h2 id="bcnSourcePreviewTitle"></h2>
            <button type="button" class="ghost" data-source-preview-close autofocus>Đóng</button>
            <p data-source-preview-lock hidden></p></header>
            <p data-source-preview-empty role="status" hidden></p>`;
          dialog.querySelector('h2').textContent = reference.resourceType === 'WORK_RESULT'
            ? 'Chi tiết kết quả công tác' : 'Chi tiết tình hình ANTT';
          dialog.append(source);
          root.append(dialog);
          const filter = () => {
            const readOnly = locked();
            const lockNotice = dialog.querySelector('[data-source-preview-lock]');
            lockNotice.hidden = !readOnly;
            lockNotice.textContent = 'Chỉ xem. Chỉnh sửa, gửi lại theo thời hạn và quyền mở khóa.';
            source.querySelectorAll('[data-source-edit], [data-source-action]').forEach(button => {
              button.disabled = readOnly;
            });
            const labels = [...source.querySelectorAll('thead th')].map(cell => cell.textContent);
            const fields = ['date', 'unit', 'category', 'content', 'status', 'actions'];
            source.querySelector('table')?.setAttribute('role', 'presentation');
            let found = false;
            for (const row of source.querySelectorAll('tbody > tr')) {
              const selected = row.dataset.sourceId === reference.resourceId;
              row.hidden = !selected;
              found ||= selected;
              [...row.cells].forEach((cell, index) => {
                cell.dataset.label = labels[index];
                cell.dataset.sourceField = fields[index];
              });
            }
            const empty = dialog.querySelector('[data-source-preview-empty]');
            empty.hidden = found;
            empty.textContent = found ? '' : 'Nội dung không còn trong danh sách. Tải lại dashboard để cập nhật.';
          };
          const observer = new MutationObserver(filter);
          observer.observe(source, { childList: true, subtree: true });
          observer.observe(root, { attributes: true, attributeFilter: ['data-bcn-entry-locked'] });
          let restored = false;
          const restore = () => {
            if (restored) return;
            restored = true;
            observer.disconnect();
            source.querySelector('table')?.removeAttribute('role');
            source.querySelectorAll('tbody > tr').forEach(row => { row.hidden = false; });
            marker.replaceWith(source);
            dialog.remove();
            close = () => {};
          };
          close = () => {
            dialog.close();
            restore();
          };
          dialog.querySelector('[data-source-preview-close]').onclick = close;
          dialog.addEventListener('close', restore, { once: true });
          filter();
          dialog.showModal();
        }
      };
    }
  };
})();
