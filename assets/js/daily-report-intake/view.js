(() => {
  'use strict';
  const schema = window.DailyReportIntakeSchema;
  const marker = '<span class="bcn-intake-required" aria-label="bắt buộc">*</span>';

  function formatTimeDiff(ms) {
    if (ms <= 0) return '00:00';
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  window.DailyReportIntake = {
    mount({ root, request, notify, getScope, refresh, previewCase }) {
      const pane = root.querySelector('[data-bcn-pane="input"]');
      const escape = window.DailyReportsUI.escape;
      pane.classList.add('bcn-intake-active');
      pane.classList.add('bcn-entry-ui');

      // 1. Cutoff Lock Banner
      const lockBanner = document.createElement('div');
      lockBanner.id = 'bcnCutoffLockBanner';
      lockBanner.className = 'bcn-cutoff-lock-banner';
      lockBanner.hidden = true;
      lockBanner.innerHTML = `<div class="bcn-lock-banner-content">
        <span class="bcn-lock-badge-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round" focusable="false">
            <rect x="5" y="10" width="14" height="11" rx="2"/>
            <path d="M8 10V7a4 4 0 0 1 8 0v3"/>
            <circle cx="12" cy="15" r="1"/><path d="M12 16v2"/>
          </svg>
        </span>
        <div class="bcn-lock-text">
          <h4>Đã khóa nhập báo cáo từ 10:00</h4>
          <p>Toàn bộ phần nhập, chỉnh sửa và gửi báo cáo đang khóa. Gửi yêu cầu để PV01 xem xét mở lại trong 30 phút.</p>
        </div>
        <button type="button" class="primary bcn-btn-unlock-trigger" id="bcnUnlockTriggerBtn">
          <i data-lucide="key-round"></i> Yêu cầu mở khóa (30 phút)
        </button>
      </div>`;
      pane.prepend(lockBanner);
      const lockDescription = lockBanner.querySelector('.bcn-lock-text p').textContent;

      // 2. Unlocked Active Banner
      const unlockedBanner = document.createElement('div');
      unlockedBanner.id = 'bcnUnlockedBanner';
      unlockedBanner.className = 'bcn-unlocked-banner';
      unlockedBanner.hidden = true;
      unlockedBanner.innerHTML = `<span class="bcn-unlocked-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round" focusable="false">
            <rect x="5" y="10" width="14" height="11" rx="2"/>
            <path d="M8 10V7a4 4 0 0 1 7.5-2"/>
            <path d="m9 15 2 2 4-4"/>
          </svg>
        </span>
        <div class="bcn-unlocked-text">
          <strong>Đã được PV01 mở khóa nhập báo cáo ngày</strong>
          <span>Thời gian còn lại: <span class="bcn-countdown-highlight" id="bcnUnlockCountdownTimer">30:00</span>
          (Thời hạn quy định 30 phút)</span>
        </div>`;
      lockBanner.after(unlockedBanner);

      // 3. Submitted Report Merged Summary Card
      const submittedCard = document.createElement('section');
      submittedCard.id = 'bcnSubmittedReportCard';
      submittedCard.className = 'card daily-report-list-card bcn-submitted-report-card';
      submittedCard.hidden = true;
      unlockedBanner.after(submittedCard);
      submittedCard.addEventListener('click', event => {
        const button = event.target.closest('[data-incident-preview]');
        if (button) previewCase(button.dataset.incidentPreview).catch(error => notify(error.message));
      });

      // 5. Section II Form
      const form = document.createElement('form');
      form.id = 'bcnDailyIntake';
      form.className = 'bcn-daily-intake';
      const numericOnly = new Map([
        ['guns', false], ['ammunition', false], ['primitive_weapons', false],
        ['explosives', true], ['fireworks', true], ['community_sentences', false],
        ['released_prisoners', false], ['parole', false], ['delinquent_youth', false],
        ['community_rehabilitation', false], ['suspected_drug_users', false],
        ...schema.patrolFields.map(([key]) => [key, false])
      ]);

      form.innerHTML = `<section class="card bcn-intake-section">
        <div class="daily-report-form bcn-intake-meta">
          <label data-intake-unit-choice><span>Đơn vị báo cáo ${marker}</span>
            <select name="unit_id" required></select></label>
          <label data-intake-unit-assigned hidden><span>Đơn vị báo cáo ${marker}</span>
            <input type="text" data-intake-unit-name readonly></label>
          <input name="report_day" type="hidden">
        </div>
        <h2 class="bcn-entry-heading"><span class="bcn-entry-heading-number">II</span>
          <span>KẾT QUẢ CÔNG TÁC CÔNG AN</span></h2>
        <p>Đơn vị báo cáo phải nhập đủ các chỉ tiêu có dấu ${marker}. Không phát sinh thì nhập 0.</p>
        ${schema.entryGroups.map(([title, fields], groupIndex) => `<fieldset class="bcn-intake-metrics"
          data-intake-group="${groupIndex}">
          <legend>${title}</legend><div class="daily-report-form">
            ${(groupIndex === 0 ? [...fields.filter(([key]) => key !== 'primitive_weapons'),
              ...fields.filter(([key]) => key === 'primitive_weapons')] : fields)
              .map(([key, label, unit, decimal]) => key === 'primitive_weapons'
              ? `<div class="bcn-primitive-weapons"><span class="bcn-primitive-title">
                  ${label.replace(/\s+tiếp nhận$/u, '')}</span>
                <div class="bcn-primitive-fields"><label><span>Số lượng ${marker}</span>
                  <input name="value_primitive_weapons" type="text" pattern="[0-9]+" inputmode="numeric" required>
                </label><div class="bcn-weapon-label"><label for="bcnWeaponType">Loại vũ khí</label>
                  <div class="bcn-weapon-picker">
                    <input id="bcnWeaponType" name="primitive_weapon_type" type="text" role="combobox"
                      aria-expanded="false" aria-autocomplete="list" aria-controls="bcnWeaponOptions"
                      maxlength="200" placeholder="Tìm hoặc thêm loại vũ khí" autocomplete="off">
                    <button type="button" class="bcn-weapon-toggle" aria-label="Mở danh sách loại vũ khí">
                      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button>
                  </div><div class="bcn-weapon-selected" data-weapon-selected
                    aria-label="Các loại vũ khí đã chọn" hidden></div>
                  <div id="bcnWeaponOptions" class="bcn-weapon-options" role="listbox"
                    aria-multiselectable="true" hidden></div></div></div></div>`
              : `<label><span>${label} (${unit}) ${marker}</span>
              <input name="value_${key}" ${numericOnly.has(key)
                ? `type="text" pattern="${decimal ? '[0-9]+([.][0-9]+)?' : '[0-9]+'}"`
                : `type="number" min="0" max="9007199254740991" step="${decimal ? 'any' : '1'}"`}
                required inputmode="${decimal ? 'decimal' : 'numeric'}">
            </label>`).join('')}
          </div></fieldset>`).join('')}
        <fieldset class="bcn-intake-metrics bcn-intake-administrative"><legend>${schema.administrativeGroup[0]}</legend>
          <div data-domain-entries></div>
          <button type="button" class="ghost bcn-domain-add" data-domain-add>+ Thêm lĩnh vực</button>
        </fieldset>
        <fieldset class="bcn-intake-metrics bcn-intake-patrol"><legend>${schema.patrolGroup[0]}</legend>
          <div class="daily-report-form">
            ${schema.patrolFields.map(([key, label]) => `<label><span>${label} ${marker}</span>
              <input name="value_${key}" type="text" pattern="[0-9]+" inputmode="numeric" required>
            </label>`).join('')}
          </div>
        </fieldset>
        <div class="bcn-toolbar"><button type="submit" class="primary" id="bcnSubmitReportBtn">Gửi báo cáo</button></div>
        <p data-intake-status role="status" aria-live="polite"></p>
        <div data-intake-unlock hidden class="bcn-callout">
          <p>Sau giờ khóa, đề nghị mở khóa kết quả công tác cho mã báo cáo này.</p>
          <div class="bcn-toolbar">
            <button type="button" class="ghost" data-unlock-part="WORK_RESULT">Mở khóa kết quả công tác</button>
          </div>
        </div>
      </section>`;

      const caseCard = root.querySelector('#dailyReportCaseForm')?.closest('.card');
      if (caseCard) {
        caseCard.classList.add('bcn-intake-section');
        const title = caseCard.querySelector('h3');
        if (title) {
          title.outerHTML = '<h2 class="bcn-entry-heading"><span class="bcn-entry-heading-number">I</span> '
            + '<span>VỤ VIỆC VÀ DIỄN BIẾN</span></h2>';
        }
      }
      pane.append(form);

      const attachments = window.DailyReportAttachments;
      attachments.picker(form);
      form.querySelector('.bcn-toolbar').before(form.lastElementChild);

      let batchId = window.BcnIds.randomUUID();
      let busy = false;
      let editingBatchId = null;
      let currentSubmittedData = null;
      let lastLockState = null;
      let lastServerNow = 0;

      const status = form.querySelector('[data-intake-status]');
      const unit = form.elements.unit_id;
      const assignedUnit = form.querySelector('[data-intake-unit-name]');
      const unitChoiceLabel = form.querySelector('[data-intake-unit-choice]');
      const assignedUnitLabel = form.querySelector('[data-intake-unit-assigned]');
      const weaponPicker = window.DailyReportWeaponPicker.mount(form);
      const domainPicker = window.DailyReportDomainEntries.mount(form);
      const date = form.elements.report_day;
      const unlockRequest = window.DailyReportUnlockRequest.mount({
        root, request, notify, getScope,
        getContext: supplement => ({
          supplement,
          unitId: getScope()?.isAdmin ? unit.value : String(getScope()?.unitId || ''),
          unitName: getScope()?.isAdmin ? unit.selectedOptions[0]?.textContent : getScope()?.unitName,
          reportDay: supplement ? currentSubmittedData?.report_day : date.value,
          scopeId: supplement ? currentSubmittedData?.id : batchId
        }),
        onSent: () => {
          lockBanner.querySelector('.bcn-lock-text p').textContent =
            'Đã gửi đề nghị cho báo cáo này. Theo dõi kết quả tại Lịch sử đề nghị.';
          unlockTriggerBtn.disabled = true;
        }
      });
      form.querySelector('[data-unlock-part]').onclick = () => unlockRequest.open(Boolean(currentSubmittedData));

      // Sanitization for numeric inputs
      for (const [key, decimal] of numericOnly) {
        const input = form.elements[`value_${key}`];
        if (!input) continue;
        const clean = value => {
          if (!decimal) return value.replace(/[^0-9]/g, '');
          const parts = value.replace(/,/g, '.').replace(/[^0-9.]/g, '').split('.');
          return parts.shift() + (parts.length ? `.${parts.join('')}` : '');
        };
        const sanitize = () => {
          const cursor = clean(input.value.slice(0, input.selectionStart ?? input.value.length)).length;
          input.value = clean(input.value);
          input.setSelectionRange(cursor, cursor);
          input.setCustomValidity(Number(input.value) > Number.MAX_SAFE_INTEGER
            ? 'Giá trị vượt quá giới hạn cho phép.' : '');
        };
        input.addEventListener('beforeinput', event => {
          const text = event.data ?? event.dataTransfer?.getData('text/plain');
          if (event.inputType.startsWith('insert') && text != null && clean(text) !== text
            && !(decimal && clean(text) === text.replace(/,/g, '.'))) event.preventDefault();
        });
        input.addEventListener('input', sanitize);
        input.addEventListener('compositionend', sanitize);
      }

      form.addEventListener('reset', () => {
        for (const key of numericOnly.keys()) {
          if (form.elements[`value_${key}`]) form.elements[`value_${key}`].setCustomValidity('');
        }
      });

      // Quick Unlock Dialog Trigger
      const unlockTriggerBtn = lockBanner.querySelector('#bcnUnlockTriggerBtn');
      unlockTriggerBtn.onclick = () => unlockRequest.open(Boolean(currentSubmittedData));

      function applyLockState(isLocked, activeUnlock = null, now = Date.now()) {
        lastServerNow = now;
        if (isLocked && lastLockState === false) {
          unlockTriggerBtn.disabled = false;
          lockBanner.querySelector('.bcn-lock-text p').textContent = lockDescription;
        }
        lastLockState = isLocked;
        syncSupplementAction();
        lockBanner.hidden = !isLocked;
        unlockedBanner.hidden = isLocked || !activeUnlock;
        if (activeUnlock && !isLocked) {
          const remaining = new Date(activeUnlock.expiresAt).getTime() - now;
          unlockedBanner.querySelector('#bcnUnlockCountdownTimer').textContent = formatTimeDiff(remaining);
        }
      }

      // Render Submitted Report Merged Card
      function renderSubmittedCard(data) {
        currentSubmittedData = data;
        const refCard = pane.querySelector('#bcnReferenceCaseCard');
        if (refCard) refCard.hidden = true;
        form.hidden = true;
        submittedCard.hidden = false;

        const dateParts = (data.report_day || '').split('-');
        const dateFormatted = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : data.report_day;
        const scope = getScope();
        const unitName = scope?.isAdmin
          ? (unit.options[unit.selectedIndex]?.text || scope?.unitName)
          : (scope?.unitName || 'Đơn vị');

        const submittedTime = data.created_at
          ? new Date(data.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
          : '';

        // Section I Summary
        let sectionIHtml = '';
        if (data.cases && data.cases.length) {
          sectionIHtml = window.DailyReportIncidentSummary.render(data.cases);
        } else {
          const narrative = data.situation?.narrative || 'Tình hình trong ngày bình thường';
          sectionIHtml = `<div class="bcn-situation-summary-card">
            <span class="bcn-badge-domain" style="background:#dcfce7;color:#15803d;margin-bottom:6px;display:inline-block;">✓ Bình thường</span>
            <p style="margin:4px 0 0;font-weight:500;">${escape(narrative)}</p>
          </div>`;
        }

        // Section II Summary
        const values = data.metric_values || {};
        const metricSummaryItems = [
          ['activities', 'Lượt công tác', 'lượt', 'activity'],
          ['detention_received', 'Tiếp nhận tạm giữ/giam', 'người', 'detention'],
          ['patrol_shifts', 'Số ca tuần tra', 'ca', 'patrol'],
          ['patrol_officers', 'Lượt CBCS tuần tra', 'lượt', 'patrol'],
          ['patrol_vehicles_checked', 'Phương tiện kiểm tra', 'xe', 'patrol'],
          ['guns', 'Súng thu hồi', 'khẩu', 'weapons'],
          ['ammunition', 'Đạn thu hồi', 'viên', 'weapons'],
          ['primitive_weapons', 'Vũ khí thô sơ', 'cây', 'weapons']
        ];
        const metricGroups = [
          ['activity', 'Công tác'],
          ['detention', 'Tạm giữ / giam'],
          ['patrol', 'Tuần tra / kiểm tra'],
          ['weapons', 'Thu hồi vũ khí']
        ];

        let metricGridHtml = metricSummaryItems.map(([key, label, u, group]) => {
          const val = values[key] ?? 0;
          return `<div class="bcn-summary-item" data-metric-group="${group}">
            <span class="bcn-summary-item-label">${label}</span>
            <span class="bcn-summary-item-value">${val} <small class="bcn-summary-item-unit">${u}</small></span>
          </div>`;
        }).join('');

        // Administrative domains
        if (data.administrative_domains && data.administrative_domains.length) {
          metricGroups.push(['administrative', 'Xử phạt hành chính']);
          const adminHtml = data.administrative_domains.map(d => `<div class="bcn-summary-item"
            data-metric-group="administrative" style="grid-column: span 2;">
            <span class="bcn-summary-item-label">Xử phạt VPHC: ${escape(d.domain)}</span>
            <span class="bcn-summary-item-value">${Number(d.values?.administrative_penalty_decisions || 0)} quyết định
              · ${Number(d.values?.administrative_fines || 0).toLocaleString('vi-VN')} đồng</span>
          </div>`).join('');
          metricGridHtml += adminHtml;
        }
        const metricLegendHtml = `<ul class="bcn-metric-legend" aria-label="Nhóm chỉ tiêu công tác">
          ${metricGroups.map(([group, label]) => `<li data-metric-group="${group}">${label}</li>`).join('')}
        </ul>`;

        submittedCard.innerHTML = `<div class="bcn-submitted-header">
          <div class="bcn-submitted-title-area">
            <div class="bcn-submitted-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>
              ĐÃ GỬI BÁO CÁO NGÀY
            </div>
            <h3>Báo cáo ngày ${escape(dateFormatted)} — ${escape(unitName)}</h3>
            <p class="bcn-submitted-meta">${submittedTime ? `Thời gian gửi: ${submittedTime} · ` : ''}
              Trạng thái: ${escape(window.DailyReportsUI.states[data.state] || 'Chờ rà soát PV01')}</p>
          </div>
          <div class="bcn-submitted-actions">
            <button type="button" class="primary bcn-btn-edit-report" id="bcnEditSubmittedReportBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              Bổ sung báo cáo
            </button>
            <button type="button" class="ghost" id="bcnRequestSupplementReportBtn">
              <i data-lucide="message-square-plus" aria-hidden="true"></i>Yêu cầu bổ sung
            </button>
          </div>
        </div>
        <div class="bcn-submitted-body">
          <div class="bcn-submitted-section">
            <h4 class="bcn-submitted-section-title">
              <span class="bcn-entry-heading-number">I</span> VỤ VIỆC VÀ DIỄN BIẾN
            </h4>
            <div class="bcn-submitted-section-content">${sectionIHtml}</div>
          </div>
          <div class="bcn-submitted-section">
            <h4 class="bcn-submitted-section-title">
              <span class="bcn-entry-heading-number">II</span> KẾT QUẢ CÔNG TÁC CÔNG AN
            </h4>
            ${metricLegendHtml}<div class="bcn-submitted-grid">${metricGridHtml}</div>
          </div>
        </div>`;

        window.lucide?.createIcons({ root: submittedCard });

        submittedCard.querySelector('#bcnRequestSupplementReportBtn').onclick = () => {
          unlockRequest.open(true);
        };
        syncSupplementAction();

        // Editing the submitted report requires the matching approved request.
        submittedCard.querySelector('#bcnEditSubmittedReportBtn').onclick = () => {
          if (!canSupplementReport()) return;
          submittedCard.hidden = true;
          if (refCard) refCard.hidden = true;
          form.hidden = false;
          editingBatchId = data.id;

          // Pre-fill Section I
          const refInstance = window.DailyReportReferenceCase?.activeInstance;
          if (refInstance) {
            if (data.cases && data.cases.length) {
              refInstance.setIncidentChoice('has_incident');
            } else {
              refInstance.setIncidentChoice('none');
              refInstance.setSituationNarrative(data.situation?.narrative || 'Tình hình trong ngày bình thường');
            }
          }

          // Pre-fill Section II
          for (const [k, v] of Object.entries(data.metric_values || {})) {
            const input = form.elements[`value_${k}`];
            if (input) input.value = v;
          }
          domainPicker.set(data.administrative_domains?.length ? data.administrative_domains
            : [{ domain: data.work_domain, values: data.metric_values }]);
          if (data.primitive_weapon_types && Array.isArray(data.primitive_weapon_types)) {
            weaponPicker.set?.(data.primitive_weapon_types);
          }
          notify('Đã tải lại thông tin báo cáo. Bạn có thể chỉnh sửa và bấm Gửi báo cáo.');
        };

      }

      function canSupplementReport() {
        const approval = getScope()?.activeUnlock;
        return approval?.purpose === 'REPORT_SUPPLEMENT'
          && approval.scopeId === currentSubmittedData?.id
          && lastLockState !== true && new Date(approval.expiresAt).getTime() > lastServerNow;
      }

      function syncSupplementAction() {
        const edit = submittedCard.querySelector('#bcnEditSubmittedReportBtn');
        if (edit) edit.hidden = !canSupplementReport();
      }

      // Check Existing Submission
      async function checkExistingReport(day, unitId) {
        if (!day || !unitId) return;
        try {
          const res = await request(`/daily-intake/latest?report_day=${encodeURIComponent(day)}&unit_id=${encodeURIComponent(unitId)}`);
          if (res?.submitted && res.data) {
            renderSubmittedCard(res.data);
          } else {
            currentSubmittedData = null;
            submittedCard.hidden = true;
            const refCard = pane.querySelector('#bcnReferenceCaseCard');
            if (refCard) refCard.hidden = false;
            form.hidden = false;
          }
        } catch {
          submittedCard.hidden = true;
        }
      }

      date.addEventListener('change', () => {
        checkExistingReport(date.value, unit.value);
      });
      unit.addEventListener('change', () => {
        checkExistingReport(date.value, unit.value);
      });

      // Submit Button Click Pre-Validation (Checks Mục I first, then Mục II)
      const submitBtn = form.querySelector('#bcnSubmitReportBtn');
      if (submitBtn) {
        submitBtn.addEventListener('click', event => {
          const refInstance = window.DailyReportReferenceCase?.activeInstance;
          if (refInstance && !editingBatchId && refInstance.hasIncident()) {
            if (!refInstance.controller.isValid()) {
              event.preventDefault();
              event.stopImmediatePropagation();
              status.textContent = 'Vui lòng hoàn thành đầy đủ thông tin vụ việc tại Mục I.';
              notify('Vui lòng hoàn thành đầy đủ thông tin vụ việc tại Mục I (hoặc chọn "Không có vụ việc") trước khi gửi báo cáo.');
              const card = document.getElementById('bcnReferenceCaseCard');
              if (card) card.scrollIntoView({ behavior: 'smooth' });
              return;
            }
          }
          if (!form.reportValidity()) {
            event.preventDefault();
            event.stopImmediatePropagation();
            status.textContent = 'Vui lòng điền đầy đủ các chỉ tiêu kết quả công tác tại Mục II.';
            notify('Vui lòng hoàn thành đầy đủ các chỉ tiêu kết quả công tác tại Mục II trước khi gửi.');
            return;
          }
        });
      }

      // Submit Handler
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy) return;

        // Check Section I & Section II validation atomically
        const refInstance = window.DailyReportReferenceCase?.activeInstance;
        let mode = 'WORK_ONLY';
        let situationNarrative = '';
        if (refInstance && !editingBatchId) {
          if (refInstance.hasIncident()) {
            if (!refInstance.controller.isValid()) {
              status.textContent = 'Vui lòng hoàn thành đầy đủ thông tin vụ việc tại Mục I.';
              notify('Vui lòng hoàn thành đầy đủ thông tin vụ việc tại Mục I (hoặc chọn "Không có vụ việc") trước khi gửi báo cáo.');
              const card = document.getElementById('bcnReferenceCaseCard');
              if (card) card.scrollIntoView({ behavior: 'smooth' });
              return;
            }
            mode = 'WORK_ONLY';
          } else {
            mode = 'NORMAL';
            situationNarrative = refInstance.getSituationNarrative();
          }
        }

        if (!form.reportValidity()) {
          status.textContent = 'Vui lòng điền đầy đủ các chỉ tiêu kết quả công tác tại Mục II.';
          notify('Vui lòng hoàn thành đầy đủ các chỉ tiêu kết quả công tác tại Mục II trước khi gửi.');
          return;
        }

        if (!getScope()?.dailyWorkDomainSupported) {
          status.textContent = 'Máy chủ chưa cập nhật phần lĩnh vực. Hãy khởi động lại máy chủ trước khi lưu.';
          notify(status.textContent);
          return;
        }
        if (!getScope()?.administrativeFieldsSupported) {
          status.textContent = 'Máy chủ chưa cập nhật chỉ tiêu xử phạt. Hãy khởi động lại máy chủ trước khi lưu.';
          notify(status.textContent);
          return;
        }
        if (!getScope()?.multipleAdministrativeDomainsSupported) {
          status.textContent = 'Máy chủ chưa hỗ trợ nhiều lĩnh vực. Hãy khởi động lại máy chủ trước khi lưu.';
          notify(status.textContent);
          return;
        }
        if (!getScope()?.patrolFieldsSupported) {
          status.textContent = 'Máy chủ chưa cập nhật chỉ tiêu tuần tra. Hãy khởi động lại máy chủ trước khi lưu.';
          notify(status.textContent);
          return;
        }
        if (!getScope()?.patrolVehiclesCheckedSupported) {
          status.textContent = 'Máy chủ chưa cập nhật chỉ tiêu phương tiện. Hãy khởi động lại máy chủ trước khi lưu.';
          notify(status.textContent);
          return;
        }
        const weaponTypes = weaponPicker.read();
        if (weaponTypes.length && !getScope()?.primitiveWeaponTypeSupported) {
          status.textContent = 'Máy chủ chưa cập nhật phần loại vũ khí. Hãy khởi động lại máy chủ trước khi lưu.';
          notify(status.textContent);
          return;
        }
        if (weaponTypes.length > 1 && (getScope()?.primitiveWeaponTypesVersion || 0) < 2) {
          status.textContent = 'Máy chủ chưa hỗ trợ chọn nhiều loại vũ khí. Hãy khởi động lại máy chủ trước khi lưu.';
          notify(status.textContent);
          return;
        }

        const domains = domainPicker.read();
        const values = Object.fromEntries([...schema.legacyEntryFields, ...schema.patrolFields].map(([key]) =>
          [key, Number(form.elements[`value_${key}`].value)]));
        for (const [key] of schema.administrativeFields) {
          values[key] = domains.reduce((sum, item) => sum + item.values[key], 0);
          if (!Number.isSafeInteger(values[key])) {
            status.textContent = 'Tổng chỉ tiêu giữa các lĩnh vực vượt quá giới hạn cho phép.';
            notify(status.textContent);
            return;
          }
        }

        const unitId = getScope()?.isAdmin ? unit.value : String(getScope()?.unitId || '');
        const targetBatchId = editingBatchId || batchId;
        const payload = {
          id: targetBatchId,
          report_day: date.value,
          unit_id: unitId,
          mode,
          situation_narrative: situationNarrative,
          incidents: [],
          values,
          work_domain: domains[0].domain,
          administrative_domains: domains,
          primitive_weapon_type: weaponTypes.join(', '),
          primitive_weapon_types: weaponTypes,
          is_update: Boolean(editingBatchId)
        };

        busy = true;
        const button = form.querySelector('button[type="submit"]');
        if (button) button.disabled = true;
        status.textContent = 'Đang gửi báo cáo…';

        try {
          // If Section I has an incident, save and submit it atomically
          if (refInstance && !editingBatchId && refInstance.hasIncident()) {
            await refInstance.controller.saveCase({ submit: true });
          }

          await attachments.save(form, async files => {
            await request('/daily-intake', {
              method: 'POST',
              body: JSON.stringify({ ...payload, attachments: files })
            });
          });

          editingBatchId = null;
          batchId = window.BcnIds.randomUUID();
          form.querySelector('[data-intake-unlock]').hidden = true;
          status.textContent = 'Đã gửi thành công Báo cáo ngày (Mục I và Mục II).';
          notify('Đã gửi thành công Báo cáo ngày (Mục I và Mục II).');

          // Refresh and render submitted card
          await checkExistingReport(date.value, unitId);
          try { await refresh(); } catch {}
        } catch (error) {
          status.textContent = error.message;
          form.querySelector('[data-intake-unlock]').hidden = getScope()?.beforeCutoff
            && date.value === getScope()?.reportDay;
          notify(error.message);
        } finally {
          busy = false;
          if (button) button.disabled = false;
        }
      });

      return {
        setLockState: applyLockState,
        reset() {
          unlockRequest.close();
          lastLockState = null;
          unlockTriggerBtn.disabled = false;
          lockBanner.querySelector('.bcn-lock-text p').textContent = lockDescription;
          batchId = window.BcnIds.randomUUID();
          editingBatchId = null;
          attachments.reset(form);
          status.textContent = '';
          form.querySelector('[data-intake-unlock]').hidden = true;
          submittedCard.hidden = true;
        },
        configure(units) {
          const scope = getScope();
          form.hidden = !scope?.isAdmin && !scope?.roles?.includes('UNIT_REPORTER');
          const admin = Boolean(scope?.isAdmin);
          const selected = admin ? unit.value || String(scope?.unitId || '') : String(scope?.unitId || '');
          const available = scope?.isAdmin ? units : [{ id: scope?.unitId || '', name: scope?.unitName || 'Chưa có đơn vị' }];
          unit.replaceChildren(...(admin ? [new Option('Chọn đơn vị báo cáo', '')] : []),
            ...available.map(item => new Option(item.name, String(item.id))));
          unit.value = selected;
          unit.disabled = !admin;
          unitChoiceLabel.hidden = !admin;
          assignedUnitLabel.hidden = admin;
          assignedUnit.value = scope?.unitName || 'Chưa được phân công đơn vị báo cáo';
          assignedUnit.defaultValue = assignedUnit.value;
          date.value = scope?.reportDay || date.value || '';

          // Check if today's report has already been submitted
          checkExistingReport(date.value, unit.value);
        }
      };
    }
  };
})();
