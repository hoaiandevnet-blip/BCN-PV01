(() => {
  const levels = new Set(['info', 'warning', 'danger']);
  const text = value => String(value ?? '').trim();
  const prefix = 'ttttch.notifications.v1:';

  function assetReference(row) {
    if (row.source === 'stations' && row.itemId) {
      return { source: 'stations', stationId: text(row.stationId), itemId: text(row.itemId), code: text(row.code) };
    }
    if (row.source === 'assets') {
      try {
        const parts = JSON.parse(row.id);
        if (parts[0] === 'assets') {
          return { source: 'assets', category: text(parts[1]), id: text(parts[2]), code: text(parts[3]) };
        }
      } catch (_) {
        // Older snapshots can still identify an asset by its exact code and category.
      }
      return row.code ? { source: 'assets', category: text(row.type), code: text(row.code) } : null;
    }
    const match = /^(camera|equipment):([^:]+):(.+)$/.exec(text(row.id));
    if (!match || match[1] !== row.source) return null;
    return { source: match[1], catalogKey: match[2], id: match[3], code: text(row.code) };
  }

  function identity(row) {
    // Regular dashboard IDs include the current array index, which changes after sorting/deletion.
    let identifier = row.notificationId || row.id;
    if (row.source === 'assets' && typeof identifier === 'string' && identifier.startsWith('[')) {
      try {
        const parts = JSON.parse(identifier);
        if (parts[0] === 'assets' && parts.length === 5) identifier = JSON.stringify(parts.slice(0, 4));
      } catch (_) {
        // Other sources already provide stable opaque IDs.
      }
    }
    return JSON.stringify([row.source, row.type, identifier ?? row.code ?? row.name]);
  }

  function create({ storage = window.localStorage, now = Date.now } = {}) {
    let scope = '';
    let available = true;
    let records = {};
    let events = [];
    let warnings = [];
    let assetCount = 0;
    let sequence = 0;
    const key = () => prefix + encodeURIComponent(scope);

    function read() {
      records = {};
      events = [];
      if (!scope) return;
      try {
        const saved = JSON.parse(storage.getItem(key()) || 'null');
        if (saved?.version !== 1) return;
        for (const [id, record] of Object.entries(saved.records || {})) {
          if (typeof record?.fingerprint !== 'string' || !Number.isFinite(record.createdAt)) continue;
          records[id] = { fingerprint: record.fingerprint, createdAt: record.createdAt, read: record.read === true };
        }
        events = Array.isArray(saved.events) ? saved.events.filter(item =>
          typeof item?.id === 'string' && typeof item.title === 'string' && typeof item.message === 'string'
          && Number.isFinite(item.createdAt)).slice(0, 200).map(item => ({
            ...item,
            kind: 'system',
            read: item.read === true,
            level: levels.has(item.level) ? item.level : 'info',
            target: text(item.target)
          })) : [];
        available = true;
      } catch (_) {
        available = false;
      }
    }

    function save() {
      if (!scope) return;
      try {
        storage.setItem(key(), JSON.stringify({ version: 1, records, events }));
        available = true;
      } catch (_) {
        available = false;
      }
    }

    function applyRecords() {
      warnings = warnings.map(item => ({ ...item, read: records[item.id]?.read === true }));
    }

    function reconcile(data) {
      if (!scope || !data || !Array.isArray(data.rows)) return;
      const summary = window.DashboardData.summarize(data.rows);
      assetCount = summary.watch;
      const next = new Map();
      const labels = {
        broken: 'Hư hỏng', maintenance: 'Bảo trì', paused: 'Tạm dừng', unknown: 'Chưa cập nhật trạng thái'
      };
      for (const row of summary.alerts) {
        const quantity = window.DashboardData.count(row);
        const label = labels[row.state] || labels.unknown;
        const target = row.source === 'stations' ? 'stationHandovers'
          : row.source === 'equipment' ? 'tttcAssetCategories' : 'assetCategoryManager';
        const item = {
          id: 'asset:' + identity(row),
          title: `${text(row.code || row.name || row.type)} · ${label}`,
          message: [text(row.type), text(row.unit || row.area || row.location),
            quantity > 1 ? `${quantity.toLocaleString('vi-VN')} tài sản` : '', text(row.note)]
            .filter(Boolean).join(' · '),
          level: row.state === 'broken' ? 'danger' : 'warning',
          kind: 'asset',
          target,
          assetRef: assetReference(row)
        };
        next.set(item.id, item);
      }
      if (Number(data.stations?.pending) > 0) {
        next.set('stations:pending', {
          id: 'stations:pending',
          title: 'Trạm chưa cập nhật trạng thái',
          message: `${data.stations.pending.toLocaleString('vi-VN')} trạm cần kiểm tra hồ sơ bàn giao.`,
          level: 'warning', kind: 'asset', target: 'stationHandovers'
        });
      }
      const nextRecords = {};
      warnings = [...next.values()].map(item => {
        const fingerprint = JSON.stringify([item.title, item.message, item.level, item.target]);
        const previous = records[item.id];
        const record = previous?.fingerprint === fingerprint
          ? previous : { fingerprint, createdAt: now(), read: false };
        nextRecords[item.id] = record;
        return { ...item, createdAt: record.createdAt, read: record.read };
      });
      const changed = JSON.stringify(records) !== JSON.stringify(nextRecords);
      records = nextRecords;
      if (changed) save();
    }

    function publish(input) {
      if (!scope || !text(input?.title)) return;
      const title = text(input.title);
      const message = text(input.message);
      const timestamp = now();
      const existing = events.find(item => input.id ? item.id === input.id
        : item.title === title && item.message === message && timestamp - item.createdAt < 8000);
      if (existing && existing.title === title && existing.message === message) return;
      const id = text(input.id) || `event:${timestamp}:${++sequence}:${Math.random().toString(36).slice(2)}`;
      events = [{
        id, title, message, level: levels.has(input.level) ? input.level : 'info', kind: 'system',
        target: text(input.target), createdAt: timestamp, read: false
      }, ...events.filter(item => item.id !== id)].slice(0, 200);
      save();
    }

    return {
      setScope(username) {
        const next = text(username);
        if (next === scope) return;
        scope = next;
        warnings = [];
        assetCount = 0;
        available = true;
        read();
      },
      reconcile,
      publish,
      resolve(id) {
        const next = events.filter(item => item.id !== id);
        if (next.length === events.length) return;
        events = next;
        save();
      },
      markRead(id) {
        if (records[id]) records[id].read = true;
        const event = events.find(item => item.id === id);
        if (event) event.read = true;
        applyRecords();
        save();
      },
      markAllRead() {
        Object.values(records).forEach(record => { record.read = true; });
        events.forEach(item => { item.read = true; });
        applyRecords();
        save();
      },
      reload() {
        read();
        applyRecords();
      },
      snapshot() {
        const items = [...warnings, ...events].sort((left, right) =>
          Number(left.read) - Number(right.read) || right.createdAt - left.createdAt
          || left.title.localeCompare(right.title, 'vi'));
        return {
          items: items.map(item => ({ ...item })),
          unread: items.filter(item => !item.read).length,
          assetCount,
          storageAvailable: available
        };
      },
      storageKey: key
    };
  }

  window.NotificationModel = { create };
})();
