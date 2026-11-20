import { palettes, appearanceDefaults } from './palettes.js';
import { acceptAppearance, previewAppearance, cancelAppearancePreview } from './appearance.js';

export async function renderSettings({ api, escapeHtml, icons }) {
  const root = document.getElementById('settings');
  root.innerHTML = '<p role="status">Đang tải cài đặt…</p>';
  let saved = await api('/api/settings');
  let draft = { palette: saved.palette, mode: saved.mode };
  let saving = false;
  acceptAppearance(saved);
  const formatUpdated = value => value.updated_by
    ? `Lưu bởi ${escapeHtml(value.updated_by)} · ${new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh'
    }).format(new Date(value.updated_at))}`
    : 'Đang dùng giao diện mặc định';
  root.innerHTML = `
    <header class="bcn-settings-head">
      <div><span class="bcn-eyebrow">QUẢN TRỊ HỆ THỐNG</span>
        <h1>Cài đặt giao diện</h1>
        <p>Chọn màu quen thuộc, giữ trải nghiệm glass trong toàn bộ phần mềm.</p></div>
      <span class="bcn-settings-access"><i data-lucide="shield-check"></i>Chỉ quản trị viên</span>
    </header>
    <div class="bcn-settings-layout">
      <div class="bcn-settings-options">
        <section class="bcn-settings-panel" aria-labelledby="appearanceModeTitle">
          <div class="bcn-settings-heading"><i data-lucide="sun-moon"></i>
            <div><h2 id="appearanceModeTitle">Chế độ hiển thị</h2>
              <p>Điều chỉnh độ sáng phù hợp với không gian làm việc.</p></div></div>
          <div class="bcn-mode-picker" role="group" aria-label="Chế độ hiển thị">
            <button type="button" data-mode="light" aria-pressed="false">
              <i data-lucide="sun"></i>Sáng</button>
            <button type="button" data-mode="dark" aria-pressed="false">
              <i data-lucide="moon"></i>Tối</button>
          </div>
        </section>
        <section class="bcn-settings-panel" aria-labelledby="appearancePaletteTitle">
          <div class="bcn-settings-heading"><i data-lucide="palette"></i>
            <div><h2 id="appearancePaletteTitle">Bộ màu hệ thống</h2>
              <p>Các màu từ hệ thống cũ, kết hợp bề mặt kính mờ hiện tại.</p></div></div>
          <div class="bcn-palette-grid" role="group" aria-label="Bộ màu hệ thống">
            ${palettes.map(palette => `
              <button type="button" class="bcn-palette-option" data-palette="${palette.id}"
                aria-label="${palette.name}" aria-pressed="false">
                <span class="bcn-palette-swatch" aria-hidden="true"
                  style="--swatch-accent:${palette.accent};--swatch-nav:${palette.nav};--swatch-paper:${palette.paper}">
                  <span></span><span></span><span></span>
                </span>
                <span class="bcn-palette-label"><strong>${palette.name}</strong>
                  <span>${palette.description}</span></span>
                <i data-lucide="circle-check" class="bcn-palette-check" aria-hidden="true"></i>
              </button>`).join('')}
          </div>
        </section>
      </div>
      <aside class="bcn-settings-panel bcn-appearance-preview" aria-label="Xem trước giao diện">
        <span class="bcn-eyebrow">XEM TRƯỚC</span>
        <div class="bcn-preview-window" aria-hidden="true">
          <div class="bcn-preview-bar"><span></span><span></span><span></span></div>
          <div class="bcn-preview-body"><div class="bcn-preview-nav"><i></i><i></i><i></i></div>
            <div class="bcn-preview-content"><b>Báo cáo ngày</b>
              <div class="bcn-preview-card"><i data-lucide="files"></i><span>Thông tin báo cáo</span></div>
              <span class="bcn-preview-button">Lưu báo cáo</span>
            </div></div>
        </div>
        <h2 id="appearancePreviewName"></h2>
        <p id="appearancePreviewMode"></p>
        <div class="bcn-settings-scope"><i data-lucide="layers-2"></i>
          <p>Hiệu ứng glass được giữ ở menu, thẻ, nút và ô nhập liệu.</p></div>
        <div class="bcn-settings-scope"><i data-lucide="users"></i>
          <p>Sau khi lưu, giao diện áp dụng cho mọi tài khoản và màn hình đăng nhập.</p></div>
      </aside>
    </div>
    <footer class="bcn-settings-savebar">
      <div><p id="appearanceStatus" role="status" aria-live="polite"></p>
        <small id="appearanceUpdated">${formatUpdated(saved)}</small></div>
      <div class="bcn-settings-actions">
        <button type="button" class="ghost" id="appearanceDefault">Mặc định</button>
        <button type="button" class="ghost" id="appearanceCancel">Hủy thay đổi</button>
        <button type="button" class="primary" id="appearanceSave">
          <i data-lucide="check"></i>Lưu giao diện</button>
      </div>
    </footer>`;
  const status = root.querySelector('#appearanceStatus');
  const changed = () => draft.palette !== saved.palette || draft.mode !== saved.mode;
  function refresh(message) {
    root.querySelectorAll('[data-palette]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.palette === draft.palette));
    });
    root.querySelectorAll('[data-mode]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === draft.mode));
    });
    root.querySelectorAll('button').forEach(button => { button.disabled = saving; });
    root.querySelector('#appearanceSave').disabled = saving || !changed();
    root.querySelector('#appearanceCancel').disabled = saving || !changed();
    root.querySelector('#appearancePreviewName').textContent = palettes.find(item => item.id === draft.palette).name;
    root.querySelector('#appearancePreviewMode').textContent = draft.mode === 'light' ? 'Chế độ sáng' : 'Chế độ tối';
    status.textContent = message || (changed() ? 'Đang xem thử · Chưa lưu cho hệ thống' : 'Đã đồng bộ với hệ thống');
  }
  function preview() {
    previewAppearance(draft);
    refresh();
  }
  root.querySelectorAll('[data-palette]').forEach(button => {
    button.onclick = () => {
      draft.palette = button.dataset.palette;
      preview();
    };
  });
  root.querySelectorAll('[data-mode]').forEach(button => {
    button.onclick = () => {
      draft.mode = button.dataset.mode;
      preview();
    };
  });
  root.querySelector('#appearanceDefault').onclick = () => {
    draft = { ...appearanceDefaults };
    preview();
  };
  root.querySelector('#appearanceCancel').onclick = () => {
    draft = { palette: saved.palette, mode: saved.mode };
    cancelAppearancePreview();
    refresh();
  };
  root.querySelector('#appearanceSave').onclick = async () => {
    saving = true;
    refresh('Đang lưu giao diện…');
    try {
      saved = await api('/api/settings', { method: 'PUT', body: JSON.stringify({ ...draft, revision: saved.revision }) });
      acceptAppearance(saved);
      cancelAppearancePreview();
      root.querySelector('#appearanceUpdated').textContent = '';
      root.querySelector('#appearanceUpdated').innerHTML = formatUpdated(saved);
      refresh('Đã lưu giao diện cho toàn hệ thống');
    } catch (error) {
      status.textContent = error.message;
    } finally {
      saving = false;
      refresh(status.textContent);
    }
  };
  icons();
  refresh();
  return cancelAppearancePreview;
}
