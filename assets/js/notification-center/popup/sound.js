(function attachNotificationSound(global) {
  'use strict';

  const MIN_INTERVAL_MS = 4000;
  const SETTINGS_KEY = 'ttttch.notification-sound.v1';
  const voices = new Set();
  const listeners = new Set();
  let context = null;
  let resuming = null;
  let lastPlayedAt = -Infinity;
  let generation = 0;
  let enabled = true;
  let volume = 0.6;
  let blocked = false;
  try {
    const saved = JSON.parse(global.localStorage?.getItem(SETTINGS_KEY) || 'null');
    if (typeof saved?.enabled === 'boolean') enabled = saved.enabled;
    if (Number.isFinite(saved?.volume)) volume = Math.max(0.1, Math.min(1, saved.volume));
  } catch (_) { /* Audio still works when browser storage is unavailable. */ }

  function status() {
    return { enabled, volume, state: !enabled ? 'muted'
      : !(global.AudioContext || global.webkitAudioContext) ? 'unsupported'
        : context?.state === 'running' ? 'ready' : blocked ? 'blocked' : 'waiting' };
  }

  function publish() {
    listeners.forEach(listener => listener(status()));
  }

  function prepare() {
    if (!enabled) return Promise.resolve(false);
    const AudioContext = global.AudioContext || global.webkitAudioContext;
    if (!AudioContext) return Promise.resolve(false);
    try {
      if (!context || context.state === 'closed') {
        context = new AudioContext();
        context.addEventListener?.('statechange', publish);
      }
      if (context.state === 'running') {
        blocked = false;
        publish();
        return Promise.resolve(true);
      }
      if (resuming) return resuming;
      let timeout;
      const deadline = new Promise(resolve => { timeout = global.setTimeout(resolve, 1800); });
      resuming = Promise.race([Promise.resolve(context.resume()), deadline]).then(() => {
        blocked = context.state !== 'running';
        publish();
        return !blocked;
      }).catch(() => {
        blocked = true;
        publish();
        return false;
      }).finally(() => {
        global.clearTimeout(timeout);
        resuming = null;
      });
      return resuming;
    } catch (_) {
      blocked = true;
      publish();
      return Promise.resolve(false);
    }
  }

  function unlock(event) {
    if (!event.isTrusted || event.repeat) return;
    void prepare();
  }

  function stopVoices() {
    for (const voice of voices) {
      try {
        voice.oscillator.stop();
      } catch (_) {
        // A voice may have ended between the reset and its ended event.
      }
      voice.oscillator.disconnect();
      voice.gain.disconnect();
    }
    voices.clear();
  }

  function tone(frequency, start, duration, volume) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const voice = { oscillator, gain };
    voices.add(voice);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration - 0.02);
    gain.gain.linearRampToValueAtTime(0, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      voices.delete(voice);
    };
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  function ring(kind = 'system') {
    if (!enabled || !context || context.state !== 'running') return false;
    const now = global.performance.now();
    if (now - lastPlayedAt < MIN_INTERVAL_MS) return false;
    try {
      const start = context.currentTime + 0.01;
      if (kind === 'chat') {
        tone(523.25, start, 0.19, 0.16 * volume);
        tone(659.25, start + 0.11, 0.24, 0.11 * volume);
      } else {
        tone(660, start, 0.36, 0.2 * volume);
        tone(880, start + 0.16, 0.44, 0.13 * volume);
      }
      lastPlayedAt = now;
      return true;
    } catch (_) {
      stopVoices();
      return false;
    }
  }

  async function play({ isCurrent = () => true, kind = 'system' } = {}) {
    if (!enabled || !context) return false;
    const token = generation;
    const requestedAt = global.performance.now();
    if (context.state !== 'running' && !await prepare()) return false;
    // Only retry this visible notice briefly; never replay old alerts after a later interaction.
    if (token !== generation || global.performance.now() - requestedAt > 2000 || !isCurrent()) return false;
    return ring(kind);
  }

  function saveSettings() {
    try {
      global.localStorage?.setItem(SETTINGS_KEY, JSON.stringify({ enabled, volume }));
    } catch (_) { /* Per-tab controls remain usable without storage. */ }
    publish();
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (!enabled) reset();
    saveSettings();
  }

  function setVolume(value) {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    volume = Math.max(0.1, Math.min(1, next));
    saveSettings();
  }

  async function testSound() {
    setEnabled(true);
    const token = generation;
    const requestedAt = global.performance.now();
    if (!await prepare() || token !== generation || global.performance.now() - requestedAt > 2000) return false;
    lastPlayedAt = -Infinity;
    return ring();
  }

  function reset() {
    generation += 1;
    stopVoices();
    lastPlayedAt = -Infinity;
  }

  document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  document.addEventListener('pointerup', unlock, { capture: true, passive: true });
  document.addEventListener('click', unlock, { capture: true, passive: true });
  document.addEventListener('keydown', unlock, { capture: true });
  global.NotificationSound = Object.freeze({ play, reset, status, test: testSound, setEnabled, setVolume,
    subscribe(listener) {
      listeners.add(listener);
      listener(status());
      return () => listeners.delete(listener);
    }
  });
})(window);
