(() => {
  'use strict';
  const fields = ['death_count', 'injured_count', 'property_damage'];
  const digits = value => value.replace(/\D/g, '');
  const display = value => value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  window.DailyReportReferenceNumbers = {
    mount(form) {
      function format(input, raw, caret = null) {
        const value = raw.replace(/^0+(?=\d)/, '');
        const money = input.name === 'property_damage';
        input.value = value ? (money ? `${display(value)} đồng` : value) : '';
        input.setCustomValidity(value && !Number.isSafeInteger(Number(value))
          ? 'Giá trị vượt quá phạm vi số nguyên cho phép.' : '');
        if (caret !== null) {
          let position = 0;
          let count = 0;
          const end = money && value ? input.value.length - 5 : input.value.length;
          while (position < end && count < caret) {
            if (/\d/.test(input.value[position])) count++;
            position++;
          }
          input.setSelectionRange(position, position);
        }
      }
      for (const name of fields) {
        const input = form.elements[name];
        const money = name === 'property_damage';
        const clamp = () => {
          if (!money || !input.value || input.selectionStart !== input.selectionEnd) return;
          const end = input.value.length - 5;
          if (input.selectionStart > end) input.setSelectionRange(end, end);
        };
        input.addEventListener('keydown', event => {
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          if (event.key.length === 1 && !/^[0-9]$/.test(event.key)) event.preventDefault();
          if (/^[0-9]$/.test(event.key) || ['Backspace', 'Delete'].includes(event.key)) clamp();
        });
        input.addEventListener('beforeinput', event => {
          if (event.data && !/^[0-9]+$/.test(event.data)) event.preventDefault();
        });
        input.addEventListener('paste', event => {
          event.preventDefault();
          const value = event.clipboardData.getData('text').trim();
          const valid = money ? /^\d+(?:[.,]\d{3})*(?:\s*đồng)?$/iu.test(value) : /^\d+$/.test(value);
          if (!valid) return;
          clamp();
          const start = input.selectionStart;
          const end = input.selectionEnd;
          const before = digits(input.value.slice(0, start));
          const after = digits(input.value.slice(end));
          const pasted = digits(value);
          format(input, before + pasted + after, before.length + pasted.length);
        });
        input.addEventListener('input', () => {
          const caret = digits(input.value.slice(0, input.selectionStart)).length;
          format(input, digits(input.value), caret);
        });
        input.addEventListener('blur', () => format(input, digits(input.value)));
      }
      return {
        reset(info) {
          for (const name of fields) format(form.elements[name], String(info[name] ?? ''));
        },
        read() {
          return Object.fromEntries(fields.map(name => [name, digits(form.elements[name].value) || null]));
        }
      };
    }
  };
})();
