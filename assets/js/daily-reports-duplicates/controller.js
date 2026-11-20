(() => {
  'use strict';
  window.DailyReportsDuplicates = {
    mount({ root, request, getScope, unitName, detail }) {
      const model = window.DailyReportsDuplicatesModel;
      const view = window.DailyReportsDuplicatesView;
      const host = root.querySelector('#bcnDuplicatesWorkspace');
      const $ = selector => host.querySelector(selector);
      let state = model.createState();
      let generation = 0;
      let selectionGeneration = 0;
      let scanController;
      let detailController;
      const selected = () => state.rows.find(row => row.key === state.selected);
      function renderComparison() {
        window.DailyReportsDuplicatesComparison.render($('#bcnDuplicateComparison'), selected(), {
          unitName, busy: state.busy, saving: state.saving
        });
      }
      function render() {
        view.renderList(host, state);
        view.renderStatus(host, state);
      }
      function reset() {
        generation += 1;
        selectionGeneration += 1;
        scanController?.abort();
        detailController?.abort();
        state = model.createState();
        $('#bcnDuplicateSearch').value = '';
        $('#bcnDuplicateState').value = 'pending';
        $('#bcnDuplicatePriority').value = '';
        render();
        renderComparison();
      }
      async function select(key, scroll = false) {
        if (state.saving) return;
        detailController?.abort();
        const current = ++selectionGeneration;
        state.selected = key;
        const row = selected();
        render();
        if (!row) return renderComparison();
        row.error = '';
        renderComparison();
        if (scroll && innerWidth <= 1100) $('#bcnDuplicateComparison').scrollIntoView({ block: 'start' });
        if (row.details) return;
        detailController = new AbortController();
        const signal = detailController.signal;
        try {
          const [source, candidate] = await Promise.all([
            request(`/cases/${encodeURIComponent(row.source.id)}`, { signal }),
            request(`/cases/${encodeURIComponent(row.candidate.id)}`, { signal })
          ]);
          if (current !== selectionGeneration || signal.aborted) return;
          row.details = { source: source.case, candidate: candidate.case };
          if (['DUPLICATE_NO_RECOUNT', 'APPEND_EVENT_TO_EXISTING'].includes(source.case.duplicate_state)) {
            row.covered = model.actions[source.case.duplicate_state][0];
          }
        } catch (error) {
          if (signal.aborted || current !== selectionGeneration) return;
          row.error = `Chưa tải được hồ sơ: ${error.message}`;
        }
        if (current === selectionGeneration) {
          render();
          renderComparison();
        }
      }
      async function scan(restart = false) {
        if (state.busy || state.saving || !getScope()) return;
        if (!$('#bcnDuplicateFilters').reportValidity()) return;
        if (restart) reset();
        const current = generation;
        if (!state.filters) state.filters = new URLSearchParams(new FormData($('#bcnDuplicateFilters')));
        state.started = true;
        state.busy = true;
        state.stopped = false;
        state.error = '';
        scanController = new AbortController();
        const signal = scanController.signal;
        render();
        try {
          if (!state.queue.length || (state.offset >= state.queue.length && state.nextOffset !== null)) {
            const query = new URLSearchParams(state.filters);
            query.set('offset', String(state.nextOffset || 0));
            const data = await request(`/cases?${query}`, { signal });
            if (current !== generation) return;
            state.queue.push(...data.cases);
            state.total = data.total;
            state.nextOffset = data.next_offset;
          }
          let processed = 0;
          while (state.offset < state.queue.length && processed < 20 && !signal.aborted) {
            const source = state.queue[state.offset];
            const data = await request(`/duplicates/candidates?case_id=${encodeURIComponent(source.id)}`, { signal });
            if (current !== generation || signal.aborted) return;
            for (const candidate of data.candidates) {
              const key = model.pairKey(source.id, candidate.id);
              if (state.rows.some(row => row.key === key)) continue;
              state.rows.push({ key, source, candidate });
            }
            state.offset += 1;
            state.scanned += 1;
            processed += 1;
            render();
            if (!state.selected && model.visibleRows(state).length) select(model.visibleRows(state)[0].key);
          }
        } catch (error) {
          if (current !== generation) return;
          if (!signal.aborted) state.error = error.message;
        } finally {
          if (current === generation) {
            state.busy = false;
            state.stopped = signal.aborted;
            render();
          }
        }
      }
      async function save(form) {
        const row = selected();
        if (!row?.details || row.decision || row.covered || state.busy || state.saving) return;
        const values = Object.fromEntries(new FormData(form));
        if (!model.actions[values.action] || !values.reason?.trim()) {
          row.saveError = 'Chọn phương án và nhập lý do đối chiếu.';
          renderComparison();
          return;
        }
        const current = generation;
        state.saving = true;
        row.saveError = '';
        render();
        try {
          const result = await request('/duplicates/decisions', { method: 'POST', body: JSON.stringify({
            case_id: row.source.id, candidate_case_id: row.candidate.id,
            action: values.action, reason: values.reason.trim()
          }) });
          if (current !== generation) return;
          row.decision = result;
          state.receipts.unshift(row);
          if (values.action !== 'SEPARATE_CASE') {
            for (const other of state.rows) {
              if (other !== row && other.source.id === row.source.id && !other.decision) {
                other.covered = model.actions[values.action][0];
              }
            }
          }
        } catch (error) {
          if (current === generation) row.saveError = error.message;
        } finally {
          if (current === generation) {
            state.saving = false;
            render();
            renderComparison();
          }
        }
      }
      $('#bcnDuplicateFilters').addEventListener('submit', event => {
        event.preventDefault();
        scan(true);
      });
      $('#bcnDuplicateFilters').addEventListener('change', () => {
        if (!state.busy && !state.saving) reset();
      });
      $('#bcnDuplicateNext').onclick = () => scan();
      $('#bcnDuplicateStop').onclick = () => scanController?.abort();
      for (const [selector, field, eventName] of [
        ['#bcnDuplicateSearch', 'query', 'input'], ['#bcnDuplicateState', 'status', 'change'],
        ['#bcnDuplicatePriority', 'level', 'change']
      ]) {
        $(selector).addEventListener(eventName, event => {
          state[field] = event.target.value;
          state.page = 0;
          render();
        });
      }
      host.addEventListener('click', event => {
        const pair = event.target.closest('[data-dup-pair]');
        if (pair) select(pair.dataset.dupPair, true);
        const page = event.target.closest('[data-dup-page]');
        if (page) {
          state.page = Math.max(0, state.page + Number(page.dataset.dupPage));
          render();
        }
        const open = event.target.closest('[data-dup-open]');
        if (open) detail(open.dataset.dupOpen);
        if (event.target.closest('[data-dup-retry]')) select(state.selected);
      });
      host.addEventListener('input', event => {
        if (!event.target.closest('#bcnDuplicateDecisionForm')) return;
        const row = selected();
        if (row) row[event.target.name] = event.target.value;
      });
      host.addEventListener('submit', event => {
        if (event.target.id !== 'bcnDuplicateDecisionForm') return;
        event.preventDefault();
        save(event.target);
      });
      root.addEventListener('bcn:navigate', event => {
        if (event.detail !== 'duplicates') scanController?.abort();
      });
      reset();
      return {
        reset,
        configure(units) {
          const chosen = $('#bcnDuplicateUnit').value;
          $('#bcnDuplicateUnit').replaceChildren(new Option('Tất cả đơn vị được giao', ''),
            ...units.map(unit => new Option(unit.name, String(unit.id))));
          $('#bcnDuplicateUnit').value = chosen;
          $('#bcnDuplicateDay').value ||= getScope()?.reportDay || '';
          $('#bcnDuplicateDay').max = getScope()?.reportDay || '';
        }
      };
    }
  };
})();
