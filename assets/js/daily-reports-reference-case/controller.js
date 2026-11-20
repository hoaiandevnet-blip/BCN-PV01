(() => {
  'use strict';
  const infoFields = ['incident_status',
    'details', 'evidence', 'handling_result', 'handling_unit_id'];
  const dates = ['ended_at'];
  const localTime = value => value ? new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 16) : '';
  const utcTime = value => value ? new Date(`${value}:00+07:00`).toISOString() : null;

  function editor({ form, item = null, readOnly = false, request, notify, getScope, onSaved, options }) {
    const info = item?.reference_info || {};
    form.classList.add('daily-report-form', 'bcn-reference-form');
    form.innerHTML = window.DailyReportReferenceView.render({ edit: Boolean(item), readOnly });
    const externalSubmit = form.closest('.bcn-case-detail')?.querySelector('#bcnCaseUpdate');
    if (externalSubmit) form.querySelector('button[type="submit"]')?.remove();
    if (item) form.querySelector('[data-reference-count="subjects"]').closest('section').id = 'bcnEditPersons';
    const incidentStatus = form.elements.incident_status;
    const businessSelect = form.elements.business_code;

    function syncIncidentStatuses(targetValue = incidentStatus.value) {
      const isPphs = (window.DailyReportsUI?.canonicalBusinessCode
        ? window.DailyReportsUI.canonicalBusinessCode(businessSelect.value)
        : businessSelect.value) === 'PPHS';
      const available = isPphs
        ? ['Giải quyết tin báo tố giác tội phạm', 'Giai đoạn điều tra']
        : ['Tiếp nhận vụ việc ban đầu', 'Giải quyết tin báo tố giác tội phạm', 'Giai đoạn điều tra'];
      incidentStatus.replaceChildren(
        new Option('Chọn trạng thái vụ việc', ''),
        ...available.map(name => new Option(name, name))
      );
      if (targetValue && available.includes(targetValue)) {
        incidentStatus.value = targetValue;
      } else if (info.incident_status && info.incident_status === targetValue) {
        const savedStatus = new Option(`${info.incident_status} (đã lưu)`, info.incident_status);
        savedStatus.disabled = true;
        incidentStatus.add(savedStatus);
        incidentStatus.value = info.incident_status;
      } else {
        incidentStatus.value = '';
      }
    }

    function syncDomainLocks() {
      const code = (window.DailyReportsUI?.canonicalBusinessCode
        ? window.DailyReportsUI.canonicalBusinessCode(businessSelect.value)
        : businessSelect.value) || businessSelect.value;
      const isOther = code === 'TINH_HINH_KHAC';
      handling?.setLocked(isOther);
      const sectionEl = form.querySelector('#bcnHandlingSection');
      if (sectionEl) sectionEl.dataset.locked = String(isOther);
    }

    businessSelect.addEventListener('change', () => {
      syncIncidentStatuses(incidentStatus.value);
      syncDomainLocks();
    });
    syncIncidentStatuses(info.incident_status || '');
    const lists = window.DailyReportReferenceLists.mount(form, info, { readOnly });
    const media = window.DailyReportReferenceMedia.mount(form);
    const numbers = window.DailyReportReferenceNumbers.mount(form);
    const handling = window.DailyReportHandlingResult.mount(form, info, { readOnly });
    syncDomainLocks();
    let caseId = item?.id || window.BcnIds.randomUUID();
    let busy = false;
    let identity = '';
    let supportsHandlingDetails = false;
    let supportsSubjectDetails = false;
    const status = form.querySelector('[data-reference-status]');
    const legal = window.DailyReportReferenceLegal.mount({ form, item, readOnly, request, getScope });
    function populateSelect(select, units, placeholder, chosen) {
      select.replaceChildren(new Option(placeholder, ''), ...units.map(unit => new Option(unit.name, String(unit.id))));
      select.value = String(chosen || '');
    }
    function configure(data) {
      supportsHandlingDetails = data.handling_details_version >= 2;
      supportsSubjectDetails = data.subject_details_version >= 1;
      const scope = getScope();
      const scopeKey = `${scope?.userId}:${scope?.unitId}`;
      const creatorId = item?.unit_id || scope?.unitId || '';
      const creatorName = data.units.find(unit => String(unit.id) === String(creatorId))?.name
        || info.creator_unit || scope?.unitName || 'Chưa có đơn vị';
      const creationUnits = item || !scope?.isAdmin
        ? [{ id: creatorId, name: creatorName }]
        : data.units;
      populateSelect(form.elements.unit_id, creationUnits, 'Chọn cơ quan tạo',
        form.elements.unit_id.value || item?.unit_id || scope?.unitId);
      form.elements.unit_id.disabled = readOnly || Boolean(item) || !scope?.isAdmin;
      for (const key of ['handling_unit_id']) {
        populateSelect(form.elements[key], data.units, 'Chọn đơn vị', form.elements[key].value || info[key]);
      }
      for (const input of form.querySelectorAll('[data-reference-options]')) {
        const id = `${form.id}-${input.name}-options`;
        let list = form.querySelector(`[id="${id}"]`);
        if (!list) {
          list = document.createElement('datalist');
          list.id = id;
          form.append(list);
        }
        list.replaceChildren(...(data.options[input.name] || []).map(value => new Option(value, value)));
        input.setAttribute('list', id);
      }
      if (identity !== scopeKey) {
        identity = scopeKey;
        restore();
      }
    }
    function restore() {
      form.elements.business_code.value = item?.business_code || '';
      syncIncidentStatuses(info.incident_status || '');
      for (const key of infoFields) {
        if (form.elements[key]) form.elements[key].value = (key === 'incident_status' ? incidentStatus.value : (info[key] || ''));
      }
      for (const key of dates) form.elements[key].value = localTime(info[key]);
      numbers.reset(info);
      form.elements.title.value = item?.title || '';
      form.elements.summary.value = item?.summary || '';
      form.elements.occurred_at.value = localTime(item?.occurred_at);
      handling.reset(info);
      form.elements.entered_at.value = localTime(info.entered_at || item?.created_at
        || getScope()?.serverNow || new Date().toISOString()).slice(0, 10);
      lists.reset();
      media.reset();
      status.textContent = '';
      legal.reset();
      syncDomainLocks();
    }
    form.addEventListener('reset', () => queueMicrotask(() => {
      if (!item) caseId = window.BcnIds.randomUUID();
      restore();
    }));
    form.addEventListener('input', event => {
      if (!['death_count', 'injured_count', 'property_damage'].includes(event.target.name)) {
        event.target.setCustomValidity?.('');
      }
    });

    async function saveCase({ submit = false } = {}) {
      if (busy || readOnly) return null;
      if (item?.current_state === 'RETURNED' && externalSubmit && !getScope()?.caseUpdateResubmitVersion) {
        status.textContent = 'Máy chủ cần khởi động lại để cập nhật và gửi lại hồ sơ. Chưa lưu thay đổi.';
        notify(status.textContent);
        throw new Error(status.textContent);
      }
      for (const key of ['business_code', 'unit_id', 'title', 'incident_status']) {
        const input = form.elements[key];
        if (input) input.setCustomValidity(input.value?.trim() ? '' : 'Trường này là bắt buộc.');
      }
      if (!form.reportValidity() || !lists.validate()) {
        throw new Error('Vui lòng điền đầy đủ thông tin vụ việc tại Mục I.');
      }
      if (!supportsSubjectDetails && lists.read().subjects.length) {
        status.textContent = 'Máy chủ chưa cập nhật thông tin đối tượng. Cần khởi động lại máy chủ trước khi lưu.';
        notify(status.textContent);
        throw new Error(status.textContent);
      }
      if (!supportsHandlingDetails && handling.requiresSupport()) {
        status.textContent = 'Máy chủ chưa cập nhật phần kết quả xử lý. Hãy khởi động lại server trước khi lưu.';
        notify(status.textContent);
        throw new Error(status.textContent);
      }
      const referenceInfo = Object.fromEntries(
        infoFields.filter(key => form.elements[key]).map(key => [key, form.elements[key].value.trim()])
      );
      for (const key of dates) referenceInfo[key] = utcTime(form.elements[key].value);
      if (item) referenceInfo.recorded_at = info.recorded_at ?? null;
      Object.assign(referenceInfo, numbers.read(), handling.read());
      Object.assign(referenceInfo, lists.read());
      try {
        legal.apply(referenceInfo);
      } catch (error) {
        status.textContent = error.message;
        throw error;
      }
      const body = { id: caseId, unit_id: form.elements.unit_id.value,
        business_code: form.elements.business_code.value, title: form.elements.title.value.trim(),
        summary: form.elements.summary.value.trim(), occurred_at: utcTime(form.elements.occurred_at.value),
        report_day: item?.report_day || getScope()?.reportDay, reference_info: referenceInfo };
      if (item) body.version = item.version;
      if (item?.current_state === 'RETURNED' && externalSubmit) body.resubmit = true;
      busy = true;
      const controls = [...form.querySelectorAll('button:not(:disabled)'), ...(externalSubmit ? [externalSubmit] : [])];
      controls.forEach(button => { button.disabled = true; });
      status.textContent = 'Đang lưu vụ việc…';
      try {
        body.attachments = await media.read();
        const result = await request(item ? `/reference-cases/${item.id}` : '/reference-cases', {
          method: item ? 'PATCH' : 'POST', body: JSON.stringify(body)
        });
        if (submit && result?.case?.id && !body.resubmit) {
          try {
            await request(`/cases/${result.case.id}/submit`, { method: 'POST' });
          } catch (submitErr) {
            console.warn('Case submit warning:', submitErr);
          }
        }
        if (!item) {
          const unitId = form.elements.unit_id.value;
          form.reset();
          caseId = window.BcnIds.randomUUID();
          await Promise.resolve();
          form.elements.unit_id.value = unitId;
        }
        status.textContent = body.resubmit ? 'Đã cập nhật và gửi lại hồ sơ cho Trung tâm.'
          : item ? 'Đã lưu chỉnh sửa.' : `Đã tạo vụ việc ${result.case.stable_code}.`;
        notify(status.textContent);
        await onSaved(result.case);
        return result.case;
      } catch (error) {
        status.textContent = error.message;
        notify(error.message);
        throw error;
      } finally {
        busy = false;
        controls.forEach(button => { button.disabled = false; });
      }
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!item) {
        const unifiedSubmitBtn = document.querySelector('#bcnSubmitReportBtn');
        if (unifiedSubmitBtn) {
          unifiedSubmitBtn.click();
          return;
        }
      }
      try {
        await saveCase({ submit: false });
      } catch {
        // Handled within saveCase
      }
    });
    configure(options);
    restore();
    if (readOnly) form.querySelectorAll('input,select,textarea,'
      + 'button:not([data-handling-open]):not([data-reference-edit="subjects"])')
      .forEach(input => { input.disabled = true; });
    return {
      configure,
      reset: () => form.reset(),
      getForm: () => form,
      isValid: () => {
        for (const key of ['business_code', 'unit_id', 'title', 'incident_status']) {
          const input = form.elements[key];
          if (input) input.setCustomValidity(input.value?.trim() ? '' : 'Trường này là bắt buộc.');
        }
        return form.checkValidity() && form.reportValidity() && lists.validate();
      },
      submit: () => saveCase({ submit: true }),
      saveCase
    };
  }

  window.DailyReportReferenceCase = {
    editor,
    mount({ root, request, notify, getScope, refresh }) {
      const pane = root.querySelector('[data-bcn-pane="input"]');
      pane.classList.add('bcn-reference-case-active');
      const card = document.createElement('section');
      card.className = 'card daily-report-list-card bcn-intake-section';
      card.id = 'bcnReferenceCaseCard';
      card.innerHTML = '<h2 class="bcn-entry-heading"><span class="bcn-entry-heading-number">I</span> '
        + '<span>VỤ VIỆC VÀ DIỄN BIẾN</span></h2>'
        + '<div class="bcn-incident-toggle-bar">'
        + '  <div class="bcn-incident-toggle-info">'
        + '    <div class="bcn-incident-toggle-icon-pill">'
        + '      <svg class="bcn-toggle-head-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" '
        + '        stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'
        + '        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'
        + '        <path d="m9 12 2 2 4-4"/>'
        + '      </svg>'
        + '    </div>'
        + '    <div class="bcn-incident-toggle-text-block">'
        + '      <span class="bcn-incident-toggle-label">Tình hình vụ việc trong ngày:</span>'
        + '      <span class="bcn-incident-toggle-hint">Chọn trạng thái để hiển thị biểu mẫu báo cáo phù hợp</span>'
        + '    </div>'
        + '  </div>'
        + '  <div class="bcn-incident-toggle-group" role="radiogroup" aria-label="Tình hình vụ việc">'
        + '    <label class="bcn-toggle-btn active" data-bcn-choice="none">'
        + '      <input type="radio" name="bcn_incident_choice" value="none" checked>'
        + '      <span class="bcn-toggle-indicator bcn-ind-normal">'
        + '        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        + '          stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">'
        + '          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'
        + '          <path d="m9 12 2 2 4-4"/>'
        + '        </svg>'
        + '      </span>'
        + '      <span class="bcn-toggle-btn-label">Không có vụ việc</span>'
        + '      <span class="bcn-toggle-pill bcn-pill-normal">Ổn định</span>'
        + '    </label>'
        + '    <label class="bcn-toggle-btn" data-bcn-choice="has_incident">'
        + '      <input type="radio" name="bcn_incident_choice" value="has_incident">'
        + '      <span class="bcn-toggle-indicator bcn-ind-alert">'
        + '        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        + '          stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">'
        + '          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>'
        + '          <line x1="12" y1="9" x2="12" y2="13"/>'
        + '          <line x1="12" y1="17" x2="12.01" y2="17"/>'
        + '        </svg>'
        + '      </span>'
        + '      <span class="bcn-toggle-btn-label">Có vụ việc phát sinh</span>'
        + '      <span class="bcn-toggle-pill bcn-pill-alert">Nhập hồ sơ</span>'
        + '    </label>'
        + '  </div>'
        + '</div>'
        + '<div id="bcnNormalSituationContainer" class="bcn-normal-situation-wrap">'
        + '  <div class="bcn-normal-situation-card">'
        + '    <div class="bcn-normal-situation-body">'
        + '      <div class="bcn-normal-situation-icon-wrap">'
        + '        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        + '          stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'
        + '          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'
        + '          <path d="m9 12 2 2 4-4"/>'
        + '        </svg>'
        + '      </div>'
        + '      <div class="bcn-normal-situation-content">'
        + '        <div class="bcn-normal-situation-line">'
        + '          <span class="bcn-normal-status-badge">✓ Ghi nhận tình hình</span>'
        + '          <span class="bcn-situation-display-text" id="bcnSituationDisplayText">'
        + '            Tình hình trong ngày bình thường</span>'
        + '          <button type="button" class="bcn-btn-custom-situation" id="bcnEditSituationBtn" '
        + '            title="Nhấn nếu muốn ghi chú bổ sung tình hình khác">'
        + '            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        + '              stroke-width="2">'
        + '              <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>'
        + '            </svg>'
        + '            <span>Tùy chỉnh</span>'
        + '          </button>'
        + '        </div>'
        + '        <p class="bcn-situation-hint">'
        + '          Tình hình an ninh, trật tự trên địa bàn ổn định, không phát sinh vụ việc vi phạm pháp luật.'
        + '        </p>'
        + '        <div id="bcnNormalCustomInputWrap" class="bcn-normal-custom-wrap" hidden>'
        + '          <input type="text" id="bcnNormalSituationText" name="situation_narrative" '
        + '            class="bcn-normal-custom-input" value="Tình hình trong ngày bình thường" '
        + '            placeholder="Nhập ghi chú diễn biến tình hình trong ngày..."/>'
        + '          <button type="button" class="bcn-normal-custom-done-btn" id="bcnDoneSituationBtn">Lưu</button>'
        + '        </div>'
        + '      </div>'
        + '    </div>'
        + '  </div>'
        + '</div>'
        + '<div id="bcnIncidentDetailedContainer" class="bcn-incident-detailed-wrap" hidden>'
        + '  <div class="bcn-incident-notice-banner">'
        + '    <span class="bcn-notice-dot"></span>'
        + '    <span>Chế độ: <strong>Lập hồ sơ vụ việc chi tiết</strong> — Các trường có dấu '
        + '      <span class="bcn-required">*</span> là bắt buộc.</span>'
        + '  </div>'
        + '  <form id="bcnReferenceCaseForm"></form>'
        + '</div>';
      pane.insertBefore(card, root.querySelector('#bcnDailyIntake'));
      const normalContainer = card.querySelector('#bcnNormalSituationContainer');
      const detailedContainer = card.querySelector('#bcnIncidentDetailedContainer');
      const toggleLabels = card.querySelectorAll('[data-bcn-choice]');
      const radioInputs = card.querySelectorAll('input[name="bcn_incident_choice"]');

      function setIncidentChoice(choice) {
        radioInputs.forEach(radio => { radio.checked = (radio.value === choice); });
        toggleLabels.forEach(label => {
          label.classList.toggle('active', label.dataset.bcnChoice === choice);
        });
        if (choice === 'has_incident') {
          normalContainer.hidden = true;
          detailedContainer.hidden = false;
        } else {
          normalContainer.hidden = false;
          detailedContainer.hidden = true;
        }
      }

      toggleLabels.forEach(label => {
        label.onclick = () => setIncidentChoice(label.dataset.bcnChoice);
      });
      radioInputs.forEach(radio => {
        radio.onchange = () => setIncidentChoice(radio.value);
      });

      const editBtn = card.querySelector('#bcnEditSituationBtn');
      const customWrap = card.querySelector('#bcnNormalCustomInputWrap');
      const sitInput = card.querySelector('#bcnNormalSituationText');
      const displayTxt = card.querySelector('#bcnSituationDisplayText');
      const doneBtn = card.querySelector('#bcnDoneSituationBtn');

      function updateSituationDisplay() {
        if (!sitInput || !displayTxt) return;
        const val = sitInput.value.trim() || 'Tình hình trong ngày bình thường';
        sitInput.value = val;
        displayTxt.textContent = val;
        if (customWrap) customWrap.hidden = true;
      }

      if (editBtn && customWrap && sitInput) {
        editBtn.onclick = () => {
          customWrap.hidden = !customWrap.hidden;
          if (!customWrap.hidden) {
            sitInput.focus();
            sitInput.select();
          }
        };
        if (doneBtn) doneBtn.onclick = updateSituationDisplay;
        sitInput.onkeydown = e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            updateSituationDisplay();
          }
        };
      }

      let data = { units: [], options: {} };
      let actor = null;
      let pending;
      const controller = editor({ form: card.querySelector('form'), request, notify, getScope,
        options: data, onSaved: refresh });

      const instance = {
        reset() {
          actor = null;
          pending = null;
          setIncidentChoice('none');
          if (sitInput) sitInput.value = 'Tình hình trong ngày bình thường';
          if (displayTxt) displayTxt.textContent = 'Tình hình trong ngày bình thường';
          if (customWrap) customWrap.hidden = true;
          controller.reset();
        },
        hasIncident: () => card.querySelector('input[name="bcn_incident_choice"]:checked')?.value === 'has_incident',
        setIncidentChoice,
        getSituationNarrative: () => sitInput?.value || 'Tình hình trong ngày bình thường',
        setSituationNarrative: text => {
          const val = text || 'Tình hình trong ngày bình thường';
          if (sitInput) sitInput.value = val;
          if (displayTxt) displayTxt.textContent = val;
        },
        lockForm(isLocked) {
          card.querySelectorAll('input, select, textarea, button').forEach(el => {
            el.disabled = isLocked;
          });
        },
        controller,
        options: () => data,
        async configure(units, { reload = false } = {}) {
          const scope = getScope();
          card.hidden = !scope?.isAdmin && !scope?.roles?.includes('UNIT_REPORTER');
          if (card.hidden) return;
          controller.configure({ ...data, units: data.units.length ? data.units : units });
          if (actor === scope?.userId && !reload) return;
          if (!pending) pending = request('/reference-case-options');
          try {
            data = await pending;
            actor = scope?.userId;
            controller.configure(data);
          } catch (error) {
            notify(error.message);
          } finally {
            pending = null;
          }
        }
      };
      window.DailyReportReferenceCase.activeInstance = instance;
      return instance;
    }
  };
})();
