(() => {
  const returnEvents = new Set([
    'CASE_RETURNED', 'CASE_SUPPLEMENT_REQUESTED', 'SOURCE_RETURNED', 'SITUATION_RETURNED', 'WORK_RESULT_RETURNED'
  ]);
  const isReturned = item => item.kind === 'daily-report' && returnEvents.has(item.eventType);
  const number = value => new Intl.NumberFormat('vi-VN').format(value);

  function create() {
    const navigation = document.querySelector('#sidebar [data-bcn-view="returned"]');
    const badge = navigation?.querySelector('[data-returned-badge]');
    const baseTitle = document.title;
    let previousCount = -1;

    function update(items = []) {
      const count = items.filter(item => isReturned(item) && !item.read).length;
      if (count === previousCount) return;
      previousCount = count;
      const label = `${number(count)} thông báo trả lại chưa đọc`;
      if (navigation && badge) {
        navigation.classList.toggle('has-returned-unread', count > 0);
        navigation.setAttribute('aria-label', count ? `Báo cáo bị trả lại, ${label}` : 'Báo cáo bị trả lại');
        badge.hidden = count === 0;
        badge.textContent = count > 99 ? '99+' : number(count);
      }
      document.title = count ? `(${number(count)} trả lại chưa đọc) ${baseTitle}` : baseTitle;
    }

    return { update, reset: () => update([]) };
  }

  window.ReturnedReportAttention = { create, isReturned };
})();
