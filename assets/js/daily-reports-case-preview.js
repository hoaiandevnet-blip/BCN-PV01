(() => {
  'use strict';
  window.DailyReportsCasePreview = {
    mount({ root, request, getScope, notify, unitName, reviewCase, editReturned, getView }) {
      let active = null;
      let generation = 0;
      const close = () => {
        generation += 1;
        active?.close();
        active = null;
      };
      async function open(id) {
        close();
        const current = ++generation;
        const result = await request(`/cases/${encodeURIComponent(id)}`);
        if (current !== generation) return;
        const item = result.case;
        const dialog = document.createElement('dialog');
        dialog.id = 'bcnCasePreview';
        dialog.className = 'bcn-dialog bcn-case-preview';
        dialog.setAttribute('aria-labelledby', 'bcnCasePreviewTitle');
        dialog.innerHTML = window.DailyReportsCasePreviewView.render(result, unitName(item.unit_id));
        root.append(dialog);
        active = dialog;
        dialog.addEventListener('close', () => {
          dialog.remove();
          if (active === dialog) active = null;
        }, { once: true });
        dialog.querySelector('[data-preview-close]').onclick = close;
        const navigation = [...dialog.querySelectorAll('[data-preview-section]')];
        const scroll = dialog.querySelector('.bcn-reader-scroll');
        const selectSection = selected => navigation.forEach(button => {
          if (button === selected) button.setAttribute('aria-current', 'location');
          else button.removeAttribute('aria-current');
        });
        navigation.forEach(button => {
          button.onclick = () => {
            const section = dialog.querySelector('#preview-' + button.dataset.previewSection);
            section.scrollIntoView({ block: 'start' });
            section.focus({ preventScroll: true });
            selectSection(button);
          };
        });
        let scrollFrame = 0;
        scroll.addEventListener('scroll', () => {
          if (scrollFrame) return;
          scrollFrame = requestAnimationFrame(() => {
            scrollFrame = 0;
            if (!dialog.isConnected) return;
            const boundary = scroll.getBoundingClientRect().top + 32;
            const selected = navigation.filter(button => dialog.querySelector('#preview-'
              + button.dataset.previewSection).getBoundingClientRect().top <= boundary).at(-1);
            selectSection(selected || navigation[0]);
          });
        }, { passive: true });
        const scope = getScope();
        const compiler = window.DailyReportsReview.actions(scope, getView(), item.current_state).supplement;
        const reporter = getView() === 'input'
          && scope?.roles.includes('UNIT_REPORTER')
          && (scope.isAdmin || String(scope.unitId) === String(item.unit_id));
        const actions = dialog.querySelector('[data-preview-actions]');
        if ((compiler || reporter) && item.current_state !== 'DRAFT') {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'primary';
          button.dataset.previewSupplement = '';
          button.textContent = !compiler && item.current_state === 'RETURNED'
            ? 'Mở mục bổ sung' : compiler ? 'Trả lại / Yêu cầu bổ sung' : 'Yêu cầu bổ sung';
          actions.append(button);
          button.onclick = async () => {
            button.disabled = true;
            try {
              if (compiler) {
                if (await reviewCase(item.id, 'request-supplement')) await open(item.id);
              } else if (item.current_state === 'RETURNED') {
                close();
                await editReturned(item.id);
              } else {
                if (!scope.supplementPermissionVersion) {
                  throw new Error('Máy chủ cần khởi động lại để tiếp nhận yêu cầu bổ sung.');
                }
                const values = await window.DailyReportsUI.form({
                  title: 'Đề nghị bổ sung hồ sơ',
                  description: 'Gửi tới Trung tâm để xét duyệt. Hồ sơ giữ nguyên và chỉ được sửa sau khi được duyệt.',
                  fields: '<label class="daily-report-wide">Lý do / nội dung cần bổ sung *'
                    + '<textarea name="reason" required maxlength="2000"></textarea></label>',
                  submit: 'Gửi yêu cầu'
                });
                if (!values) return;
                await request('/unlock-requests', { method: 'POST', body: JSON.stringify({
                  unit_id: item.unit_id, report_day: item.report_day, purpose: 'CASE_SUPPLEMENT',
                  scope: { kind: 'CASE', id: item.id }, reason: values.reason
                }) });
                button.textContent = 'Đang chờ Trung tâm duyệt';
                button.dataset.pending = 'true';
                notify('Đã gửi yêu cầu bổ sung. Hồ sơ chỉ được sửa sau khi Trung tâm duyệt.');
              }
            } catch (error) {
              notify(error.message);
            } finally {
              button.disabled = button.dataset.pending === 'true';
            }
          };
        }
        dialog.showModal();
        window.lucide?.createIcons({ root: dialog });
        const attachments = window.DailyReportAttachments;
        const tasks = [attachments.list(dialog.querySelector('[data-preview-files]'), {
          resource: 'cases', id, request, notify, readOnly: true, current: () => active === dialog
        })];
        dialog.querySelectorAll('[data-preview-event-files]').forEach(container => {
          tasks.push(attachments.list(container, { resource: 'events', id: container.dataset.previewEventFiles,
            request, notify, readOnly: true, current: () => active === dialog }));
        });
        await Promise.all(tasks);
      }
      return { open, close };
    }
  };
})();
