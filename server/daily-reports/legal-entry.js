import { loadBundledLegalCatalogue, filterBundledArticles } from './bundled-legal-catalogue.js';
import { businessCodeGroup, matchesBusinessCode } from './business-codes.js';

const articleKey = article => `${article.article_code}:${article.clause_code || ''}`;
const referenceId = (version, article) => `${version.bundle_key}:${article.article_code}`;

export async function legalEntryOptions(client, day, businessCode) {
  const { rows } = await client.query(`select a.*,v.document_number,v.source_uri,v.status
    from daily_report_legal_articles a join daily_report_legal_versions v on v.id=a.version_id
    where v.status='PUBLISHED' and v.effective_from <= $1 and a.effective_from <= $1
      and (a.effective_to is null or a.effective_to >= $1) and a.business_codes ?| $2::text[]
    order by v.effective_from desc,v.published_at desc nulls last,v.created_at desc,a.id`,
  [day, businessCodeGroup(businessCode)]);
  const choices = new Map();
  for (const article of rows) {
    const key = articleKey(article);
    if (!choices.has(key)) choices.set(key, { ...article, source_kind: 'PUBLISHED' });
  }
  const catalogue = await loadBundledLegalCatalogue();
  for (const article of filterBundledArticles(catalogue.articles, { business_code: businessCode })) {
    const key = articleKey(article);
    if (!choices.has(key)) choices.set(key, { ...article, source_kind: 'REFERENCE',
      reference_id: referenceId(catalogue.version, article) });
  }
  return [...choices.values()].sort((left, right) =>
    articleKey(left).localeCompare(articleKey(right), 'vi', { numeric: true }));
}

// Bundled selections are source references, never automatically published legal versions.
// Keep an immutable source snapshot on the case; the approved article foreign key remains separate.
export async function resolveLegalSelection({ client, body, existing, day, businessCode, fail, validateArticle }) {
  if (existing && body.legal_article_id === undefined && body.legal_reference_id === undefined) {
    return { articleId: existing.legal_article_id, reference: existing.legal_reference };
  }
  const articleId = body.legal_article_id || null;
  const selectedReference = body.legal_reference_id || null;
  if (articleId && selectedReference) {
    fail(422, 'AMBIGUOUS_LEGAL_REFERENCE', 'Chỉ chọn một điều hoặc khoản pháp luật.');
  }
  if (articleId) {
    if (articleId !== existing?.legal_article_id) await validateArticle(client, articleId, day, businessCode);
    return { articleId, reference: null };
  }
  if (!selectedReference) return { articleId: null, reference: null };
  if (typeof selectedReference !== 'string' || selectedReference.length > 100) {
    fail(422, 'INVALID_BUNDLED_LEGAL_REFERENCE', 'Điều luật được chọn không hợp lệ.');
  }
  if (selectedReference === existing?.legal_reference?.reference_id) {
    return { articleId: null, reference: existing.legal_reference };
  }
  const { version, articles } = await loadBundledLegalCatalogue();
  const article = articles.find(value => referenceId(version, value) === selectedReference);
  if (!article || !matchesBusinessCode(article.business_codes, businessCode)) {
    fail(422, 'INVALID_BUNDLED_LEGAL_REFERENCE', 'Điều luật không tồn tại hoặc không thuộc hệ vụ việc đã chọn.');
  }
  return { articleId: null, reference: {
    reference_id: selectedReference, source_kind: 'REFERENCE', mapping_status: article.mapping_status,
    bundle_key: version.bundle_key, source_sha256: version.source_sha256,
    article_code: article.article_code, clause_code: article.clause_code, title: article.title,
    document_number: version.document_number, source_uri: version.source_uri, source_page: article.source_page
  } };
}
