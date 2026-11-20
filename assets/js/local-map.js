(function (root) {
  'use strict';

  // Keep status tied to tiles still retained by Leaflet, rather than the last
  // request to finish. A good overview tile must not hide a failed detail tile.
  function monitorTiles(layers, element, messages = {}) {
    if (!element) return () => {};
    const text = {
      loading: 'Đang tải nền bản đồ nội bộ…',
      ready: 'Bản đồ tiêu chuẩn · dữ liệu nền nội bộ',
      partial: 'Một phần ảnh nền chưa sẵn sàng · vẫn hiển thị dữ liệu đã tải',
      error: 'Ảnh nền nội bộ chưa sẵn sàng · kiểm tra dịch vụ bản đồ trên máy chủ',
      ...messages
    };
    const sources = layers.filter(Boolean).map(layer => ({ layer, tiles: new Map() }));
    const update = () => {
      const states = sources.flatMap(source => [...source.tiles.values()]);
      const failed = states.includes('error');
      const loaded = states.includes('loaded');
      const state = failed ? (loaded ? 'partial' : 'error') : (loaded ? 'ready' : 'loading');
      element.textContent = text[state];
      element.dataset.tileState = state;
    };
    const subscriptions = sources.map(source => {
      // The element identifies a tile even when wrapped map coordinates repeat.
      const key = event => event.tile || `${event.coords.z}/${event.coords.x}/${event.coords.y}`;
      const handlers = {
        tileloadstart: event => { source.tiles.set(key(event), 'loading'); update(); },
        tileload: event => { source.tiles.set(key(event), 'loaded'); update(); },
        tileerror: event => { source.tiles.set(key(event), 'error'); update(); },
        tileunload: event => { source.tiles.delete(key(event)); update(); },
        remove: () => { source.tiles.clear(); update(); }
      };
      Object.entries(handlers).forEach(([name, handler]) => source.layer.on(name, handler));
      return () => Object.entries(handlers).forEach(([name, handler]) => source.layer.off(name, handler));
    });
    update();
    return () => subscriptions.forEach(dispose => dispose());
  }

  // Layout changes such as a collapsed sidebar do not fire window.resize.
  // Wait until a hidden map has real dimensions before asking Leaflet to redraw.
  function observeSize(map, host) {
    let frame = null, previousWidth = 0, previousHeight = 0, stopped = false;
    const update = () => {
      frame = null;
      if (stopped || !host.isConnected) return;
      const width = host.clientWidth, height = host.clientHeight;
      if (!width || !height) { previousWidth = 0; previousHeight = 0; return; }
      if (width === previousWidth && height === previousHeight) return;
      previousWidth = width;
      previousHeight = height;
      // Resize the viewport each frame, but rebuild markers only after motion settles.
      map.invalidateSize({ pan: false, debounceMoveend: true });
    };
    const schedule = () => {
      if (!stopped && frame === null) frame = root.requestAnimationFrame(update);
    };
    const observer = root.ResizeObserver ? new root.ResizeObserver(schedule) : null;
    observer?.observe(host);
    root.addEventListener('resize', schedule);
    root.document?.addEventListener('fullscreenchange', schedule);
    const dispose = () => {
      stopped = true;
      observer?.disconnect();
      if (frame !== null) root.cancelAnimationFrame(frame);
      root.removeEventListener('resize', schedule);
      root.document?.removeEventListener('fullscreenchange', schedule);
      map.off('unload', dispose);
    };
    map.on('unload', dispose);
    schedule();
    return dispose;
  }

  root.LocalMap = { monitorTiles, observeSize };
})(window);
