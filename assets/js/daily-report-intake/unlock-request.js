(() => {
  'use strict';

  window.DailyReportUnlockRequest = {
    mount({ root, request, notify, getScope, getContext, onSent }) {
      const dialog = document.createElement('dialog');
      dialog.id = 'bcnQuickUnlockDialog';
      dialog.className = 'bcn-dialog card';
      dialog.setAttribute('aria-labelledby', 'bcnQuickUnlockTitle');
      dialog.innerHTML = `<div class="bcn-dialog-header">
        <h3 id="bcnQuickUnlockTitle">Yêu cầu mở khóa báo cáo ngày</h3>
        <button type="button" class="ghost bcn-dialog-close" data-close-unlock aria-label="Đóng">×</button>
      </div><form id="bcnQuickUnlockForm" class="daily-report-form">
        <p class="daily-report-wide" data-unlock-description></p>
        <dl class="daily-report-wide bcn-unlock-report-context">
          <div><dt>Ngày báo cáo được đề nghị</dt><dd><time data-unlock-report-day></time></dd></div>
          <div><dt>Đơn vị báo cáo</dt><dd data-unlock-report-unit></dd></div>
        </dl>
        <p class="daily-report-wide bcn-unlock-context-note">Ngày và đơn vị lấy từ báo cáo đang mở.</p>
        <label class="daily-report-wide"><span>Lý do đề nghị <span class="bcn-required">*</span></span>
          <textarea name="reason" rows="4" required maxlength="2000"
            placeholder="Nêu nội dung cần nhập hoặc bổ sung và lý do đề nghị…"></textarea>
        </label>
        <p class="daily-report-wide" data-unlock-feedback role="alert" hidden></p>
        <div class="bcn-toolbar daily-report-wide">
          <button type="button" class="ghost" data-close-unlock>Hủy bỏ</button>
          <button type="submit" class="primary">Gửi yêu cầu mở khóa</button>
        </div>
      </form>`;
      root.append(dialog);
      const form = dialog.querySelector('form');
      const feedback = form.querySelector('[data-unlock-feedback]');
      const submit = form.querySelector('[type=submit]');
      let context = null;
      let busy = false;

      const isCurrent = value => root.dataset.bcnActiveView === 'input'
        && value.reportDay === getScope()?.reportDay
        && JSON.stringify(value) === JSON.stringify(getContext(value.supplement));

      function open(supplement = false) {
        const next = getContext(supplement);
        if (!next.unitId || !next.scopeId || !isCurrent(next)) {
          notify('Mở đúng báo cáo tại Nhập báo cáo ngày trước khi gửi đề nghị.');
          return;
        }
        context = Object.freeze({ ...next });
        form.reset();
        feedback.hidden = true;
        dialog.querySelector('h3').textContent = supplement
          ? 'Yêu cầu bổ sung báo cáo' : 'Yêu cầu mở khóa báo cáo ngày';
        form.querySelector('[data-unlock-description]').textContent = supplement
          ? 'PV01 xem xét cho phép bổ sung báo cáo này trong 30 phút.'
          : 'Gửi tới PV01 để được mở khóa nhập báo cáo này trong 30 phút.';
        const day = form.querySelector('[data-unlock-report-day]');
        day.dateTime = next.reportDay;
        day.textContent = next.reportDay.split('-').reverse().join('/');
        form.querySelector('[data-unlock-report-unit]').textContent = next.unitName;
        submit.textContent = supplement ? 'Gửi yêu cầu bổ sung' : 'Gửi yêu cầu mở khóa';
        dialog.showModal();
      }

      dialog.querySelectorAll('[data-close-unlock]').forEach(button => {
        button.onclick = () => { if (!busy) dialog.close(); };
      });
      dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
      form.onsubmit = async event => {
        event.preventDefault();
        if (busy || !context || !form.reportValidity()) return;
        const reason = form.elements.reason.value.trim();
        if (!reason) return;
        feedback.hidden = true;
        busy = true;
        submit.disabled = true;
        form.setAttribute('aria-busy', 'true');
        try {
          if (!isCurrent(context)) {
            throw new Error('Ngày hoặc đơn vị báo cáo đã thay đổi. Đóng hộp thoại và mở lại đề nghị từ báo cáo.');
          }
          if (context.supplement && !getScope()?.supplementPermissionVersion) {
            throw new Error('Máy chủ cần khởi động lại để tiếp nhận yêu cầu bổ sung.');
          }
          await request('/unlock-requests', { method: 'POST', body: JSON.stringify({
            unit_id: context.unitId, report_day: context.reportDay,
            scope: { kind: 'WORK_RESULT', id: context.scopeId },
            purpose: context.supplement ? 'REPORT_SUPPLEMENT' : 'REPORTING_WINDOW', reason
          }) });
          dialog.close();
          notify('Đã gửi đề nghị tới PV01. Theo dõi kết quả tại Lịch sử đề nghị.');
          onSent(context);
        } catch (error) {
          feedback.textContent = error.message;
          feedback.hidden = false;
        } finally {
          busy = false;
          submit.disabled = false;
          form.setAttribute('aria-busy', 'false');
        }
      };
      return { open, close: () => dialog.close() };
    }
  };
})();
