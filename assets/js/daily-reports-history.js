(() => {
  'use strict';
  window.DailyReportsHistory = {
    mount({ root, request, notify }) {
      const view = window.DailyReportsHistoryView;
      const card = view.mount(root);
      const $ = selector => card.querySelector(selector);
      let page = 1;
      let snapshot = null;
      let sequence = 0;
      let timer;
      let controller;

      function setLoading(loading) {
        card.setAttribute('aria-busy', String(loading));
        const loadBtn = $('#bcnAuditLoad');
        if (loadBtn) loadBtn.disabled = loading;
        const refreshBtn = root.querySelector('#dailyReportRefresh');
        if (refreshBtn && root.dataset.bcnActiveView === 'history') {
          refreshBtn.disabled = loading;
          if (loading) refreshBtn.setAttribute('aria-busy', 'true');
          else refreshBtn.removeAttribute('aria-busy');
        }
        $('#bcnAuditPagination')?.querySelectorAll('button').forEach(button => {
          button.disabled = loading || button.dataset.disabled === 'true';
        });
      }

      async function load({ fresh = false, target = page } = {}) {
        clearTimeout(timer);
        const current = ++sequence;
        controller?.abort();
        controller = new AbortController();
        if (fresh) snapshot = null;
        const params = new URLSearchParams({ page: String(fresh ? 1 : target),
          page_size: $('#bcnAuditPageSize').value, q: $('#bcnAuditSearch').value.trim(),
          group: $('#bcnAuditGroup').value, outcome: $('#bcnAuditOutcome').value });
        if (snapshot !== null) params.set('snapshot', snapshot);
        setLoading(true);
        try {
          const result = await request(`/audit?${params}`, { signal: controller.signal });
          if (current !== sequence) return;
          page = result.pagination.page;
          snapshot = result.pagination.snapshot;
          view.renderRows(card, result.events);
          view.renderPagination(card, result.pagination);
          $('#bcnAuditPagination').querySelectorAll('button').forEach(button => {
            button.dataset.disabled = String(button.disabled);
          });
        } catch (error) {
          if (current !== sequence || error.name === 'AbortError') return;
          $('#bcnAuditRows').innerHTML = '<div class="bcn-audit-empty"><strong>Chưa tải được lịch sử</strong>'
            + '<p>Bấm Cập nhật lịch sử để thử lại.</p></div>';
          $('#bcnAuditPagination').replaceChildren();
          $('#bcnAuditCount').textContent = 'Tải lịch sử không thành công';
          notify(error.message);
        } finally {
          if (current === sequence) setLoading(false);
        }
      }

      function filterChanged() {
        clearTimeout(timer);
        sequence += 1;
        controller?.abort();
        setLoading(true);
        timer = setTimeout(() => load({ fresh: true }), 250);
      }
      const loadBtn = $('#bcnAuditLoad');
      if (loadBtn) loadBtn.onclick = () => load({ fresh: true });
      $('#bcnAuditSearch').oninput = filterChanged;
      for (const id of ['bcnAuditGroup', 'bcnAuditOutcome', 'bcnAuditPageSize']) {
        $(`#${id}`).onchange = () => load({ fresh: true });
      }
      $('#bcnAuditFilters').onsubmit = event => {
        event.preventDefault();
        load({ fresh: true });
      };
      $('#bcnAuditFilters').onreset = event => {
        event.preventDefault();
        $('#bcnAuditSearch').value = '';
        $('#bcnAuditGroup').value = '';
        $('#bcnAuditOutcome').value = '';
        load({ fresh: true });
      };
      $('#bcnAuditPagination').onclick = async event => {
        const button = event.target.closest('[data-audit-page]');
        if (!button || button.disabled) return;
        await load({ target: Number(button.dataset.auditPage) });
        if (root.dataset.bcnActiveView === 'history') card.scrollIntoView({ block: 'start' });
      };
      return { load, reset() {
        clearTimeout(timer);
        sequence += 1;
        controller?.abort();
        snapshot = null;
        page = 1;
        $('#bcnAuditSearch').value = '';
        $('#bcnAuditGroup').value = '';
        $('#bcnAuditOutcome').value = '';
        $('#bcnAuditPageSize').value = '10';
        $('#bcnAuditPagination').replaceChildren();
        $('#bcnAuditRows').replaceChildren();
        $('#bcnAuditCount').textContent = 'Chưa tải lịch sử';
        setLoading(false);
      } };
    }
  };
})();
