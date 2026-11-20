(() => {
  'use strict';

  let active = null;
  const mounted = new WeakSet();
  const options = menu => [...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')];

  function close(restoreFocus = false) {
    if (!active) return;
    const { button, menu, home } = active;
    active = null;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (home.isConnected) home.append(menu);
    else menu.remove();
    if (restoreFocus && button.isConnected) button.focus({ preventScroll: true });
  }

  function open(button, last = false) {
    const menu = document.getElementById(button.getAttribute('aria-controls'));
    if (!menu) return;
    if (active?.button === button) {
      close(true);
      return;
    }
    close();
    active = { button, menu, home: menu.parentElement };
    document.body.append(menu);
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    const anchor = button.getBoundingClientRect();
    active.anchor = { top: anchor.top, left: anchor.left };
    const bounds = menu.getBoundingClientRect();
    const edge = 12;
    const below = anchor.bottom + 6;
    const top = below + bounds.height <= innerHeight - edge ? below : anchor.top - bounds.height - 6;
    menu.style.left = `${Math.max(edge, Math.min(anchor.right - bounds.width, innerWidth - bounds.width - edge))}px`;
    menu.style.top = `${Math.max(edge, Math.min(top, innerHeight - bounds.height - edge))}px`;
    const buttons = options(menu);
    buttons[last ? buttons.length - 1 : 0]?.focus({ preventScroll: true });
  }

  function mount(root) {
    if (mounted.has(root)) return;
    mounted.add(root);
    root.addEventListener('click', event => {
      const button = event.target.closest('[data-case-more]');
      if (button && root.contains(button)) open(button);
    });
    root.addEventListener('keydown', event => {
      const button = event.target.closest('[data-case-more]');
      if (!button || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault();
      open(button, event.key === 'ArrowUp');
    });
  }

  document.addEventListener('pointerdown', event => {
    if (active && !active.menu.contains(event.target) && !active.button.contains(event.target)) close();
  }, true);
  document.addEventListener('click', event => {
    if (active?.menu.contains(event.target) && event.target.closest('[role="menuitem"]')) close(true);
  }, true);
  document.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      close(true);
      return;
    }
    if (!active.menu.contains(event.target)) return;
    const buttons = options(active.menu);
    const index = buttons.indexOf(document.activeElement);
    let next;
    if (event.key === 'ArrowDown') next = (index + 1) % buttons.length;
    if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = buttons.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    buttons[next]?.focus();
  }, true);
  document.addEventListener('scroll', event => {
    if (!active || active.menu.contains(event.target)) return;
    const position = active.button.getBoundingClientRect();
    // Ignore a queued scroll event when the triggering button has not moved since opening.
    if (Math.abs(position.top - active.anchor.top) > 0.5
      || Math.abs(position.left - active.anchor.left) > 0.5) close();
  }, true);
  window.addEventListener('resize', () => close());
  window.DailyReportsActionMenu = { mount, close };
})();
