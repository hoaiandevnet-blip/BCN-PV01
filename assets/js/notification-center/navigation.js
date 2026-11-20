(() => {
  const cameras = {
    lpr: ['camera-lpr', 'camera_code'],
    ptz: ['camera-ptz', 'camera_code'],
    tbox: ['tbox', 'tbox_code'],
    glmLpr: ['ttv-glm-lpr', 'record_code'],
    glmPtz: ['ttv-glm-ptz', 'record_code']
  };
  const text = value => String(value ?? '').trim();
  const missing = 'Không tìm thấy tài sản trong thông báo. Tài sản có thể đã bị xóa hoặc đổi mã.';

  function exact(rows, reference, codeKey = 'asset_code') {
    const matches = rows.filter(row => row.is_deleted !== true
      && (reference.id ? text(row.id) === text(reference.id) : text(row[codeKey]) === text(reference.code))
      && (!reference.category || text(row.category) === text(reference.category)));
    if (matches.length !== 1) throw new Error(missing);
    return matches[0];
  }

  function create(context) {
    let generation = 0;

    async function open(target, item) {
      let request = ++generation;
      const user = context.userKey();
      if (item?.dailyReportRef) {
        if (!context.canOpen('dailyReports')) {
          context.notify('Bạn không có quyền xem Báo cáo ngày.');
          return;
        }
        context.navigate('dailyReports');
        request = ++generation;
        const current = () => request === generation && context.userKey() === user
          && context.currentPage() === 'dailyReports';
        try {
          await context.dailyReports?.openNotification(item.dailyReportRef, current);
        } catch (error) {
          if (current()) context.notify(error.message || 'Chưa mở được nội dung Báo cáo ngày.');
        }
        return;
      }
      const reference = item?.assetRef;
      if (!reference) {
        context.navigate(target);
        return;
      }
      const pages = {
        equipment: 'tttcEquipmentDetail', camera: 'tttcAssetDetail',
        assets: context.isAdmin() ? 'assetCategoryManager' : 'assets', stations: 'stationHandovers'
      };
      const page = pages[reference.source];
      if (!page || !context.canOpen(page)) {
        context.notify('Bạn không có quyền xem tài sản này.');
        return;
      }
      const current = () => request === generation && context.userKey() === user
        && context.currentPage() === page;
      try {
        if (reference.source === 'equipment') {
          if (!/^[a-z0-9][a-z0-9-]*$/.test(reference.catalogKey || '')
            || (!reference.id && !reference.code)) throw new Error(missing);
          context.equipment.select(reference.catalogKey, '', reference);
          context.navigate(page);
        } else if (reference.source === 'stations') {
          context.stations.select(reference);
          context.navigate(page);
        } else if (reference.source === 'camera') {
          if (!Object.hasOwn(cameras, reference.catalogKey) || (!reference.id && !reference.code)) {
            throw new Error(missing);
          }
          const [endpoint, codeKey] = cameras[reference.catalogKey];
          context.selectCamera(reference.catalogKey === 'glmLpr' ? 'glm' : reference.catalogKey);
          context.navigate(page);
          request = ++generation;
          const rows = await context.api(`/api/tttc/${endpoint}`);
          if (current()) context.showCamera(exact(rows, reference, codeKey));
        } else {
          if (!reference.id && !reference.code) throw new Error(missing);
          context.navigate(page);
          request = ++generation;
          const rows = await context.api('/api/assets');
          if (!current()) return;
          const row = exact(rows, reference);
          // The existing detail endpoint is keyed by asset code, so never pick an ambiguous code.
          exact(rows, { code: row.asset_code });
          await context.openAsset(row.asset_code);
        }
      } catch (error) {
        if (request === generation && context.userKey() === user) {
          context.notify(error.message || 'Chưa mở được hồ sơ tài sản. Vui lòng thử lại.');
        }
      }
    }

    return { open, cancel() { generation += 1; } };
  }

  window.NotificationNavigation = { create };
})();
