import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./sound.js', import.meta.url), 'utf8');

function setup({ saved = null, unsupported = false } = {}) {
  let now = 0;
  let audio;
  let resume;
  const events = new Map();
  const tones = [];
  const levels = [];
  const storage = new Map(saved ? [['ttttch.notification-sound.v1', JSON.stringify(saved)]] : []);
  class AudioContext {
    constructor() {
      audio = this;
      this.state = 'suspended';
      this.currentTime = 0;
      this.destination = {};
    }
    addEventListener() {}
    resume() {
      return new Promise((resolve, reject) => {
        resume = { ok: () => { this.state = 'running'; resolve(); }, fail: reject };
      });
    }
    createOscillator() {
      const oscillator = { frequency: { setValueAtTime() {} }, connect() {}, disconnect() {},
        start() { tones.push(oscillator); }, stop() {} };
      return oscillator;
    }
    createGain() {
      return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {},
        linearRampToValueAtTime(value) { levels.push(value); } }, connect() {}, disconnect() {} };
    }
  }
  const window = { AudioContext: unsupported ? undefined : AudioContext, performance: { now: () => now },
    setTimeout, clearTimeout,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } };
  vm.runInNewContext(source, { window, document: { addEventListener: (name, listener) => events.set(name, listener) } });
  return { sound: window.NotificationSound, tones, levels, storage,
    activate: (name = 'click', isTrusted = true) => events.get(name)({ isTrusted }),
    resume: () => resume.ok(), reject: () => resume.fail(new Error('NotAllowedError')),
    suspend: () => { audio.state = 'suspended'; }, advance: amount => { now += amount; } };
}

test('notification arriving while audio is resuming waits and rings exactly once', async () => {
  const fixture = setup();
  fixture.activate('pointerup');
  const played = fixture.sound.play();
  fixture.resume();
  assert.equal(await played, true);
  assert.equal(fixture.tones.length, 2);
  assert.ok(Math.max(...fixture.levels) > 0.04, 'default chime is clearer than the previous very low gain');
  assert.equal(await fixture.sound.play(), false, 'burst sounds remain throttled');
});

test('restored page needs a real interaction, then the test button activates audio', async () => {
  const fixture = setup();
  fixture.activate('click', false);
  assert.equal(await fixture.sound.play(), false);
  assert.equal(fixture.sound.status().state, 'waiting');
  const tested = fixture.sound.test();
  fixture.resume();
  assert.equal(await tested, true);
  assert.equal(fixture.sound.status().state, 'ready');
});

test('suspended context resumes for a fresh notification without dropping its sound', async () => {
  const fixture = setup();
  const first = fixture.sound.test();
  fixture.resume();
  await first;
  fixture.suspend();
  fixture.advance(5000);
  const second = fixture.sound.play();
  fixture.resume();
  assert.equal(await second, true);
  assert.equal(fixture.tones.length, 4);
});

test('dismissed, stale and previous-account notifications never play after resume', async () => {
  for (const mode of ['dismissed', 'stale', 'logout']) {
    const fixture = setup();
    fixture.activate();
    let current = true;
    const played = fixture.sound.play({ isCurrent: () => current });
    if (mode === 'dismissed') current = false;
    if (mode === 'stale') fixture.advance(2500);
    if (mode === 'logout') fixture.sound.reset();
    fixture.resume();
    assert.equal(await played, false, mode);
    assert.equal(fixture.tones.length, 0, mode);
  }
});

test('blocked audio reports its state and can be retried from a trusted click', async () => {
  const fixture = setup();
  const failed = fixture.sound.test();
  fixture.reject();
  assert.equal(await failed, false);
  assert.equal(fixture.sound.status().state, 'blocked');
  const retry = fixture.sound.test();
  fixture.resume();
  assert.equal(await retry, true);
});

test('mute and volume persist, mute cancels a pending sound and test explicitly enables audio', async () => {
  const fixture = setup({ saved: { enabled: false, volume: 0.3 } });
  assert.equal(fixture.sound.status().state, 'muted');
  assert.equal(fixture.sound.status().volume, 0.3);
  fixture.sound.setVolume(0.8);
  const played = fixture.sound.test();
  fixture.sound.setEnabled(false);
  fixture.resume();
  assert.equal(await played, false);
  assert.deepEqual(JSON.parse(fixture.storage.get('ttttch.notification-sound.v1')), { enabled: false, volume: 0.8 });
});

test('unsupported browsers keep a usable visual notification flow', async () => {
  const fixture = setup({ unsupported: true });
  assert.equal(fixture.sound.status().state, 'unsupported');
  assert.equal(await fixture.sound.test(), false);
  assert.equal(await fixture.sound.play(), false);
});

test('a browser that never completes resume shows blocked status instead of hanging the test button', async () => {
  const fixture = setup();
  assert.equal(await fixture.sound.test(), false);
  assert.equal(fixture.sound.status().state, 'blocked');
  assert.equal(fixture.tones.length, 0);
});
