import os from 'node:os';
import { readMemory } from './daily/execute.js';

export const modelProfiles = Object.freeze([
  { id: 'qwen3.5:4b-q4_K_M', label: 'Qwen3.5 4B · Cân bằng', thinking: false },
  { id: 'qwen2.5:3b', label: 'Qwen2.5 3B · Nhẹ', thinking: null }
]);

export const limits = Object.freeze({
  message: 1800,
  history: 2400,
  historyEntries: 8,
  context: 4096,
  output: 640,
  timeoutMs: 180000,
  keepAlive: '60s'
});

export function hardwareProfile() {
  return {
    cpu: os.cpus()[0]?.model || 'CPU local',
    memoryGiB: Math.round(os.totalmem() / 1024 ** 3),
    contextTokens: limits.context,
    parallelRequests: 1,
    idleUnloadSeconds: 60
  };
}

export function validateChat(body) {
  const fail = message => {
    throw Object.assign(new Error(message), { status: 422 });
  };
  if (!body || typeof body.message !== 'string' || !body.message.trim()) fail('Nhập nội dung cần hỏi Seedy.');
  if (body.message.length > limits.message) fail(`Mỗi lượt tối đa ${limits.message} ký tự.`);
  if (body.model && !modelProfiles.some(profile => profile.id === body.model)) fail('Model chưa được hỗ trợ.');
  const history = body.history ?? [];
  if (!Array.isArray(history) || history.length > limits.historyEntries) fail('Lịch sử trò chuyện quá dài.');
  if (history.some(item => !item || !['user', 'assistant'].includes(item.role)
    || typeof item.content !== 'string' || item.content.length > limits.history)) {
    fail('Lịch sử trò chuyện không hợp lệ.');
  }
  if (history.reduce((sum, item) => sum + item.content.length, 0) > limits.history) {
    fail('Lịch sử vượt giới hạn bộ nhớ của trợ lý.');
  }
  const context = body.context ?? { kind: 'none' };
  if (!context || !['none', 'dashboard'].includes(context.kind)) fail('Nguồn ngữ cảnh không hợp lệ.');
  if (context.kind === 'dashboard' && !/^\d{4}-\d{2}-\d{2}$/.test(context.day || '')) {
    fail('Chọn ngày số liệu hợp lệ.');
  }
  const pages = ['home', 'dailyReports', 'digitalMap', 'accounts', 'directory', 'settings'];
  return {
    message: body.message.trim(),
    memory: readMemory(body.memory),
    model: body.model || null,
    history: history.map(item => ({ role: item.role, content: item.content })),
    context: { kind: context.kind, day: context.day },
    page: pages.includes(body.page) ? body.page : 'home'
  };
}
