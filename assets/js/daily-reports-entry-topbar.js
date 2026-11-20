(() => {
  'use strict';

  const views = {
    input: { title: 'Nhập báo cáo ngày', icon: 'file-plus-2' },
    registry: { title: 'Tra cứu vụ việc', icon: 'database' },
    approval: { title: 'Phê duyệt vụ việc', icon: 'badge-check' }
  };

  window.DailyReportsEntryTopbar = {
    mount(root) {
      const bar = document.querySelector('.bcn-topbar');
      const title = document.getElementById('pageTitle');
      const unit = document.getElementById('accountUnit');
      const context = title.parentElement;
      const emblem = document.createElement('span');
      emblem.className = 'entry-topbar-icon';
      emblem.setAttribute('aria-hidden', 'true');
      const meta = document.createElement('span');
      meta.className = 'entry-topbar-meta';
      const day = document.createElement('time');
      day.className = 'entry-topbar-day';
      let originalTitle = '';
      let mounted = false;

      function reset() {
        if (!mounted) return;
        mounted = false;
        delete bar.dataset.entryTopbar;
        delete root.dataset.entryTopbar;
        title.textContent = originalTitle;
        title.removeAttribute('role');
        title.removeAttribute('aria-level');
        title.removeAttribute('title');
        context.append(unit);
        emblem.remove();
        meta.remove();
      }

      return {
        reset,
        update(view, { formattedDay, reportDay, granted }) {
          const page = views[view];
          if (!page || !granted || !root.classList.contains('active')) return reset();
          if (!mounted) originalTitle = title.textContent;
          mounted = true;
          bar.dataset.entryTopbar = view;
          root.dataset.entryTopbar = view;
          title.textContent = page.title;
          title.setAttribute('role', 'heading');
          title.setAttribute('aria-level', '1');
          title.title = root.querySelector('#bcnPageDescription').textContent;
          emblem.innerHTML = `<i data-lucide="${page.icon}"></i>`;
          day.textContent = formattedDay;
          day.dateTime = reportDay || '';
          day.setAttribute('aria-label', `Ngày báo cáo: ${formattedDay}`);
          if (view === 'input') meta.replaceChildren(day, unit);
          else meta.replaceChildren(unit);
          context.prepend(emblem);
          context.append(meta);
          window.lucide?.createIcons({ root: context });
        }
      };
    }
  };
})();
