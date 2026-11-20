(() => {
  'use strict';
  window.DailyReportsPresentation = {
    mount({ root, request, getScope, notify, detail, loadLegalVersions, loadNotifications, loadAudit }) {
      const ui = window.DailyReportsUI;
      const $ = selector => root.querySelector(selector);
      const act = action => async event => {
        event?.preventDefault();
        try { await action(event); } catch (error) { notify(error.message); }
      };
      let units = [];
      let entryMode = 'case';
      let articles = [];
      let versions = [];
      let bundledVersion;
      const has = role => getScope()?.roles?.includes(role);
      const unitName = id => units.find(unit => String(unit.id) === String(id))?.name || `Đơn vị ${id}`;
      const duplicateWorkspace = window.DailyReportsDuplicates.mount({
        root, request, getScope, unitName, detail
      });
      const kpis = values => values.map(([label, value, note, key, icon]) =>
        `<article class="bcn-kpi" data-legal-metric="${ui.escape(key)}">
        <span class="bcn-legal-metric-icon" aria-hidden="true"><i data-lucide="${ui.escape(icon)}"></i></span>
        <small>${ui.escape(label)}</small><strong>${ui.escape(value)}</strong>
        <p>${ui.escape(note || '')}</p></article>`).join('');
      function showLegalDetail(item) {
        const dialog = $('#bcnDetail');
        const escape = ui.escape;
        const metadata = (label, value, wide = false) =>
          `<div${wide ? ' class="bcn-law-meta-wide"' : ''}><dt>${escape(label)}</dt>
            <dd>${escape(value || 'Chưa cập nhật')}</dd></div>`;
        const fields = metadata('Văn bản căn cứ', item.document_number)
          + metadata('Trạng thái', ui.states[item.status] || item.status)
          + metadata('Chương', item.chapter, true)
          + metadata(item.bundled ? 'Hệ nghiệp vụ · gợi ý tra cứu' : 'Hệ nghiệp vụ',
            [...new Set(item.business_codes.map(code => ui.domainName(code) || code))].join(', '), true)
          + (item.bundled ? '' : metadata('Hiệu lực từ', ui.date(item.effective_from)));
        const note = item.bundled ? bundledVersion.review_note : item.amendment_note;
        $('#bcnDetailBody').innerHTML = `<section class="bcn-law-detail">
          <header class="bcn-law-header">
            <div class="bcn-law-heading"><span class="bcn-law-symbol" aria-hidden="true">
              <i data-lucide="scale"></i></span><div><p class="bcn-law-kicker">Danh mục pháp luật</p>
              <span id="bcnLegalArticle">Điều ${escape(item.article_code)}${item.clause_code
                ? ` · Khoản ${escape(item.clause_code)}` : ''}</span></div></div>
            <h2 id="bcnLegalTitle">${escape(item.title)}</h2>
          </header>
          <div class="bcn-law-scroll"><dl class="bcn-law-meta">${fields}</dl>
            <section class="bcn-law-content"><h3>${item.bundled ? 'Toàn văn điều luật' : 'Nội dung điều luật'}</h3>
              ${item.bundled
                ? `<p>Tên điều trích từ văn bản gốc. Xem nội dung đầy đủ và chú thích tại trang
                    <strong>${escape(item.source_page)}</strong> của PDF đính kèm.</p>`
                : `<div class="bcn-legal-text">${escape(item.article_text
                  || 'Phiên bản này chưa có nội dung điều / khoản.')}</div>`}
            </section>${note ? `<aside class="bcn-law-note"><i data-lucide="info" aria-hidden="true"></i>
              <p>${escape(note)}</p></aside>` : ''}</div>
          ${item.bundled ? `<footer class="bcn-law-footer"><span>PDF nguồn · Trang ${escape(item.source_page)}</span>
            <a class="primary bcn-law-source" href="${escape(item.source_pdf_url)}"
              target="_blank" rel="noopener noreferrer"><i data-lucide="file-text" aria-hidden="true"></i>
              Mở văn bản gốc<i data-lucide="arrow-up-right" aria-hidden="true"></i></a></footer>` : ''}
        </section>`;
        dialog.setAttribute('aria-labelledby', 'bcnLegalArticle bcnLegalTitle');
        dialog.addEventListener('close', () => dialog.removeAttribute('aria-labelledby'), { once: true });
        window.lucide?.createIcons({ root: dialog });
        dialog.showModal();
        $('.bcn-law-scroll').scrollTop = 0;
      }
      function setEntry(mode) {
        entryMode = mode;
        root.querySelectorAll('[data-entry-mode]').forEach(button => {
          button.classList.toggle('active', button.dataset.entryMode === (mode === 'situation' ? 'case' : mode));
          button.setAttribute('aria-selected', String(button.dataset.entryMode === (mode === 'situation' ? 'case' : mode)));
        });
        root.querySelectorAll('[data-entry-panel]').forEach(panel => { panel.hidden = panel.dataset.entryPanel !== mode; });
      }
      root.querySelectorAll('[data-entry-mode]').forEach(button => {
        button.onclick = () => setEntry(button.dataset.entryMode);
      });
      $('#bcnSituationBack').onclick = () => {
        setEntry('case');
        $('[data-classification-petition]').focus();
      };
      const entryForm = $('#dailyReportCaseForm');
      const classificationHost = document.createElement('section');
      classificationHost.id = 'bcnEntryClassifications';
      classificationHost.className = 'daily-report-wide';
      const businessLabel = entryForm.elements.business_code.closest('label');
      const legalLabel = $('#bcnEntryLegal').closest('label');
      businessLabel.hidden = true;
      legalLabel.hidden = true;
      entryForm.insertBefore(classificationHost, legalLabel);
      const entryClassifications = window.DailyReportsClassifications.mount(classificationHost, {
        request, getDay: () => getScope()?.reportDay, notify, onPetition: () => {
          setEntry('situation');
          $('#bcnSituationBack').focus();
        }
      });
      async function entryLegal() {
        if (root.querySelector('#bcnReferenceCaseForm')) return;
        await entryClassifications.refresh();
      }
      $('#dailyReportCaseForm [name="decision_number"]').oninput = event => {
        $('#dailyReportCaseForm [name="decision_authority"]').required = Boolean(event.target.value.trim());
      };
      function renderScope() {
        const scope = getScope();
        if (!scope) return;
        $('#dailyReportCaseForm [name="unit_name"]').value = scope.unitName || 'Chưa gắn đơn vị nhập liệu';
        $('#bcnMetricUnitLabel').value = scope.unitName || 'Chưa gắn đơn vị nhập liệu';
        $('#bcnEntryReadOnly').hidden = has('UNIT_REPORTER');
        $('#bcnLawImportOpen').disabled = !(scope.isAdmin || has('LEGAL_REVIEWER'));
        $('#bcnMetricAvailability').textContent = $('#bcnMetricGroup').options.length
          ? '' : 'Chưa có chỉ tiêu có hiệu lực được phân công cho tài khoản này.';
      }
      async function legalCatalog() {
        versions = (await request('/legal/versions')).versions;
        bundledVersion ||= (await request('/legal/bundled')).version;
        versions.push(bundledVersion);
        const chosen = $('#bcnLegalVersion').value;
        $('#bcnLegalVersion').innerHTML = '<option value="">Tất cả phiên bản được phép</option>' + versions.map(item =>
          `<option value="${item.id}">${ui.escape(item.document_number)} · ${ui.states[item.status] || item.status}</option>`).join('');
        if (versions.some(item => item.id === chosen)) $('#bcnLegalVersion').value = chosen;
        else if (!versions.some(item => item.status === 'PUBLISHED')) $('#bcnLegalVersion').value = bundledVersion.id;
        const bundled = $('#bcnLegalVersion').value === bundledVersion.id;
        const query = new URLSearchParams(new FormData($('#bcnLegalSearch')));
        if (query.get('q')) {
          query.set('q', query.get('q').replace(/^điều\s+/iu, '').trim());
        }
        articles = (await request(`/legal/${bundled ? 'bundled/articles' : 'articles'}?${query}`)).articles;
        $('#bcnLegalMetrics').innerHTML = kpis([
          ['Danh mục hiện tại', articles.length, 'Điều / khoản theo bộ lọc', 'catalogue', 'book-open'],
          ['Hệ nghiệp vụ', Object.keys(ui.domains).length, 'Không đồng nghĩa chương BLHS', 'domains', 'layers-3'],
          ['Tình hình khiếu kiện', $('#bcnSituationForm [name="categories"]').options.length,
            'Phân loại tình hình', 'situations', 'messages-square'],
          ['Lịch sử phiên bản', versions.length, 'Giữ căn cứ cũ khi cập nhật', 'versions', 'history']
        ]);
        window.lucide?.createIcons({ root: $('#bcnLegalMetrics') });
        $('#bcnLawResults').innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr>
          <th>Điều / khoản</th><th>Tên tội danh</th><th>Hệ nghiệp vụ</th><th>Phiên bản căn cứ</th></tr></thead><tbody>
          ${articles.map((item, index) => `<tr><td><button class="ghost" data-law-detail="${index}">
            Điều ${ui.escape(item.article_code)} ${ui.escape(item.clause_code)}</button></td><td>${ui.escape(item.title)}</td>
            <td><span class="bcn-category-list">${[...new Set(item.business_codes.map(ui.canonicalBusinessCode))]
              .map(ui.categoryBadge).join('')}</span></td>
            <td>${ui.escape(item.document_number)}<small>${ui.states[item.status] || item.status}</small></td></tr>`).join('')
            || '<tr><td colspan="4">Chưa có điều luật phù hợp.</td></tr>'}</tbody></table></div>`;
        $('#bcnLawResultCount').textContent = `${articles.length} điều / khoản phù hợp`;
        root.querySelectorAll('[data-law-detail]').forEach(button => {
          button.onclick = () => showLegalDetail(articles[Number(button.dataset.lawDetail)]);
        });
      }
      $('#bcnLegalSearch').onsubmit = act(legalCatalog);
      $('#bcnLegalSearch').onreset = () => setTimeout(() => legalCatalog().catch(error => notify(error.message)), 0);
      $('#bcnLegalExportJson').onclick = () => {
        const selected = versions.find(item => item.id === $('#bcnLegalVersion').value);
        const blob = new Blob([JSON.stringify({ version: selected || null, articles }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'danh-muc-phap-luat.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      async function activate(view) {
        if (!getScope()) return;
        $('#bcnCaseWorkflow').hidden = !['updates', 'returned'].includes(view);
        $('#bcnCaseWorkflow').textContent = view === 'returned'
          ? 'Lịch sử trả lại → Đơn vị sửa hồ sơ → Giải trình và gửi lại → PV01 duyệt. Sau 10:00 cần được mở khóa.'
          : 'Giữ nguyên mã vụ việc. Bản nháp có thể chỉnh sửa; vụ đã duyệt được thêm diễn biến, quyết định và gửi PV01 rà soát.';
        renderScope();
        if (view === 'input') {
          setEntry(entryMode);
          if (has('UNIT_REPORTER')) await entryLegal();
        }
        if (view === 'legal') await Promise.all([legalCatalog(), loadLegalVersions()]);
        if (view === 'history') {
          const tasks = [];
          if (has('PV01_COMPILER') || has('AUDITOR')) tasks.push(loadAudit());
          if (has('UNIT_REPORTER') || has('PV01_COMPILER')
            || has('LEGAL_REVIEWER') || getScope().isAdmin) tasks.push(loadNotifications());
          await Promise.all(tasks);
        }

      }
      root.addEventListener('bcn:navigate', event => {
        activate(event.detail).catch(error => notify(error.message));
      });
      return {
        configure(values) {
          units = values.units;
          duplicateWorkspace.configure(units);
          renderScope();
          $('#dailyReportCaseForm [name="category_code"]').value ||= $('#dailyReportCaseForm [name="business_code"]').value;
          setEntry(entryMode);
        },
        activate,
        legalCatalog,
        unitName,
        renderScope,
        reset() {
          entryClassifications.reset();
          units = [];
          articles = [];
          versions = [];
          duplicateWorkspace.reset();
          root.querySelectorAll('#bcnLawResults')
            .forEach(element => element.replaceChildren());
        }
      };
    }
  };
})();
