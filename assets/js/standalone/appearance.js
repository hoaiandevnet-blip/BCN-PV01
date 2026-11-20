import { appearanceDefaults, appearanceTokens, validAppearance } from './palettes.js';

const cacheKey = 'bcnpv01.appearance.v1';
let saved = { ...appearanceDefaults };
let previewing = false;

function apply(value) {
  const appearance = validAppearance(value) ? value : appearanceDefaults;
  for (const [key, token] of Object.entries(appearanceTokens(appearance))) {
    document.body.style.setProperty(key, token, 'important');
  }
  document.body.dataset.palette = appearance.palette;
  document.body.dataset.appearanceMode = appearance.mode;
  document.body.classList.toggle('theme-dark', appearance.mode === 'dark');
  document.body.classList.toggle('theme-light', appearance.mode === 'light');
}

export function acceptAppearance(value) {
  if (!validAppearance(value)) return;
  saved = { palette: value.palette, mode: value.mode, revision: value.revision };
  try {
    localStorage.setItem(cacheKey, JSON.stringify(saved));
  } catch {
    // The server remains authoritative when browser storage is unavailable.
  }
  if (!previewing) apply(saved);
}

export function previewAppearance(value) {
  previewing = true;
  apply(value);
}

export function cancelAppearancePreview() {
  previewing = false;
  apply(saved);
}

export async function syncAppearance() {
  if (previewing) return;
  try {
    const response = await fetch('/api/appearance', {
      credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(5000)
    });
    if (response.ok) acceptAppearance(await response.json());
  } catch {
    // Retain the last confirmed palette while the local server reconnects.
  }
}

export async function initializeAppearance() {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey));
    if (validAppearance(cached)) saved = cached;
  } catch {
    saved = { ...appearanceDefaults };
  }
  apply(saved);
  await syncAppearance();
}
