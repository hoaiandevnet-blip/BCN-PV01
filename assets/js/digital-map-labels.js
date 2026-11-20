(function (root) {
  'use strict';

  const mounted = new WeakMap();
  const events = 'zoomend moveend resize';

  function intersects(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function mount(map, boundaries) {
    if (!map || !boundaries?.features || !root.L || !root.MapLabelPosition) return null;
    if (mounted.has(map)) return mounted.get(map);
    const paneName = 'digitalWardNames';
    const pane = map.getPane(paneName) || map.createPane(paneName);
    pane.classList.add('digital-map-ward-names');
    pane.style.pointerEvents = 'none';
    const group = root.L.layerGroup().addTo(map);
    const entries = [];
    let selectedCode = null;
    let counts = null;
    let mode = 'heat';
    let frame = null;
    let disposed = false;

    for (const feature of boundaries.features) {
      const name = String(feature.properties?.name || '').trim();
      const position = root.MapLabelPosition.getLabelPoint(feature);
      if (!name || !position) continue;
      const label = document.createElement('span');
      label.className = 'digital-map-ward-name';
      label.textContent = name;
      label.style.visibility = 'hidden';
      const marker = root.L.marker(position, {
        pane: paneName,
        interactive: false,
        keyboard: false,
        icon: root.L.divIcon({
          className: 'digital-map-label-anchor',
          html: label,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        })
      });
      group.addLayer(marker);
      entries.push({ code: feature.properties.code, position, label, name });
    }

    function refresh() {
      frame = null;
      const host = map.getContainer();
      if (disposed || !host.isConnected || !host.clientWidth || !host.clientHeight) return;

      const size = map.getSize();
      const overview = map.getZoom() < 11;
      pane.classList.toggle('is-overview', overview);
      const boxes = entries.map(entry => {
        const ward = counts?.get(entry.code);
        const count = ward?.current || 0;
        const prior = ward?.previous || 0;
        const relevant = count > 0 || (mode === 'change' && prior > 0);
        const delta = count - prior;
        const value = mode === 'change' ? (delta > 0 ? '+' : '') + delta : count;
        const caption = relevant ? entry.name + ' · ' + value : entry.name;
        if (entry.label.textContent !== caption) entry.label.textContent = caption;
        const isHotspot = relevant && (mode === 'change' ? Math.abs(delta) >= 30 : count >= 50);
        const isWarning = relevant && (mode === 'change'
          ? Math.abs(delta) >= 15 && Math.abs(delta) < 30
          : count >= 20 && count < 50);
        entry.label.classList.toggle('has-reports', relevant);
        entry.label.classList.toggle('is-selected', entry.code === selectedCode);
        entry.label.classList.toggle('is-hotspot', Boolean(isHotspot));
        entry.label.classList.toggle('is-warning', Boolean(isWarning));
        const point = map.latLngToContainerPoint(entry.position);
        const width = entry.label.offsetWidth;
        const height = entry.label.offsetHeight;
        return {
          entry, count: mode === 'change' ? Math.abs(delta) : count, relevant,
          left: point.x - width / 2 - 3,
          right: point.x + width / 2 + 3,
          top: point.y - height / 2 - 3,
          bottom: point.y + height / 2 + 3
        };
      });
      boxes.sort((a, b) => Number(b.entry.code === selectedCode) - Number(a.entry.code === selectedCode)
        || b.count - a.count);
      const occupied = [];
      const visibility = boxes.map(box => {
        const fits = box.left >= 0 && box.right <= size.x && box.top >= 0 && box.bottom <= size.y;
        const relevant = !overview || !counts || box.relevant || box.entry.code === selectedCode;
        const visible = fits && relevant && !occupied.some(other => intersects(box, other));
        if (visible) occupied.push(box);
        return { label: box.entry.label, visible };
      });
      for (const { label, visible } of visibility) {
        label.style.visibility = visible ? 'visible' : 'hidden';
      }
    }

    function schedule() {
      if (!disposed && frame === null) frame = root.requestAnimationFrame(refresh);
    }

    function dispose() {
      disposed = true;
      if (frame !== null) root.cancelAnimationFrame(frame);
      map.off(events, schedule);
      map.off('unload', dispose);
      group.remove();
      mounted.delete(map);
    }

    const controller = {
      select(code, wardCounts, layerMode = 'heat') {
        mode = layerMode;
        selectedCode = code;
        counts = wardCounts;
        schedule();
      },
      dispose
    };
    mounted.set(map, controller);
    map.on(events, schedule);
    map.on('unload', dispose);
    schedule();
    return controller;
  }

  function select(map, code, counts, mode) {
    mounted.get(map)?.select(code, counts, mode);
  }

  root.DigitalMapLabels = { mount, select };
})(window);
