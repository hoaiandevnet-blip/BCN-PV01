import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readBundledLegalCatalogue, filterBundledArticles } from '../server/daily-reports/bundled-legal-catalogue.js';

const catalogue = await readBundledLegalCatalogue();
const { version, articles } = catalogue;

test('official bundle covers all offence headings, including added articles, without general or repealed articles', () => {
  assert.equal(version.document_number, '135/VBHN-VPQH');
  assert.equal(version.source_pages, 277);
  assert.equal(articles.length, 315);
  assert.equal(new Set(articles.map(item => item.id)).size, 315);
  assert.equal(new Set(articles.map(item => item.chapter_code)).size, 14);
  const excluded = version.excluded_articles.map(item => item.article_code);
  assert.deepEqual(excluded, ['122', '292', '352', '367', '392']);
  const expected = new Set(Array.from({ length: 318 }, (_, index) => String(index + 108)));
  expected.add('217a');
  expected.add('256a');
  assert.deepEqual(new Set([...articles.map(item => item.article_code), ...excluded]), expected);
  assert.equal(articles.find(item => item.article_code === '173').title, 'Tội trộm cắp tài sản');
  assert.equal(articles.find(item => item.article_code === '194').title,
    'Tội sản xuất, buôn bán hàng giả là thuốc chữa bệnh, thuốc phòng bệnh');
  assert.equal(articles.find(item => item.article_code === '256a').title, 'Tội sử dụng trái phép chất ma túy');
});

test('lookup distinguishes article suffixes and searches Vietnamese without accents', () => {
  for (const q of ['Điều 173', '173', 'trộm cắp', 'TROM CAP']) {
    assert.deepEqual(filterBundledArticles(articles, { q }).map(item => item.article_code), ['173']);
  }
  assert.deepEqual(filterBundledArticles(articles, { q: 'Điều 256a' }).map(item => item.article_code), ['256a']);
  assert.deepEqual(filterBundledArticles(articles, { q: '256' }).map(item => item.article_code), ['256']);
  assert.equal(filterBundledArticles(articles, { q: 'không có tội danh này' }).length, 0);
  const drugs = filterBundledArticles(articles, { business_code: 'MA_TUY' });
  assert.equal(drugs.length, 14);
  assert.ok(drugs.some(item => item.article_code === '256a'));
  assert.equal(filterBundledArticles(articles, { q: '173', business_code: 'MA_TUY' }).length, 0);
});

test('reference entries preserve original source pages and do not claim reviewed mappings or effective dates', () => {
  assert.equal(version.status, 'REFERENCE');
  for (const item of articles) {
    assert.equal(item.mapping_status, 'SUGGESTED');
    assert.equal(item.effective_from, null);
    assert.equal(item.effective_to, null);
    assert.equal(item.article_text, '');
    assert.equal(item.source_pdf_url, `${version.pdf_url}#page=${item.source_page}`);
  }
  assert.equal(articles.find(item => item.article_code === '256a').source_page, 165);
});

test('portable bundle loads after copying to another directory and rejects damaged source or catalogue', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bcn-law-bundle-'));
  try {
    await cp(new URL('../server/data/legal/blhs-135-2025/', import.meta.url), directory, { recursive: true });
    assert.equal((await readBundledLegalCatalogue(directory)).articles.length, 315);
    await writeFile(path.join(directory, 'catalogue.json'), '{}');
    await assert.rejects(readBundledLegalCatalogue(directory), /checksum mismatch/);
    await cp(new URL('../server/data/legal/blhs-135-2025/catalogue.json', import.meta.url),
      path.join(directory, 'catalogue.json'));
    await writeFile(path.join(directory, 'source.pdf'), '%PDF damaged');
    await assert.rejects(readBundledLegalCatalogue(directory), /checksum mismatch/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
