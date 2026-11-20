import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';

const base = 'http://127.0.0.1:11434';
const models = ['qwen3.5:4b-q4_K_M', 'qwen2.5:3b'];
const results = [];
const output = new URL('../../outputs/seedy-ai/', import.meta.url);
await mkdir(output, { recursive: true });

for (const model of models) {
  const started = performance.now();
  let firstTokenMs = null;
  let responseText = '';
  let completion;
  let loaded;
  const response = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(150000),
    body: JSON.stringify({
      model,
      stream: true,
      keep_alive: 0,
      ...(model.startsWith('qwen3.5') ? { think: false } : {}),
      options: { num_ctx: 2048, num_predict: 160, num_thread: 4, temperature: 0.3, presence_penalty: 0 },
      messages: [
        { role: 'system', content: 'Bạn là Seedy, trợ lý BCNPV01. Trả lời tiếng Việt ngắn gọn, đúng dữ kiện.' },
        { role: 'user', content: 'Đơn vị có 5 báo cáo: 3 đã gửi, 1 nháp, 1 bị trả lại. '
          + 'Tóm tắt số liệu và đề xuất việc cần làm, trong 3 câu. Không tự thêm dữ kiện.' }
      ]
    })
  });
  if (!response.ok) {
    console.log(JSON.stringify({ model, error: await response.text() }));
    continue;
  }
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const event = JSON.parse(line);
      if (event.error) throw new Error(event.error);
      if (event.message?.content) {
        if (firstTokenMs === null) {
          firstTokenMs = Math.round(performance.now() - started);
          loaded = await fetch(`${base}/api/ps`).then(value => value.json());
        }
        responseText += event.message.content;
      }
      if (event.done) completion = event;
    }
  }
  const result = {
    model,
    firstTokenMs,
    elapsedMs: Math.round(performance.now() - started),
    tokensPerSecond: completion?.eval_duration ? completion.eval_count / (completion.eval_duration / 1e9) : null,
    doneReason: completion?.done_reason,
    response: responseText,
    loaded,
    measuredAt: new Date().toISOString()
  };
  results.push(result);
  console.log(JSON.stringify(result));
}
await writeFile(new URL('benchmark.json', output), JSON.stringify({
  hardware: { cpu: os.cpus()[0]?.model, totalMemoryBytes: os.totalmem(), platform: os.platform() },
  results
}, null, 2) + '\n');
