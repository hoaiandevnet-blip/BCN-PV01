import { createPetState, savePetState, placePet, movePet } from './state.js';
import { createAnimator, loadArtwork } from './animation.js';
import { createPetView } from './ui.js';
import { createAvoidance } from './avoidance.js';
import { initializeAssistant } from '../seedy-assistant/controller.js';

async function initializeSeedy() {
  const shell = document.getElementById('appShell');
  const toolbar = shell?.querySelector('.userbox');
  if (!toolbar || document.getElementById('bcnPet')) return;

  const state = createPetState();
  const view = createPetView(toolbar);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const animator = createAnimator(view.sprite, reducedMotion);
  let assistantActivity = 'idle';
  const assistant = initializeAssistant({
    onActivity: activity => {
      assistantActivity = activity;
      if (state.active) animator.play(activity, activity === 'review');
    }
  });
  const avoidControls = createAvoidance(view, state);
  let ready = false;
  let drag = null;
  let suppressClick = false;
  let lastLookAt = 0;
  view.toggle.disabled = true;
  view.updateToggle(state.hidden);

  function syncVisibility() {
    view.positionToggle();
    const sidebar = document.getElementById('sidebar');
    const mobileMenu = shell.classList.contains('menu-open') && getComputedStyle(sidebar).position === 'fixed';
    state.active = ready && !shell.hidden && !state.hidden && !mobileMenu;
    view.root.hidden = !state.active;
    view.updateToggle(state.hidden);
    if (!state.active) {
      view.setMenu(false);
      drag = null;
      state.dragging = false;
      view.root.dataset.dragging = 'false';
    } else {
      placePet(view.root, state);
      view.positionMenu();
      avoidControls();
    }
    animator.setEnabled(state.active && !document.hidden);
    if (state.active && !document.hidden && assistantActivity === 'working') animator.play('working');
  }

  function setHidden(hidden) {
    state.hidden = hidden;
    savePetState(state);
    syncVisibility();
    if (hidden) view.toggle.focus({ preventScroll: true });
  }

  function resetPosition() {
    state.position = { x: 1, y: 1 };
    placePet(view.root, state);
    savePetState(state);
    view.setMenu(false);
    view.character.focus({ preventScroll: true });
    animator.play('wave', true);
    avoidControls();
  }

  view.toggle.addEventListener('click', () => setHidden(!state.hidden));
  view.menuToggle.addEventListener('click', () => view.setMenu(view.menu.hidden));
  view.menu.addEventListener('click', event => {
    const action = event.target.closest('[data-pet-action]')?.dataset.petAction;
    if (action === 'chat') {
      view.setMenu(false);
      assistant.open();
    }
    if (action === 'hide') setHidden(true);
    if (action === 'reset') resetPosition();
    if (action === 'wave') {
      view.setMenu(false);
      view.character.focus({ preventScroll: true });
      animator.play('wave', true);
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!view.root.contains(event.target)) view.setMenu(false);
  });
  view.root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !view.menu.hidden) {
      event.preventDefault();
      event.stopPropagation();
      view.setMenu(false, true);
    }
  });

  view.character.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    view.setMenu(false);
    suppressClick = false;
    const bounds = view.root.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      left: bounds.left,
      top: bounds.top,
      moved: false
    };
    view.character.setPointerCapture(event.pointerId);
  });
  view.character.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const horizontal = event.clientX - drag.startX;
    const vertical = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(horizontal, vertical) < 5) return;
    drag.moved = true;
    state.dragging = true;
    view.root.dataset.dragging = 'true';
    movePet(view.root, state, drag.left + horizontal, drag.top + vertical);
    animator.play(event.clientX < drag.lastX ? 'left' : 'right');
    drag.lastX = event.clientX;
  });

  function finishDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    suppressClick = drag.moved;
    if (drag.moved) savePetState(state);
    drag = null;
    state.dragging = false;
    view.root.dataset.dragging = 'false';
    if (view.character.hasPointerCapture(event.pointerId)) {
      view.character.releasePointerCapture(event.pointerId);
    }
    animator.play('idle');
    avoidControls();
  }
  view.character.addEventListener('pointerup', finishDrag);
  view.character.addEventListener('pointercancel', finishDrag);
  view.character.addEventListener('lostpointercapture', finishDrag);
  view.character.addEventListener('click', event => {
    if (suppressClick && event.detail !== 0) {
      suppressClick = false;
      return;
    }
    assistant.open();
    animator.play('wave', true);
  });

  view.character.addEventListener('keydown', event => {
    if (event.key === 'Home') {
      event.preventDefault();
      resetPosition();
      return;
    }
    const directions = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1]
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const distance = event.shiftKey ? 48 : 16;
    const bounds = view.root.getBoundingClientRect();
    movePet(view.root, state, bounds.left + direction[0] * distance, bounds.top + direction[1] * distance);
    savePetState(state);
    avoidControls();
  });

  document.addEventListener('pointermove', event => {
    if (!state.active || state.dragging || reducedMotion.matches || event.pointerType !== 'mouse') return;
    if (!view.menu.hidden || view.root.contains(event.target)) return;
    const now = performance.now();
    if (now - lastLookAt < 80) return;
    lastLookAt = now;
    const bounds = view.character.getBoundingClientRect();
    const distance = Math.hypot(event.clientX - bounds.x - bounds.width / 2,
      event.clientY - bounds.y - bounds.height / 2);
    if (distance > 300) return;
    animator.look({ x: event.clientX, y: event.clientY }, bounds);
  }, { passive: true });

  const observer = new MutationObserver(syncVisibility);
  observer.observe(shell, { attributes: true, attributeFilter: ['hidden', 'class'] });
  window.addEventListener('resize', syncVisibility);
  window.addEventListener('pageshow', syncVisibility);
  window.addEventListener('pagehide', () => animator.setEnabled(false));
  document.addEventListener('visibilitychange', syncVisibility);
  reducedMotion.addEventListener('change', syncVisibility);

  try {
    await loadArtwork();
    ready = true;
    view.toggle.disabled = false;
    syncVisibility();
  } catch (error) {
    view.root.hidden = true;
    view.toggle.title = 'Không tải được hình Seedy. Vui lòng tải lại trang.';
    console.warn('BCNPV01: không tải được thú cưng.', error);
  }
}

initializeSeedy().catch(error => console.warn('BCNPV01: không khởi tạo được thú cưng.', error));
