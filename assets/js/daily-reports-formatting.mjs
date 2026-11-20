import { normalizeReportAlignment, reportAlignmentOptions, reportAlignmentParts }
  from './daily-reports-document-format.mjs';

export function mountReportFormatting(root, onChange) {
  let alignment = normalizeReportAlignment();
  let active = false;
  const bar = root.querySelector('#bcnDocumentFormatting');
  const stack = root.querySelector('#bcnPaperStack');
  bar.innerHTML = `<div class="bcn-format-heading"><strong>Căn chỉnh văn bản</strong>
      <button type="button" class="ghost" data-format-default
        title="Khôi phục cách căn của phần đang chọn">Theo mẫu</button></div>
    <div class="bcn-format-controls">
      <label>Phần cần căn<select id="bcnFormatPart">
        ${Object.entries(reportAlignmentParts).map(([key, part]) =>
          `<option value="${key}">${part.label}</option>`).join('')}
      </select></label>
      <div class="bcn-format-buttons" role="group" aria-label="Cách căn chữ">
        ${Object.entries(reportAlignmentOptions).map(([key, option]) =>
          `<button type="button" class="ghost" data-format-align="${key}"
            aria-label="${option.label}" title="${option.label}" aria-pressed="false">
            <i data-lucide="${option.icon}" aria-hidden="true"></i><span>${option.short}</span></button>`).join('')}
      </div>
    </div>
    <p>Chọn phần cần căn hoặc bấm vào chữ trên bản xem trước. Áp dụng cho cả phần đang chọn.</p>
    <span class="bcn-format-feedback" role="status" aria-live="polite"></span>`;
  const select = bar.querySelector('select');
  const status = bar.querySelector('[role="status"]');
  select.value = 'audience';

  function highlight() {
    stack.querySelectorAll('[data-format-part]').forEach(element => {
      const selected = active && element.dataset.formatPart === select.value;
      element.classList.toggle('bcn-format-selected', selected);
      element.setAttribute('aria-pressed', String(selected));
    });
  }

  function update() {
    const bulletin = root.querySelector('#bcnReportType').value === 'BANTIN_24H';
    for (const option of select.options) {
      option.hidden = bulletin && ['recipients', 'signature'].includes(option.value);
      option.disabled = option.hidden;
    }
    if (select.selectedOptions[0]?.disabled) select.value = 'title';
    bar.querySelectorAll('[data-format-align]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.formatAlign === alignment[select.value]));
    });
    highlight();
  }

  function choose(part) {
    if (!Object.hasOwn(reportAlignmentParts, part)) return;
    select.value = part;
    active = true;
    status.textContent = '';
    update();
  }

  function change(value) {
    alignment[select.value] = value;
    active = true;
    status.textContent = `${reportAlignmentParts[select.value].label}: ${reportAlignmentOptions[value].label}. `
      + 'Bấm Lưu lựa chọn để lưu cùng bản nháp.';
    update();
    onChange();
  }

  select.addEventListener('change', () => choose(select.value));
  bar.querySelectorAll('[data-format-align]').forEach(button => {
    button.addEventListener('click', () => change(button.dataset.formatAlign));
  });
  bar.querySelector('[data-format-default]').addEventListener('click', () => {
    change(reportAlignmentParts[select.value].default);
  });
  stack.addEventListener('click', event => {
    const part = event.target.closest('[data-format-part]');
    if (part) choose(part.dataset.formatPart);
  });
  stack.addEventListener('keydown', event => {
    const part = event.target.closest('[data-format-part]');
    if (part && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      choose(part.dataset.formatPart);
      bar.querySelector('[data-format-align][aria-pressed="true"]').focus();
    }
  });
  window.lucide?.createIcons({ root: bar });
  update();
  return {
    read: () => ({ ...alignment }),
    update,
    restore(value) {
      alignment = normalizeReportAlignment(value);
      active = false;
      status.textContent = '';
      update();
    }
  };
}
