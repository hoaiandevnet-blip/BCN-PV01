const storageKey = 'bcnpv01.pet.seedy.v1';
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function createPetState() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(storageKey)) || {};
  } catch {
    // The companion also works when browser storage is unavailable.
  }
  const validPosition = Number.isFinite(saved.position?.x) && Number.isFinite(saved.position?.y);
  return {
    hidden: saved.hidden === true,
    position: validPosition ? {
      x: clamp(saved.position.x, 0, 1),
      y: clamp(saved.position.y, 0, 1)
    } : { x: 1, y: 1 },
    dragging: false,
    active: false
  };
}

export function savePetState(state) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ hidden: state.hidden, position: state.position }));
  } catch {
    // Keep the current in-memory preference without blocking the workspace.
  }
}

export function positionBounds(element) {
  const margin = 12;
  const { width, height } = element.getBoundingClientRect();
  const right = Math.max(margin, innerWidth - width - margin);
  const bottom = Math.max(margin, innerHeight - height - margin);
  return { left: margin, top: Math.min(80, bottom), right, bottom };
}

export function placePet(element, state) {
  const bounds = positionBounds(element);
  const left = bounds.left + (bounds.right - bounds.left) * state.position.x;
  const top = bounds.top + (bounds.bottom - bounds.top) * state.position.y;
  element.style.left = `${Math.round(left)}px`;
  element.style.top = `${Math.round(top)}px`;
}

export function movePet(element, state, left, top) {
  const bounds = positionBounds(element);
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  state.position = {
    x: width ? clamp((left - bounds.left) / width, 0, 1) : 0,
    y: height ? clamp((top - bounds.top) / height, 0, 1) : 0
  };
  placePet(element, state);
}
