import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Packer } from 'docx';
import { createDailyReportDocument } from '../server/daily-reports/docx.js';
const run = promisify(execFile);
const renderer = process.env.DAILY_REPORT_DOCX_RENDERER;
if (!renderer) throw new Error('DAILY_REPORT_DOCX_RENDERER required');
const directory = path.resolve('outputs/daily-reports-qa');
await mkdir(directory, { recursive: true });
const document = createDailyReportDocument({ reportType: 'BCN_PV01', reportDay: '2026-10-28',
  signer: { full_name: 'Người ký giả kiểm tra phân trang', title: 'Trưởng phòng', rank_name: 'Cấp bậc giả' },
  items: Array.from({ length: 42 }, (_, index) => ({ included: true, section_code: 'NOI_DUNG',
    text: `Nội dung giả ${index + 1}. ` + 'Kiểm tra bố cục nhiều trang, phông chữ và ngắt dòng. '.repeat(4) })) });
const input = path.join(directory, 'BCN_MULTIPAGE.docx');
await writeFile(input, await Packer.toBuffer(document));
await run(renderer, ['--headless', '--convert-to', 'pdf', '--outdir', directory, input], { timeout: 45000 });
const binaries = path.dirname(renderer);
const textExtractor = path.resolve(binaries, '../../native/poppler/poppler/bin/pdftotext');
const pdf = path.join(directory, 'BCN_MULTIPAGE.pdf');
const info = await run(path.join(binaries, 'pdfinfo'), [pdf]);
const pages = Number(info.stdout.match(/Pages:\s+(\d+)/)?.[1]);
assert.ok(pages >= 3);
assert.match(info.stdout, /A4/);
const second = await run(textExtractor, ['-f', '2', '-l', '2', '-layout', pdf, '-']);
assert.match(second.stdout.trimStart(), /^2\s/);
const first = await run(textExtractor, ['-f', '1', '-l', '1', '-layout', pdf, '-']);
assert.doesNotMatch(first.stdout.trimStart(), /^1\s/);
await run(path.join(binaries, 'pdftoppm'), ['-png', '-f', '2', '-singlefile', '-scale-to', '1200', pdf,
  path.join(directory, 'multipage-page-2')]);
await run(path.join(binaries, 'pdftoppm'), ['-png', '-f', String(pages), '-singlefile', '-scale-to', '1200', pdf,
  path.join(directory, 'multipage-last-page')]);
const result = { status: 'PASS', at: new Date().toISOString(), pages, format: 'A4',
  first_page_without_number: true, page_two_number: 2, renderer: path.basename(renderer) };
await writeFile(path.join(directory, 'document-results.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
