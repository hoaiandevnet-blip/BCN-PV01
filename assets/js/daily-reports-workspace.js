(() => {
  window.DailyReportsWorkspace = {
    mount({ root, request, notify, getScope, refresh, reviewCase }) {
      window.DailyReportsWorkspaceView.mount(root);
      window.DailyReportsV8View.mount(root);
      window.DailyReportsComposerView.mount(root);
      window.DailyReportsReferenceView.mount(root, { getScope });
      window.DailyReportsCaseTitle.mount(root.querySelector('#dailyReportCaseForm'));
      window.DailyReportsPersons.mount(root.querySelector('#bcnEntryPersons'));
      window.DailyReportsLocation.mount(root.querySelector('#bcnEntryLocation'));
      const attachments = window.DailyReportAttachments;
      for (const id of ['dailyReportCaseForm', 'bcnSituationForm', 'bcnMetricForm']) {
        const form = root.querySelector('#' + id);
        const submit = form.querySelector('button[type="submit"],button.primary');
        attachments.picker(form, submit?.closest('.bcn-toolbar') || submit);
      }
      const navigation = window.DailyReportsNavigation.mount(root, { getScope });
      const $ = selector => root.querySelector(selector);
      const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[char]);
      const send = (url, body = {}, method = 'POST') => request(url, { method, body: JSON.stringify(body) });
      const act = action => async event => {
        event?.preventDefault();
        try { await action(event); } catch (error) { notify(error.message); }
      };
      const has = role => getScope()?.roles?.includes(role);
      const admin = () => Boolean(getScope()?.isAdmin);
      const date = () => getScope()?.reportDay;
      const history = window.DailyReportsHistory.mount({ root, request, notify });
      const permissionWorkspace = window.DailyReportsPermissionWorkspace.mount(root);
      const leaderWorkspace = window.DailyReportsLeaders.mount(root);
      const presentation = window.DailyReportsPresentation.mount({
        root, request, getScope, notify, detail: id => detail(id).catch(error => notify(error.message)),
        loadLegalVersions: loadLegal, loadNotifications, loadAudit
      });
      const accountPicker = window.DailyReportAccountPicker.mount({ root, unitName: presentation.unitName });
      window.DailyReportRolePicker.mount({ root, accountPicker });
      const entryUnits = window.DailyReportEntryUnits.mount({ root, getScope,
        onMetricUnitChange: act(loadMetricDefinitions) });
      const casePreview = window.DailyReportsCasePreview.mount({ root, request, notify, getScope,
        unitName: presentation.unitName, reviewCase, getView: () => navigation.current(), editReturned: async id => {
          navigation.select('returned');
          await detail(id);
        } });
      const intake = window.DailyReportIntake.mount({ root, request, notify, getScope,
        previewCase: id => casePreview.open(id),
        refresh: async () => { await refresh(); await loadSources(); } });
      const referenceCase = window.DailyReportReferenceCase.mount({ root, request, notify, getScope, refresh });
      const entryLock = window.DailyReportEntryLock.mount({ root, onStateChange: intake.setLockState });
      let roleRequest = 0;
      let roleLoading = 0;
      let units = [];
      let leaders = [];
      let leaderLoading = null;
      let leaderGeneration = 0;
      let leaderDeleting = false;
      let sources = [];
      let draft = null;
      let sourceFilter = '';
      let sourcesLoaded = false;
      let draftListRequest = 0;
      let initialized = false;
      let detailGeneration = 0;
      const composer = window.DailyReportsComposer.mount({ root, notify, retainEdits, render: renderComposer,
        getSources: () => sources, getDraft: () => draft, getLeaders: () => leaders,
        onTypeChange: () => { draft = null; }
      });
      const fields = {
        GENERAL: [['activities', 'Số lượt công tác']],
        DETENTION: [['received', 'Tiếp nhận'], ['released', 'Đã giải quyết'], ['remaining', 'Đang quản lý']],
        TIP_INTAKE_AND_RESOLUTION: [['received', 'Tiếp nhận mới'], ['resolved', 'Đã giải quyết'], ['pending', 'Đang giải quyết']],
        INVESTIGATION: [
          ['new_prosecutions_cases', 'Khởi tố vụ án'], ['new_prosecutions_accused', 'Khởi tố bị can'],
          ['suspended_cases', 'Tạm đình chỉ vụ'], ['suspended_accused', 'Tạm đình chỉ bị can'],
          ['discontinued_cases', 'Đình chỉ vụ'], ['discontinued_accused', 'Đình chỉ bị can'],
          ['investigation_concluded_cases', 'Kết luận điều tra vụ'],
          ['investigation_concluded_accused', 'Kết luận điều tra bị can']
        ]
      };
      function metricFields() {
        $('#bcnMetricFields').innerHTML = (fields[$('#bcnMetricGroup').value] || []).map(([key, label]) =>
          `<label>${label}<input type="number" name="value_${key}" min="0" step="1" value="0" required></label>`).join('');
      }
      function queryValues() {
        return Object.fromEntries([...new FormData($('#bcnCaseFilters'))].filter(([, value]) => value));
      }
      async function loadLeaders({ force = false } = {}) {
        if (!admin() && !has('PV01_COMPILER')) return;
        if (force) {
          leaderGeneration += 1;
          leaderLoading = null;
        }
        if (leaderLoading) return leaderLoading;
        const generation = leaderGeneration;
        leaderWorkspace.setLoading(true);
        leaderLoading = (async () => {
          const result = await request('/leaders?include_archived=true');
          if (generation !== leaderGeneration) return;
          leaders = result.leaders;
          composer.updateSigners();
          composer.refresh();
          leaderWorkspace.render(leaders, admin(), date());
          root.querySelectorAll('[data-leader-edit]').forEach(button => {
            button.onclick = () => {
              const item = leaders.find(leader => leader.id === button.dataset.leaderEdit);
              for (const [key, value] of Object.entries(item)) {
                const input = $('#bcnLeaderForm').elements.namedItem(key);
                if (input) input.value = value || '';
              }
              $('#bcnLeaderForm').scrollIntoView({ block: 'center', behavior: 'instant' });
              $('#bcnLeaderForm').elements.full_name.focus({ preventScroll: true });
            };
          });
          root.querySelectorAll('[data-leader-state]').forEach(button => {
            button.onclick = act(async () => {
              const item = leaders.find(leader => leader.id === button.dataset.leaderState);
              await send(`/leaders/${item.id}/${item.archived_at ? 'restore' : 'archive'}`);
              await loadLeaders({ force: true });
            });
          });
          root.querySelectorAll('[data-leader-delete]').forEach(button => {
            button.onclick = act(() => deleteLeaders([button.dataset.leaderDelete]));
          });
        })().catch(error => {
          if (generation !== leaderGeneration) return;
          leaderWorkspace.error('Không tải được danh sách. Bấm Cập nhật để thử lại.');
          throw error;
        }).finally(() => {
          if (generation === leaderGeneration) {
            leaderLoading = null;
            leaderWorkspace.setLoading(false);
          }
        });
        return leaderLoading;
      }
      async function deleteLeaders(ids) {
        if (!admin() || leaderDeleting || !ids.length) return;
        const selected = leaders.filter(item => ids.includes(item.id));
        if (!selected.length) return;
        leaderDeleting = true;
        try {
          const deleted = await leaderWorkspace.confirmDelete(selected, async () => {
            if (selected.length === 1) await send(`/leaders/${selected[0].id}`, {}, 'DELETE');
            else await send('/leaders', { ids: selected.map(item => item.id) }, 'DELETE');
          });
          if (!deleted) return;
          if (ids.includes($('#bcnLeaderForm').elements.namedItem('id').value)) $('#bcnLeaderForm').reset();
          await loadLeaders({ force: true });
          notify(`Đã xóa ${selected.length} lãnh đạo khỏi danh sách.`);
        } finally { leaderDeleting = false; }
      }
      function formatVnd(val) {
        const n = Number(val || 0);
        return n > 0 ? n.toLocaleString('vi-VN') + ' đ' : '0 đ';
      }

      function renderCaseContent(item) {
        let locationText = '';
        if (item.location_address && typeof item.location_address === 'object') {
          const a = item.location_address;
          locationText = [a.address, a.commune, a.district, a.province].filter(Boolean).join(', ');
        }
        if (!locationText && item.location_general) locationText = item.location_general;

        let occurredText = '';
        if (item.occurred_at) {
          try {
            occurredText = new Intl.DateTimeFormat('vi-VN', {
              dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh'
            }).format(new Date(item.occurred_at));
          } catch { occurredText = String(item.occurred_at); }
        }

        const persons = Array.isArray(item.persons) ? item.persons : [];

        return `<div class="bcn-source-case-card">
          ${item.title ? `<div class="bcn-case-card-title">${escape(item.title)}</div>` : ''}
          <div class="bcn-case-card-summary">${escape(item.summary || 'Chưa có tóm tắt vụ việc.')}</div>
          <div class="bcn-case-meta-row">
            ${locationText
              ? `<span class="bcn-meta-pill">📍 Địa bàn: <strong>${escape(locationText)}</strong></span>` : ''}
            ${occurredText
              ? `<span class="bcn-meta-pill">⏰ Thời điểm: <strong>${escape(occurredText)}</strong></span>` : ''}
            ${item.counted_as_pphs ? `<span class="bcn-meta-pill bcn-meta-pphs">✓ Tính vụ PPHS</span>` : ''}
          </div>
          ${persons.length ? `<div class="bcn-case-persons-wrap">
            <div class="bcn-persons-header">👤 Đối tượng liên quan (${persons.length}):</div>
            <div class="bcn-persons-list">
              ${persons.map(p => `<span class="bcn-person-tag">
                <strong>${escape(p.name || 'Đối tượng')}</strong>
                ${p.birth_year ? `(SN ${escape(p.birth_year)})` : ''}
                ${p.role ? `· <em>${escape(p.role)}</em>` : ''}
                ${p.address ? `· Trú: ${escape(p.address)}` : ''}
                ${p.offense ? `· Hành vi: ${escape(p.offense)}` : ''}
              </span>`).join('')}
            </div>
          </div>` : ''}
        </div>`;
      }

      function renderPoliceWork(item, intakeSchema) {
        const values = item.metric_values || {};
        const weaponType = item.primitive_weapon_type || '';
        const adminDomains = Array.isArray(item.administrative_domains) ? item.administrative_domains : [];
        const blocks = [];

        // 1. Thu hồi vũ khí, VLN, CCHT
        if (values.guns || values.ammunition || values.primitive_weapons || values.explosives || values.fireworks) {
          blocks.push(`<div class="bcn-work-block">
            <div class="bcn-work-block-title">
              <span class="bcn-icon-badge">🛡️</span> Thu hồi vũ khí, vật liệu nổ, công cụ hỗ trợ
            </div>
            <div class="bcn-stat-chips-grid">
              ${values.guns ? `<div class="bcn-stat-chip chip-highlight">
                <span class="chip-label">Súng tiếp nhận</span>
                <span class="chip-val">${values.guns} <small>khẩu</small></span>
              </div>` : ''}
              ${values.ammunition ? `<div class="bcn-stat-chip chip-highlight">
                <span class="chip-label">Đạn tiếp nhận</span>
                <span class="chip-val">${values.ammunition} <small>viên</small></span>
              </div>` : ''}
              ${values.primitive_weapons ? `<div class="bcn-stat-chip">
                <span class="chip-label">Vũ khí thô sơ</span>
                <span class="chip-val">${values.primitive_weapons} <small>vũ khí</small></span>
                ${weaponType ? `<small class="bcn-work-note">${escape(weaponType)}</small>` : ''}
              </div>` : ''}
              ${values.explosives ? `<div class="bcn-stat-chip">
                <span class="chip-label">Thuốc nổ</span>
                <span class="chip-val">${values.explosives} <small>kg</small></span>
              </div>` : ''}
              ${values.fireworks ? `<div class="bcn-stat-chip">
                <span class="chip-label">Pháo nổ</span>
                <span class="chip-val">${values.fireworks} <small>kg</small></span>
              </div>` : ''}
            </div>
          </div>`);
        }

        // 2. Kiểm danh, kiểm diện, gọi hỏi răn đe
        if (values.community_sentences || values.released_prisoners || values.parole || values.delinquent_youth || values.community_rehabilitation || values.suspected_drug_users) {
          blocks.push(`<div class="bcn-work-block">
            <div class="bcn-work-block-title">
              <span class="bcn-icon-badge">📋</span> Kiểm danh, kiểm diện, gọi hỏi, răn đe, giáo dục
            </div>
            <div class="bcn-stat-chips-grid">
              ${values.community_sentences ? `<div class="bcn-stat-chip">
                <span class="chip-label">Án tại cấp xã</span>
                <span class="chip-val">${values.community_sentences} <small>đối tượng</small></span>
              </div>` : ''}
              ${values.released_prisoners ? `<div class="bcn-stat-chip">
                <span class="chip-label">Xong án phạt tù về cư trú</span>
                <span class="chip-val">${values.released_prisoners} <small>đối tượng</small></span>
              </div>` : ''}
              ${values.parole ? `<div class="bcn-stat-chip">
                <span class="chip-label">Tha tù trước thời hạn</span>
                <span class="chip-val">${values.parole} <small>đối tượng</small></span>
              </div>` : ''}
              ${values.delinquent_youth ? `<div class="bcn-stat-chip chip-warning">
                <span class="chip-label">Thanh thiếu niên hư, VPPL</span>
                <span class="chip-val">${values.delinquent_youth} <small>đối tượng</small></span>
              </div>` : ''}
              ${values.community_rehabilitation ? `<div class="bcn-stat-chip">
                <span class="chip-label">Cai nghiện tại cộng đồng</span>
                <span class="chip-val">${values.community_rehabilitation} <small>đối tượng</small></span>
              </div>` : ''}
              ${values.suspected_drug_users ? `<div class="bcn-stat-chip chip-warning">
                <span class="chip-label">Nghi sử dụng ma túy</span>
                <span class="chip-val">${values.suspected_drug_users} <small>đối tượng</small></span>
              </div>` : ''}
            </div>
          </div>`);
        }

        // 3. Tuần tra kiểm soát
        if (values.patrol_officers || values.patrol_rounds || values.patrol_vehicles_checked || values.patrol_vehicles_detained || values.patrol_violations || values.patrol_documents_detained || values.patrol_shifts) {
          blocks.push(`<div class="bcn-work-block">
            <div class="bcn-work-block-title">
              <span class="bcn-icon-badge">🚔</span> Tuần tra, kiểm soát & đảm bảo ANTT
            </div>
            <div class="bcn-stat-chips-grid">
              ${values.patrol_shifts ? `<div class="bcn-stat-chip"><span class="chip-label">Số ca tuần tra</span><span class="chip-val">${values.patrol_shifts} <small>ca</small></span></div>` : ''}
              ${values.patrol_officers ? `<div class="bcn-stat-chip"><span class="chip-label">Số CBCS</span><span class="chip-val">${values.patrol_officers} <small>lượt</small></span></div>` : ''}
              ${values.patrol_rounds ? `<div class="bcn-stat-chip"><span class="chip-label">Số lượt</span><span class="chip-val">${values.patrol_rounds} <small>lượt</small></span></div>` : ''}
              ${values.patrol_vehicles_checked ? `<div class="bcn-stat-chip"><span class="chip-label">Phương tiện kiểm tra</span><span class="chip-val">${values.patrol_vehicles_checked} <small>xe</small></span></div>` : ''}
              ${values.patrol_vehicles_detained ? `<div class="bcn-stat-chip"><span class="chip-label">Phương tiện tạm giữ</span><span class="chip-val">${values.patrol_vehicles_detained} <small>xe</small></span></div>` : ''}
              ${values.patrol_violations ? `<div class="bcn-stat-chip chip-highlight"><span class="chip-label">Vi phạm phát hiện</span><span class="chip-val">${values.patrol_violations} <small>vụ</small></span></div>` : ''}
              ${values.patrol_documents_detained ? `<div class="bcn-stat-chip"><span class="chip-label">Giấy tờ tạm giữ</span><span class="chip-val">${values.patrol_documents_detained} <small>bộ</small></span></div>` : ''}
            </div>
          </div>`);
        }

        // 4. Xử lý VPHC theo từng lĩnh vực
        if (adminDomains.length) {
          blocks.push(`<div class="bcn-work-block">
            <div class="bcn-work-block-title">
              <span class="bcn-icon-badge">⚖️</span> Kết quả Xử lý vi phạm hành chính (VPHC)
            </div>
            <div class="bcn-admin-matrix">
              ${adminDomains.map(d => {
                const v = d.values || {};
                return `<div class="bcn-admin-card">
                  <div class="bcn-admin-card-head">
                    <span class="bcn-domain-tag">${escape(d.domain || 'Lĩnh vực')}</span>
                  </div>
                  <div class="bcn-admin-card-metrics">
                    <div class="admin-metric"><span class="lbl">Kiểm tra:</span> <b>${v.administrative_checks || 0}</b> <small>th</small></div>
                    <div class="admin-metric"><span class="lbl">Lập biên bản:</span> <b>${v.administrative_violation_records || 0}</b> <small>th</small></div>
                    <div class="admin-metric"><span class="lbl">Ban hành QĐ:</span> <b>${v.administrative_penalty_decisions || 0}</b> <small>th</small></div>
                    <div class="admin-metric fine"><span class="lbl">Tiền phạt:</span> <b class="fine-amt">${formatVnd(v.administrative_fines)}</b></div>
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>`);
        } else if (values.administrative_checks || values.administrative_violation_records || values.administrative_penalty_decisions || values.administrative_fines) {
          blocks.push(`<div class="bcn-work-block">
            <div class="bcn-work-block-title">
              <span class="bcn-icon-badge">⚖️</span> Kết quả Xử lý vi phạm hành chính (VPHC) ${item.work_domain ? `(${escape(item.work_domain)})` : ''}
            </div>
            <div class="bcn-admin-matrix">
              <div class="bcn-admin-card">
                <div class="bcn-admin-card-metrics">
                  <div class="admin-metric"><span class="lbl">Kiểm tra:</span> <b>${values.administrative_checks || 0}</b> <small>th</small></div>
                  <div class="admin-metric"><span class="lbl">Lập biên bản:</span> <b>${values.administrative_violation_records || 0}</b> <small>th</small></div>
                  <div class="admin-metric"><span class="lbl">Ban hành QĐ:</span> <b>${values.administrative_penalty_decisions || 0}</b> <small>th</small></div>
                  <div class="admin-metric fine"><span class="lbl">Tiền phạt:</span> <b class="fine-amt">${formatVnd(values.administrative_fines)}</b></div>
                </div>
              </div>
            </div>
          </div>`);
        }

        return blocks.length ? `<div class="bcn-police-work-view">${blocks.join('')}</div>`
          : `<p class="bcn-no-metrics">Chưa có số liệu phát sinh.</p>`;
      }

      async function loadSources(current = () => true) {
        const query = new URLSearchParams({ report_day: $('#bcnSourceDay').value });
        if ($('#bcnSourceUnit').value) query.set('unit_id', $('#bcnSourceUnit').value);
        const [metrics, situations, casesData] = await Promise.all([
          request(`/work-results?${query}`),
          request(`/situations?${query}`),
          request(`/cases?${query}`).catch(() => ({ cases: [] }))
        ]);
        if (!current()) return;
        const caseItems = (casesData?.cases || []).map(item => ({ ...item, kind: 'cases' }));
        const metricItems = (metrics?.metrics || []).map(item => ({ ...item, kind: 'work-results' }));
        const situationItems = (situations?.situations || []).map(item => ({ ...item, kind: 'situations' }));
        const items = [...caseItems, ...situationItems, ...metricItems];
        const metricNames = Object.fromEntries([...$('#bcnMetricGroup').options]
          .map(option => [option.value, option.textContent]));
        metricNames.DAILY_POLICE_WORK = 'Kết quả công tác công an';
        const situationNames = Object.fromEntries([...$('#bcnSituationForm [name="categories"]').options]
          .map(option => [option.value, option.textContent]));
        situationNames.NORMAL_DAY = 'Tình hình ngày bình thường';
        const valueNames = Object.fromEntries(Object.values(fields).flat());
        const intakeSchema = window.DailyReportIntakeSchema;
        for (const [key, label, unit] of [
          ...intakeSchema.fields, ...intakeSchema.administrativeFields, ...intakeSchema.patrolFields
        ]) {
          valueNames[key] = unit ? `${label} (${unit})` : label;
        }
        const rows = items.map(item => {
          const itemState = item.current_state || item.state;
          const canReviewSource = item.kind === 'situations'
            ? navigation.current() === 'input' && has('PV01_COMPILER')
            : window.DailyReportsReview.allowed(getScope(), navigation.current());
          let indicatorHtml = '';
          if (item.kind === 'cases') {
            indicatorHtml = `<div class="bcn-indicator-box">
              <span class="bcn-source-tag bcn-tag-case">Vụ việc phát sinh</span>
              <div style="margin-top: 6px;">${window.DailyReportsUI.caseCategoryBadges(item)}</div>
              <div class="bcn-indicator-code">${escape(item.stable_code || '')}</div>
            </div>`;
          } else if (item.kind === 'situations') {
            indicatorHtml = `<div class="bcn-indicator-box">
              <span class="bcn-source-tag bcn-tag-situation">Tình hình trong ngày</span>
              <div style="margin-top: 6px;"><strong>${escape((item.category_codes || [])
                .map(code => situationNames[code] || code).join(', ') || 'Tình hình')}</strong></div>
            </div>`;
          } else {
            indicatorHtml = `<div class="bcn-indicator-box">
              <span class="bcn-source-tag bcn-tag-metric">Kết quả công tác công an</span>
              <div style="margin-top: 4px; font-size: 11px; color: #64748b;">Chỉ tiêu công tác</div>
            </div>`;
          }

          let contentHtml = '';
          if (item.kind === 'cases') {
            contentHtml = renderCaseContent(item);
          } else if (item.kind === 'situations') {
            contentHtml = `<div class="bcn-situation-content-box"><p>${escape(item.narrative || 'Tình hình ngày bình thường.')}</p></div>`;
          } else if (item.metric_code === 'DAILY_POLICE_WORK') {
            contentHtml = renderPoliceWork(item, intakeSchema);
          } else {
            contentHtml = escape((item.work_domain ? `${item.work_domain}; ` : '')
              + Object.entries(item.metric_values || {})
              .map(([key, value]) => `${valueNames[key] || key}: ${value}`).join('; ')
              + (item.primitive_weapon_type ? `; Loại vũ khí thô sơ: ${item.primitive_weapon_type}` : ''));
          }

          return `<tr data-source-id="${item.id}">
            <td>${window.DailyReportsUI.date(item.report_day)}</td>
            <td>${escape(presentation.unitName(item.unit_id) || item.unit_name || '')}</td>
            <td>${indicatorHtml}</td>
            <td>${contentHtml}</td>
            <td>${window.DailyReportsUI.status(itemState)}<p>${escape(item.review_reason || '')}</p></td>
            <td class="daily-report-actions">
              <button class="ghost" data-source-files="${item.id}">Văn bản đính kèm</button>
              ${item.kind === 'cases' ? `<button class="ghost" data-case-detail="${item.id}">Chi tiết vụ việc</button>` : ''}
              ${['DRAFT', 'RETURNED'].includes(itemState) && has('UNIT_REPORTER')
                ? `<button class="ghost" data-source-action="submit" data-kind="${item.kind}" data-id="${item.id}">Gửi rà soát</button>` : ''}
              ${itemState === 'PENDING_REVIEW' && canReviewSource
                ? `<button class="ghost" data-source-action="verify" data-kind="${item.kind}" data-id="${item.id}">Duyệt</button>` : ''}
              ${has('UNIT_REPORTER') && ['DRAFT', 'RETURNED'].includes(itemState) && item.kind !== 'cases'
                ? `<button class="ghost" data-source-edit="${item.id}">Sửa nguồn</button>` : ''}
              ${canReviewSource && itemState === 'PENDING_REVIEW'
                ? `<button class="ghost" data-source-return="${item.id}">Trả lại</button>` : ''}
            </td>
          </tr>`;
        }).join('');
        $('#bcnSourceRows').innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr>
          <th>Ngày</th><th>Đơn vị</th><th>Chỉ tiêu / Tình hình</th><th>Giá trị / Nội dung</th>
          <th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
          ${rows || '<tr><td colspan="6" class="empty-row">Chưa có dữ liệu.</td></tr>'}</tbody></table></div>`;

        root.querySelectorAll('[data-case-detail]').forEach(button => {
          button.onclick = act(async () => {
            await detail(button.dataset.caseDetail);
          });
        });
        root.querySelectorAll('[data-source-files]').forEach(button => {
          button.onclick = act(async () => {
            const item = items.find(value => value.id === button.dataset.sourceFiles);
            const dialog = document.createElement('dialog');
            dialog.className = 'bcn-dialog bcn-attachment-dialog card';
            dialog.setAttribute('aria-label', 'Văn bản đính kèm');
            dialog.innerHTML = '<button class="ghost" type="button">Đóng</button><div></div>';
            root.append(dialog);
            dialog.querySelector('button').onclick = () => dialog.close();
            dialog.addEventListener('close', () => {
              dialog.remove();
              loadSources().catch(error => notify(error.message));
            }, { once: true });
            dialog.showModal();
            await attachments.list(dialog.querySelector('div'), { resource: item.kind, id: item.id, request, notify });
          });
        });
        root.querySelectorAll('[data-source-edit]').forEach(button => {
          button.onclick = act(async () => {
            const item = items.find(value => value.id === button.dataset.sourceEdit);
            const body = { version: item.version };
            if (item.kind === 'situations') {
              body.narrative = window.prompt('Nội dung tình hình:', item.narrative);
              if (body.narrative === null) return;
              const labels = window.prompt('Nhãn tình hình, phân cách bằng dấu phẩy:', item.category_codes.join(', '));
              if (labels === null) return;
              body.category_codes = labels.split(',').map(value => value.trim()).filter(Boolean);
            } else {
              body.values = {};
              const domainRows = item.administrative_domains || [];
              const administrativeKeys = new Set(intakeSchema.administrativeFields.map(([key]) => key));
              for (const [key, value] of Object.entries(item.metric_values)) {
                if (domainRows.length && administrativeKeys.has(key)) continue;
                const input = window.prompt(`Giá trị ${key}:`, String(value));
                if (input === null) return;
                body.values[key] = Number(input);
              }
              if (item.metric_code === 'DAILY_POLICE_WORK') {
                if (domainRows.length) {
                  body.administrative_domains = [];
                  for (const row of domainRows) {
                    const label = intakeSchema.workDomains.join('\n');
                    const domain = window.prompt(`Chọn đúng tên lĩnh vực:\n${label}`, row.domain);
                    if (domain === null) return;
                    const values = {};
                    for (const [key, name, unit] of intakeSchema.administrativeFields) {
                      const input = window.prompt(`${domain.trim()} — ${name} (${unit}):`, String(row.values[key]));
                      if (input === null) return;
                      values[key] = Number(input);
                    }
                    body.administrative_domains.push({ domain: domain.trim(), values });
                  }
                  body.work_domain = body.administrative_domains[0].domain;
                  for (const [key] of intakeSchema.administrativeFields) {
                    body.values[key] = body.administrative_domains.reduce((sum, row) => sum + row.values[key], 0);
                  }
                } else if (item.work_domain) {
                  const label = window.DailyReportIntakeSchema.workDomains.join('\n');
                  body.work_domain = window.prompt(`Chọn đúng tên lĩnh vực:\n${label}`, item.work_domain);
                  if (body.work_domain === null) return;
                  body.work_domain = body.work_domain.trim();
                }
                const previous = item.primitive_weapon_types?.length ? item.primitive_weapon_types
                  : item.primitive_weapon_type ? [item.primitive_weapon_type] : [];
                const typed = window.prompt('Các loại vũ khí thô sơ, ngăn cách bằng dấu phẩy:', previous.join(', '));
                if (typed === null) return;
                body.primitive_weapon_types = typed === previous.join(', ') ? previous
                  : typed.split(',').map(value => value.trim()).filter(Boolean);
              }
            }
            await send(`/${item.kind}/${item.id}`, body, 'PATCH');
            await loadSources();
          });
        });
        root.querySelectorAll('[data-source-return]').forEach(button => {
          button.onclick = act(async () => {
            const item = items.find(value => value.id === button.dataset.sourceReturn);
            const reason = window.prompt('Lý do trả lại:');
            if (!reason) return;
            await send(`/${item.kind}/${item.id}/return`, { reason });
            await loadSources();
          });
        });
        root.querySelectorAll('[data-source-action]').forEach(button => {
          button.onclick = act(async () => {
            await send(`/${button.dataset.kind}/${button.dataset.id}/${button.dataset.sourceAction}`);
            await loadSources();
          });
        });
      }
      function retainEdits(row) {
        const rows = row ? [row] : root.querySelectorAll('[data-compose-row]');
        for (const element of rows) {
          const item = sources[Number(element.dataset.composeRow)];
          item.included = element.querySelector('[data-include]').checked;
          item.edited_text = element.querySelector('textarea').value;
          item.section_code = element.querySelector('[data-section]').value;
          item.sort_index = Number(element.querySelector('[data-sort]').value);
        }
      }
      function renderComposer({ previewChanged = true } = {}) {
        const visible = [];
        const sectionOptions = [
          ['NOI_DUNG', 'Tình hình ANTT'], ['TINH_HINH_KHAC', '1.2 — Tình hình khác'],
          ['KET_QUA_CONG_TAC', 'Kết quả công tác'], ['CAC_MAT_CONG_TAC_KHAC', '1.3.2 — Các mặt công tác khác'],
          ['CONG_TAC_TRUC_BAN', 'Công tác trực ban'], ['KIEN_NGHI', 'Kiến nghị']
        ];
        const groups = new Map();
        sources.forEach((item, index) => {
          if (!composer.matches(item)) return;
          if (!`${item.source_text} ${item.business_code} ${item.stable_code}`.toLowerCase().includes(sourceFilter)) return;
          visible.push(item);
          const groupName = window.DailyReportsUI.caseDomainCodes(item).map(window.DailyReportsUI.domainName).filter(Boolean).join(' · ')
            || ({ WORK_RESULT: 'Kết quả công tác', SITUATION: 'Tình hình khiếu kiện',
              CASE_EVENT: 'Diễn biến bổ sung' })[item.source_type] || 'Tình hình ANTT';
          if (!groups.has(groupName)) groups.set(groupName, []);
          groups.get(groupName).push(`<article class="bcn-item ${item.included ? 'is-chosen' : ''}"
            data-compose-row="${index}" data-source-id="${item.source_id}">
            <label><input data-include type="checkbox" ${item.included ? 'checked' : ''}
              ${item.current_state && item.current_state !== 'VERIFIED' ? 'disabled' : ''}>
              ${escape(({ CASE: 'Vụ việc', CASE_EVENT: 'Diễn biến vụ việc', WORK_RESULT: 'Kết quả công tác',
                SITUATION: 'Tình hình' })[item.source_type] || 'Nội dung báo cáo')}
              · ${escape(presentation.unitName(item.unit_id))}</label>
            ${window.DailyReportsUI.status(item.current_state || 'VERIFIED')}
            <p>${item.late_flag ? '⚠ Bổ sung muộn · ' : ''}${escape(item.source_text)}</p>
            <div class="bcn-toolbar"><select data-section aria-label="Đề mục">
              ${sectionOptions.map(([code, label]) => `<option value="${code}"
                ${(item.section_code || 'NOI_DUNG') === code ? 'selected' : ''}>${label}</option>`).join('')}</select>
              <input data-sort type="number" min="0" aria-label="Thứ tự" value="${item.sort_index ?? index}"></div>
            <label class="bcn-composer-edit-label">Nội dung sẽ đưa vào Word
              <textarea aria-label="Nội dung biên tập">${escape(item.edited_text ?? item.source_text)}</textarea></label>
          </article>`);
        });
        $('#bcnComposerRows').innerHTML = [...groups].map(([name, rows]) => `<section class="bcn-composer-group">
          <h4 class="bcn-composer-group-title">${escape(name)} <small>${rows.length} ý</small></h4>
          ${rows.join('')}</section>`).join('') || '<div class="bcn-empty">Không có ý phù hợp.</div>';
        $('#bcnComposeMatches').textContent = sourcesLoaded ? `${visible.length} ý phù hợp` : 'Chưa tải nguồn';
        $('#bcnDraftStatus').textContent = draft
          ? `Phiên bản ${draft.revision} · ${draft.statistics_snapshot?.selected_cases ?? 0} vụ đã lưu`
            + (draft.stale ? ' · Có nguồn mới cần rà soát' : '')
          : 'Chưa mở bản nháp';
        composer.updateSelection(visible);
        if (previewChanged) composer.refresh();
      }
      const draftList = $('#bcnDraftList');
      const draftOpen = $('#bcnDraftOpen');
      draftList.onchange = () => { draftOpen.disabled = !draftList.value; };
      async function loadDrafts(preferredId = '') {
        const version = ++draftListRequest;
        let result;
        try {
          result = await request('/drafts');
        } catch (error) {
          if (version !== draftListRequest) return;
          if (draftList.disabled) draftList.replaceChildren(new Option('Chưa tải được danh sách', ''));
          throw error;
        }
        if (version !== draftListRequest) return;
        const selected = preferredId || draftList.value || draft?.id;
        const types = $('#bcnReportType').options;
        const names = new Map([...types].map(option => [option.value, option.textContent]));
        const options = result.drafts.map(item => {
          const day = item.report_day.slice(0, 10).split('-').reverse().join('/');
          return new Option(`${day} · ${names.get(item.report_type) || item.report_type} · v${item.revision}`, item.id);
        });
        draftList.replaceChildren(new Option(options.length ? 'Chọn bản nháp…' : 'Chưa có bản nháp đã lưu', ''), ...options);
        if (options.some(option => option.value === selected)) draftList.value = selected;
        draftList.disabled = !options.length;
        draftOpen.disabled = !draftList.value;
      }
      async function saveDraft() {
        if (!draft) throw new Error('Hãy tạo hoặc mở bản nháp trước khi lưu.');
        retainEdits();
        const result = await send(`/drafts/${draft.id}/items`, {
          revision: draft.revision,
          document_fields: composer.documentFields(),
          leader_id: $('#bcnSigner').value || null,
          items: sources.filter(item => item.included).map(item => ({ ...item, source_version: item.version || 1 }))
        }, 'PUT');
        draft = result.draft;
        renderComposer();
        await loadDrafts();
      }
      $('#bcnCaseFilters').onsubmit = act(refresh);
      $('#bcnClearFilters').onclick = () => {
        $('#bcnCaseFilters').reset();
        $('#dailyReportStateFilter').value = '';
        refresh();
      };
      $('#bcnMetricGroup').onchange = metricFields;
      $('#bcnSourcesLoad').onclick = act(() => loadSources());
      $('#bcnLeadersLoad').onclick = act(loadLeaders);
      $('#bcnLeadersDelete').onclick = act(() => deleteLeaders(leaderWorkspace.selectedIds()));
      $('#bcnLeaderManagement').addEventListener('toggle', () => {
        if ($('#bcnLeaderManagement').open) loadLeaders().catch(error => notify(error.message));
      });
      $('#bcnLeaderForm').onsubmit = act(async event => {
        const body = Object.fromEntries(new FormData(event.target));
        await send(body.id ? `/leaders/${body.id}` : '/leaders', body, body.id ? 'PUT' : 'POST');
        event.target.reset();
        await loadLeaders({ force: true });
      });
      $('#bcnSituationForm').onsubmit = act(async event => {
        if (event.target.dataset.attachmentSaving === 'true') return;
        const data = new FormData(event.target);
        const id = event.target.dataset.sourceId || window.BcnIds.randomUUID();
        event.target.dataset.sourceId = id;
        await attachments.save(event.target, async files => {
          await send('/situations', { id, report_day: data.get('report_day'), narrative: data.get('narrative'),
            unit_id: data.get('unit_id'), category_codes: data.getAll('categories'), attachments: files });
          attachments.reset(event.target);
        });
        delete event.target.dataset.sourceId;
        notify('Đã lưu nháp tình hình.');
        await loadSources();
      });
      $('#bcnMetricForm').onsubmit = act(async event => {
        if (event.target.dataset.attachmentSaving === 'true') return;
        const data = Object.fromEntries(new FormData(event.target));
        const values = Object.fromEntries(Object.entries(data).filter(([key]) => key.startsWith('value_'))
          .map(([key, value]) => [key.slice(6), Number(value)]));
        const id = event.target.dataset.sourceId || window.BcnIds.randomUUID();
        event.target.dataset.sourceId = id;
        await attachments.save(event.target, async files => {
          await send('/work-results', { id, report_day: data.report_day, metric_code: data.metric_code,
            unit_id: data.unit_id, values, attachments: files });
          attachments.reset(event.target);
        });
        delete event.target.dataset.sourceId;
        notify('Đã lưu nháp kết quả công tác.');
        await loadSources();
      });
      async function loadComposer(current = () => true) {
        const query = new URLSearchParams({ report_day: $('#bcnComposeDay').value, include_pending: 'true' });
        if ($('#bcnComposeUnit').value) query.set('unit_id', $('#bcnComposeUnit').value);
        const all = new Map();
        let offset = 0;
        do {
          query.set('offset', offset);
          const page = await request(`/composer/items?${query}`);
          if (!current()) return;
          for (const item of page.items) all.set(`${item.source_type}:${item.source_id}`, item);
          offset = page.next_offset;
          $('#bcnComposeMatches').textContent = `Đang tải ${all.size} ý…`;
        } while (offset !== null);
        sourcesLoaded = true;
        sources = [...all.values()];
        draft = null;
        renderComposer();
        await Promise.all([loadLeaders(), loadDrafts()]);
      }
      $('#bcnComposeLoad').onclick = act(() => loadComposer());
      $('#bcnComposeSearch').oninput = () => {
        retainEdits();
        sourceFilter = $('#bcnComposeSearch').value.trim().toLowerCase();
        renderComposer({ previewChanged: false });
      };
      $('#bcnDraftNew').onclick = act(async () => {
        draft = (await send('/drafts', { report_day: $('#bcnComposeDay').value,
          report_type: $('#bcnReportType').value })).draft;
        retainEdits();
        renderComposer();
        await loadDrafts(draft.id);
      });
      $('#bcnDraftHistory').onclick = act(async () => {
        if (!draft) throw new Error('Hãy mở bản nháp trước.');
        const data = await request(`/drafts/${draft.id}/history`);
        $('#bcnDetailBody').innerHTML = data.history.map(entry => `<article class="bcn-item">
          <h3>Phiên bản ${entry.revision} · ${escape(entry.created_at)}</h3>
          <p>Số vụ chọn: ${entry.snapshot.statistics.selected_cases}</p>
          ${entry.snapshot.items.map(item => `<p>${escape(item.edited_text || item.source_snapshot.narrative)}</p>`).join('')}
        </article>`).join('') || '<p>Chưa có lần lưu lựa chọn.</p>';
        $('#bcnDetail').showModal();
      });
      $('#bcnDraftSave').onclick = act(saveDraft);
      $('#bcnDraftOpen').onclick = act(async () => {
        if (!$('#bcnDraftList').value) return;
        const result = await request(`/drafts/${$('#bcnDraftList').value}`);
        draft = result.draft;
        $('#bcnReportType').value = draft.report_type;
        $('#bcnComposeDay').value = draft.report_day.slice(0, 10);
        sourcesLoaded = true;
        sources = result.items.map(item => ({ ...item, version: item.source_version,
          source_text: item.source_snapshot.metric_code === 'DAILY_POLICE_WORK'
            ? window.DailyReportIntakeSchema.formatValues(item.source_snapshot.metric_values,
              item.source_snapshot.primitive_weapon_type, item.source_snapshot.work_domain,
              item.source_snapshot.administrative_domains)
            : item.source_snapshot.narrative || JSON.stringify(item.source_snapshot.metric_values || {}),
          unit_id: item.source_snapshot.unit_id,
          business_code: item.source_snapshot.business_code,
          classifications: item.source_snapshot.classifications,
          current_state: 'VERIFIED' }));
        await composer.restore(draft.document_fields, draft.report_type);
        renderComposer();
        await loadLeaders();
      });
      $('#bcnExport').onclick = act(async () => {
        await saveDraft();
        const result = await send(`/drafts/${draft.id}/exports`, {
          expected_revision: draft.revision, report_type: draft.report_type,
          leader_id: $('#bcnSigner').value || null, report_number: $('#bcnReportNumber').value
        });
        const id = result.export.id;
        $('#bcnExportResult').innerHTML = `<p>Đã tạo ${escape(result.export.file_name)} · phiên bản ${draft.revision}</p>
          <a href="/api/bao-cao-ngay/exports/${id}/download">Tải Word</a> ·
          <a href="/api/bao-cao-ngay/exports/${id}/preview" target="_blank" rel="noopener">Xem trước từ Word</a>`;
      });
      async function loadLegal() {
        const result = await request('/legal/versions');
        $('#bcnLegalRows').innerHTML = result.versions.map(item => `<article class="bcn-item">
          <strong>${escape(item.document_number)} · ${escape(item.title)}</strong> · ${escape(item.status)}
          <p>Khác biệt: ${escape(JSON.stringify(item.diff || {}))}</p>
          <p>${escape(item.source_uri)} · ${escape(item.effective_from || 'Chưa có hiệu lực')}</p>
          <button class="ghost" data-legal-id="${item.id}" data-legal-action="articles">Xem điều/khoản</button>
          ${item.status === 'DRAFT' && String(item.imported_by) === String(getScope()?.userId)
            ? `<button class="ghost" data-legal-id="${item.id}" data-legal-action="discard">Hủy bản nháp</button>` : ''}
          ${has('LEGAL_REVIEWER') && item.status !== 'RETIRED' ? `<button class="ghost" data-legal-id="${item.id}"
            data-legal-action="${item.status === 'DRAFT' ? 'review' : item.status === 'REVIEWED' ? 'publish' : 'rollback'}">
            ${item.status === 'DRAFT' ? 'Xác nhận thẩm định' : item.status === 'REVIEWED' ? 'Công bố' : 'Ngừng áp dụng'}</button>` : ''}
        </article>`).join('') || '<p>Chưa nhập danh mục được thẩm định.</p>';
        root.querySelectorAll('[data-legal-action]').forEach(button => {
          button.onclick = act(async () => {
            const action = button.dataset.legalAction;
            const id = button.dataset.legalId;
            if (action === 'articles') {
              const data = await request(`/legal/articles?version_id=${id}`);
              $('#bcnLegalArticles').innerHTML = data.articles.map(item => `<p>Điều ${escape(item.article_code)}
                ${escape(item.clause_code)} — ${escape(item.title)} · ${escape(item.business_codes.join(', '))}</p>`).join('');
              return;
            }
            const body = {};
            if (action === 'publish') {
              body.effective_from = result.versions.find(item => item.id === id).effective_from.slice(0, 10);
            }
            if (action === 'rollback') {
              body.reason = window.prompt('Lý do ngừng áp dụng:');
              if (!body.reason) return;
            }
            await send(`/legal/versions/${id}/${action}`, body);
            await loadLegal();
            await presentation.legalCatalog();
          });
        });
      }
      $('#bcnLegalLoad').onclick = act(loadLegal);
      $('#bcnLegalForm').onsubmit = act(async event => {
        const data = new FormData(event.target);
        const file = data.get('articles');
        if (file.size > 2 * 1024 * 1024) throw new Error('Tệp danh mục tối đa 2 MB.');
        const imported = JSON.parse(await file.text());
        const list = Array.isArray(imported) ? imported : imported.articles || imported.offences;
        if (!Array.isArray(list)) throw new Error('Tệp cần có danh sách articles hoặc offences.');
        const names = Object.fromEntries(Object.entries(window.DailyReportsUI.domains).map(([code, label]) => [label, code]));
        const articles = list.map(item => ({ ...item,
          article_code: item.article_code || String(item.article || ''),
          business_codes: item.business_codes || [names[item.group]].filter(Boolean)
        }));
        const body = Object.fromEntries(data);
        body.articles = articles;
        const result = await send('/legal/import-drafts', body);
        $('#bcnLegalDiff').textContent = `Mới: ${result.diff.added.join(', ')}\nSửa: ${result.diff.changed.join(', ')}\n`
          + `Không có trong bản mới: ${result.diff.retired.join(', ')}\nChờ thẩm định chuyên môn.`;
        await loadLegal();
        await presentation.legalCatalog();
      });
      async function loadNotifications() {
        window.dispatchEvent(new CustomEvent('daily-reports-changed'));
      }
      async function loadAudit() {
        await history.load({ fresh: true });
      }
      async function loadRoles() {
        const sequence = ++roleRequest;
        roleLoading = sequence;
        let result;
        try {
          result = await request('/role-assignments');
        } finally {
          if (roleLoading === sequence) roleLoading = 0;
        }
        if (sequence !== roleRequest || !admin()) return;
        accountPicker.setAccounts(result.accounts);
        permissionWorkspace.renderRoles(result, presentation.unitName);
        root.querySelectorAll('[data-role-modules]').forEach(button => {
          button.onclick = act(async () => {
            const role = result.roles[Number(button.dataset.roleModules)];
            const available = result.roleModules[role.role_code] || [];
            const selected = role.submodules ?? available;
            const values = await window.DailyReportsUI.form({ title: 'Phân quyền module con Báo cáo ngày',
              description: 'Chỉ các mục được chọn mới được mở và thao tác. Tổng quan luôn hiển thị.',
              fields: available.map(key => [key, result.compilerModules[key]]).map(([key, label]) =>
                `<label class="bcn-submodule-choice"><input type="checkbox" name="module_${key}" ${selected.includes(key) ? 'checked' : ''}>
                  ${escape(label)}</label>`).join(''), submit: 'Lưu phân quyền' });
            if (!values) return;
            const submodules = available.filter(key => values[`module_${key}`]);
            await send('/user-roles', { ...role, submodules }, 'PUT');
            await loadRoles();
            notify('Đã lưu phân quyền module con Báo cáo ngày.');
          });
        });
        root.querySelectorAll('[data-role-delete]').forEach(button => {
          button.onclick = act(async () => {
            await send('/user-roles', result.roles[Number(button.dataset.roleDelete)], 'DELETE');
            await loadRoles();
          });
        });
      }
      async function loadMetricDefinitions() {
        const query = new URLSearchParams();
        const selectedUnit = $('#bcnMetricForm [name="unit_id"]').value;
        if (admin() && selectedUnit) query.set('unit_id', selectedUnit);
        const definitions = await request(`/metric-definitions?${query}`);
        $('#bcnMetricGroup').innerHTML = definitions.metricGroups.filter(group => group.permitted).map(group =>
          `<option value="${group.code}">${escape(group.label)}</option>`).join('');
        for (const group of definitions.metricGroups.filter(item => item.configured)) {
          fields[group.code] = group.fields.map(field => [field.code, field.label]);
        }
        metricFields();
        $('#bcnMetricAvailability').textContent = $('#bcnMetricGroup').options.length ? ''
          : admin() && !selectedUnit ? 'Chọn đơn vị báo cáo để xem các chỉ tiêu phù hợp.'
          : 'Chưa có chỉ tiêu có hiệu lực được phân công cho tài khoản này.';
      }
      function ensureRoleAccounts() {
        if ($('#bcnRoleManagement').open && admin() && !roleLoading
          && $('#bcnRoleAccountSearch').dataset.loaded !== 'true') {
          loadRoles().catch(error => notify(error.message));
        }
      }
      $('#bcnRoleManagement').addEventListener('toggle', ensureRoleAccounts);
      root.addEventListener('bcn:navigate', event => {
        if (event.detail === 'composer' && navigation.allowed('composer')) {
          loadDrafts().catch(error => notify(error.message));
        }
        if (event.detail === 'permissions') ensureRoleAccounts();
        if (['permissions', 'composer'].includes(event.detail)) loadLeaders().catch(error => notify(error.message));
      });
      $('#bcnRolesLoad').onclick = act(loadRoles);
      $('#bcnRoleForm').onsubmit = act(async event => {
        if (!accountPicker.validate()) return;
        const body = Object.fromEntries(new FormData(event.target));
        delete body.compiler_module;
        if (body.role_code === 'PV01_COMPILER') {
          body.submodules = [...event.target.querySelectorAll('[name="compiler_module"]:checked')]
            .map(input => input.value);
        }
        await send('/user-roles', body, 'PUT');
        await loadRoles();
        notify('Đã cấp vai trò và quyền mở Báo cáo ngày cho tài khoản.');
      });
      async function detail(id, options = {}) {
        if (navigation.current() === 'registry') return casePreview.open(id);
        const generation = ++detailGeneration;
        const current = () => generation === detailGeneration && (options.current?.() ?? true);
        const result = await request(`/cases/${encodeURIComponent(id)}`);
        if (!current()) return;
        const item = result.case;
        if (options.assistantReview && (item.current_state !== 'RETURNED'
          || item.version !== options.assistantReview.version)) {
          throw new Error('Hồ sơ đã thay đổi. Hãy đọc lại hồ sơ và soạn lại bản bổ sung.');
        }
        const focusEvent = result.events.find(value => value.id === options.eventId);
        const reportDay = focusEvent?.report_day || item.report_day;
        const reviewing = navigation.current() === 'approval';
        const canEdit = !reviewing && has('UNIT_REPORTER')
          && (['DRAFT', 'RETURNED'].includes(item.current_state)
            || navigation.current() === 'updates'
            || item.business_code === 'TINH_HINH_KHAC');
        $('#bcnDetailBody').innerHTML = window.DailyReportsCaseDetailView.render({
          result, canEdit, canCompile: has('PV01_COMPILER'), canReport: !reviewing && has('UNIT_REPORTER'),
          view: navigation.current(),
          compilerModules: admin() ? null : getScope()?.compilerModules,
          focusEvent, reportDay, unitName: presentation.unitName(item.unit_id),
          handlingUnitName: item.reference_info?.handling_unit_id
            ? presentation.unitName(item.reference_info.handling_unit_id) : ''
        });
        window.DailyReportsCaseDetailView.bind($('#bcnDetailBody'));
        const narrativeOnly = item.intake_report && !item.persons?.length;
        let editClassifications;
        if (item.reference_info && canEdit) {
          const referenceOptions = await request('/reference-case-options');
          if (!current()) return;
          window.DailyReportReferenceCase.editor({ form: $('#bcnCaseEdit'), item, readOnly: !canEdit,
            request, notify, getScope, options: referenceOptions,
            onSaved: async () => { $('#bcnDetail').close(); await refresh(); } });
        } else if (!item.reference_info) {
        window.DailyReportsPersons.mount($('#bcnEditPersons'), {
          persons: item.persons || [], readOnly: !canEdit || narrativeOnly
        });
        editClassifications = window.DailyReportsClassifications.mount($('#bcnEditClassifications'), {
          request, getDay: () => item.report_day.slice(0, 10), item, readOnly: !canEdit, notify
        });
        window.DailyReportsCaseTitle.mount($('#bcnCaseEdit'), { businessCode: item.business_code, readOnly: !canEdit });
        window.DailyReportsLocation.mount($('#bcnEditLocation'), {
          address: item.location_address, legacy: item.location_general, readOnly: !canEdit
        });
        }
        if (options.assistantReview && canEdit) {
          const submit = $('#bcnCaseUpdate');
          if (submit) submit.textContent = 'Xác nhận cập nhật và gửi lại';
        }
        if (options.assistantReview?.draft) {
          const field = $('#bcnCaseEdit')?.elements.summary;
          if (!canEdit || !field || field.disabled || field.readOnly) {
            throw new Error('Không thể điền bản nháp vào hồ sơ bằng tài khoản hiện tại.');
          }
          field.value = [field.value.trimEnd(), options.assistantReview.draft].filter(Boolean).join('\n\n');
          field.dispatchEvent(new Event('input', { bubbles: true }));
        }
        $('#bcnDetail').showModal();
        const fileTasks = [attachments.list($('#bcnCaseAttachments'), { resource: 'cases', id,
          request, notify, current, readOnly: !canEdit, onChange: () => detail(id, options) })];
        root.querySelectorAll('[data-event-files]').forEach(container => {
          fileTasks.push(attachments.list(container, { resource: 'events', id: container.dataset.eventFiles,
            request, notify, current, readOnly: true }));
        });
        Promise.all(fileTasks).catch(error => { if (current()) notify(error.message); });
        if (!item.reference_info) $('#bcnCaseEdit').onsubmit = event => {
          event.preventDefault();
          notify('Danh sách điều luật chưa tải xong. Nếu tải lỗi, đóng và mở lại hồ sơ để thử lại.');
        };
        if (editClassifications) await editClassifications.refresh();
        if (!current()) return;
        if ($('#bcnRequestSupplement')) $('#bcnRequestSupplement').onclick = act(async () => {
          if (await reviewCase(id, 'request-supplement')) await detail(id, options);
        });
        if ($('#bcnVerifyCase')) $('#bcnVerifyCase').onclick = act(async () => {
          await send(`/cases/${id}/verify`);
          await detail(id, options);
        });
        root.querySelectorAll('[data-event-compose]').forEach(button => {
          button.onclick = act(async () => {
            const event = result.events.find(value => value.id === button.dataset.eventCompose);
            $('#bcnDetail').close();
            navigation.select('composer');
            $('#bcnComposeDay').value = event.report_day;
            $('#bcnComposeUnit').value = '';
            $('#bcnComposeClear').click();
            await loadComposer();
            focusNotification(`[data-source-id="${event.id}"]`);
          });
        });
        let savingCase = false;
        if (!item.reference_info) $('#bcnCaseEdit').onsubmit = act(async event => {
          if (savingCase) return;
          if (item.current_state === 'RETURNED' && !getScope()?.caseUpdateResubmitVersion) {
            throw new Error('Máy chủ cần khởi động lại để cập nhật và gửi lại hồ sơ. Chưa lưu thay đổi.');
          }
          const values = Object.fromEntries(new FormData(event.target));
          window.DailyReportsClassifications.apply(event.target, values);
          if (!narrativeOnly) window.DailyReportsPersons.apply(event.target, values);
          window.DailyReportsLocation.apply(event.target, values);
          const button = $('#bcnCaseUpdate');
          savingCase = true;
          button.disabled = true;
          try {
            const resubmit = item.current_state === 'RETURNED';
            try {
              await send(`/cases/${id}`, { ...values, version: item.version, resubmit }, 'PATCH');
              notify(resubmit ? 'Đã cập nhật và gửi lại hồ sơ cho Trung tâm.' : 'Đã lưu cập nhật.');
            } catch (patchErr) {
              if (patchErr.status === 409 && item.current_state === 'VERIFIED') {
                await send(`/cases/${id}/events`, {
                  narrative: values.summary || item.summary,
                  event_kind: 'UPDATE',
                  report_day: date()
                });
                notify('Đã lưu cập nhật vụ việc.');
              } else {
                throw patchErr;
              }
            }
            $('#bcnDetail').close();
            await refresh();
          } finally {
            savingCase = false;
            button.disabled = false;
          }
        });
        if ($('#bcnCountCase')) $('#bcnCountCase').onclick = act(async () => {
          const data = await request('/statistics/rules');
          if (!data.rules.length) throw new Error('Chưa có quy tắc thống kê được phê duyệt.');
          const choice = window.prompt(data.rules.map((rule, index) => `${index + 1}. ${rule.title}`).join('\n')
            + '\nNhập số thứ tự quy tắc:');
          const rule = data.rules[Number(choice) - 1];
          if (!rule) return;
          const reason = window.prompt('Căn cứ áp dụng quy tắc cho vụ việc này:');
          if (!reason) return;
          await send(`/cases/${id}/counting`, { rule_id: rule.id, reason, report_day: date() });
          notify('Đã ghi nhận thống kê lần đầu.');
        });
        if ($('#bcnAddEvent')) $('#bcnAddEvent').onclick = act(async () => {
          const ui = window.DailyReportsUI;
          const values = await ui.form({ title: 'Cập nhật vụ việc',
            description: item.title || item.summary.slice(0, 120),
            fields: ui.select('decision_type', 'Loại quyết định', ui.decisions)
              + ui.field('decision_number', 'Số quyết định', 'text', 'maxlength="100"')
              + ui.field('decision_date', 'Ngày ban hành', 'date')
              + ui.field('decision_authority', 'Cơ quan ban hành', 'text', 'maxlength="250"')
              + `<label class="daily-report-wide">${ui.fieldLabel('Diễn biến cập nhật *')}
                <textarea name="narrative" required maxlength="8000"></textarea></label>`,
            attachments: true,
            onSubmit: values => send(`/cases/${id}/events`, { ...values, report_day: date(), event_kind: 'UPDATE' }),
            submit: 'Lưu cập nhật' });
          if (!values) return;
          $('#bcnDetail').close();
          await detail(id);
        });
        root.querySelectorAll('[data-event-verify]').forEach(button => {
          button.onclick = act(async () => {
            await send(`/events/${button.dataset.eventVerify}/verify`);
            $('#bcnDetail').close();
            await detail(id, options);
          });
        });
        if ($('#bcnDuplicateCheck')) $('#bcnDuplicateCheck').onclick = act(async () => {
          const data = await request(`/duplicates/candidates?case_id=${id}`);
          $('#bcnDuplicateRows').innerHTML = window.DailyReportsCaseDuplicates.render(data.candidates);
          window.lucide?.createIcons({ root: $('#bcnDuplicateRows'),
            attrs: { 'stroke-width': 1.8, focusable: 'false' } });
          root.querySelectorAll('[data-duplicate-open]').forEach(button => {
            button.onclick = act(async () => {
              $('#bcnDetail').close();
              await detail(button.dataset.duplicateOpen);
            });
          });
          root.querySelectorAll('[data-duplicate-decide]').forEach(button => {
            button.onclick = act(async () => {
              const reason = window.prompt('Lý do quyết định đối chiếu:');
              if (!reason) return;
              await send('/duplicates/decisions', { case_id: id, candidate_case_id: button.dataset.duplicateDecide,
                action: $(`[data-duplicate-action="${button.dataset.duplicateDecide}"]`).value, reason });
              notify('Đã lưu quyết định đối chiếu.');
            });
          });
        });
      }
      function focusNotification(selector) {
        root.querySelectorAll('[data-notification-focus]').forEach(node => {
          node.removeAttribute('data-notification-focus');
        });
        const target = $(selector);
        if (target) {
          target.setAttribute('data-notification-focus', '');
          target.scrollIntoView({ block: 'center' });
        }
      }
      const sourcePreview = window.DailyReportSourcePreview.mount(root, getScope);
      async function openNotification(reference, current) {
        const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
        if (!uuid.test(reference.resourceId || '')) throw new Error('Mã thông báo nghiệp vụ không hợp lệ.');
        navigation.select(reference.view);
        if (reference.view === 'composer' && reference.resourceType !== 'DRAFT') {
          $('#bcnComposeDay').value = reference.reportDay;
          $('#bcnComposeUnit').value = reference.unitId || '';
          await loadComposer(current);
        } else if (reference.caseId && uuid.test(reference.caseId)) {
          await detail(reference.caseId, { current, eventId: reference.eventId,
            assistantReview: reference.assistantReview });
        } else if (reference.resourceType === 'UNLOCK_REQUEST') {
          focusNotification(`[data-unlock-id="${reference.resourceId}"]`);
        } else if (['SITUATION', 'WORK_RESULT'].includes(reference.resourceType)) {
          $('#bcnSourceDay').value = reference.reportDay;
          $('#bcnSourceUnit').value = reference.unitId || '';
          await loadSources(current);
          if (current()) sourcePreview.open(reference);
        } else if (reference.resourceType === 'LEGAL_VERSION') {
          await loadLegal();
        } else if (reference.resourceType === 'DRAFT') {
          $('#bcnComposeDay').value = reference.reportDay;
          await loadDrafts();
          if (!current()) return;
          $('#bcnDraftList').value = reference.resourceId;
          await $('#bcnDraftOpen').onclick();
        }
      }
      return {
        navigation,
        presentation,
        openNotification,
        cancelDetail() {
          casePreview.close();
          detailGeneration += 1;
          sourcePreview.close();
        },
        reset() {
          casePreview.close();
          sourcePreview.close();
          leaderGeneration += 1;
          leaderLoading = null;
          leaderWorkspace.reset();
          roleRequest += 1;
          roleLoading = 0;
          accountPicker.reset();
          detailGeneration += 1;
          initialized = false;
          navigation.reset();
          presentation.reset();
          history.reset();
          permissionWorkspace.reset();
          composer.reset();
          draft = null;
          sources = [];
          sourceFilter = '';
          sourcesLoaded = false;
          draftListRequest += 1;
          draftList.replaceChildren(new Option('Đang tải danh sách…', ''));
          draftList.disabled = true;
          draftOpen.disabled = true;
          renderComposer({ previewChanged: false });
          leaders = [];
          ['bcnSourceRows', 'bcnComposerRows', 'bcnLeaderRows', 'bcnLegalRows', 'bcnLegalArticles',
            'bcnAuditRows', 'bcnRoleRows', 'bcnExportResult', 'bcnDetailBody']
            .forEach(id => { $(`#${id}`).innerHTML = ''; });
          $('#bcnDetail').close();
          root.querySelectorAll('form').forEach(form => form.reset());
          intake.reset();
          referenceCase.reset();
          entryLock.reset();
          $('#bcnStatsRule')?.closest('.card')?.remove();
        },
        queryValues,
        preview: id => casePreview.open(id).catch(error => notify(error.message)),
        detail: id => detail(id).catch(error => notify(error.message)),
        duplicates: id => detail(id).then(() => $('#bcnDuplicateCheck')?.click())
          .catch(error => notify(error.message)),
        async refresh({ reloadUnits = false } = {}) {
          if (initialized && reloadUnits) {
            units = (await request('/units')).units;
            for (const id of ['bcnCaseUnit', 'bcnSourceUnit', 'bcnComposeUnit', 'bcnRoleUnit']) {
              const select = $(`#${id}`);
              const selected = select.value;
              const placeholder = [...select.options].find(option => !option.value);
              select.replaceChildren(...(placeholder ? [placeholder] : []),
                ...units.map(unit => new Option(unit.name, String(unit.id))));
              select.value = selected;
            }
          }
          if (initialized) {
            entryUnits.configure(units);
            intake.configure(units);
            await referenceCase.configure(units, { reload: reloadUnits });
            entryLock.configure(getScope());
            if (reloadUnits) presentation.configure({ units });
            if (['permissions', 'composer'].includes(navigation.current())) await loadLeaders();
            return;
          }
          window.DailyReportConfiguration?.mount({ root, request, send, act, escape, admin });
          units = (await request('/units')).units;
          entryUnits.configure(units);
          intake.configure(units);
          await referenceCase.configure(units);
          entryLock.configure(getScope());
          const options = units.map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join('');
          ['bcnCaseUnit', 'bcnSourceUnit', 'bcnComposeUnit', 'bcnRoleUnit'].forEach(id => {
            $(`#${id}`).innerHTML = (id === 'bcnComposeUnit' || id === 'bcnRoleUnit' || (id === 'bcnCaseUnit' && has('PV01_COMPILER'))
              ? '<option value="">Toàn phạm vi được giao</option>' : '') + options;
            if (getScope()?.unitId && id !== 'bcnComposeUnit' && !(id === 'bcnCaseUnit' && has('PV01_COMPILER'))) $(`#${id}`).value = getScope().unitId;
          });
          root.querySelectorAll('input[type="date"]').forEach(input => {
            if (input.name !== 'effective_to') input.value = date();
          });
          const permissions = {
            intake: has('UNIT_REPORTER') || has('PV01_COMPILER'),
            sources: has('UNIT_REPORTER') || has('PV01_COMPILER'), composer: has('PV01_COMPILER'),
            leaders: has('PV01_COMPILER') || admin(), legal: true,
            notifications: has('UNIT_REPORTER') || has('PV01_COMPILER') || has('AUDITOR') || admin() || has('LEGAL_REVIEWER'), permissions: admin()
          };
          ['bcnSituationForm', 'bcnMetricForm', 'dailyReportCaseForm'].forEach(id => {
            $(`#${id}`).hidden = !has('UNIT_REPORTER') || (!admin() && !getScope()?.unitId);
          });
          $('#bcnLeaderForm').hidden = !admin();
          $('#bcnLegalForm').hidden = !(admin() || has('LEGAL_REVIEWER'));
          $('#bcnAuditLoad').closest('.card').hidden = !(has('PV01_COMPILER') || has('AUDITOR'));
          permissions.compilerModules = getScope()?.compilerModules;
          permissions.compilerOnly = has('PV01_COMPILER') && !has('UNIT_REPORTER') && !admin();
          if (permissions.sources && (admin() || getScope()?.submodules?.includes('input'))) {
            await loadMetricDefinitions();
          }
          await composer.restore();
          presentation.configure({ units, permissions });
          navigation.configure(permissions, getScope());
          initialized = true;
        }
      };
    }
  };
})();
