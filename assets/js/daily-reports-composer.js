(() => {
  'use strict';
  const model = import('./daily-reports-document-model.mjs?v=20261029-clean-report');
  const formatting = import('./daily-reports-formatting.mjs?v=20261029-alignment');
  window.DailyReportsComposer = {
    mount({ root, getSources, getDraft, getLeaders, retainEdits, render, notify, onTypeChange }) {
      const $ = selector => root.querySelector(selector);
      const ui = window.DailyReportsUI;
      let onlySelected = false;
      let visibleSources = [];
      const metricValues = [...$('#bcnComposerMetrics').querySelectorAll('strong')];
      const reviewShare = $('#bcnReviewShare');
      const percent = new Intl.NumberFormat('vi-VN', { style: 'percent', maximumFractionDigits: 1 });
      let previewTimer;
      let generation = 0;
      let formatControls;
      const formatReady = formatting.then(({ mountReportFormatting }) => {
        formatControls = mountReportFormatting(root, refresh);
        return formatControls;
      });
      const viewport = $('#bcnPaperViewport');
      const topbar = root.closest('.main')?.querySelector(':scope > .topbar');
      function fitPreview() {
        const paper = $('#bcnPaperStack .bcn-paper');
        if (!paper || !viewport.clientWidth) return;
        const style = getComputedStyle(viewport);
        const available = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const paperWidth = parseFloat(getComputedStyle(paper).width);
        const actualSize = $('#bcnPreviewZoom').getAttribute('aria-pressed') === 'true';
        const scale = actualSize ? 1 : Math.min(1, available / paperWidth);
        $('#bcnPaperStack').style.zoom = String(scale);
      }
      const layoutObserver = new ResizeObserver(() => {
        const fixedHeader = topbar && ['sticky', 'fixed'].includes(getComputedStyle(topbar).position);
        root.style.setProperty('--bcn-composer-top', `${(fixedHeader ? topbar.offsetHeight : 0) + 16}px`);
        fitPreview();
      });
      layoutObserver.observe(viewport);
      if (topbar) layoutObserver.observe(topbar);
      function matches(item) {
        const category = $('#bcnComposeCategory').value;
        const status = $('#bcnComposeStatus').value;
        return (!category || ui.caseDomainCodes(item).includes(category) || item.source_type === category)
          && (!status || (status === 'LATE' ? item.late_flag : item.current_state === status))
          && (!onlySelected || item.included);
      }
      function documentFields() {
        const values = { number: $('#bcnReportNumber').value, alignment: formatControls?.read() || {} };
        root.querySelectorAll('[data-document]').forEach(field => { values[field.dataset.document] = field.value; });
        return values;
      }
      async function restore(values = {}, type = $('#bcnReportType').value) {
        const { documentDefaults } = await model;
        await formatReady;
        const data = { ...documentDefaults(type), ...values };
        formatControls.restore(data.alignment);
        root.querySelectorAll('[data-document]').forEach(field => { field.value = data[field.dataset.document] || ''; });
        $('#bcnReportNumber').value = data.number || '';
        refresh();
      }
      function updateSigners() {
        const selected = $('#bcnSigner').value || getDraft()?.signer_id || '';
        const scope = $('#bcnReportType').value === 'BCN_PV01' ? 'PV01' : 'CATP';
        const day = $('#bcnComposeDay').value;
        const available = getLeaders().filter(item => !item.archived_at && item.signer_scope === scope
          && item.effective_from.slice(0, 10) <= day && (!item.effective_to || item.effective_to.slice(0, 10) >= day));
        $('#bcnSigner').innerHTML = '<option value="">Chọn người ký</option>' + available.map(item =>
          `<option value="${item.id}">${ui.escape(item.rank_name)} ${ui.escape(item.full_name)} · ${item.signer_scope}</option>`).join('');
        if (available.some(item => item.id === selected)) $('#bcnSigner').value = selected;
      }
      async function preview() {
        const version = ++generation;
        await formatReady;
        const reportDay = $('#bcnComposeDay').value;
        if (!reportDay || root.querySelector('[data-bcn-pane="composer"]').hidden) return;
        const items = getSources().filter(item => item.included);
        const args = { reportType: $('#bcnReportType').value, reportDay, documentFields: documentFields(),
          items, signer: getLeaders().find(item => item.id === $('#bcnSigner').value) };
        await model;
        if (version !== generation) return;
        await window.DailyReportsPreview.render(root, args);
        formatControls.update();
        fitPreview();
      }
      function updateSelection(visible = visibleSources) {
        visibleSources = visible;
        const list = getSources();
        let chosen = 0;
        let pending = 0;
        const units = new Set();
        for (const item of list) {
          if (item.current_state && item.current_state !== 'VERIFIED') pending += 1;
          if (item.included) {
            chosen += 1;
            units.add(item.unit_id);
          }
        }
        [list.length, chosen, units.size, pending].forEach((value, index) => {
          const text = String(value);
          if (metricValues[index].textContent !== text) metricValues[index].textContent = text;
        });
        reviewShare.hidden = !list.length;
        if (list.length) {
          const share = pending / list.length;
          reviewShare.querySelector('.bcn-share-label').textContent = percent.format(share);
          reviewShare.style.setProperty('--bcn-review-share', String(share));
        }
        reviewShare.closest('.bcn-compose-metric').classList.toggle('has-pending', pending > 0);
        $('#bcnSelectVisible').disabled = !visible.some(item =>
          !item.included && (!item.current_state || item.current_state === 'VERIFIED'));
        $('#bcnDeselectVisible').disabled = !visible.some(item => item.included);
        $('#bcnOnlySelected').disabled = !chosen && !onlySelected;
        $('#bcnOnlySelected').setAttribute('aria-pressed', String(onlySelected));
      }
      function refresh() {
        const bulletin = $('#bcnReportType').value === 'BANTIN_24H';
        $('#bcnDocumentFields').hidden = bulletin;
        $('#bcnBulletinNote').hidden = !bulletin;
        for (const key of ['duty', 'requests']) {
          $(`[data-document="${key}"]`).closest('label').hidden = $('#bcnReportType').value !== 'BCN_PV01';
        }
        clearTimeout(previewTimer);
        previewTimer = setTimeout(() => preview().catch(error => notify(error.message)), 150);
      }
      for (const id of ['bcnComposeCategory', 'bcnComposeStatus']) {
        $(`#${id}`).onchange = () => {
          retainEdits();
          render({ previewChanged: false });
        };
      }
      for (const [id, included] of [['bcnSelectVisible', true], ['bcnDeselectVisible', false]]) {
        $(`#${id}`).onclick = () => {
          retainEdits();
          visibleSources.forEach(item => {
            if (!item.current_state || item.current_state === 'VERIFIED') item.included = included;
          });
          render();
        };
      }
      $('#bcnOnlySelected').onclick = () => {
        retainEdits();
        onlySelected = !onlySelected;
        render({ previewChanged: false });
      };
      $('#bcnComposeClear').onclick = () => {
        $('#bcnComposeCategory').value = '';
        $('#bcnComposeStatus').value = '';
        $('#bcnComposeSearch').value = '';
        onlySelected = false;
        $('#bcnComposeSearch').dispatchEvent(new Event('input'));
      };
      $('#bcnComposerRows').addEventListener('input', event => {
        const row = event.target.closest('[data-compose-row]');
        if (!row) return;
        retainEdits(row);
        if (event.target.matches('[data-include]')) {
          if (onlySelected && !event.target.checked) {
            render();
            return;
          }
          row.classList.toggle('is-chosen', event.target.checked);
          updateSelection();
        }
        refresh();
      });
      root.querySelectorAll('[data-document],#bcnReportNumber,#bcnSigner').forEach(field => {
        field.addEventListener('input', refresh);
      });
      $('#bcnReportType').onchange = async () => {
        retainEdits();
        onTypeChange();
        updateSigners();
        await restore({}, $('#bcnReportType').value);
        render();
      };
      $('#bcnComposeDay').addEventListener('change', updateSigners);
      $('#bcnPreviewRefresh').onclick = () => {
        retainEdits();
        preview().catch(error => notify(error.message));
      };
      $('#bcnPreviewZoom').onclick = event => {
        const zoom = event.target.getAttribute('aria-pressed') !== 'true';
        event.target.setAttribute('aria-pressed', String(zoom));
        event.target.textContent = zoom ? 'Vừa khung' : 'Xem 100%';
        fitPreview();
      };
      $('#bcnManageSigners').onclick = () => {
        $('#bcnLeaderManagement').open = true;
        root.querySelector('[data-bcn-pane="leaders"]').scrollIntoView({ behavior: 'smooth', block: 'start' });
        $('#bcnLeadersLoad').click();
      };
      root.addEventListener('bcn:navigate', event => {
        if (event.detail === 'composer' && root.dataset.bcnAccess === 'granted') refresh();
      });
      return { matches, documentFields, restore, refresh, updateSigners, updateSelection,
        reset() {
          clearTimeout(previewTimer);
          generation += 1;
          onlySelected = false;
          visibleSources = [];
          $('#bcnOnlySelected').setAttribute('aria-pressed', 'false');
          $('#bcnComposeSearch').value = '';
          $('#bcnComposeCategory').value = '';
          $('#bcnComposeStatus').value = '';
          $('#bcnPaperStack').replaceChildren();
          formatControls?.restore();
        }
      };
    }
  };
})();
