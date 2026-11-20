(() => {
  const root = document.getElementById('dailyReports');
  if (!root) return;
  window.DailyReportsActionMenu.mount(root);
  const api = '/api/bao-cao-ngay';
  const reportText = import('./daily-reports-report-text.mjs?v=20261029-clean-report');
  const $ = selector => root.querySelector(selector);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  let scope = null;
  let caseRequest = 0;
  let pendingRefresh = null;
  let expanded;
  let unlockWorkspace;
  let decidingUnlock = false;
  let pendingCaseId = window.BcnIds.randomUUID();

  async function request(path, options = {}) {
    const view = expanded?.navigation.current();
    if ((!options.method || options.method === 'GET') && ['registry', 'approval'].includes(view)
      && /^\/(cases|work-results|situations|events)([/?]|$)/.test(path)) {
      path += `${path.includes('?') ? '&' : '?'}workspace=${view}`;
    }
    const response = await (window.BcnSession?.fetch || window.fetch)(`${api}${path}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });
    const body = response.headers.get('content-type')?.includes('application/json')
      ? await response.json() : null;
    if (!response.ok) throw new Error(body?.error || `Yêu cầu thất bại (${response.status}).`);
    if (options.method && options.method !== 'GET') {
      window.dispatchEvent(new CustomEvent('daily-reports-changed'));
    }
    if (/^\/(cases|overview|composer\/items|drafts|duplicates\/candidates|work-results|situations)([/?]|$)/u.test(path)) {
      const { reportDisplayPayload } = await reportText;
      return reportDisplayPayload(body);
    }
    return body;
  }

  function reportDate() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }

  function notify(message) {
    window.NotificationPopup.getShared().notify(message, { source: 'Báo cáo ngày' });
  }

  function setScope() {
    const unit = scope?.unitId ? `${scope.unitName || `Đơn vị ${scope.unitId}`}`
      : scope?.isAdmin ? 'Admin · Toàn bộ đơn vị'
        : 'Chưa gắn đơn vị công tác; cập nhật tại Hệ thống & Phân quyền';
    const deadline = scope?.beforeCutoff ? 'Đang trong giờ nhập đến trước 10:00'
      : 'Đã khóa cửa sổ nhập báo cáo';
    $('#dailyReportScope').textContent = `${unit} · Ngày ${scope?.reportDay || reportDate()}`
      + ` · ${deadline} · Múi giờ ${scope?.timeZone || 'Asia/Ho_Chi_Minh'}`;
  }

  async function loadScope() {
    const next = await request('/scope');
    const identity = value => JSON.stringify({
      userId: value.userId, unitId: value.unitId,
      isAdmin: value.isAdmin, submodules: value.submodules, compilerModules: value.compilerModules, roles: [...new Set(value.roles || [])].sort()
    });
    const changed = scope && identity(scope) !== identity(next);
    scope = next;
    if (changed) expanded?.reset();
    setScope();
  }

  function caseActions(item) {
    const currentView = expanded?.navigation.current();
    const review = window.DailyReportsReview.actions(scope, currentView, item.current_state);
    const canReview = review.verify;
    const action = (name, label, icon, secondary = false, menu = false) =>
      `<button type="button" class="daily-report-action${secondary ? ' is-secondary' : ''}"
        ${menu ? 'role="menuitem"' : ''}
        data-${name}="${escapeHtml(item.id)}"><i data-lucide="${icon}" aria-hidden="true"></i>
        <span>${label}</span></button>`;
    const buttons = [
      currentView === 'registry'
        ? action('case-preview', 'Xem chi tiết', 'eye', true) : action('detail', 'Chi tiết', 'eye', true),
      canReview
        ? action('verify', 'Duyệt', 'shield-check') : ''
    ].join('');
    const extra = [
      currentView === 'duplicates'
        ? action('duplicate', 'Kiểm tra trùng', 'scan-search', true, true) : '',
      currentView !== 'approval' && review.supplement
        ? action('request-supplement', 'Trả lại / Yêu cầu bổ sung', 'message-square-plus', true, true) : ''
    ].join('');
    const label = escapeHtml(item.title || item.summary.slice(0, 90));
    const menuId = `bcnCaseActions-${escapeHtml(item.id)}`;
    return `<div class="bcn-case-actions${canReview ? ' bcn-case-actions-review' : ''}" role="group"
      aria-label="Thao tác vụ việc ${label}">${buttons}${extra ? `
      <button type="button" class="daily-report-action is-secondary" data-case-more="${escapeHtml(item.id)}"
        aria-label="Thao tác khác: ${label}" title="Thao tác khác" aria-haspopup="menu"
        aria-expanded="false" aria-controls="${menuId}">
        <i data-lucide="ellipsis" aria-hidden="true"></i></button>
      <div id="${menuId}" class="bcn-case-overflow-menu" role="menu" aria-label="Thao tác: ${label}" hidden>
        ${extra}</div>` : ''}</div>`;
  }

  async function loadCases(offset = 0) {
    window.DailyReportsActionMenu.close();
    const requestId = ++caseRequest;
    if (!Number.isSafeInteger(offset)) offset = 0;
    if (!scope?.roles?.some(role => ['UNIT_REPORTER', 'PV01_COMPILER'].includes(role))
      || !['registry', 'approval', 'input', 'returned', 'updates', 'duplicates']
        .some(key => expanded?.navigation.allowed(key))) {
      $('#dailyReportCaseRows').innerHTML = '';
      $('#bcnUpdateRows').innerHTML = '';
      return;
    }
    const query = new URLSearchParams({ report_day: scope?.reportDay || reportDate() });
    query.set('offset', offset);
    for (const [key, value] of Object.entries(expanded?.queryValues() || {})) query.set(key, value);
    if ($('#dailyReportStateFilter').value) query.set('state', $('#dailyReportStateFilter').value);
    const forcedState = expanded?.navigation.forcedState();
    if (forcedState) query.set('state', forcedState);
    if (expanded?.navigation.current() === 'returned') query.set('has_returns', 'true');
    if (expanded?.navigation.current() === 'updates') {
      query.delete('followup');
      query.set('business_code', 'TINH_HINH_KHAC');
      const formFromDay = expanded?.queryValues()?.from_day;
      if (!formFromDay) {
        query.set('from_day', '2026-01-01');
        query.set('to_day', scope?.reportDay || reportDate());
      }
    }
    const [data, metricData] = await Promise.all([
      request(`/cases?${query}`),
      query.get('date_basis') === 'returned' ? { metrics: [] }
        : request(`/work-results?${query}`).catch(() => ({ metrics: [] }))
    ]);
    if (requestId !== caseRequest) return;
    const period = $('#bcnCaseListPeriod');
    if (period) {
      const from = query.get('from_day') || query.get('report_day');
      const to = query.get('to_day') || query.get('report_day');
      const dateLabel = query.get('date_basis') === 'returned' ? 'ngày trả lại gần nhất' : 'ngày báo cáo';
      const displayDay = value => value.split('-').reverse().join('/');
      const domainCode = query.get('business_code');
      const domainLabel = domainCode ? (window.DailyReportsUI?.domainName(domainCode) || domainCode) : '';
      period.innerHTML = `<i data-lucide="calendar-days" aria-hidden="true"></i>
        <span>${from === to ? dateLabel[0].toUpperCase() + dateLabel.slice(1) : 'Khoảng ' + dateLabel}</span>
        <strong>${displayDay(from)}${from === to ? '' : ' – ' + displayDay(to)}</strong>`
        + (domainLabel ? ` · <span class="bcn-domain-filter-tag"><i data-lucide="tag" aria-hidden="true"></i> `
          + `Hệ: <strong>${escapeHtml(domainLabel)}</strong> `
          + `<button type="button" class="bcn-domain-filter-clear" title="Bỏ lọc hệ nghiệp vụ" `
          + `aria-label="Bỏ lọc hệ nghiệp vụ">×</button></span>` : '');
      period.dataset.from = from;
      period.dataset.to = to;
      if (domainLabel) {
        period.querySelector('.bcn-domain-filter-clear').onclick = () => {
          const form = $('#bcnCaseFilters');
          if (form) form.elements.business_code.value = '';
          loadCases().catch(error => notify(error.message));
        };
      }
      window.lucide?.createIcons({ root: period });
    }
    const cases = data.cases || [];
    const metrics = metricData.metrics || [];
    const totalCount = data.total ?? cases.length;
    const isApprovalView = expanded?.navigation.current() === 'approval';
    if (isApprovalView) {
      $('#dailyReportCaseCount').textContent = String(totalCount);
      $('#dailyReportCaseCount').classList.add('bcn-approval-numeric');
      const titleBadge = $('#bcnApprovalTitleBadge');
      if (titleBadge) {
        titleBadge.textContent = String(totalCount);
        titleBadge.hidden = totalCount <= 0;
      }
    } else {
      $('#dailyReportCaseCount').textContent = `${cases.length} / ${totalCount} hồ sơ phù hợp`;
      $('#dailyReportCaseCount').classList.remove('bcn-approval-numeric');
      const titleBadge = $('#bcnApprovalTitleBadge');
      if (titleBadge) titleBadge.hidden = true;
    }
    const approvalBadge = document.querySelector('#sidebar [data-approval-badge]');
    if (approvalBadge && (isApprovalView || !expanded?.navigation.current()
      || expanded?.navigation.current() === 'input')) {
      approvalBadge.textContent = String(totalCount);
      approvalBadge.hidden = totalCount <= 0;
    }
    const casesTabCount = $('#bcnRegCasesCount');
    if (casesTabCount) casesTabCount.textContent = String(totalCount);
    const metricsTabCount = $('#bcnRegMetricsCount');
    if (metricsTabCount) metricsTabCount.textContent = String(metrics.length);

    if (!$('#bcnCasePagination')) {
      const pagination = document.createElement('div');
      pagination.id = 'bcnCasePagination';
      pagination.className = 'bcn-toolbar';
      $('#dailyReportCaseRows').closest('.table-wrap').after(pagination);
    }
    $('#bcnCasePagination').innerHTML = '<button class="ghost" data-case-prev>Trang trước</button>'
      + '<button class="ghost" data-case-next>Trang sau</button>';
    $('[data-case-prev]').disabled = offset === 0;
    $('[data-case-next]').disabled = data.next_offset === null;
    $('[data-case-prev]').onclick = () => loadCases(Math.max(0, offset - 500)).catch(error => notify(error.message));
    $('[data-case-next]').onclick = () => loadCases(data.next_offset).catch(error => notify(error.message));
    $('#dailyReportCaseRows').innerHTML = cases.length ? cases.map((item, index) => {
      let locationText = '';
      if (item.location_address && typeof item.location_address === 'object') {
        const a = item.location_address;
        locationText = [a.address, a.commune, a.district, a.province].filter(Boolean).join(', ');
      }
      if (!locationText && item.location_general) locationText = item.location_general;

      const persons = Array.isArray(item.persons) ? item.persons : [];
      let personsHtml = '';
      if (persons.length) {
        personsHtml = `<div class="bcn-case-persons-inline">
          <span class="lbl-persons">👤 Đối tượng (${persons.length}):</span>
          ${persons.map(p => `<span class="person-inline-tag">
            <b>${escapeHtml(p.name || 'Đối tượng')}</b>${p.birth_year ? ` (SN ${escapeHtml(p.birth_year)})` : ''}${p.role ? ` · <em>${escapeHtml(p.role)}</em>` : ''}${p.offense ? ` · ${escapeHtml(p.offense)}` : ''}
          </span>`).join(' ')}
        </div>`;
      }

      return `<tr data-case-id="${item.id}"><td>${offset + index + 1}</td>
        <td>${window.DailyReportsUI.caseCategoryBadges(item)}</td>
        <td><strong>${escapeHtml(item.title || item.summary.slice(0, 90))}</strong>
          <p class="bcn-case-summary-p">${escapeHtml(item.summary)}</p>
          <div class="bcn-case-inline-meta">
            ${locationText ? `<span class="inline-meta-item">📍 ${escapeHtml(locationText)}</span>` : ''}
            ${item.counted_as_pphs ? `<span class="inline-meta-item pphs-tag">✓ PPHS</span>` : ''}
          </div>
          ${personsHtml}
        </td><td><strong>${escapeHtml(item.unit_name)}</strong></td>
        <td>${window.DailyReportsUI.status(item.current_state)}</td>
        <td class="daily-report-actions">${caseActions(item)}</td></tr>`;
    }).join('')
      : '<tr><td colspan="6" class="empty-row">Chưa có hồ sơ phù hợp.</td></tr>';
    window.lucide?.createIcons({ root: $('#dailyReportCaseRows'), attrs: { 'stroke-width': 1.8, focusable: 'false' } });

    // Render Bảng Kết quả công tác Công an xã
    const metricRowsEl = $('#bcnRegistryMetricRows');
    const aggBannerEl = $('#bcnMetricsAggregateBanner');
    if (metricRowsEl) {
      let totalGuns = 0;
      let totalAmmo = 0;
      let totalWeapons = 0;
      let totalExplosives = 0;
      let totalFireworks = 0;
      let totalPersons = 0;
      let totalPatrolOfficers = 0;
      let totalPatrolViolations = 0;
      let totalFines = 0;

      for (const item of metrics) {
        const v = item.metric_values || {};
        totalGuns += Number(v.guns) || 0;
        totalAmmo += Number(v.ammunition) || 0;
        totalWeapons += Number(v.primitive_weapons) || 0;
        totalExplosives += Number(v.explosives) || 0;
        totalFireworks += Number(v.fireworks) || 0;
        totalPersons += (Number(v.community_sentences) || 0)
          + (Number(v.released_prisoners) || 0)
          + (Number(v.parole) || 0)
          + (Number(v.delinquent_youth) || 0)
          + (Number(v.community_rehabilitation) || 0)
          + (Number(v.suspected_drug_users) || 0);
        totalPatrolOfficers += Number(v.patrol_officers) || 0;
        totalPatrolViolations += Number(v.patrol_violations) || 0;

        const adminDomains = Array.isArray(item.administrative_domains) ? item.administrative_domains : [];
        if (adminDomains.length) {
          for (const d of adminDomains) {
            totalFines += Number(d.values?.administrative_fines) || 0;
          }
        } else {
          totalFines += Number(v.administrative_fines) || 0;
        }
      }

      if (aggBannerEl) {
        if (metrics.length > 0) {
          aggBannerEl.hidden = false;
          aggBannerEl.innerHTML = `<div class="bcn-metrics-kpi-bar">
            <div class="bcn-kpi-tile">
              <div class="bcn-kpi-icon icon-weapon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <div class="bcn-kpi-body">
                <span class="bcn-kpi-label">VŨ KHÍ, VLN, CCHT</span>
                <span class="bcn-kpi-val">${totalGuns} <small>súng</small> · ${totalAmmo} <small>đạn</small></span>
              </div>
            </div>
            <div class="bcn-kpi-tile">
              <div class="bcn-kpi-icon icon-users">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <div class="bcn-kpi-body">
                <span class="bcn-kpi-label">QUẢN LÝ ĐỐI TƯỢNG</span>
                <span class="bcn-kpi-val">${totalPersons} <small>đối tượng</small></span>
              </div>
            </div>
            <div class="bcn-kpi-tile">
              <div class="bcn-kpi-icon icon-patrol">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <rect x="2" y="5" width="20" height="14" rx="2"/>
                  <line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
              </div>
              <div class="bcn-kpi-body">
                <span class="bcn-kpi-label">TUẦN TRA ANTT</span>
                <span class="bcn-kpi-val">${totalPatrolOfficers} <small>lượt</small> · ${totalPatrolViolations} <small>vi phạm</small></span>
              </div>
            </div>
            <div class="bcn-kpi-tile">
              <div class="bcn-kpi-icon icon-fine">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <line x1="12" y1="1" x2="12" y2="23"/>
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
              </div>
              <div class="bcn-kpi-body">
                <span class="bcn-kpi-label">XỬ PHẠT VPHC</span>
                <span class="bcn-kpi-val fine-highlight">${totalFines.toLocaleString('vi-VN')} <small>đ</small></span>
              </div>
            </div>
          </div>`;
        } else {
          aggBannerEl.hidden = true;
          aggBannerEl.innerHTML = '';
        }
      }

      metricRowsEl.innerHTML = metrics.length ? metrics.map((item, index) => {
        const values = item.metric_values || {};
        const weaponType = item.primitive_weapon_type || '';
        const adminDomains = Array.isArray(item.administrative_domains) ? item.administrative_domains : [];

        // 1. Vũ khí
        const weaponItems = [];
        if (values.guns) {
          weaponItems.push(`<div class="bcn-stat-item stat-highlight-red">
            <span class="stat-lbl">Súng các loại:</span>
            <span class="stat-val"><b>${values.guns}</b> khẩu</span>
          </div>`);
        }
        if (values.ammunition) {
          weaponItems.push(`<div class="bcn-stat-item stat-highlight-red">
            <span class="stat-lbl">Đạn các loại:</span>
            <span class="stat-val"><b>${values.ammunition}</b> viên</span>
          </div>`);
        }
        if (values.primitive_weapons) {
          weaponItems.push(`<div class="bcn-stat-item">
            <span class="stat-lbl">Vũ khí thô sơ:</span>
            <span class="stat-val"><b>${values.primitive_weapons}</b> ${weaponType ? `<small>(${escapeHtml(weaponType)})</small>` : ''}</span>
          </div>`);
        }
        if (values.explosives) {
          weaponItems.push(`<div class="bcn-stat-item">
            <span class="stat-lbl">Thuốc nổ:</span>
            <span class="stat-val"><b>${values.explosives}</b> kg</span>
          </div>`);
        }
        if (values.fireworks) {
          weaponItems.push(`<div class="bcn-stat-item">
            <span class="stat-lbl">Pháo nổ:</span>
            <span class="stat-val"><b>${values.fireworks}</b> kg</span>
          </div>`);
        }
        const weaponStatsHtml = weaponItems.length
          ? `<div class="bcn-stat-items-grid">${weaponItems.join('')}</div>`
          : `<div class="bcn-stat-empty">Không phát sinh thu hồi trong ngày</div>`;

        // 2. Đối tượng
        const personItems = [];
        if (values.community_sentences) {
          personItems.push(`<div class="bcn-stat-item">
            <span class="stat-lbl">Án cấp xã:</span>
            <span class="stat-val"><b>${values.community_sentences}</b> người</span>
          </div>`);
        }
        if (values.released_prisoners) {
          personItems.push(`<div class="bcn-stat-item">
            <span class="stat-lbl">Xong án tù về:</span>
            <span class="stat-val"><b>${values.released_prisoners}</b> người</span>
          </div>`);
        }
        if (values.parole) {
          personItems.push(`<div class="bcn-stat-item">
            <span class="stat-lbl">Tha tù có ĐK:</span>
            <span class="stat-val"><b>${values.parole}</b> người</span>
          </div>`);
        }
        if (values.delinquent_youth) {
          personItems.push(`<div class="bcn-stat-item stat-highlight-amber">
            <span class="stat-lbl">Thanh thiếu niên hư:</span>
            <span class="stat-val"><b>${values.delinquent_youth}</b> người</span>
          </div>`);
        }
        if (values.community_rehabilitation) {
          personItems.push(`<div class="bcn-stat-item">
            <span class="stat-lbl">Cai nghiện ma túy:</span>
            <span class="stat-val"><b>${values.community_rehabilitation}</b> người</span>
          </div>`);
        }
        if (values.suspected_drug_users) {
          personItems.push(`<div class="bcn-stat-item stat-highlight-amber">
            <span class="stat-lbl">Nghi sử dụng MT:</span>
            <span class="stat-val"><b>${values.suspected_drug_users}</b> người</span>
          </div>`);
        }
        const personStatsHtml = personItems.length
          ? `<div class="bcn-stat-items-grid">${personItems.join('')}</div>`
          : `<div class="bcn-stat-empty">Không có đối tượng quản lý phát sinh</div>`;

        // 3. Tuần tra
        const patrolItems = [];
        if (values.patrol_shifts) {
          patrolItems.push(`<div class="bcn-stat-item">
            <span class="stat-lbl">Ca tuần tra:</span>
            <span class="stat-val"><b>${values.patrol_shifts}</b> ca</span>
          </div>`);
        }
        if (values.patrol_officers) {
          patrolItems.push(`<div class="bcn-stat-item">
            <span class="stat-lbl">Lượt CBCS:</span>
            <span class="stat-val"><b>${values.patrol_officers}</b> lượt</span>
          </div>`);
        }
        if (values.patrol_vehicles_checked) {
          patrolItems.push(`<div class="bcn-stat-item">
            <span class="stat-lbl">Phương tiện kiểm tra:</span>
            <span class="stat-val"><b>${values.patrol_vehicles_checked}</b> xe</span>
          </div>`);
        }
        if (values.patrol_violations) {
          patrolItems.push(`<div class="bcn-stat-item stat-highlight-red">
            <span class="stat-lbl">Phát hiện vi phạm:</span>
            <span class="stat-val"><b>${values.patrol_violations}</b> vụ</span>
          </div>`);
        }
        if (values.patrol_vehicles_detained) {
          patrolItems.push(`<div class="bcn-stat-item">
            <span class="stat-lbl">Tạm giữ phương tiện:</span>
            <span class="stat-val"><b>${values.patrol_vehicles_detained}</b> xe</span>
          </div>`);
        }
        const patrolStatsHtml = patrolItems.length
          ? `<div class="bcn-stat-items-grid">${patrolItems.join('')}</div>`
          : `<div class="bcn-stat-empty">Không ghi nhận ca tuần tra trong ngày</div>`;

        // 4. VPHC
        let adminCardsHtml = '';
        let communeTotalFines = 0;
        if (adminDomains.length) {
          adminCardsHtml = adminDomains.map(d => {
            const v = d.values || {};
            const fineAmt = Number(v.administrative_fines) || 0;
            communeTotalFines += fineAmt;
            return `<div class="bcn-domain-stat-row">
              <div class="bcn-domain-head">
                <span class="bcn-domain-name">${escapeHtml(d.domain || 'Lĩnh vực')}</span>
                <span class="bcn-domain-fine">${fineAmt > 0 ? fineAmt.toLocaleString('vi-VN') + ' đ' : '0 đ'}</span>
              </div>
              <div class="bcn-domain-counts">
                <span>KT: <b>${v.administrative_checks || 0}</b></span>
                <span>·</span>
                <span>BB: <b>${v.administrative_violation_records || 0}</b></span>
                <span>·</span>
                <span>QĐ: <b>${v.administrative_penalty_decisions || 0}</b></span>
              </div>
            </div>`;
          }).join('');
        } else if (values.administrative_checks || values.administrative_violation_records
          || values.administrative_penalty_decisions || values.administrative_fines) {
          const fineAmt = Number(values.administrative_fines) || 0;
          communeTotalFines += fineAmt;
          adminCardsHtml = `<div class="bcn-domain-stat-row">
            <div class="bcn-domain-head">
              <span class="bcn-domain-name">${escapeHtml(item.work_domain || 'Tổng hợp')}</span>
              <span class="bcn-domain-fine">${fineAmt > 0 ? fineAmt.toLocaleString('vi-VN') + ' đ' : '0 đ'}</span>
            </div>
            <div class="bcn-domain-counts">
              <span>KT: <b>${values.administrative_checks || 0}</b></span>
              <span>·</span>
              <span>BB: <b>${values.administrative_violation_records || 0}</b></span>
              <span>·</span>
              <span>QĐ: <b>${values.administrative_penalty_decisions || 0}</b></span>
            </div>
          </div>`;
        }

        const adminStatsHtml = adminCardsHtml
          ? `<div class="bcn-admin-domains-list">${adminCardsHtml}</div>
             <div class="bcn-total-fine-pill">
               <span>Tổng tiền phạt:</span>
               <strong>${communeTotalFines.toLocaleString('vi-VN')} đ</strong>
             </div>`
          : `<div class="bcn-stat-empty">Không phát sinh xử phạt vi phạm hành chính</div>`;

        const canReview = window.DailyReportsReview.allowed(scope, expanded?.navigation.current())
          && item.state === 'PENDING_REVIEW';
        const canSubmit = !['registry', 'approval'].includes(expanded?.navigation.current())
          && scope?.roles?.includes('UNIT_REPORTER') && ['DRAFT', 'RETURNED'].includes(item.state);
        const actions = [
          `<button class="ghost icon-button" data-source-files="${item.id}" data-kind="work-results">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
            <span>Văn bản đính kèm</span>
          </button>`,
          canReview ? `<button class="primary icon-button bcn-btn-verify" data-source-action="verify" data-kind="work-results" data-id="${item.id}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>Duyệt</span>
          </button>` : '',
          canReview ? `<button class="ghost danger icon-button" data-source-return="${item.id}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
            <span>Trả lại</span>
          </button>` : '',
          canSubmit ? `<button class="primary icon-button" data-source-action="submit" data-kind="work-results" data-id="${item.id}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            <span>Gửi rà soát</span>
          </button>` : ''
        ].filter(Boolean).join('');

        return `<div class="bcn-commune-card" data-metric-id="${item.id}">
          <div class="bcn-commune-card-head">
            <div class="bcn-commune-header-left">
              <span class="bcn-commune-stt">#${index + 1}</span>
              <div class="bcn-commune-identity">
                <div class="bcn-commune-title-row">
                  <svg class="bcn-commune-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/>
                  </svg>
                  <strong class="bcn-commune-name">${escapeHtml(item.unit_name || 'Công an xã')}</strong>
                  <span class="bcn-commune-status">${window.DailyReportsUI.status(item.state)}</span>
                </div>
                <div class="bcn-commune-meta-row">
                  <span class="bcn-commune-date">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    Ngày báo cáo: <b>${window.DailyReportsUI.date(item.report_day)}</b>
                  </span>
                </div>
              </div>
            </div>
            <div class="bcn-commune-header-actions">
              ${actions}
            </div>
          </div>
          <div class="bcn-commune-card-body">
            <div class="bcn-panel panel-weapons">
              <div class="bcn-panel-head">
                <span class="bcn-panel-icon" data-work-icon="weapons" aria-hidden="true">
                  <i data-lucide="shield-check"></i></span>
                <span class="bcn-panel-title">Thu hồi VK, VLN, CCHT</span>
              </div>
              <div class="bcn-panel-content">
                ${weaponStatsHtml}
              </div>
            </div>
            <div class="bcn-panel panel-persons">
              <div class="bcn-panel-head">
                <span class="bcn-panel-icon" data-work-icon="persons" aria-hidden="true">
                  <i data-lucide="clipboard-check"></i></span>
                <span class="bcn-panel-title">Kiểm danh, răn đe đối tượng</span>
              </div>
              <div class="bcn-panel-content">
                ${personStatsHtml}
              </div>
            </div>
            <div class="bcn-panel panel-patrol">
              <div class="bcn-panel-head">
                <span class="bcn-panel-icon" data-work-icon="patrol" aria-hidden="true">
                  <i data-lucide="car-front"></i></span>
                <span class="bcn-panel-title">Tuần tra, kiểm soát ANTT</span>
              </div>
              <div class="bcn-panel-content">
                ${patrolStatsHtml}
              </div>
            </div>
            <div class="bcn-panel panel-admin">
              <div class="bcn-panel-head">
                <span class="bcn-panel-icon" data-work-icon="administrative" aria-hidden="true">
                  <i data-lucide="scale"></i></span>
                <span class="bcn-panel-title">Xử lý vi phạm hành chính</span>
              </div>
              <div class="bcn-panel-content">
                ${adminStatsHtml}
              </div>
            </div>
          </div>
        </div>`;
      }).join('')
        : '<div class="bcn-empty-card">Chưa có kết quả công tác công an xã phù hợp với bộ lọc đã chọn.</div>';

      window.lucide?.createIcons({ root: metricRowsEl, attrs: { 'stroke-width': 1.8, focusable: 'false' } });
      metricRowsEl.querySelectorAll('[data-source-files]').forEach(btn => {
        btn.onclick = async () => {
          const m = metrics.find(x => x.id === btn.dataset.sourceFiles);
          if (!m) return;
          const dialog = document.createElement('dialog');
          dialog.className = 'bcn-dialog bcn-attachment-dialog card';
          dialog.setAttribute('aria-label', 'Văn bản đính kèm');
          dialog.innerHTML = '<button class="ghost" type="button">Đóng</button><div></div>';
          root.append(dialog);
          dialog.querySelector('button').onclick = () => dialog.close();
          dialog.addEventListener('close', () => { dialog.remove(); loadCases().catch(err => notify(err.message)); }, { once: true });
          dialog.showModal();
          await window.DailyReportAttachments.list(dialog.querySelector('div'), { resource: 'work-results', id: m.id,
            request, notify, readOnly: ['registry', 'approval'].includes(expanded?.navigation.current()) });
        };
      });

      metricRowsEl.querySelectorAll('[data-source-action]').forEach(btn => {
        btn.onclick = async () => {
          await request(`/${btn.dataset.kind}/${btn.dataset.id}/${btn.dataset.sourceAction}`, { method: 'POST' });
          await loadCases();
        };
      });

      metricRowsEl.querySelectorAll('[data-source-return]').forEach(btn => {
        btn.onclick = async () => {
          const reason = window.prompt('Lý do trả lại kết quả công tác:');
          if (!reason) return;
          await request(`/work-results/${btn.dataset.sourceReturn}/return`, {
            method: 'POST', body: JSON.stringify({ reason })
          });
          await loadCases();
        };
      });
    }

    const updates = expanded?.navigation.current() === 'updates';
    if (updates) {
      const from = query.get('from_day') || query.get('report_day');
      const to = query.get('to_day') || query.get('report_day');
      const fmtDay = val => (val ? val.split('-').reverse().join('/') : '');
      const hasCustomDate = Boolean(expanded?.queryValues()?.from_day || expanded?.queryValues()?.to_day);
      const rangeText = hasCustomDate
        ? (from === to ? fmtDay(from) : `${fmtDay(from)} – ${fmtDay(to)}`)
        : 'Tất cả thời gian';
      const metaBar = `<div class="bcn-updates-meta-bar">`
        + `<span class="bcn-updates-count"><i data-lucide="clipboard-list" aria-hidden="true"></i> `
        + `Tìm thấy <strong>${cases.length}</strong> / <strong>${data.total ?? cases.length}</strong> vụ việc</span>`
        + (rangeText ? `<span class="bcn-updates-date-badge"><i data-lucide="calendar" aria-hidden="true"></i> `
          + `${rangeText}</span>` : '')
        + `</div>`;
      const rowsHtml = cases.length ? cases.map(item => {
        const persons = Array.isArray(item.persons) ? item.persons : [];
        const personsCount = persons.length ? `<span class="bcn-meta-tag">`
          + `<i data-lucide="users" aria-hidden="true"></i> ${persons.length} đối tượng</span>` : '';
        const eventCount = item.event_count || 1;
        const isReporter = scope.roles?.includes('UNIT_REPORTER');
        const actLabel = isReporter ? 'Cập nhật' : 'Xem & xử lý';
        const actIcon = isReporter ? 'file-pen-line' : 'external-link';
        return `<article class="bcn-update-item" data-case-id="${item.id}">
          <header class="bcn-update-item-header">
            <div class="bcn-update-item-badges">
              ${window.DailyReportsUI.caseCategoryBadges(item)}
              <span class="bcn-event-badge" title="Số diễn biến đã ghi nhận">`
                + `<i data-lucide="git-commit" aria-hidden="true"></i>${eventCount} diễn biến</span>
              ${window.DailyReportsUI.status(item.current_state)}
            </div>
          </header>
          <div class="bcn-update-item-body">
            <h4 class="bcn-update-item-title">${escapeHtml(item.title || item.summary.slice(0, 90))}</h4>
            ${item.summary ? `<p class="bcn-update-item-summary">`
              + `${escapeHtml(item.summary.slice(0, 160))}${item.summary.length > 160 ? '…' : ''}</p>` : ''}
            <div class="bcn-update-item-meta">
              <span class="bcn-meta-tag"><i data-lucide="building-2" aria-hidden="true"></i>`
                + `${escapeHtml(item.unit_name || 'Đơn vị')}</span>
              <span class="bcn-meta-tag"><i data-lucide="calendar" aria-hidden="true"></i>`
                + `Ngày BC: ${window.DailyReportsUI.date(item.report_day)}</span>
              ${item.occurred_at ? `<span class="bcn-meta-tag"><i data-lucide="clock" aria-hidden="true"></i>`
                + `Xảy ra: ${window.DailyReportsUI.date(item.occurred_at.slice(0, 10))}</span>` : ''}
              ${personsCount}
            </div>
          </div>
          <footer class="bcn-update-item-actions">
            <button class="ghost bcn-action-preview" type="button" data-case-preview="${item.id}">
              <i data-lucide="eye" aria-hidden="true"></i>Xem nhanh</button>
            <button class="primary bcn-action-detail" type="button" data-detail="${item.id}">
              <i data-lucide="${actIcon}" aria-hidden="true"></i>${actLabel}</button>
          </footer>
        </article>`;
      }).join('') : `<div class="bcn-empty-card bcn-updates-empty">
        <div class="bcn-empty-icon" aria-hidden="true"><i data-lucide="folder-search"></i></div>
        <h4>Chưa có vụ việc nào phù hợp</h4>
        <p>Không tìm thấy hồ sơ đang theo dõi theo bộ lọc hiện tại. Thử chọn lại khoảng ngày hoặc xóa lọc.</p>
      </div>`;
      $('#bcnUpdateRows').innerHTML = metaBar + rowsHtml;
      window.lucide?.createIcons({ root: $('#bcnUpdateRows'), attrs: { 'stroke-width': 1.8, focusable: 'false' } });
      $('#bcnUpdateRows').after($('#bcnCasePagination'));
    } else {
      $('#dailyReportCaseRows').closest('.table-wrap').after($('#bcnCasePagination'));
    }
    root.querySelectorAll('[data-request-supplement]').forEach(button => {
      button.onclick = () => reviewCase(button.dataset.requestSupplement, 'request-supplement');
    });
    root.querySelectorAll('[data-duplicate]').forEach(button => {
      button.onclick = () => expanded.duplicates(button.dataset.duplicate);
    });
    root.querySelectorAll('[data-detail]').forEach(button => {
      button.onclick = () => expanded.detail(button.dataset.detail);
    });
    root.querySelectorAll('.bcn-update-item').forEach(card => {
      card.onclick = event => {
        if (event.target.closest('button, a, input, select')) return;
        expanded.detail(card.dataset.caseId);
      };
    });
    root.querySelectorAll('#dailyReportCaseRows tr[data-case-id]').forEach(row => {
      row.onclick = event => {
        if (event.target.closest('button, a, input, select')) return;
        expanded.detail(row.dataset.caseId);
      };
    });
    root.querySelectorAll('[data-case-preview]').forEach(button => {
      button.onclick = () => expanded.preview(button.dataset.casePreview);
    });
    root.querySelectorAll('[data-verify]').forEach(button => {
      button.onclick = () => reviewCase(button.dataset.verify, 'verify');
    });
  }

  async function loadUnlockRequests() {
    await unlockWorkspace?.load();
  }

  function refresh() {
    if (pendingRefresh) return pendingRefresh;
    pendingRefresh = refreshWorkspace().finally(() => { pendingRefresh = null; });
    return pendingRefresh;
  }

  async function updateApprovalBadge() {
    const badge = document.querySelector('#sidebar [data-approval-badge]');
    if (!badge) return;
    const canApprove = Boolean(scope?.isAdmin
      || scope?.roles?.includes('PV01_COMPILER') && scope.compilerModules?.includes('approval'));
    if (!canApprove) {
      badge.hidden = true;
      return;
    }
    try {
      const day = scope?.reportDay || reportDate();
      const res = await request(`/cases?report_day=${day}&offset=0`);
      const count = Number(res?.total ?? (res?.cases ? res.cases.length : 0)) || 0;
      badge.textContent = String(count);
      badge.hidden = count <= 0;
    } catch {
      // Non-blocking
    }
  }

  async function refreshWorkspace() {
    try {
      await loadScope();
      await expanded?.refresh();
      expanded?.navigation.updateContext();
      expanded?.presentation.renderScope();
      const results = await Promise.allSettled([loadCases(), loadUnlockRequests(), updateApprovalBadge()]);
      const failed = results.find(result => result.status === 'rejected');
      if (failed) notify(failed.reason.message);
    } catch (error) {
      expanded?.reset();
      $('#dailyReportCaseRows').innerHTML = '';
      unlockWorkspace?.reset();
      notify(error.message);
      $('#dailyReportScope').textContent = 'Không tải được phạm vi truy cập.';
    }
  }


  async function reviewCase(id, action) {
    if (!window.DailyReportsReview.allowed(scope, expanded?.navigation.current())) return false;
    let body = {};
    if (action === 'request-supplement') {
      const values = await window.DailyReportsUI.form({
        title: 'Yêu cầu đơn vị bổ sung',
        description: 'Gửi về đúng đơn vị để chỉnh sửa và gửi lại. Hồ sơ chờ bổ sung sẽ không được đưa vào Word '
          + 'cho đến khi đơn vị gửi lại và được duyệt.',
        fields: '<label class="daily-report-wide">Nội dung yêu cầu *'
          + '<textarea name="reason" required maxlength="3000"></textarea></label>',
        submit: 'Gửi yêu cầu'
      });
      if (!values) return false;
      body = { reason: values.reason.trim() };
    }
    try {
      await request(`/cases/${encodeURIComponent(id)}/${action}`, {
        method: 'POST', body: JSON.stringify(body)
      });
      notify(action === 'verify' ? 'Đã duyệt hồ sơ.' : 'Đã gửi yêu cầu bổ sung tới đơn vị.');
      await refresh();
      return true;
    } catch (error) {
      notify(error.message);
      return false;
    }
  }

  async function decideUnlock(id, decision = 'APPROVED', purpose = 'REPORTING_WINDOW', item) {
    if (decidingUnlock) return;
    decidingUnlock = true;
    try {
      const values = await window.DailyReportsUI.form({
        title: decision === 'APPROVED' ? (purpose === 'CASE_SUPPLEMENT' ? 'Duyệt bổ sung hồ sơ'
          : 'Mở khóa 30 phút') : 'Từ chối yêu cầu',
        description: 'Quyết định áp dụng đúng đơn vị, ngày và đối tượng trong yêu cầu.',
        fields: (unlockWorkspace?.decisionContext(item) || '')
          + '<label class="daily-report-wide">Lý do quyết định'
          + '<textarea name="reason" rows="3" maxlength="2000" '
          + 'placeholder="Ghi ý kiến xử lý để đơn vị theo dõi…"></textarea></label>',
        submit: decision === 'APPROVED' ? (purpose === 'CASE_SUPPLEMENT' ? 'Duyệt bổ sung'
          : 'Chấp thuận 30 phút') : 'Từ chối yêu cầu',
        onSubmit: async values => {
          const dialog = root.querySelector('.bcn-action-dialog[open]');
          const buttons = [...(dialog?.querySelectorAll('button') || [])];
          if (dialog?.getAttribute('aria-busy') === 'true') throw new Error('Đang xử lý quyết định.');
          dialog?.setAttribute('aria-busy', 'true');
          buttons.forEach(button => { button.disabled = true; });
          try {
            await request(`/unlock-requests/${encodeURIComponent(id)}/decide`, {
              method: 'POST', body: JSON.stringify({ decision, reason: values.reason.trim() })
            });
          } finally {
            dialog?.setAttribute('aria-busy', 'false');
            buttons.forEach(button => { button.disabled = false; });
          }
        }
      });
      if (!values) return;
      notify(decision === 'APPROVED' ? (purpose === 'CASE_SUPPLEMENT'
        ? 'Đã duyệt. Đơn vị được cập nhật và gửi lại hồ sơ này.' : 'Đã mở quyền trong 30 phút.')
        : 'Đã từ chối yêu cầu.');
      await refresh();
    } catch (error) {
      notify(error.message);
    } finally {
      decidingUnlock = false;
    }
  }

  $('#dailyReportCaseForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (event.currentTarget.dataset.attachmentSaving === 'true') return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    window.DailyReportsPersons.apply(event.currentTarget, values);
    delete values.unit_name;
    if (values.occurred_at) values.occurred_at = new Date(values.occurred_at).toISOString();
    values.report_day = scope?.reportDay || reportDate();
    values.id = pendingCaseId;
    const form = event.currentTarget;
    try {
      window.DailyReportsClassifications.apply(form, values);
      window.DailyReportsLocation.apply(form, values);
      await window.DailyReportAttachments.save(form, async attachments => {
        await request('/cases', { method: 'POST', body: JSON.stringify({ ...values, attachments }) });
      });
      form.reset();
      pendingCaseId = window.BcnIds.randomUUID();
      notify('Đã lưu hồ sơ vụ việc.');
      await refresh();
      if (expanded.navigation.current() === 'input') await expanded.presentation.activate('input');
    } catch (error) {
      notify(error.message);
    }
  });

  $('#dailyReportRefresh').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      await refresh();
      await expanded.presentation.activate(expanded.navigation.current());
    } catch (error) {
      notify(error.message);
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  });
  expanded = window.DailyReportsWorkspace.mount({ root, request, notify, getScope: () => scope, refresh, reviewCase });
  unlockWorkspace = window.DailyReportsUnlock.mount({
    root, request, getScope: () => scope, decide: decideUnlock,
    unitName: id => expanded.presentation.unitName(id),
    allowed: () => expanded.navigation.allowed('unlock')
  });
  $('#dailyReportStateFilter').addEventListener('change', () => loadCases().catch(error => notify(error.message)));
  window.DailyReports = {
    async refreshUnits() {
      await loadScope();
      await expanded.refresh({ reloadUnits: true });
      return refresh();
    },
    activate() {
      expanded.navigation.select(expanded.navigation.current());
      return refresh();
    },
    deactivate() {
      window.DailyReportsActionMenu.close();
      expanded.cancelDetail();
      expanded.navigation.deactivate();
      $('#bcnDetail').close();
    },
    async openNotification(reference, current = () => true) {
      await refresh();
      if (!current() || !scope) return;
      await expanded.openNotification(reference, current);
    },
    async fromAssistant(action, draft, current) {
      if (!expanded.navigation.allowed('returned')) throw new Error('Bạn chưa có quyền xem báo cáo bị trả lại.');
      expanded.navigation.select('returned');
      if (action.type === 'list' || action.type === 'cases') {
        const form = $('#bcnCaseFilters');
        form.reset();
        form.elements.date_basis.value = action.byReturn ? 'returned' : '';
        if (action.from) form.elements.from_day.value = action.from;
        if (action.to) form.elements.to_day.value = action.to;
        if (action.unit) {
          form.elements.unit_id.value = action.unit;
          if (form.elements.unit_id.value !== action.unit && String(scope.unitId) !== action.unit) {
            throw new Error('Không áp dụng được bộ lọc đơn vị.');
          }
        }
        form.elements.state.value = action.state || 'RETURNED';
        $('#dailyReportStateFilter').value = form.elements.state.value;
        const domain = action.domain || action.business_code || '';
        if (domain) {
          form.elements.business_code.value = domain;
        }
        await loadCases();
      } else if (action.type === 'review') {
        await expanded.openNotification({ view: 'returned', resourceType: 'CASE',
          resourceId: action.id, caseId: action.id, assistantReview: { version: action.version, draft } }, current);
      }
    },
    navigate(view) {
      window.DailyReportsActionMenu.close();
      expanded.cancelDetail();
      expanded.navigation.select(view);
      if (expanded.navigation.isCaseView()) loadCases().catch(error => notify(error.message));
      $('#bcnDetail').close();
    }
  };
})();
