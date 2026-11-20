import { limits, modelProfiles } from './config.js';

const localOrigin = 'http://127.0.0.1:11434';

export function createOllamaClient({ request = fetch } = {}) {
  async function availableModels(signal) {
    const response = await request(`${localOrigin}/api/tags`, {
      signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(5000)]),
      redirect: 'error'
    });
    if (!response.ok) throw new Error('Không đọc được danh sách model local.');
    const body = await response.json();
    return modelProfiles.flatMap(profile => {
      const model = body.models?.find(item => item.name === profile.id && !item.remote_host && !item.remote_model
        && item.size > 256 * 1024 ** 2 && item.details?.format === 'gguf');
      return model ? [{ ...profile, sizeBytes: model.size }] : [];
    });
  }

  async function* chat({ profile, messages, signal, format }) {
    const response = await request(`${localOrigin}/api/chat`, {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: profile.id,
        messages,
        stream: true,
        ...(format ? { format } : {}),
        keep_alive: limits.keepAlive,
        ...(profile.thinking === false ? { think: false } : {}),
        options: {
          num_ctx: limits.context,
          num_predict: format ? 100 : limits.output,
          num_thread: 4,
          temperature: format ? 0 : 0.3,
          presence_penalty: 0
        }
      })
    });
    if (!response.ok) throw new Error('Ollama chưa chạy được model. Kiểm tra Ollama rồi thử lại.');
    const decoder = new TextDecoder();
    let buffer = '';
    let receivedDone = false;
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      if (buffer.length > 65536) throw new Error('Phản hồi model vượt giới hạn.');
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const event = JSON.parse(line);
        if (event.error) throw new Error('Model local gặp lỗi khi trả lời. Vui lòng thử lại.');
        if (typeof event.message?.content === 'string' && event.message.content) {
          yield { type: 'delta', text: event.message.content };
        }
        if (event.done) {
          receivedDone = true;
          yield {
            type: 'done',
            truncated: event.done_reason === 'length',
            tokens: event.eval_count || 0,
            tokensPerSecond: event.eval_duration ? event.eval_count / (event.eval_duration / 1e9) : null
          };
        }
      }
    }
    if (!receivedDone) throw new Error('Kết nối model kết thúc trước khi hoàn thành câu trả lời.');
  }

  return { availableModels, chat };
}
