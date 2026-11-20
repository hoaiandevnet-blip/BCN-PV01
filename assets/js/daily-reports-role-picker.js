(() => {
  'use strict';
  window.DailyReportRolePicker = {
    mount({ root, accountPicker }) {
      const form = root.querySelector('#bcnRoleForm');
      const role = form.elements.role_code;
      const unit = form.elements.unit_id;
      const metric = form.elements.metric_code;
      const hint = root.querySelector('#bcnRoleEligibility');
      const button = form.querySelector('button.primary');
      const labels = window.DailyReportsUI.roles;
      let selectedAccountId = '';
      let previousRole = '';

      function scope() {
        const account = accountPicker.selected();
        const reporter = role.value === 'UNIT_REPORTER';
        root.querySelector('#bcnCompilerModules').hidden = role.value !== 'PV01_COMPILER';
        unit.disabled = reporter;
        if (reporter) unit.value = account?.team_id ? String(account.team_id) : '';
        else if (previousRole === 'UNIT_REPORTER') unit.value = '';
        metric.disabled = !reporter;
        metric.closest('label').hidden = !reporter;
        if (!reporter) metric.value = '';
        previousRole = role.value;
        if (!account) hint.textContent = 'Chọn tài khoản để xem vai trò phù hợp với đơn vị công tác.';
        else if (account.is_admin) hint.textContent = 'Tài khoản admin đã có toàn quyền. Không cần phân công thêm.';
        else if (!account.team_id) hint.textContent =
          'Gắn đơn vị công tác ở Hệ thống & Phân quyền trước khi giao nhập hoặc tổng hợp báo cáo.';
        else if (account.is_pv01) hint.textContent = role.value === 'PV01_COMPILER'
          ? 'Chỉ tài khoản PV01 đang chọn được giao tổng hợp theo phạm vi bên dưới sau khi bấm Cấp vai trò. '
            + 'Các tài khoản PV01 khác không tự có quyền tổng hợp.'
          : 'PV01 có thể được giao nhập báo cáo của đơn vị hoặc tổng hợp. '
            + 'Muốn giao tổng hợp, chọn Cán bộ tổng hợp PV01 và bấm Cấp vai trò cho đúng tài khoản.';
        else hint.textContent =
          'Đơn vị nhập báo cáo được nhập và gửi hồ sơ của đơn vị mình. Quyền mở Báo cáo ngày được cấp cùng vai trò.';
      }

      function update() {
        const account = accountPicker.selected();
        const previous = role.value;
        const accountId = String(account?.id || '');
        const changed = accountId !== selectedAccountId;
        const choices = account?.is_admin ? [] : account ? [
          ...(account.team_id ? ['UNIT_REPORTER'] : []),
          ...(account.team_id && account.is_pv01 ? ['PV01_COMPILER'] : [])
        ] : ['UNIT_REPORTER', 'PV01_COMPILER'];
        role.replaceChildren(...choices.map(code => new Option(labels[code], code)));
        if (!changed && choices.includes(previous)) role.value = previous;
        if (changed) unit.value = '';
        selectedAccountId = accountId;
        role.disabled = Boolean(account?.is_admin);
        button.disabled = !account || Boolean(account.is_admin);
        scope();
      }

      root.querySelector('#bcnRoleUser').addEventListener('change', update);
      role.addEventListener('change', scope);
      update();
      return { update };
    }
  };
})();
