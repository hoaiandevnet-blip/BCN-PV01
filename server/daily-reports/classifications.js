import { BUSINESS_CODES } from './rules.js';
import { canonicalBusinessCode } from './business-codes.js';
import { resolveLegalSelection } from './legal-entry.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function caseClassifications(item) {
  if (item?.classifications?.length) return item.classifications;
  if (!item?.business_code) return [];
  return [{ business_code: canonicalBusinessCode(item.business_code), legal_selections:
    item.legal_article_id || item.legal_reference ? [{ legal_article_id: item.legal_article_id || null,
      legal_reference: item.legal_reference || null }] : [] }];
}

export function classificationCodes(item) {
  return caseClassifications(item).map(group => canonicalBusinessCode(group.business_code));
}

export async function resolveClassifications({ client, body, existing, day, fail, validateArticle }) {
  const previous = caseClassifications(existing);
  let input = body.classifications;
  if (input === undefined) {
    if (existing && body.legal_article_id === undefined && body.legal_reference_id === undefined) return previous;
    if (existing && (previous.length > 1 || previous.some(group => group.legal_selections.length > 1))) {
      fail(422, 'CLASSIFICATIONS_REQUIRED', 'Hồ sơ có nhiều lựa chọn; hãy tải lại form để cập nhật đầy đủ điều luật.');
    }
    input = [{ business_code: existing?.business_code || body.business_code, legal_selections:
      body.legal_article_id || body.legal_reference_id ? [body] : [] }];
  }
  if (!Array.isArray(input) || !input.length || input.length > BUSINESS_CODES.length) {
    fail(422, 'INVALID_CLASSIFICATIONS', 'Vui lòng chọn ít nhất một hệ vụ việc hợp lệ.');
  }
  const seen = new Set();
  const groups = [];
  for (const group of input) {
    const code = canonicalBusinessCode(group?.business_code);
    if (!BUSINESS_CODES.includes(code) || seen.has(code)) {
      fail(422, 'INVALID_BUSINESS_CODE', 'Hệ vụ việc không hợp lệ hoặc đã được chọn.');
    }
    seen.add(code);
    if (!Array.isArray(group.legal_selections) || group.legal_selections.length > 100) {
      fail(422, 'INVALID_LEGAL_SELECTIONS', 'Mỗi hệ được chọn tối đa 100 điều / khoản pháp luật.');
    }
    const old = previous.find(value => canonicalBusinessCode(value.business_code) === code);
    const selections = [];
    const keys = new Set();
    for (const selection of group.legal_selections) {
      if (!selection || typeof selection !== 'object' || Array.isArray(selection)
        || (!selection.legal_article_id && !selection.legal_reference_id)
        || (selection.legal_article_id && !uuid.test(selection.legal_article_id))) {
        fail(422, 'INVALID_LEGAL_SELECTION', 'Điều / khoản được chọn không hợp lệ.');
      }
      const key = selection.legal_article_id || selection.legal_reference_id;
      if (keys.has(key)) fail(422, 'DUPLICATE_LEGAL_SELECTION', 'Không chọn lặp lại cùng một điều / khoản trong một hệ.');
      keys.add(key);
      const saved = old?.legal_selections.find(value => selection.legal_article_id
        ? value.legal_article_id === selection.legal_article_id
        : value.legal_reference?.reference_id === selection.legal_reference_id);
      const resolved = await resolveLegalSelection({ client, body: selection, existing: saved,
        day, businessCode: code, fail, validateArticle });
      let article = saved?.article_snapshot || null;
      if (resolved.articleId && !article) {
        const { rows } = await client.query(`select a.article_code,a.clause_code,a.title,v.document_number,
          a.version_id,v.source_uri from daily_report_legal_articles a
          join daily_report_legal_versions v on v.id=a.version_id where a.id=$1`, [resolved.articleId]);
        article = rows[0] || null;
      }
      selections.push({ legal_article_id: resolved.articleId, legal_reference: resolved.reference,
        article_snapshot: article });
    }
    groups.push({ business_code: code, legal_selections: selections });
  }
  return groups;
}

export function primaryClassification(groups) {
  const first = groups[0];
  const legal = first.legal_selections[0];
  return { businessCode: first.business_code, articleId: legal?.legal_article_id || null,
    reference: legal?.legal_reference || null };
}

export async function ensureClassificationSchema(pool) {
  await pool.query(`alter table daily_report_cases
    add column if not exists classifications jsonb not null default '[]'::jsonb`);
  // Additive migration: preserve old links and snapshots without changing case versions or submissions.
  await pool.query(`update daily_report_cases set classifications=jsonb_build_array(jsonb_build_object(
    'business_code',business_code,'legal_selections',case
      when legal_article_id is null and legal_reference is null then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object('legal_article_id',legal_article_id,
        'legal_reference',legal_reference)) end)) where classifications='[]'::jsonb`);
  await pool.query(`create index if not exists daily_report_case_classifications_idx
    on daily_report_cases using gin(classifications jsonb_path_ops)`);
}
