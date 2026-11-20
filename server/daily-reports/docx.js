import { BorderStyle, Document, Paragraph, Table, TableCell, TableRow, TextRun,
  Header, PageNumber, AlignmentType, WidthType } from 'docx';
import { buildReportModel, templates } from '../../assets/js/daily-reports-document-model.mjs';
import { reportAlignmentIndent } from '../../assets/js/daily-reports-document-format.mjs';

const run = (text, options = {}) => new TextRun({ text, font: 'Times New Roman', size: 28, ...options });
const paragraph = (text, options = {}) => new Paragraph({
  alignment: options.alignment || AlignmentType.JUSTIFIED,
  spacing: { line: 276, after: 120, ...(options.spacing || {}) },
  indent: options.indent === false ? undefined : { firstLine: 720 },
  keepNext: options.keepNext || false,
  widowControl: true,
  children: [run(text, { bold: options.bold || false, italics: options.italics || false, size: options.size || 28 })]
});
const centered = (text, options = {}) => paragraph(text, {
  alignment: AlignmentType.CENTER, indent: false, spacing: { after: 40 }, ...options
});
const borders = Object.fromEntries(['top', 'bottom', 'left', 'right', 'insideHorizontal', 'insideVertical']
  .map(side => [side, { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }]));
function twoColumns(left, right, widths, cantSplit = true) {
  return new Table({
    width: { size: widths.reduce((sum, width) => sum + width, 0), type: WidthType.DXA },
    columnWidths: widths,
    borders,
    rows: [new TableRow({ cantSplit, children: [left, right].map((children, index) => new TableCell({
      width: { size: widths[index], type: WidthType.DXA },
      margins: { top: 0, bottom: 0, left: 65, right: 65 },
      borders,
      children
    })) })]
  });
}

export function createDailyReportDocument(options) {
  const model = buildReportModel(options);
  const formatting = part => ({
    alignment: model.alignment[part] === 'justify' ? AlignmentType.JUSTIFIED : model.alignment[part],
    indent: reportAlignmentIndent(part, model.alignment[part])
  });
  if (model.signature && !options.signer) throw new Error('Báo cáo này yêu cầu chọn người ký.');
  const children = [];
  // A4 210 × 297 mm; 1 inch = 25.4 mm = 1440 twips.
  const mm = value => Math.round(value * 1440 / 25.4);
  const left = model.bulletin ? mm(20) : mm(30);
  const usable = mm(210) - left - mm(20);
  if (!model.bulletin) {
    const firstWidth = Math.round(usable * .43);
    children.push(twoColumns([
      centered(model.issuer, { size: 24 }),
      centered(model.organization, { bold: true, size: 24 }),
      centered('________________', { size: 22 }),
      centered('Số: ' + model.number, { size: 26 }),
      ...(!model.values.classification || model.values.classification === 'KHÔNG MẬT' ? []
        : [centered(model.values.classification, { bold: true, size: 24 })])
    ], [
      centered('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { bold: true, size: 24 }),
      centered('Độc lập - Tự do - Hạnh phúc', { bold: true, size: 26 }),
      centered('________________________', { size: 22 }),
      centered(model.dateText, { italics: true, size: 26 })
    ], [firstWidth, usable - firstWidth]));
  }
  children.push(paragraph(model.title, { ...formatting('title'), bold: true,
    keepNext: true, spacing: { before: 240, after: 100 } }));
  children.push(paragraph(model.subtitle, { ...formatting('subtitle'), bold: true,
    spacing: { after: 240 }, keepNext: true }));
  if (model.values.audience) {
    for (const line of model.values.audience.split('\n')) {
      children.push(paragraph(line, { ...formatting('audience'), keepNext: true }));
    }
  }
  for (const [index, block] of model.blocks.entries()) {
    children.push(paragraph(block.text, { ...formatting(block.kind === 'heading' ? 'heading' : 'body'),
      bold: block.kind === 'heading',
      keepNext: block.kind === 'heading' || Boolean(model.signature && index === model.blocks.length - 1),
      spacing: { before: block.kind === 'heading' ? 120 : 0 } }));
  }
  if (model.signature) {
    const firstWidth = Math.round(usable * .45);
    children.push(paragraph('', { spacing: { after: 180 }, indent: false, keepNext: true }));
    children.push(twoColumns([
      paragraph('Nơi nhận:', { ...formatting('recipients'), bold: true, italics: true, size: 24 }),
      ...model.values.recipients.split('\n').filter(Boolean).map(text =>
        paragraph(text, { ...formatting('recipients'), size: 22, spacing: { after: 40 } }))
    ], [
      ...model.signerLines.map(text => centered(text, { ...formatting('signature'), bold: true, keepNext: true })),
      centered('', { spacing: { after: mm(27) } }),
      centered(model.signerName, { ...formatting('signature'), bold: true })
    ], [firstWidth, usable - firstWidth]));
  }
  return new Document({
    styles: { default: { document: {
      run: { font: 'Times New Roman', size: 28, color: '000000' },
      paragraph: { alignment: AlignmentType.JUSTIFIED }
    } } },
    sections: [{
      properties: {
        titlePage: true,
        page: { size: { width: mm(210), height: mm(297) },
          margin: { top: mm(20), bottom: mm(20), left, right: mm(20), header: mm(10), footer: mm(10) } }
      },
      headers: {
        first: new Header({ children: [new Paragraph('')] }),
        default: new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
          children: [new TextRun({ children: [PageNumber.CURRENT], font: 'Times New Roman', size: 26 })]
        })] })
      },
      children
    }]
  });
}

export function dailyReportTemplate(reportType) {
  return templates[reportType] || null;
}
