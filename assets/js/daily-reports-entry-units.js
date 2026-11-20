(() => {
  'use strict';
  window.DailyReportEntryUnits = {
    mount({ root, getScope, onMetricUnitChange }) {
      const forms = ['dailyReportCaseForm', 'bcnSituationForm', 'bcnMetricForm'];
      const controls = forms.map(id => {
        const form = root.querySelector(`#${id}`);
        let fixedInput = form.querySelector('[name="unit_name"], #bcnMetricUnitLabel');
        if (!fixedInput) {
          const label = document.createElement('label');
          label.textContent = 'Đơn vị báo cáo';
          fixedInput = document.createElement('input');
          fixedInput.readOnly = true;
          label.append(fixedInput);
          form.prepend(label);
        }
        const fixedLabel = fixedInput.closest('label');
        fixedLabel.dataset.bcnAssignedUnit = id;
        const assignedHint = document.createElement('small');
        assignedHint.id = `${id}-assigned-unit-hint`;
        assignedHint.textContent = 'Tự động theo đơn vị được phân công cho tài khoản.';
        fixedInput.setAttribute('aria-describedby', assignedHint.id);
        fixedLabel.append(assignedHint);

        const label = document.createElement('label');
        label.dataset.bcnEntryUnit = id;
        label.innerHTML = window.DailyReportsUI.fieldLabel('Đơn vị báo cáo *');
        label.hidden = true;
        const select = document.createElement('select');
        select.name = 'unit_id';
        select.disabled = true;
        const hint = document.createElement('small');
        hint.id = `${id}-admin-unit-hint`;
        hint.textContent = 'Admin được chọn đơn vị báo cáo trong toàn hệ thống.';
        select.setAttribute('aria-describedby', hint.id);
        label.append(select, hint);
        form.prepend(label);
        if (id === 'bcnMetricForm') select.addEventListener('change', onMetricUnitChange);
        return { label, select, fixedLabel, fixedInput };
      });
      return {
        configure(units) {
          const scope = getScope();
          const admin = Boolean(scope?.isAdmin);
          const unitId = String(scope?.unitId || '');
          const name = scope?.unitName || 'Chưa được phân công đơn vị báo cáo';
          for (const { label, select, fixedLabel, fixedInput } of controls) {
            const previous = select.value || unitId;
            if (admin) {
              select.replaceChildren(new Option('Chọn đơn vị báo cáo', ''),
                ...units.map(unit => new Option(unit.name, String(unit.id))));
              select.value = units.some(unit => String(unit.id) === previous) ? previous : '';
            } else {
              select.replaceChildren(new Option(name, unitId));
              select.value = unitId;
            }
            select.required = admin;
            select.disabled = !admin;
            label.hidden = !admin;
            fixedLabel.hidden = admin;
            fixedInput.value = name;
            fixedInput.defaultValue = name;
            fixedInput.readOnly = true;
          }
        }
      };
    }
  };
})();
