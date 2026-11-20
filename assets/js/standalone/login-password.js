export function initializePasswordToggle() {
  const input = document.getElementById('loginPassword');
  const button = document.getElementById('togglePassword');
  function setVisible(visible) {
    input.type = visible ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(visible));
    button.setAttribute('aria-label', visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
    button.innerHTML = `<i data-lucide="${visible ? 'eye-off' : 'eye'}" aria-hidden="true"></i>
      <span>${visible ? 'Ẩn' : 'Hiện'}</span>`;
    window.lucide?.createIcons();
  }
  button.addEventListener('click', () => setVisible(input.type === 'password'));
  return () => setVisible(false);
}
