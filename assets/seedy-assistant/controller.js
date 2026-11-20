import { readStatus, streamChat } from './api.js';
import { createChatState, conversationHistory } from './state.js';
import { createAssistantView, addMessage } from './view.js';

export function initializeAssistant({ onActivity = () => {} } = {}) {
  const state = createChatState();
  const view = createAssistantView();
  const shell = document.getElementById('appShell');
  let controller = null;
  let generation = 0;
  let statusGeneration = 0;
  let opener = null;

  function controls() {
    view.send.disabled = !state.owner || state.busy;
    view.send.hidden = state.busy;
    view.stop.hidden = !state.busy;
    view.models.disabled = state.busy || !state.ready;
    view.context.disabled = state.busy;
    view.day.disabled = state.busy;
    view.clear.disabled = state.busy;
    view.reconnect.disabled = state.busy;
    view.history.setAttribute('aria-busy', String(state.busy));
  }

  function clearConversation() {
    generation += 1;
    controller?.abort();
    controller = null;
    state.messages = [];
    state.memory = null;
    state.proposal = null;
    state.busy = false;
    view.history.querySelectorAll('.seedy-ai-message').forEach(element => element.remove());
    view.showError();
    view.progress.textContent = 'Enter để gửi · Shift+Enter xuống dòng';
    onActivity('idle');
    controls();
  }

  async function checkConnection() {
    const current = ++statusGeneration;
    view.connection.textContent = 'Đang kiểm tra Ollama…';
    view.reconnect.disabled = true;
    try {
      const status = await readStatus();
      if (current !== statusGeneration || shell.hidden) return;
      if (state.owner && state.owner !== status.accountId) clearConversation();
      state.owner = status.accountId;
      state.ready = status.ready;
      const selected = status.models.some(model => model.id === state.model) ? state.model : status.recommended;
      view.models.replaceChildren(...status.models.map(model => new Option(model.label, model.id)));
      state.model = selected || '';
      view.models.value = state.model;
      view.day.value ||= status.day;
      view.day.max = status.day;
      view.connection.textContent = status.message;
      view.connection.dataset.ready = String(status.ready);
      view.connection.title = `${status.hardware.cpu} · RAM ${status.hardware.memoryGiB} GB · chạy trên máy này`;
      view.showError();
    } catch (error) {
      if (current !== statusGeneration) return;
      state.ready = false;
      view.connection.textContent = 'Chưa kết nối được trợ lý';
      view.connection.dataset.ready = 'false';
      view.showError(error.message);
    } finally {
      if (current === statusGeneration) controls();
    }
  }

  function close() {
    controller?.abort();
    view.panel.hidden = true;
    opener?.focus({ preventScroll: true });
  }

  async function send() {
    const question = view.context.checked ? 'Tóm tắt số liệu ngày đã chọn' : view.input.value.trim();
    if (!question || !state.owner || state.busy || shell.hidden) return;
    if (view.context.checked && !view.day.value) {
      view.showError('Chọn ngày số liệu cần tóm tắt.');
      return;
    }
    const payload = {
      message: question,
      memory: state.memory,
      model: state.model,
      history: conversationHistory(state.messages),
      page: document.querySelector('#appShell .main > .page.active')?.id || 'home',
      context: view.context.checked ? { kind: 'dashboard', day: view.day.value } : { kind: 'none' }
    };
    const user = { role: 'user', content: question, complete: true };
    const answer = { role: 'assistant', content: '', complete: false };
    state.messages.push(user, answer);
    addMessage(view, user);
    const rendered = addMessage(view, answer);
    if (!view.context.checked) view.input.value = '';
    view.showError();
    state.busy = true;
    controller = new AbortController();
    const requestController = controller;
    const current = generation;
    controls();
    view.progress.textContent = view.context.checked
      ? 'Đang đọc số liệu theo quyền tài khoản…' : 'Seedy đang tra cứu và chuẩn bị câu trả lời…';
    onActivity('working');
    let metadata;
    let renderedTruncated = false;
    const owner = state.owner;
    const stillCurrent = () => current === generation && owner === state.owner && !shell.hidden;
    async function openReport(action, draft) {
      if (!stillCurrent()) return;
      await window.openSeedyReport(action, owner, draft, stillCurrent);
      if (stillCurrent() && action.type === 'review') close();
    }
    try {
      await streamChat(payload, {
        signal: requestController.signal,
        onEvent(event) {
          if (current !== generation) return;
          if (event.type === 'meta') {
            if (event.accountId !== state.owner) {
              throw Object.assign(new Error('Phiên tài khoản đã thay đổi.'), { status: 401 });
            }
            metadata = event;
            rendered.sources(event.sources, event.data);
            if (event.historyTurn) {
              user.historyContent = event.historyTurn.question;
              answer.historyContent = event.historyTurn.answer;
            }
          }
          if (event.type === 'delta') {
            answer.content += event.text;
            rendered.update();
            view.progress.textContent = 'Seedy đang trả lời…';
          }
          if (event.type === 'done') {
            renderedTruncated = Boolean(event.truncated);
            answer.complete = true;
            if (!answer.content.trim()) answer.content = 'Chưa nhận được nội dung trả lời. Bạn có thể thử lại.';
            rendered.update();
            if (answer.historyContent) rendered.showStart();
            view.progress.textContent = event.truncated
              ? 'Đạt giới hạn mỗi lượt. Bạn có thể yêu cầu tiếp tục.' : 'Đã trả lời · xử lý trên máy này';
          }
        }
      });
      if (stillCurrent()) {
        onActivity('review');
        state.memory = metadata?.memory || null;
        const action = metadata?.action;
        if (state.memory?.kind !== 'cases' || action?.type === 'list') state.proposal = null;
        if (action) {
          user.historyContent = question;
          answer.historyContent = 'Đã hiển thị trong phiên.';
          if (metadata.draft) {
            state.proposal = null;
            if (!renderedTruncated) {
              const draft = answer.content;
              state.proposal = { id: action.id, version: action.version, draft };
              rendered.addAction('Xem và sửa bản nháp trên hồ sơ', () => openReport(action, draft));
            }
          } else {
            const previous = state.proposal;
            if (action.type === 'review' && previous?.id === action.id && previous.version !== action.version) {
              state.proposal = null;
              throw new Error('Hồ sơ đã thay đổi sau khi soạn nháp. Hãy soạn lại trước khi gửi.');
            }
            const draft = previous && previous.id === action.id ? previous.draft : '';
            const isExplicitOpen = /\b(mo|chuyen sang|di toi|xem danh sach|loc danh sach)\b/i.test(question);
            const isReturnedRelated = Boolean(action.byReturn || action.state === 'RETURNED'
              || action.type === 'list' || action.type === 'review');

            if (action.type === 'review' || (action.type === 'list' && isExplicitOpen)) {
              const actionLabel = action.type === 'list' ? 'Mở lại danh sách' : 'Mở hồ sơ để kiểm tra';
              rendered.addAction(actionLabel, () => openReport(action, draft));
              await openReport(action, draft);
            } else if (isReturnedRelated) {
              const actionLabel = action.type === 'list' ? 'Mở lại danh sách' : 'Lọc trên Báo cáo bị trả lại';
              rendered.addAction(actionLabel, () => openReport(action, draft));
            }
          }
        }
      }
    } catch (error) {
      if (current !== generation) return;
      if (error.status === 401 || error.code === 'ACCOUNT_SESSION_CHANGED') {
        window.dispatchEvent(new CustomEvent('bcn-session-expired'));
        return;
      }
      if (requestController.signal.aborted) {
        view.progress.textContent = 'Đã dừng trả lời';
      } else {
        view.showError(error.message);
        view.progress.textContent = 'Chưa hoàn thành câu trả lời';
      }
      if (!answer.content) {
        answer.content = requestController.signal.aborted ? 'Đã dừng.' : 'Chưa có câu trả lời. Bạn có thể thử lại.';
        rendered.update();
      }
      onActivity('idle');
    } finally {
      if (current === generation) {
        state.busy = false;
        controller = null;
        controls();
        if (!view.panel.hidden) view.input.focus({ preventScroll: true });
      }
    }
  }

  view.form.addEventListener('submit', event => {
    event.preventDefault();
    send();
  });
  view.input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      send();
    }
  });
  view.close.addEventListener('click', close);
  view.clear.addEventListener('click', clearConversation);
  view.stop.addEventListener('click', () => controller?.abort());
  view.reconnect.addEventListener('click', checkConnection);
  view.models.addEventListener('change', () => { state.model = view.models.value; });
  function contextChanged() {
    view.dateLabel.hidden = !view.context.checked;
    view.input.disabled = view.context.checked;
    view.input.placeholder = view.context.checked ? 'Bấm Gửi để xem bản tóm tắt theo mẫu.' : 'Nhắn Seedy…';
    controls();
  }
  view.context.addEventListener('change', contextChanged);
  view.panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  });
  function resetSession() {
    statusGeneration += 1;
    clearConversation();
    state.owner = null;
    state.ready = false;
    view.panel.hidden = true;
    view.input.value = '';
    view.context.checked = false;
    contextChanged();
    controls();
  }
  window.addEventListener('bcn-session-expired', resetSession);
  const observer = new MutationObserver(() => {
    if (shell.hidden) resetSession();
  });
  observer.observe(shell, { attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('pagehide', () => controller?.abort());
  controls();

  return {
    open() {
      if (shell.hidden) return;
      opener = document.activeElement;
      view.panel.hidden = false;
      view.input.focus({ preventScroll: true });
      if (!state.busy) checkConnection();
    }
  };
}
