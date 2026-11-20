(() => {
  'use strict';
  const ui = () => window.DailyReportsUI;
  const escape = value => ui().escape(value);
  const handlingLabels = new Set([
    'Trạng thái vụ việc', 'Kết quả xử lý', 'Hình thức xử lý',
    'Số QĐ khởi tố vụ án', 'Số QĐ không khởi tố vụ án', 'Số QĐ tạm đình chỉ vụ án',
    'Số QĐ đình chỉ vụ án', 'Ngày tháng năm', 'Cơ quan quyết định',
    'Kết quả giải quyết', 'Lý do', 'Hình thức chi tiết', 'Tổng tiền phạt'
  ]);
  const damageLine = /^(Người chết|Bị thương|Tài sản thiệt hại): [\d.,]+(?: đồng)?$/u;
  const wideLabels = new Set(['Vật chứng', 'Kết quả giải quyết', 'Lý do', 'Hình thức chi tiết']);
  const decisionLabel = label => label.startsWith('Số QĐ ') || label === 'Số quyết định';
  const decisionField = row => decisionLabel(row.label)
    || ['Ngày tháng năm', 'Cơ quan quyết định'].includes(row.label);

  function fields(lines, allowed) {
    const result = [];
    for (const line of lines) {
      const match = line.match(/^([^:]+): ?(.*)$/u);
      if (match && allowed.has(match[1])) result.push({ label: match[1], value: match[2] });
      else if (result.length) result.at(-1).value += '\n' + line;
    }
    return result;
  }

  function split(event, item) {
    const narrative = String(event.narrative ?? '');
    const plain = { narrative, damage: [], handling: [] };
    // Only the application's initial reference report has the labelled footer.
    // Later free-text events must never borrow fields from the current case.
    if (event.event_kind !== 'INITIAL_REPORT' || !item.reference_info) return plain;
    const lines = narrative.split(/\r?\n/u);
    const resultIndex = lines.findLastIndex(line => line.startsWith('Kết quả xử lý: '));
    const stateIndex = resultIndex - 1;
    if (stateIndex < 0 || !lines[stateIndex].startsWith('Trạng thái vụ việc: ')) return plain;
    let contentEnd = stateIndex;
    let damage = [];
    const numericIndex = lines.slice(0, stateIndex).findLastIndex(line => damageLine.test(line));
    if (numericIndex >= 0) {
      const afterNumeric = lines.slice(numericIndex + 1, stateIndex);
      if (!afterNumeric.length || afterNumeric[0].startsWith('Vật chứng: ')) {
        contentEnd = numericIndex;
        while (contentEnd > 0 && damageLine.test(lines[contentEnd - 1])) contentEnd -= 1;
        damage = fields(lines.slice(contentEnd, stateIndex),
          new Set(['Người chết', 'Bị thương', 'Tài sản thiệt hại', 'Vật chứng']));
      }
    }
    return { narrative: lines.slice(0, contentEnd).join('\n'), damage,
      handling: fields(lines.slice(stateIndex), handlingLabels) };
  }

  const facts = rows => `<dl class="bcn-event-facts">${rows.map(({ label, value }) => {
    const classes = [wideLabels.has(label) ? 'bcn-event-fact-wide' : '',
      decisionLabel(label) ? 'bcn-event-fact-decision' : '',
      ['Người chết', 'Bị thương'].includes(label) ? 'bcn-event-fact-casualty' : ''].filter(Boolean);
    return `<div${classes.length ? ` class="${classes.join(' ')}"` : ''}>
      <dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`;
  }).join('')}</dl>`;
  const group = (name, title, icon, body) => `<section class="bcn-event-group bcn-event-${name}">
    <h5><i data-lucide="${icon}" aria-hidden="true"></i>${title}</h5>${body}</section>`;

  function render(event, item, { groupDecisions = false } = {}) {
    const content = split(event, item);
    const handlingRows = groupDecisions ? content.handling.filter(row => !decisionField(row)) : content.handling;
    const decisionRows = groupDecisions ? content.handling.filter(decisionField) : [];
    const narrative = content.narrative ? group('narrative', 'Nội dung diễn biến', 'file-text',
      `<p class="bcn-event-text">${escape(content.narrative)}</p>`) : '';
    const damage = content.damage.length ? group('damage', 'Thiệt hại & vật chứng', 'package-search',
      facts(content.damage)) : '';
    const handling = handlingRows.length ? group('handling', 'Trạng thái & kết quả xử lý', 'clipboard-check',
      facts(handlingRows)) : '';
    const reportedDecision = decisionRows.length ? group('decision', 'Quyết định trong báo cáo', 'file-badge',
      facts(decisionRows)) : '';
    const decision = event.decision_number ? group('decision', 'Thông tin quyết định', 'file-check-2', facts([
      { label: 'Loại quyết định', value: ui().decisions[event.decision_type] || 'Quyết định' },
      { label: 'Số quyết định', value: event.decision_number },
      { label: 'Ngày quyết định', value: ui().date(event.decision_date) },
      { label: 'Cơ quan ban hành', value: event.decision_authority || 'Chưa ghi cơ quan ban hành' }
    ])) : '';
    return `<div class="bcn-event-content">${narrative}${damage}${handling}${reportedDecision}${decision}</div>`;
  }

  window.DailyReportsCaseEventContent = { split, render };
})();
