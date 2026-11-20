export async function readStatus() {
  const response = await window.BcnSession.fetch('/api/seedy/status', {
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(8000)
  });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error || 'Không kiểm tra được AI local.'), {
    status: response.status
  });
  return body;
}

export async function streamChat(payload, { signal, onEvent }) {
  const response = await window.BcnSession.fetch('/api/seedy/chat', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  });
  if (!response.ok) {
    const body = await response.json();
    throw Object.assign(new Error(body.error || 'Không gửi được câu hỏi.'), { status: response.status });
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const event = JSON.parse(line);
        if (event.type === 'error') {
          throw Object.assign(new Error(event.error), { status: event.status });
        }
        onEvent(event);
        if (event.type === 'done') completed = true;
      }
    }
    if (!completed && !signal.aborted) throw new Error('Câu trả lời bị gián đoạn. Vui lòng thử lại.');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
