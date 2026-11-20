(function attachNotificationPopup(global) {
  'use strict';

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function levelFor(message) {
    if (/lỗi|thất bại|không thể|chưa thể/iu.test(message)) return 'danger';
    if (/vui lòng|phải|cần|chưa|hết hạn|hết giờ|đã khóa|không được|không có/iu.test(message)) return 'warning';
    if (/^đã(?:\s|$)|thành công/iu.test(message)) return 'success';
    return 'info';
  }

  function compactContent(item) {
    return {
      title: item.title || (item.unitName ? String(item.unitName) : 'Thông báo'),
      message: item.message || ''
    };
  }

  function create({ onOpen, durationMs = 6500 } = {}) {
    const seen = new Set();
    const queue = [];
    let currentEntry = null;
    let exitTimer = null;
    let animFrame = null;

    const host = element('div', 'notification-popup-host');
    host.setAttribute('role', 'region');
    host.setAttribute('aria-label', 'Thông báo hệ thống');
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);

    function placeHost() {
      const surface = (typeof document.querySelector === 'function' && document.querySelector('dialog:modal'))
        || document.fullscreenElement || document.body;
      if (host.parentElement !== surface) surface.append(host);
    }

    document.addEventListener('fullscreenchange', placeHost);
    document.addEventListener('close', () => global.setTimeout(placeHost, 0), true);

    function updatePendingLabel() {
      if (!currentEntry) return;
      let pendingEl = currentEntry.copy.children.find
        ? currentEntry.copy.children.find(n => n.className === 'notification-popup-pending')
        : currentEntry.card.querySelector('.notification-popup-pending');
      const count = queue.length;
      if (count > 0) {
        if (!pendingEl) {
          pendingEl = element('p', 'notification-popup-pending');
          currentEntry.copy.append(pendingEl);
        }
        pendingEl.textContent = `Còn ${count} thông báo đang chờ`;
        pendingEl.hidden = false;
      } else if (pendingEl) {
        pendingEl.hidden = true;
      }
    }

    function stopTimer(entry) {
      if (entry.timer === null) return;
      global.clearTimeout(entry.timer);
      entry.timer = null;
      entry.remaining = Math.max(0, entry.remaining - (Date.now() - entry.startedAt));
    }

    function startTimer(entry) {
      if (entry !== currentEntry || entry.timer !== null || entry.closing) return;
      if (entry.hoverCount > 0 || entry.focusCount > 0) return;
      entry.startedAt = Date.now();
      entry.timer = global.setTimeout(() => {
        entry.timer = null;
        dismiss(entry);
      }, entry.remaining);
    }

    function dismiss(entry, restoreFocus = true) {
      if (entry !== currentEntry || entry.closing) return;
      entry.closing = true;
      if (restoreFocus && entry.card.contains(document.activeElement)) {
        const target = entry.returnFocus?.isConnected ? entry.returnFocus
          : document.getElementById('notificationToggle');
        target?.focus?.({ preventScroll: true });
      }
      stopTimer(entry);
      const card = entry.card;
      card.inert = true;
      card.setAttribute('aria-hidden', 'true');

      const finish = () => {
        if (entry !== currentEntry) return;
        if (exitTimer !== null) {
          global.clearTimeout(exitTimer);
          exitTimer = null;
        }
        card.remove();
        currentEntry = null;
        showNext();
      };

      if (global.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        finish();
        return;
      }

      card.classList.remove('notification-popup-visible');
      card.classList.add('notification-popup-exiting');
      exitTimer = global.setTimeout(finish, 320);
    }

    function showNext() {
      if (currentEntry !== null || !queue.length) return;
      placeHost();
      const nextBatch = queue.shift();
      const mainItem = nextBatch.items[0];
      const additionalCount = nextBatch.items.length - 1;

      const entry = {
        batch: nextBatch,
        returnFocus: document.activeElement,
        remaining: Math.max(0, nextBatch.durationMs ?? durationMs),
        timer: null,
        closing: false,
        hoverCount: 0,
        focusCount: 0
      };
      currentEntry = entry;

      const card = element('section', 'notification-popup-card');
      card.inert = true;
      entry.card = card;

      card.dataset.kind = mainItem.kind || 'asset';
      card.dataset.level = mainItem.level || 'info';

      const symbol = element('span', 'notification-popup-icon', '!');
      symbol.setAttribute('aria-hidden', 'true');

      const copy = element('div', 'notification-popup-copy');
      entry.copy = copy;

      const sourceLabel = mainItem.kind === 'transient'
        ? mainItem.source
        : (mainItem.kind === 'daily-report' ? 'BÁO CÁO NGÀY' : 'CẬP NHẬT TÀI SẢN');
      copy.append(element('span', 'notification-popup-kicker', sourceLabel));

      const content = compactContent(mainItem);
      copy.append(element('strong', 'notification-popup-title', content.title));
      copy.append(element('p', 'notification-popup-message', content.message));

      if (additionalCount > 0) {
        copy.append(element('p', 'notification-popup-summary', `và ${additionalCount} cập nhật khác`));
      }

      let openBtn = null;
      if (mainItem.kind !== 'transient' || mainItem.openNotifications) {
        const actions = element('div', 'notification-popup-actions');
        openBtn = element('button', 'notification-popup-open', 'Xem thông báo');
        openBtn.type = 'button';
        openBtn.disabled = true;
        openBtn.addEventListener('click', event => {
          event?.stopPropagation?.();
          openBtn.disabled = true;
          dismiss(entry, false);
          if (typeof onOpen === 'function') onOpen();
        });
        actions.append(openBtn);
        copy.append(actions);
      }

      updatePendingLabel();

      const closeLabel = mainItem.kind === 'daily-report'
        ? 'Đóng thông báo Báo cáo ngày'
        : (mainItem.kind === 'asset' ? 'Đóng thông báo cập nhật tài sản'
          : `Đóng thông báo ${mainItem.source || 'hệ thống'}`);
      const closeBtn = element('button', 'notification-popup-close');
      const closeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      closeIcon.setAttribute('viewBox', '0 0 24 24');
      closeIcon.setAttribute('aria-hidden', 'true');
      closeIcon.setAttribute('focusable', 'false');
      const closePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      closePath.setAttribute('d', 'M6 6 18 18 M18 6 6 18');
      closePath.setAttribute('fill', 'none');
      closePath.setAttribute('stroke', 'currentColor');
      closePath.setAttribute('stroke-width', '2');
      closePath.setAttribute('stroke-linecap', 'round');
      closeIcon.append(closePath);
      closeBtn.append(closeIcon);
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', closeLabel);
      closeBtn.addEventListener('click', event => {
        event?.stopPropagation?.();
        dismiss(entry);
      });

      card.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          dismiss(entry);
        }
      });

      card.addEventListener('pointerenter', () => {
        entry.hoverCount += 1;
        stopTimer(entry);
      });
      card.addEventListener('pointerleave', () => {
        entry.hoverCount = Math.max(0, entry.hoverCount - 1);
        if (entry.hoverCount === 0 && entry.focusCount === 0) startTimer(entry);
      });
      card.addEventListener('focusin', () => {
        entry.focusCount += 1;
        stopTimer(entry);
      });
      card.addEventListener('focusout', event => {
        if (!card.contains(event.relatedTarget)) {
          entry.focusCount = 0;
          if (entry.hoverCount === 0) startTimer(entry);
        }
      });

      card.append(symbol, copy, closeBtn);
      host.append(card);

      animFrame = global.requestAnimationFrame(() => {
        animFrame = global.requestAnimationFrame(() => {
          if (currentEntry !== entry) return;
          card.classList.add('notification-popup-visible');
          card.inert = false;
          if (openBtn) openBtn.disabled = false;
          startTimer(entry);
        });
      });
    }

    function enqueue(items) {
      if (!Array.isArray(items)) return;
      const validItems = [];
      for (const raw of items) {
        if (!raw || (raw.eventType !== 'asset-status' && raw.kind !== 'daily-report')) continue;
        if (raw.id === undefined || raw.id === null || !String(raw.id)) continue;
        const key = String(raw.id);
        if (seen.has(key)) continue;
        seen.add(key);
        validItems.push({ ...raw });
      }
      if (!validItems.length) return;

      const batch = {
        kind: 'business',
        items: validItems
      };
      queue.push(batch);

      void global.NotificationSound?.play({
        isCurrent: () => (currentEntry?.batch === batch || queue.includes(batch))
      });

      if (currentEntry === null) {
        showNext();
      } else {
        updatePendingLabel();
      }
    }

    function notify(message, options = {}) {
      const text = String(message ?? '').trim();
      if (!text) return;
      const level = ['info', 'warning', 'danger', 'success'].includes(options.level)
        ? options.level : levelFor(text);
      const source = String(options.source || 'Hệ thống');

      const matches = b => b.kind === 'transient' && b.items[0].message === text
        && b.items[0].source === source && b.items[0].level === level;
      if (queue.some(matches) || (currentEntry && matches(currentEntry.batch))) return;

      const titles = { info: 'Thông báo', warning: 'Cần chú ý', danger: 'Chưa thực hiện được', success: 'Thành công' };
      const item = {
        kind: 'transient',
        source,
        title: String(options.title || titles[level]),
        message: text,
        level,
        openNotifications: options.openNotifications === true
      };
      const batch = {
        kind: 'transient',
        items: [item],
        durationMs: options.durationMs
      };
      queue.push(batch);

      void global.NotificationSound?.play({
        isCurrent: () => (currentEntry?.batch === batch || queue.includes(batch))
      });

      if (currentEntry === null) {
        showNext();
      } else {
        updatePendingLabel();
      }
    }

    function reset() {
      global.NotificationSound?.reset();
      if (exitTimer !== null) {
        global.clearTimeout(exitTimer);
        exitTimer = null;
      }
      if (animFrame !== null) {
        global.cancelAnimationFrame(animFrame);
        animFrame = null;
      }
      if (currentEntry) {
        stopTimer(currentEntry);
        currentEntry.card.remove();
        currentEntry = null;
      }
      queue.length = 0;
      seen.clear();
      host.replaceChildren();
    }

    return { enqueue, notify, reset };
  }

  let shared;
  function getShared() {
    shared ||= create({ onOpen: () => global.NotificationCenter?.open() });
    return shared;
  }

  global.NotificationPopup = Object.freeze({ create, getShared });
})(window);
