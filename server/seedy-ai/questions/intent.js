import { normalizeQuestion, requestedDay } from './date.js';

function planTurn(message, today, previous) {
  const query = normalizeQuestion(message);
  const guidance = /\b(huong dan|cach (tinh|nhap|gui|nop|xuat)|tinh nhu the nao|duoc tinh|la gi|nghia la|soan|viet nhap)\b/;
  if (guidance.test(query)) return null;
  const domainCase = /\b(he (vu viec|nghiep vu)|vu viec|vu an|pham phap hinh su|pphs|ma tuy|cong nghe cao|kinh te|moi truong|te nan xa hoi|tnxh|an ninh quoc gia|anqg|hoat dong tu phap|tra lai|tra ve|bi tra|can bo sung|cho duyet|da duyet)\b/.test(query);
  if (domainCase) return null;
  const unit = /\bdon vi\b/.test(query);
  const submission = /\b(gui|nop|bao cao)\b/.test(query);
  const statistics = /\b(bao nhieu|thong ke|so luong|tong so|danh sach|liet ke|tien do)\b/.test(query);
  const summary = /\b(tom tat|thong ke)\b/.test(query) && /\b(tong quan|so lieu|hom nay|hom qua)\b/.test(query);
  const direct = (unit && (submission || statistics)) || (/\btien do\b/.test(query) && submission) || summary;
  const names = /\b(don vi nao|nhung don vi|danh sach|liet ke|ten (cac )?don vi)\b/.test(query);
  const followup = previous && query.length < 160
    && /^(con |the |vay |va |hom |ngay |liet ke|danh sach|nhung don vi|don vi nao|cho (toi|minh|t) (xem|danh sach))/.test(query)
    && (submission || names || /\b(hom|ngay)\b|\d{1,4}[/-]\d{1,2}/.test(query));
  if (!direct && !followup) return null;
  const date = requestedDay(query, today, previous?.day || today);
  if (date.clarification) return date;
  const wantsNames = names || (!direct && previous?.list && submission);
  const missing = /\b(chua|khong) (gui|nop)\b/.test(query);
  const submitted = /\bda (gui|nop)\b/.test(query);
  let list = null;
  if (wantsNames) {
    list = missing && submitted ? 'all' : missing ? 'missing'
      : /\btra lai\b/.test(query) ? 'returned' : /\bmot phan\b/.test(query) ? 'partial'
        : /\b(gui|nop) du\b/.test(query) ? 'complete' : submitted ? 'submitted' : previous?.list || 'all';
  } else if (!direct && !submission) {
    list = previous.list;
  }
  return { kind: 'dashboard', day: date.day, answer: summary ? 'summary' : 'units', list };
}

// Interpret only read-only queries. History can select a date, never an account or authorization scope.
export function planDataQuestion(message, history, today) {
  let previous = null;
  for (const turn of history) {
    if (turn.role !== 'user') continue;
    const candidate = planTurn(turn.content, today, previous);
    previous = candidate?.day ? candidate : null;
  }
  return planTurn(message, today, previous);
}
