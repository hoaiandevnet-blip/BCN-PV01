(() => {
  'use strict';
  const model = import('./daily-reports-document-model.mjs?v=20261029-clean-report');
  const formatting = import('./daily-reports-document-format.mjs');
  window.DailyReportsPreview = {
    async render(root, options) {
      const { buildReportModel } = await model;
      const { reportAlignmentParts, reportAlignmentIndent } = await formatting;
      const ui = window.DailyReportsUI;
      const value = buildReportModel(options);
      const stack = root.querySelector('#bcnPaperStack');
      const format = (node, part) => {
        if (!part) return;
        node.dataset.formatPart = part;
        node.style.textAlign = value.alignment[part];
        node.style.textIndent = reportAlignmentIndent(part, value.alignment[part]) ? '12.7mm' : '0';
        node.tabIndex = 0;
        node.setAttribute('role', 'button');
        node.setAttribute('aria-label', 'Căn chỉnh: ' + reportAlignmentParts[part].label);
      };
      const paragraph = (text, className = '', part = '') => {
        const node = document.createElement('p');
        node.className = 'bcn-paper-block ' + className;
        node.textContent = text;
        format(node, part);
        return node;
      };
      const blocks = [];
      if (!value.bulletin) {
        const header = document.createElement('div');
        header.className = 'bcn-letterhead';
        header.innerHTML = `<div>${ui.escape(value.issuer)}<br><strong>${ui.escape(value.organization)}</strong>
          <hr><p>Số: ${ui.escape(value.number)}</p>
          <b>${ui.escape(value.values.classification === 'KHÔNG MẬT' ? '' : value.values.classification)}</b></div>
          <div><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br><strong>Độc lập - Tự do - Hạnh phúc</strong><hr>
          <p><i>${ui.escape(value.dateText)}</i></p></div>`;
        blocks.push(header);
      }
      blocks.push(paragraph(value.title, 'bcn-paper-title', 'title'),
        paragraph(value.subtitle, 'bcn-paper-subtitle', 'subtitle'));
      if (value.values.audience) blocks.push(paragraph(value.values.audience, 'bcn-paper-audience', 'audience'));
      for (const [index, block] of value.blocks.entries()) {
        const ending = !value.bulletin && index === value.blocks.length - 1;
        blocks.push(paragraph(block.text, block.kind === 'heading' ? 'bcn-paper-heading'
          : 'bcn-paper-text' + (ending ? ' bcn-paper-ending' : ''), block.kind === 'heading' ? 'heading' : 'body'));
      }
      if (!value.bulletin) {
        const signature = document.createElement('div');
        signature.className = 'bcn-paper-signature';
        signature.innerHTML = `<div><strong><i>Nơi nhận:</i></strong><p>${ui.escape(value.values.recipients)}</p></div>
          <div><strong>${value.signerLines.map(ui.escape).join('<br>')}</strong><div class="bcn-signature-space"></div>
          <strong>${ui.escape(value.signerName || '[CHƯA CHỌN NGƯỜI KÝ]')}</strong></div>`;
        format(signature.children[0], 'recipients');
        format(signature.children[1], 'signature');
        blocks.push(signature);
      }
      stack.replaceChildren();
      let pageNumber = 0;
      const newPage = () => {
        pageNumber += 1;
        const page = document.createElement('section');
        page.className = 'bcn-paper' + (value.bulletin ? ' is-bulletin' : '');
        const number = document.createElement('span');
        number.className = 'bcn-paper-number';
        number.textContent = pageNumber > 1 ? String(pageNumber) : '';
        const content = document.createElement('div');
        content.className = 'bcn-paper-content';
        page.append(number, content);
        stack.append(page);
        return content;
      };
      let page = newPage();
      const fits = () => page.scrollHeight <= page.clientHeight + 1;
      for (const [index, block] of blocks.entries()) {
        page.append(block);
        if (!fits() && page.children.length > 1) {
          block.remove();
          page = newPage();
          page.append(block);
        }
        if (!fits() && block.classList.contains('bcn-paper-text')) {
          let words = block.textContent.split(/\s+/u);
          block.remove();
          while (words.length) {
            const part = paragraph('', block.className, 'body');
            page.append(part);
            let low = 1;
            let high = words.length;
            let count = 1;
            while (low <= high) {
              const middle = Math.floor((low + high) / 2);
              part.textContent = words.slice(0, middle).join(' ');
              if (fits()) {
                count = middle;
                low = middle + 1;
              } else high = middle - 1;
            }
            part.textContent = words.splice(0, count).join(' ');
            if (words.length) page = newPage();
          }
        }
        const keepNext = block.classList.contains('bcn-paper-heading') || block.classList.contains('bcn-paper-ending');
        if (keepNext && blocks[index + 1] && page.children.length > 1) {
          const probe = blocks[index + 1].cloneNode(true);
          page.append(probe);
          const overflow = !fits();
          probe.remove();
          if (overflow) {
            block.remove();
            page = newPage();
            page.append(block);
          }
        }
      }
      root.querySelector('#bcnPreviewStatus').textContent = `${pageNumber} trang xem trước · Bản nháp chưa ký`;
    }
  };
})();
