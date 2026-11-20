import { positionBounds } from './state.js';

// Give real application controls priority over the floating companion's hit area.
const controls = 'button, input, select, textarea, a[href], [role="button"], [contenteditable="true"]';

export function createAvoidance(view, state) {
  let pending = 0;
  const main = document.querySelector('#appShell .main');

  function avoidControls() {
    pending = 0;
    if (!state.active || state.dragging || !view.menu.hidden) return;
    const bounds = positionBounds(view.root);
    const pet = view.root.getBoundingClientRect();
    const obstacles = Array.from(document.querySelectorAll(controls)).filter(element => {
      return !view.root.contains(element) && element.getClientRects().length
        && getComputedStyle(element).visibility !== 'hidden';
    }).map(element => element.getBoundingClientRect()).filter(rect => {
      return rect.width > 0 && rect.height > 0 && rect.bottom > bounds.top && rect.top < innerHeight
        && rect.right > 0 && rect.left < innerWidth;
    });
    const clear = point => obstacles.every(rect => {
      return point.left + pet.width + 5 <= rect.left || point.left - 5 >= rect.right
        || point.top + pet.height + 5 <= rect.top || point.top - 5 >= rect.bottom;
    });
    const current = { left: pet.left, top: pet.top };
    if (clear(current)) {
      view.root.style.visibility = '';
      return;
    }
    const candidates = [];
    // Search from the present position outwards; never rewrite the user's saved position.
    const step = 24;
    for (let top = bounds.top; top <= bounds.bottom; top += step) {
      for (let left = bounds.left; left <= bounds.right; left += step) {
        candidates.push({ left, top });
      }
      candidates.push({ left: bounds.right, top });
    }
    for (let left = bounds.left; left <= bounds.right; left += step) {
      candidates.push({ left, top: bounds.bottom });
    }
    candidates.push({ left: bounds.right, top: bounds.bottom });
    const distance = point => (point.left - pet.left) ** 2 + (point.top - pet.top) ** 2;
    candidates.sort((first, second) => distance(first) - distance(second));
    const safe = candidates.find(clear);
    view.root.style.visibility = safe ? '' : 'hidden';
    if (safe) {
      view.root.style.left = `${Math.round(safe.left)}px`;
      view.root.style.top = `${Math.round(safe.top)}px`;
    }
  }

  function schedule() {
    if (pending) return;
    pending = requestAnimationFrame(avoidControls);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  const resizeObserver = new ResizeObserver(schedule);
  resizeObserver.observe(main);
  document.addEventListener('scroll', schedule, { passive: true, capture: true });
  return schedule;
}
