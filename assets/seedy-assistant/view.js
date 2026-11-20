import { renderMessageText } from './text.js';
import { loadAdministrativeNames } from './highlights.js';

export function createAssistantView() {
  const panel = document.createElement('section');
  panel.id = 'seedyAssistant';
  panel.className = 'seedy-ai-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'seedyAiTitle');
  panel.innerHTML = `
    <header class="seedy-ai-header">
      <span class="seedy-ai-avatar" aria-hidden="true"></span>
      <div><h2 id="seedyAiTitle">Seedy</h2><p>Trợ lý BCNPV01 · AI local</p></div>
      <button type="button" class="ghost" data-ai-clear title="Xóa trò chuyện"
        aria-label="Xóa cuộc trò chuyện với Seedy">↺</button>
      <button type="button" class="ghost" data-ai-close title="Đóng"
        aria-label="Đóng trợ lý Seedy">×</button>
    </header>
    <div class="seedy-ai-runtime">
      <span data-ai-connection role="status">Đang kiểm tra Ollama…</span>
      <button type="button" class="ghost" data-ai-reconnect>Kiểm tra lại</button>
    </div>
    <div class="seedy-ai-options">
      <label>Model local<select data-ai-model aria-label="Model AI local"></select></label>
      <label class="seedy-ai-context" title="Dựng bản tóm tắt trực tiếp từ số liệu hệ thống cho ngày đã chọn">
        <input type="checkbox" data-ai-context/>Tóm tắt số liệu theo mẫu</label>
      <label class="seedy-ai-date" hidden>Ngày số liệu<input type="date" data-ai-day/></label>
    </div>
    <div class="seedy-ai-history" role="log" aria-label="Cuộc trò chuyện với Seedy" tabindex="0"></div>
    <p class="seedy-ai-error" data-ai-error role="alert" hidden></p>
    <form class="seedy-ai-form">
      <label class="seedy-ai-sr-only" for="seedyAiInput">Nội dung hỏi Seedy</label>
      <textarea id="seedyAiInput" rows="3" maxlength="1800" placeholder="Nhắn Seedy…"
        autocomplete="off" enterkeyhint="send" required></textarea>
      <div class="seedy-ai-composer-foot">
        <small data-ai-progress>Enter để gửi · Shift+Enter xuống dòng</small>
        <button type="button" class="ghost" data-ai-stop hidden>Dừng</button>
        <button type="submit" class="primary" data-ai-send disabled>Gửi</button>
      </div>
    </form>
    <footer class="seedy-ai-footnote">Bản nháp chưa ghi vào hồ sơ. Kiểm tra nội dung trước khi dùng.
      Trò chuyện được giữ trong lần mở trang này.</footer>`;
  document.body.append(panel);
  const find = selector => panel.querySelector(selector);
  return {
    panel,
    input: find('#seedyAiInput'),
    form: find('form'),
    history: find('.seedy-ai-history'),
    connection: find('[data-ai-connection]'),
    models: find('[data-ai-model]'),
    context: find('[data-ai-context]'),
    day: find('[data-ai-day]'),
    dateLabel: find('.seedy-ai-date'),
    progress: find('[data-ai-progress]'),
    send: find('[data-ai-send]'),
    stop: find('[data-ai-stop]'),
    clear: find('[data-ai-clear]'),
    close: find('[data-ai-close]'),
    reconnect: find('[data-ai-reconnect]'),
    showError(message = '') {
      const error = find('[data-ai-error]');
      error.textContent = message;
      error.hidden = !message;
    }
  };
}

export function addMessage(view, message) {
  const article = document.createElement('article');
  article.className = `seedy-ai-message seedy-ai-message-${message.role}`;
  const author = document.createElement('strong');
  author.textContent = message.role === 'user' ? 'Bạn' : 'Seedy';
  const text = document.createElement('div');
  text.className = 'seedy-ai-message-text';
  const highlights = { emphasize: message.role === 'assistant', names: [] };
  renderMessageText(text, message.content, highlights);
  const pending = document.createElement('div');
  pending.className = 'seedy-ai-pending';
  pending.setAttribute('role', 'status');
  pending.append(document.createTextNode('Đang trả lời'));
  const dots = document.createElement('span');
  dots.className = 'seedy-ai-pending-dots';
  dots.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 3; index += 1) {
    dots.append(document.createElement('span'));
  }
  pending.append(dots);
  const sources = document.createElement('small');
  sources.className = 'seedy-ai-sources';
  const actions = document.createElement('div');
  actions.className = 'seedy-ai-actions';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'ghost seedy-ai-copy';
  copy.textContent = 'Sao chép';
  actions.append(copy);
  function syncPresentation() {
    const hasText = Boolean(message.content.trim());
    pending.hidden = message.role !== 'assistant' || message.complete || hasText;
    text.hidden = !hasText;
    sources.hidden = !hasText || !sources.textContent;
    actions.hidden = message.role !== 'assistant' || !hasText;
    copy.hidden = message.role !== 'assistant' || !hasText;
    copy.disabled = !hasText;
  }
  syncPresentation();
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text.textContent);
      copy.textContent = 'Đã sao chép';
      setTimeout(() => {
        copy.textContent = 'Sao chép';
      }, 1500);
    } catch {
      view.showError('Trình duyệt chưa cho sao chép. Bạn có thể chọn và sao chép phần văn bản.');
    }
  });
  article.append(author, pending, text, sources, actions);
  view.history.append(article);
  view.history.scrollTop = view.history.scrollHeight;
  if (highlights.emphasize) {
    loadAdministrativeNames().then(loaded => {
      if (loaded && article.isConnected) {
        renderMessageText(text, message.content, highlights);
      }
    });
  }
  return {
    addAction(label, activate) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ghost seedy-ai-action-btn';
      button.textContent = label;
      button.onclick = async () => {
        button.disabled = true;
        try {
          await activate();
        } catch (error) {
          view.showError(error.message);
        } finally {
          button.disabled = false;
        }
      };
      actions.append(button);
    },
    showStart() {
      view.history.scrollTop += article.getBoundingClientRect().top - view.history.getBoundingClientRect().top;
    },
    update() {
      const following = view.history.scrollHeight - view.history.scrollTop - view.history.clientHeight < 90;
      renderMessageText(text, message.content, highlights);
      syncPresentation();
      if (following) {
        view.history.scrollTop = view.history.scrollHeight;
      }
    },
    sources(items, data) {
      highlights.names = data?.danh_sach?.don_vi?.map(unit => unit.ten) || [];
      renderMessageText(text, message.content, highlights);
      if (!items.length && !data) {
        sources.textContent = '';
        syncPresentation();
        return;
      }
      sources.textContent = 'Tham khảo: ' + items.map(item => item.title).join(' · ')
        + (data ? ` · Tổng quan ${data.ngay} (theo quyền tài khoản)` : '');
      if (data) {
        sources.textContent += `\nSố liệu nguồn: ${data.vu_viec.hien_tai} vụ; `
          + `${data.don_vi.da_gui}/${data.don_vi.can_gui} đơn vị đã gửi; ${data.don_vi.chua_gui} chưa gửi.`;
      }
      syncPresentation();
    }
  };
}
