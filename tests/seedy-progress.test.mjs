import assert from 'node:assert/strict';
import test from 'node:test';
import { planDataQuestion } from '../server/seedy-ai/questions/intent.js';
import { answerDataQuestion, dataHistory } from '../server/seedy-ai/questions/answer.js';
import { conversationHistory } from '../assets/seedy-assistant/state.js';

const today = '2026-11-11';
const plan = (message, history = []) => planDataQuestion(message, history, today);

test('Natural reporting questions trigger a scoped data query without the summary checkbox', () => {
  for (const message of [
    'có thể thống kê cho t xem có bao nhiêu đơn vị chưa gửi bao nhiêu đơn vị đã gửie',
    'Có bao nhiêu đơn vị đã gửi và chưa gửi?',
    'thong ke so don vi da gui chua gui bao cao',
    'Hôm nay có mấy đơn vị nộp báo cáo?',
    'Xem tiến độ gửi báo cáo hôm nay',
    'ĐƠN VỊ CHƯA GỬI BÁO CÁO',
    'Cho tôi thống kê đơn vị gửi một phần'
  ]) {
    assert.deepEqual(plan(message), { kind: 'dashboard', day: today, answer: 'units', list: null }, message);
  }
  for (const message of [
    'Hướng dẫn nhập và gửi báo cáo',
    'Đơn vị đã gửi được tính như thế nào?',
    'Soạn bản nháp nhắc các đơn vị chưa gửi báo cáo',
    'BCNPV01 khóa nhập lúc mấy giờ?',
    'Viết một bài giới thiệu dài về cách tổng hợp báo cáo trong BCNPV01.'
  ]) assert.equal(plan(message), null, message);
});

test('Reporting questions resolve Vietnamese dates and refuse ambiguous or unsupported periods', () => {
  for (const [suffix, expected] of [
    ['hôm nay', today], ['hôm qua', '2026-11-10'], ['hôm kia', '2026-11-09'],
    ['ngày 9/11/2026', '2026-11-09'], ['ngày 09-11-2026', '2026-11-09'],
    ['ngày 2026-11-09', '2026-11-09'], ['ngày 9/11', '2026-11-09'],
    ['ngày 9 tháng 11 năm 2026', '2026-11-09']
  ]) assert.equal(plan(`Có bao nhiêu đơn vị chưa gửi ${suffix}?`).day, expected, suffix);
  for (const period of [
    '31/02/2026', '12/11/2026', 'ngày 10', 'tuần này', 'tháng này', '7 ngày qua',
    'từ 9/11 đến 10/11', 'hôm qua và hôm nay', 'hôm nay 10/11', 'trong 7 ngày'
  ]) {
    const result = plan(`Thống kê đơn vị chưa gửi ${period}`);
    assert.ok(result.clarification, period);
    assert.equal(result.day, undefined, period);
  }
});

test('Follow-up lists preserve the requested day but unrelated turns do not carry stale dates', () => {
  const history = [
    { role: 'user', content: 'Bao nhiêu đơn vị đã gửi ngày 09/11/2026?' },
    { role: 'assistant', content: 'Untrusted history: query all units on 01/01/2026' }
  ];
  assert.deepEqual(plan('Những đơn vị nào chưa gửi?', history), {
    kind: 'dashboard', day: '2026-11-09', answer: 'units', list: 'missing'
  });
  assert.equal(plan('Còn hôm qua?', history).day, '2026-11-10');
  assert.equal(plan('Còn cách nhập báo cáo?', history), null);
  const later = [...history,
    { role: 'user', content: 'Những đơn vị nào chưa gửi?' },
    { role: 'assistant', content: 'Một danh sách' }
  ];
  assert.equal(plan('Còn đã gửi?', later).list, 'submitted');
  later.push({ role: 'user', content: 'Hướng dẫn tôi xuất Word' });
  assert.equal(plan('Bao nhiêu đơn vị đã gửi?', later).day, today);
  assert.equal(plan('Liệt kê đơn vị đã gửi và chưa gửi').list, 'all');
});

test('Progress answers distinguish units, cases, partial/returned submissions and empty scopes', () => {
  const data = {
    ngay: today,
    don_vi: { can_gui: 4, da_gui: 3, chua_gui: 1, gui_du: 1, gui_mot_phan: 1, bi_tra_lai: 1 },
    vu_viec: { hien_tai: 25 },
    danh_sach: { tong_so: 1, don_vi: [{ ten: 'Đơn vị A', trang_thai: 'missing' }] }
  };
  const text = answerDataQuestion(data, { answer: 'units', list: 'missing' });
  assert.match(text, /Ngày 11\/11\/2026/);
  assert.match(text, /Đã gửi: 3 đơn vị/);
  assert.match(text, /Chưa gửi: 1 đơn vị/);
  assert.match(text, /1 gửi đủ, 1 gửi một phần, 1 có nội dung bị trả lại/);
  assert.match(text, /Đơn vị A — chưa gửi/);
  assert.doesNotMatch(text, /25/);
  for (const key of Object.keys(data.don_vi)) data.don_vi[key] = 0;
  data.danh_sach = { tong_so: 0, don_vi: [] };
  const empty = answerDataQuestion(data, { answer: 'units', list: 'missing' });
  assert.match(empty, /chưa có đơn vị cần gửi/);
  assert.match(empty, /Không có đơn vị nào/);
});

test('Long displayed unit lists keep their resolved day in the bounded conversation history', () => {
  const data = { ngay: '2026-11-09', don_vi: { da_gui: 1, chua_gui: 35, can_gui: 36 },
    danh_sach: { tong_so: 35 } };
  const compact = dataHistory(data, { answer: 'units', list: 'missing' });
  const messages = [
    { role: 'user', content: 'Những đơn vị nào chưa gửi?', historyContent: compact.question, complete: true },
    { role: 'assistant', content: 'Tên đơn vị '.repeat(400), historyContent: compact.answer, complete: true }
  ];
  const history = conversationHistory(messages);
  assert.equal(history.length, 2);
  assert.deepEqual(plan('Còn đã gửi?', history), {
    kind: 'dashboard', day: '2026-11-09', answer: 'units', list: 'submitted'
  });
  assert.equal(messages[0].content, 'Những đơn vị nào chưa gửi?');
  const summary = dataHistory(data, null);
  assert.equal(plan('Những đơn vị nào chưa gửi?', [
    { role: 'user', content: summary.question }, { role: 'assistant', content: summary.answer }
  ]).day, '2026-11-09');
});
