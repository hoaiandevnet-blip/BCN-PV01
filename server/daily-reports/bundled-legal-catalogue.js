import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { BUSINESS_CODES } from './rules.js';
import { matchesBusinessCode } from './business-codes.js';

const directory = fileURLToPath(new URL('../data/legal/blhs-135-2025/', import.meta.url));
const sourceUrl = '/api/bao-cao-ngay/legal/bundled/source';
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
let cached;

export async function readBundledLegalCatalogue(root = directory) {
  const [manifestBuffer, catalogueBuffer, source] = await Promise.all([
    readFile(path.join(root, 'manifest.json')),
    readFile(path.join(root, 'catalogue.json')),
    readFile(path.join(root, 'source.pdf'))
  ]);
  const manifest = JSON.parse(manifestBuffer);
  if (sha256(catalogueBuffer) !== manifest.catalogue_sha256 || sha256(source) !== manifest.source_sha256) {
    throw new Error('Bundled legal catalogue checksum mismatch.');
  }
  const { version, articles } = JSON.parse(catalogueBuffer);
  if (version.status !== 'REFERENCE' || articles.length !== manifest.article_count
    || version.article_count !== articles.length || version.source_sha256 !== manifest.source_sha256) {
    throw new Error('Bundled legal catalogue metadata mismatch.');
  }
  const codes = new Set();
  for (const article of articles) {
    if (codes.has(article.article_code) || !article.title.startsWith('Tội ')
      || !article.business_codes.length || article.business_codes.some(code => !BUSINESS_CODES.includes(code))
      || !Number.isInteger(article.source_page) || article.source_page < 1 || article.source_page > version.source_pages) {
      throw new Error('Invalid bundled offence entry.');
    }
    codes.add(article.article_code);
  }
  return {
    version: { ...version, bundled: true, pdf_url: sourceUrl,
      catalogue_url: '/api/bao-cao-ngay/legal/bundled/download' },
    articles: articles.map(article => ({ ...article, bundled: true, status: 'REFERENCE',
      document_number: version.document_number, source_uri: version.source_uri,
      source_pdf_url: `${sourceUrl}#page=${article.source_page}` }))
  };
}

function load() {
  cached ||= readBundledLegalCatalogue().catch(error => {
    cached = null;
    throw error;
  });
  return cached;
}

export { load as loadBundledLegalCatalogue };

export function filterBundledArticles(articles, { q = '', business_code = '' } = {}) {
  const normalize = text => String(text).normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
  const term = normalize(q).replace(/^dieu\s+/, '');
  const articleQuery = /^\d+[a-z]?$/i.test(term);
  return articles.filter(article => (!business_code || matchesBusinessCode(article.business_codes, business_code))
    && (!term || (articleQuery ? article.article_code === term : normalize(article.title).includes(term))));
}

export function registerBundledLegalRoutes(app, { base, wrap, fail }) {
  app.get(`${base}/legal/bundled`, wrap(async (_req, res) => {
    res.json({ version: (await load()).version });
  }));
  app.get(`${base}/legal/bundled/articles`, wrap(async (req, res) => {
    const query = { q: String(req.query.q || ''), business_code: String(req.query.business_code || '') };
    if (query.q.length > 200 || (query.business_code && !BUSINESS_CODES.includes(query.business_code))) {
      fail(422, 'INVALID_LEGAL_SEARCH', 'Bộ lọc danh mục không hợp lệ.');
    }
    const catalogue = await load();
    res.json({ articles: filterBundledArticles(catalogue.articles, query), version: catalogue.version });
  }));
  app.get(`${base}/legal/bundled/source`, wrap(async (_req, res) => {
    await load();
    res.type('application/pdf');
    res.set('Content-Disposition', 'inline; filename="135-vbhn-vpqh.pdf"');
    res.sendFile(path.join(directory, 'source.pdf'));
  }));
  app.get(`${base}/legal/bundled/download`, wrap(async (_req, res) => {
    const catalogue = await load();
    res.attachment('danh-muc-toi-danh-135-vbhn-vpqh.json');
    res.json(catalogue);
  }));
}
