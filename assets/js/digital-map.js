(function (root) {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const formatNumber = value => Number(value || 0).toLocaleString('vi-VN');
  const state = { initialized: false, loading: null, map: null, layer: null, boundaries: null, rows: [],
    mode: 'heat', mapStyle: 'dark', borders: true, selectedCode: null, stats: null, period: null,
    request: null, dayIndex: null, timer: 0 };
  try {
    const saved = localStorage.getItem('bcn_digital_map_style');
    if (saved === 'light' || saved === 'dark') state.mapStyle = saved;
  } catch {}

  function setMapStyle(style) {
    state.mapStyle = style === 'light' ? 'light' : 'dark';
    try { localStorage.setItem('bcn_digital_map_style', state.mapStyle); } catch {}
    const host = $('#digitalMapCanvas');
    const page = $('#digitalMap');
    if (host) host.dataset.mapStyle = state.mapStyle;
    if (page) page.dataset.mapStyle = state.mapStyle;
    document.querySelectorAll('[data-digital-map-style]').forEach(button => {
      const active = button.dataset.digitalMapStyle === state.mapStyle;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    updateMap();
  }

  function colorForCount(count, maximum) {
    if (count === null || count === undefined) return 'hsl(215 15% 15%)';
    if (count === 0) return 'hsl(215 25% 18%)';
    const ratio = Math.min(1, Math.max(0, count / Math.max(1, maximum)));
    const hue = Math.round(42 - 38 * Math.pow(ratio, 0.85));
    const saturation = Math.round(75 + 15 * ratio);
    const lightness = Math.round(58 - 22 * ratio);
    return `hsl(${hue} ${saturation}% ${lightness}%)`;
  }
  function filteredRows() {
    const category = $('#digitalMapCategory')?.value || '';
    const severity = $('#digitalMapSeverity')?.value || '';
    return state.rows.filter(row => (!category || row.category === category) && (!severity || row.status === severity));
  }
  function normalizeWardSearch(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .toLocaleLowerCase('vi')
      .trim();
  }
  function searchWardFeatures(features, query, includeAll = false) {
    const needle = normalizeWardSearch(query);
    if (!needle && !includeAll) return [];
    return (features || [])
      .map(feature => {
        const name = String(feature.properties?.name || '');
        const code = String(feature.properties?.code || '');
        const haystack = normalizeWardSearch(name + ' ' + code);
        const nameValue = normalizeWardSearch(name);
        const score = !needle ? 3 : nameValue === needle ? 0 : nameValue.startsWith(needle) ? 1 : haystack.includes(needle) ? 2 : 99;
        return { feature, score };
      })
      .filter(item => item.score < 99)
      .sort((a,b) => a.score - b.score || String(a.feature.properties?.name || '').localeCompare(String(b.feature.properties?.name || ''), 'vi'))
      .map(item => item.feature);
  }
  function metricTypeForRow(row) {
    return ['case', 'subject', 'vehicle'].includes(row?.metric_type) ? row.metric_type : 'case';
  }
  function metricValueForRow(row) {
    const metricType = metricTypeForRow(row);
    const field = metricType === 'subject' ? 'subject_count' : metricType === 'vehicle' ? 'vehicle_count' : 'case_count';
    return Number(row?.[field]) || 0;
  }
  function metricLabel(metricType, titleCase = false) {
    const labels = { case:'vụ việc', subject:'người/đối tượng', vehicle:'phương tiện' };
    const value = labels[metricType] || labels.case;
    return titleCase ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  }
  function metricSummaryTitle(metricType) {
    const titles = { case:'TỔNG VỤ VIỆC', subject:'TỔNG NGƯỜI / ĐỐI TƯỢNG', vehicle:'TỔNG PHƯƠNG TIỆN' };
    return titles[metricType] || titles.case;
  }
  function aggregate(rows) {
    const wards = new Map(), categories = new Map(), severities = new Map();
    const subjects = new Map(), vehicles = new Map();
    const metricTypes = new Set(rows.map(metricTypeForRow));
    const displayMetricType = metricTypes.size === 1 ? [...metricTypes][0] : 'case';
    let total = 0, displayTotal = 0, subjectTotal = 0, vehicleTotal = 0;
    rows.forEach(row => {
      const metricType = metricTypeForRow(row);
      const value = metricValueForRow(row);
      const displayValue = metricType === displayMetricType ? value : 0;
      const ward = wards.get(row.ward_code) || { code:row.ward_code, name:row.ward_name, count:0, rows:[] };
      ward.count += displayValue;
      ward.rows.push(row);
      wards.set(row.ward_code, ward);
      if (metricType === 'case') total += value;
      if (metricType === displayMetricType) {
        displayTotal += value;
        categories.set(row.category, (categories.get(row.category) || 0) + value);
        severities.set(row.severity, (severities.get(row.severity) || 0) + value);
      }
      if (metricType === 'subject') {
        subjectTotal += value;
        subjects.set(row.ward_name, (subjects.get(row.ward_name) || 0) + value);
      }
      if (metricType === 'vehicle') {
        vehicleTotal += value;
        vehicles.set(row.ward_name, (vehicles.get(row.ward_name) || 0) + value);
      }
    });
    const maximum = Math.max(0, ...[...wards.values()].map(ward => ward.count));
    return { wards, categories, severities, subjects, vehicles, total, displayTotal, displayMetricType, maximum, subjectTotal, vehicleTotal };
  }
  function wardStyle(feature) {
    const code = feature.properties.code;
    const ward = state.stats?.wards.get(code);
    const selected = state.selectedCode === code;
    const current = ward?.current || 0;
    const previous = ward?.previous || 0;
    const delta = current - previous;
    const maxVal = Math.max(1, state.stats?.maximum || 1);
    const ratio = Math.min(1, Math.max(0, current / maxVal));
    let fill = colorForCount(current || null, state.stats?.maximum || 0);
    if (state.mode === 'change') {
      fill = delta > 0 ? '#dc634d' : delta < 0 ? '#248e99' : current ? '#e0c997' : '#5d6570';
    }
    const hasCurrent = current > 0;
    const isChangeActive = previous > 0 && state.mode === 'change';
    const isLight = state.mapStyle === 'light';
    const computedOpacity = hasCurrent
      ? (isLight ? 0.45 + 0.25 * ratio : 0.42 + 0.28 * ratio)
      : isChangeActive ? 0.5 : (isLight ? 0.04 : 0.08);
    const borderColor = selected
      ? '#38bdf8'
      : (isLight ? 'rgba(15, 23, 42, 0.55)' : 'rgba(255, 255, 255, 0.32)');
    return {
      color: borderColor,
      weight: selected ? 2.5 : (isLight ? 1.2 : 1),
      opacity: selected ? 1 : state.borders ? (isLight ? 0.8 : 0.7) : 0,
      fillColor: fill,
      fillOpacity: selected ? 0.8 : computedOpacity
    };
  }
  function wardTooltip(feature) {
    const ward = state.stats?.wards.get(feature.properties.code);
    const current = ward?.current || 0;
    const previous = ward?.previous || 0;
    return `<strong>${escapeHtml(feature.properties.name)}</strong><br>${formatNumber(current)} vụ kỳ này
      · ${formatNumber(previous)} vụ kỳ trước<br>${root.DigitalMapStats.change(current, previous)}`;
  }
  function focusWard(code) {
    if (!code || !state.boundaries) return;
    state.selectedCode = code;
    renderSelected();
    updateMap();
    const layer = Object.values(state.layer?._layers || {}).find(item => item.feature?.properties.code === code);
    if (layer && state.map) {
      const compact = matchMedia('(max-width: 620px)').matches;
      const inspector = $('#digitalMapSelected');
      state.map.fitBounds(layer.getBounds(), {
        maxZoom: 12, paddingTopLeft: [16, 56],
        paddingBottomRight: compact ? [16, inspector.offsetHeight + 12] : [inspector.offsetWidth + 20, 24],
        animate: !matchMedia('(prefers-reduced-motion: reduce)').matches
      });
    }
  }
  function hideWardSearch() {
    const results = $('#digitalMapWardResults');
    const input = $('#digitalMapWardSearch');
    if (results) results.hidden = true;
    if (input) input.setAttribute('aria-expanded', 'false');
  }
  function renderWardSearch() {
    const input = $('#digitalMapWardSearch');
    const results = $('#digitalMapWardResults');
    const clear = $('#digitalMapWardSearchClear');
    const status = $('#digitalMapWardSearchStatus');
    if (!input || !results) return [];
    const query = input.value;
    if (clear) clear.hidden = !query.trim();
    const showAll = !query.trim() && document.activeElement === input;
    const matches = searchWardFeatures(state.boundaries?.features, query, showAll);
    results.innerHTML = '';
    if (!query.trim() && !showAll) {
      hideWardSearch();
      if (status) status.textContent = '';
      return matches;
    }
    input.setAttribute('aria-expanded', 'true');
    results.hidden = false;
    if (!matches.length) {
      results.innerHTML = '<div class="digital-map-map-search-empty">Không tìm thấy phường/xã phù hợp.</div>';
      if (status) status.textContent = 'Không tìm thấy kết quả';
      return matches;
    }
    const visibleMatches = query.trim() ? matches.slice(0, 8) : matches;
    results.innerHTML = visibleMatches.map(feature => {
      const code = escapeHtml(feature.properties?.code || '');
      const name = escapeHtml(feature.properties?.name || '');
      return `<button type="button" role="option" data-digital-search-code="${code}"><i data-lucide="map-pin"></i><span>${name}</span></button>`;
    }).join('');
    results.querySelectorAll('[data-digital-search-code]').forEach(button => {
      button.onclick = () => {
        focusWard(button.dataset.digitalSearchCode);
        input.value = button.querySelector('span')?.textContent || '';
        if (clear) clear.hidden = false;
        hideWardSearch();
        if (status) status.textContent = 'Đã chọn ' + input.value;
      };
    });
    root.lucide?.createIcons?.();
    if (status) status.textContent = query.trim() ? `Tìm thấy ${matches.length} phường/xã` : `Danh sách ${matches.length} phường/xã`;
    return matches;
  }
  function createMap() {
    if (state.map || !state.boundaries) return;
    const host = $('#digitalMapCanvas');
    if (!host || !root.L) { if (host) host.textContent = 'Không tải được thư viện bản đồ.'; return; }
    state.map = L.map(host, {
      zoomControl:true, attributionControl:false, minZoom:8, maxZoom:17, zoomSnap:.25, scrollWheelZoom:true
    });
    setMapStyle(state.mapStyle);
    const localTiles = L.tileLayer('/map-tiles/{z}/{x}/{y}.png', {
      minZoom: 8, maxZoom: 17, maxNativeZoom: 17,
      attribution: '© OpenStreetMap contributors · dữ liệu lưu nội bộ'
    });
    root.LocalMap.observeSize(state.map, host);
    localTiles.addTo(state.map);
    state.layer = L.geoJSON(state.boundaries, {
      style:wardStyle,
      onEachFeature(feature, layer) {
        layer.bindTooltip(wardTooltip(feature), { sticky:true, direction:'top' });
        layer.on('mouseover', () => {
          if (state.borders && state.selectedCode !== feature.properties.code) layer.setStyle({ opacity: .8 });
        });
        layer.on('mouseout', () => layer.setStyle(wardStyle(feature)));
        layer.on('click', () => {
          state.selectedCode = feature.properties.code;
          renderSelected();
          updateMap();
          layer.closeTooltip();
        });
      }
    }).addTo(state.map);
    const bounds = state.layer.getBounds();
    if (bounds.isValid()) {
      state.map.setMaxBounds(bounds.pad(.35));
      state.map.fitBounds(bounds.pad(.04), { maxZoom:10 });
    }
    root.DigitalMapLabels?.mount(state.map, state.boundaries);
  }
  function updateMap() {
    if (!state.layer) return;
    state.layer.eachLayer(layer => {
      layer.setStyle(wardStyle(layer.feature));
      layer.setTooltipContent(wardTooltip(layer.feature));
      const code = layer.feature.properties.code;
      const ward = state.stats?.wards.get(code);
      const current = ward?.current || 0;
      const prior = ward?.previous || 0;
      const delta = current - prior;
      const peak = current > 0 && current === state.stats.maximum;
      const isHotspot = state.mode === 'change' ? Math.abs(delta) >= 30 : current >= 50;
      const path = layer.getElement();
      path?.classList.toggle('map-ward-flow', code === state.selectedCode || (state.mode === 'heat' && peak));
      path?.classList.toggle('is-hotspot-polygon', Boolean(isHotspot));
    });
    for (const button of document.querySelectorAll('[data-digital-ward]')) {
      button.setAttribute('aria-pressed', String(button.dataset.digitalWard === state.selectedCode));
    }
    root.DigitalMapLabels?.select(state.map, state.selectedCode, state.stats?.wards, state.mode);
  }
  function renderLegend() {
    const rootElement = $('#digitalMapLegend');
    if (!rootElement) return;
    if (state.mode === 'change') {
      rootElement.innerHTML = '<b>So với kỳ trước</b><div class="map-change-key">'
        + '<span>Tăng</span><span>Giảm</span><span>Không đổi</span></div><small>Xám · chưa ghi nhận ở cả hai kỳ</small>';
      return;
    }
    const maximum = state.stats?.maximum || 0;
    rootElement.innerHTML = maximum
      ? `<b>Số vụ theo địa bàn</b><div class="digital-map-scale"></div>
        <div class="digital-map-scale-labels"><span>0</span><span>${formatNumber(maximum)} vụ</span></div>
        <small><i></i>Chưa ghi nhận vụ trong kỳ</small>`
      : '<b>Chưa có vụ lên bản đồ</b><small>Chọn kỳ hoặc hệ nghiệp vụ khác để đối chiếu.</small>';
  }
  function renderSelected() {
    const feature = state.boundaries?.features.find(item => item.properties.code === state.selectedCode);
    const visible = Boolean(feature && state.stats);
    $('#digitalMapSelected').hidden = !visible;
    $('#mapWardContent').innerHTML = visible ? root.DigitalMapStats.detail(feature, state.stats.wards.get(state.selectedCode)) : '';
  }
  function renderAll() {
    if (!state.period) return;
    const rows = filteredRows();
    state.stats = root.DigitalMapStats.collect(state.dayIndex === null
      ? rows : rows.filter(row => row.dayIndex === state.dayIndex));
    if (state.dayIndex !== null) {
      // Use one scale for the entire playback so equal daily counts always have the same colour.
      const days = new Map();
      for (const row of rows) {
        if (row.area !== 'mapped') continue;
        const key = row.ward_code + '/' + row.dayIndex;
        const count = (days.get(key) || 0) + row.current;
        days.set(key, count);
        state.stats.maximum = Math.max(state.stats.maximum, count);
      }
    }
    const day = start => {
      const date = new Date(start + 'T00:00:00Z');
      date.setUTCDate(date.getUTCDate() + state.dayIndex);
      return date.toISOString().slice(0, 10);
    };
    const period = state.dayIndex === null ? state.period : {
      from: day(state.period.from), to: day(state.period.from),
      previousFrom: day(state.period.previousFrom), previousTo: day(state.period.previousFrom)
    };
    $('#mapTimelineLabel').textContent = state.dayIndex === null ? 'Cả kỳ' : period.to.split('-').reverse().join('/');
    const daily = state.dayIndex !== null;
    $('#mapDailyControls').hidden = !daily;
    $('#mapTimelineAll').setAttribute('aria-pressed', String(!daily));
    $('#mapTimelineDaily').setAttribute('aria-pressed', String(daily));
    $('#mapTimelineDay').setAttribute('aria-valuetext', $('#mapTimelineLabel').textContent);
    $('#mapTimelineDay').value = state.dayIndex ?? 0;
    root.DigitalMapStats.paint({ ...state, period, wardCount: state.boundaries.features.length });
    renderLegend();
    renderSelected();
    updateMap();
  }
  function fillFilterOptions() {
    for (const [id, key, label] of [
      ['#digitalMapCategory', 'category', 'Tất cả hệ'], ['#digitalMapSeverity', 'status', 'Tất cả trạng thái']
    ]) {
      const select = $(id);
      const selected = select.value;
      const names = [...new Set(state.rows.map(row => row[key]))].sort((a, b) => a.localeCompare(b, 'vi'));
      select.innerHTML = `<option value="">${label}</option>` + names.map(name =>
        `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
      select.value = names.includes(selected) ? selected : '';
    }
  }
  async function refreshRows() {
    stopTimeline();
    state.dayIndex = null;
    $('#mapTimelinePlay').disabled = true;
    $('#mapTimelineDay').disabled = true;
    $('#mapTimelineDaily').disabled = true;
    $('#mapTimelineDaily').setAttribute('aria-pressed', 'false');
    $('#mapTimelineAll').setAttribute('aria-pressed', 'true');
    $('#mapDailyControls').hidden = true;
    $('#mapTimelineLabel').textContent = 'Cả kỳ';
    state.request?.abort();
    const request = new AbortController();
    state.request = request;
    const params = new URLSearchParams();
    const from = $('#digitalMapFrom');
    const to = $('#digitalMapTo');
    if (from.value) params.set('from', from.value);
    if (to.value) params.set('to', to.value);
    $('#digitalMapUpdated').textContent = 'Đang tải số liệu báo cáo…';
    try {
      const response = await fetch('/api/digital-map/reports?' + params, { signal: request.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Không tải được số liệu báo cáo.');
      if (request.signal.aborted) return;
      state.rows = result.rows;
      state.period = result.period;
      $('#mapTimelineDaily').disabled = false;
      $('#mapTimelineDay').max = result.period.days - 1;
      $('#mapTimelineDay').disabled = result.period.days < 2;
      $('#mapTimelinePlay').disabled = result.period.days < 2;
      from.value = result.period.from;
      to.value = result.period.to;
      fillFilterOptions();
      renderAll();
    } catch (error) {
      if (request.signal.aborted) return;
      state.rows = [];
      state.period = null;
      state.stats = null;
      for (const id of ['Summary', 'Charts', 'Ranking', 'Legend']) {
        $('#digitalMap' + id).replaceChildren();
      }
      renderSelected();
      updateMap();
      $('#digitalMapUpdated').textContent = error.message;
    }
  }
  function parsePeriodDate(value) {
    const text = String(value ?? '').trim();
    const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return match ? `${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}` : '';
  }
  function parsePeriodTitle(value) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    const range = text.match(/từ ngày\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+đến ngày\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
    const from = parsePeriodDate(range?.[1]);
    const to = parsePeriodDate(range?.[2]);
    if (!from || !to) return null;
    return { key:`period-${to.replaceAll('-', '')}`, label:text.split('(')[0].trim(), from, to };
  }
  function sourceMetricType(label) {
    if (/phương tiện|xe cơ giới/i.test(label)) return 'vehicle';
    if (/đối tượng|cá nhân|tổ chức|người chết|người bị thương/i.test(label)) return 'subject';
    return 'case';
  }
  function sourceNumber(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const number = typeof value === 'number' ? value : Number(String(value).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  }
  function parseSourceMatrix(workbook) {
    const sheet = workbook.Sheets['tổng'] || workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return null;
    const matrix = root.XLSX.utils.sheet_to_json(sheet, { header:1, blankrows:false, raw:true, defval:'' });
    const headerIndex = matrix.findIndex(row => String(row[0] || '').trim() === 'STT'
      && String(row[1] || '').toLowerCase().includes('chỉ tiêu')
      && row.slice(2).filter(value => String(value).trim()).length >= 80);
    if (headerIndex < 0) return null;
    const wardNames = matrix[headerIndex].slice(2).map(value => String(value || '').trim()).filter(Boolean);
    const period = parsePeriodTitle(matrix[0]?.[0]);
    if (!period || wardNames.length !== 95) throw new Error('Không nhận diện được kỳ dữ liệu hoặc đủ 95 phường/xã trong file');
    const rows = [];
    let category = '';
    matrix.slice(headerIndex + 1).forEach((sourceRow, offset) => {
      const label = String(sourceRow[1] || '').trim();
      if (!label) return;
      const hasNumber = wardNames.some((_, index) => sourceNumber(sourceRow[index + 2]) !== null);
      if (/^\d+\.\s/.test(label) && !hasNumber) {
        category = label;
        return;
      }
      if (!category || !hasNumber) return;
      const metricType = sourceMetricType(label);
      wardNames.forEach((wardName, index) => {
        const value = sourceNumber(sourceRow[index + 2]);
        if (value === null) return;
        rows.push({
          excelRow: headerIndex + offset + 2,
          wardName, reportDate:period.to, category, severity:label, metricType,
          caseCount: metricType === 'case' ? value : 0,
          subjectCount: metricType === 'subject' ? value : '',
          vehicleCount: metricType === 'vehicle' ? value : '', note:''
        });
      });
    });
    if (!rows.length) throw new Error('File không có dòng chỉ tiêu chứa số liệu');
    return { rows, period };
  }
  function stopTimeline() {
    clearInterval(state.timer);
    state.timer = 0;
    $('#mapTimelinePlay').textContent = 'Phát';
    $('#mapTimelinePlay').setAttribute('aria-pressed', 'false');
  }
  function bind() {
    if (state.initialized) return;
    state.initialized = true;
    const mobile = matchMedia('(max-width: 820px)');
    const sizeFilters = () => { $('.map-filter-box').open = !mobile.matches; };
    sizeFilters();
    mobile.addEventListener('change', sizeFilters);
    $('#mapBoundaries').onchange = event => {
      state.borders = event.target.checked;
      updateMap();
    };
    const listButtons = document.querySelectorAll('[data-map-list]');
    for (const button of listButtons) {
      button.onclick = () => {
        for (const option of listButtons) {
          option.setAttribute('aria-pressed', String(option === button));
          document.getElementById(option.dataset.mapList).hidden = option !== button;
        }
      };
    }
    const closeWard = () => {
      const row = $('#digitalMapRanking [aria-pressed=true]');
      state.selectedCode = null;
      renderSelected();
      updateMap();
      const search = $('#digitalMapWardSearch');
      search.value = '';
      $('#digitalMapWardSearchClear').hidden = true;
      if (row && row.getClientRects().length && !mobile.matches) row.focus({ preventScroll: true });
      else search.focus({ preventScroll: true });
      hideWardSearch();
      $('#digitalMapWardSearchStatus').textContent = '';
    };
    $('#mapCloseWard').onclick = closeWard;
    $('#digitalMap').addEventListener('keydown', event => {
      if (event.key !== 'Escape' || $('#digitalMapSelected').hidden) return;
      event.preventDefault();
      closeWard();
    });
    $('#mapTimelineDaily').onclick = () => {
      if (state.dayIndex === null) state.dayIndex = 0;
      renderAll();
    };
    $('#mapTimelinePlay').onclick = () => {
      if (state.timer) return stopTimeline();
      const last = state.period.days - 1;
      if (state.dayIndex === null || state.dayIndex === last) state.dayIndex = 0;
      renderAll();
      $('#mapTimelinePlay').textContent = 'Tạm dừng';
      $('#mapTimelinePlay').setAttribute('aria-pressed', 'true');
      state.timer = setInterval(() => {
        if (document.hidden || !$('#digitalMap').classList.contains('active')) return stopTimeline();
        state.dayIndex++;
        renderAll();
        if (state.dayIndex >= last) stopTimeline();
      }, 1200);
    };
    $('#mapTimelineDay').oninput = event => {
      stopTimeline();
      state.dayIndex = Number(event.target.value);
      renderAll();
    };
    $('#mapTimelineAll').onclick = () => {
      stopTimeline();
      state.dayIndex = null;
      renderAll();
    };
    $('#digitalMapRefresh').onclick = refreshRows;
    for (const id of ['#digitalMapFrom', '#digitalMapTo']) $(id).onchange = refreshRows;
    for (const id of ['#digitalMapCategory', '#digitalMapSeverity']) $(id).onchange = renderAll;
    $('#digitalMapRanking').onclick = event => {
      const button = event.target.closest('[data-digital-ward]');
      if (button) {
        focusWard(button.dataset.digitalWard);
        if (mobile.matches) $('#digitalMapCanvas').scrollIntoView({ block: 'center' });
        $('#mapCloseWard').focus({ preventScroll: true });
      }
    };
    $('#digitalMapClearFilters').onclick = () => {
      for (const id of ['From', 'To', 'Category', 'Severity']) $('#digitalMap' + id).value = '';
      refreshRows();
    };
    const wardSearch = $('#digitalMapWardSearch');
    const wardSearchClear = $('#digitalMapWardSearchClear');
    wardSearch?.addEventListener('input', renderWardSearch);
    wardSearch?.addEventListener('focus', renderWardSearch);
    wardSearch?.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        wardSearch.value = '';
        renderWardSearch();
        wardSearch.blur();
        return;
      }
      if (event.key !== 'Enter') return;
      const match = searchWardFeatures(state.boundaries?.features, wardSearch.value)[0];
      if (!match) return;
      event.preventDefault();
      focusWard(match.properties.code);
      wardSearch.value = match.properties.name;
      if (wardSearchClear) wardSearchClear.hidden = false;
      hideWardSearch();
      $('#digitalMapWardSearchStatus').textContent = 'Đã chọn ' + match.properties.name;
    });
    wardSearchClear?.addEventListener('click', () => {
      wardSearch.value = '';
      renderWardSearch();
      wardSearch.focus();
    });
    $('#digitalMapMapSearch')?.addEventListener('click', event => event.stopPropagation());
    document.addEventListener('click', event => {
      if (!$('#digitalMapMapSearch')?.contains(event.target)) hideWardSearch();
    });
    document.querySelectorAll('[data-digital-map-mode]').forEach(button => button.onclick = () => {
      state.mode = button.dataset.digitalMapMode;
      document.querySelectorAll('[data-digital-map-mode]').forEach(item => {
        item.classList.toggle('active', item === button);
        item.setAttribute('aria-pressed', String(item === button));
      });
      renderAll();
    });
    document.querySelectorAll('[data-digital-map-style]').forEach(button => {
      button.onclick = () => setMapStyle(button.dataset.digitalMapStyle);
    });
    setMapStyle(state.mapStyle);
  }
  async function render() {
    bind();
    const firstLoad = !state.loading;
    if (firstLoad) state.loading = (async () => {
      const response = await fetch('/api/digital-map/boundaries');
      if (!response.ok) throw new Error('Không tải được ranh giới phường/xã');
      state.boundaries = await response.json();
      if (state.boundaries.features?.length !== 95) throw new Error('Dữ liệu ranh giới chưa đủ 95 phường/xã');
      createMap();
      await refreshRows();
    })().catch(error => {
      $('#digitalMapUpdated').textContent = error.message;
      state.loading = null;
    });
    await state.loading;
    if (!firstLoad && state.boundaries) {
      try { await refreshRows(); }
      catch (error) { $('#digitalMapUpdated').textContent = error.message; }
    }
    setTimeout(() => state.map?.invalidateSize(), 60);
  }
  root.DigitalMap = { render, colorForCount, parseSourceMatrix, metricValueForRow, aggregate, normalizeWardSearch, searchWardFeatures };
})(window);
