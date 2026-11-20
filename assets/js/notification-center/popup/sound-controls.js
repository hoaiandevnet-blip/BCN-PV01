(function attachSoundControls(global) {
  'use strict';
  const mounted = new WeakSet();

  function mount(host) {
    const sound = global.NotificationSound;
    if (!host || !sound || mounted.has(host)) return;
    mounted.add(host);
    host.innerHTML = `<div class="settings-card-head">
      <span><i data-lucide="volume-2" aria-hidden="true"></i></span>
      <div><h3>Âm thanh thông báo</h3><p data-sound-status role="status"></p></div>
      </div><div class="notification-sound-heading">
        <strong>Phát chuông khi có thông báo mới</strong>
        <button type="button" class="ghost" data-sound-toggle aria-pressed="true"></button>
      </div><div class="notification-sound-controls">
        <label>Âm lượng <input type="range" min="10" max="100" step="10" data-sound-volume></label>
        <output data-sound-volume-label></output>
        <button type="button" class="ghost" data-sound-test>Thử âm thanh</button>
      </div><p class="notification-sound-feedback" data-sound-feedback role="status" hidden></p>
      <p class="notification-sound-note">Lựa chọn được tự động lưu trên trình duyệt này.</p>`;
    const toggle = host.querySelector('[data-sound-toggle]');
    const test = host.querySelector('[data-sound-test]');
    const volume = host.querySelector('[data-sound-volume]');
    const feedback = host.querySelector('[data-sound-feedback]');
    let testing = false;
    const messages = {
      ready: 'Chuông sẵn sàng khi có thông báo mới.',
      waiting: 'Bấm Thử âm thanh để kích hoạt chuông trên trình duyệt này.',
      blocked: 'Trình duyệt chưa cho phát tiếng. Bấm Thử âm thanh để bật lại.',
      muted: 'Đang tắt tiếng thông báo.',
      unsupported: 'Trình duyệt này chưa hỗ trợ âm thanh thông báo.'
    };
    sound.subscribe(state => {
      host.dataset.soundState = state.state;
      host.querySelector('[data-sound-status]').textContent = messages[state.state];
      toggle.textContent = state.enabled ? 'Tắt tiếng' : 'Bật tiếng';
      toggle.setAttribute('aria-pressed', String(state.enabled));
      toggle.setAttribute('aria-label', state.enabled ? 'Tắt âm thanh thông báo' : 'Bật âm thanh thông báo');
      volume.value = String(Math.round(state.volume * 100));
      host.querySelector('[data-sound-volume-label]').textContent = `${volume.value}%`;
      toggle.disabled = state.state === 'unsupported';
      volume.disabled = !state.enabled || state.state === 'unsupported';
      test.disabled = testing || state.state === 'unsupported';
    });
    toggle.addEventListener('click', () => {
      if (sound.status().enabled) sound.setEnabled(false);
      else void sound.test();
      feedback.hidden = true;
    });
    volume.addEventListener('input', () => {
      sound.setVolume(Number(volume.value) / 100);
      feedback.hidden = true;
    });
    test.addEventListener('click', async () => {
      if (testing) return;
      testing = true;
      test.disabled = true;
      feedback.hidden = false;
      feedback.textContent = 'Đang thử chuông…';
      const played = await sound.test();
      feedback.textContent = played
        ? 'Đã phát chuông thử. Nếu chưa nghe, kiểm tra âm lượng máy và tiếng của tab trình duyệt.'
        : 'Chưa phát được tiếng. Kiểm tra quyền âm thanh của trang rồi bấm Thử âm thanh lại.';
      testing = false;
      test.disabled = sound.status().state === 'unsupported';
    });
    global.lucide?.createIcons({ root: host });
  }

  global.NotificationSoundControls = Object.freeze({ mount });
})(window);
