import { legalEntryOptions, resolveLegalSelection } from '../legal-entry.js';

const key = article => article.source_kind === 'REFERENCE'
  ? `reference:${article.reference_id}` : `published:${article.id}`;
const label = article => `Điều ${article.article_code}`
  + (article.clause_code ? `, khoản ${article.clause_code}` : '') + ` — ${article.title}`;

export async function referenceCaseLegal({ client, body, validated, previous, day, fail }) {
  const info = body.reference_info;
  const requested = info.case_types ?? (info.case_type_key ? [{ key: info.case_type_key }]
    : info.case_type ? [{ key: '__legacy_saved' }] : []);
  if (!Array.isArray(requested) || requested.length > 100
    || requested.some(entry => !entry || typeof entry.key !== 'string' || entry.key.length > 160)) {
    fail(422, 'INVALID_CASE_TYPE', 'Danh sách loại vụ việc không hợp lệ (tối đa 100 điều).');
  }
  const keys = requested.map(entry => entry.key);
  if (new Set(keys).size !== keys.length) fail(422, 'DUPLICATE_CASE_TYPE', 'Không chọn trùng điều luật.');
  const old = previous?.reference_info;
  const saved = previous?.business_code === validated.business
    ? old?.case_types || (old?.case_type ? [{ key: old.case_type_key || '__legacy_saved', label: old.case_type }] : [])
    : [];
  const oldSelections = previous?.classifications?.[0]?.legal_selections || [];
  const options = requested.length ? await legalEntryOptions(client, day, validated.business) : [];
  const types = [];
  const selections = [];
  for (const selected of keys) {
    const article = options.find(entry => key(entry) === selected);
    if (article) {
      const resolved = article.source_kind === 'REFERENCE'
        ? await resolveLegalSelection({ client, body: { legal_reference_id: article.reference_id },
          day, businessCode: validated.business, fail }) : { articleId: article.id, reference: null };
      types.push({ key: selected, label: label(article) });
      selections.push({ legal_article_id: resolved.articleId, legal_reference: resolved.reference });
      continue;
    }
    const index = saved.findIndex(entry => entry.key === selected);
    if (index < 0) {
      fail(422, 'CASE_TYPE_DOMAIN_MISMATCH', 'Điều luật không thuộc lĩnh vực đã chọn hoặc không còn hiệu lực.');
    }
    types.push(saved[index]);
    const historical = [...oldSelections, {
      legal_article_id: previous.legal_article_id, legal_reference: previous.legal_reference
    }];
    const stored = historical.find(entry => (entry.legal_reference
      ? `reference:${entry.legal_reference.reference_id}` : `published:${entry.legal_article_id}`) === selected);
    if (stored?.legal_article_id || stored?.legal_reference) selections.push(stored);
  }
  validated.info.case_types = types;
  validated.info.case_type = types.map(entry => entry.label).join('; ');
  validated.info.case_type_key = types[0]?.key === '__legacy_saved' ? '' : types[0]?.key || '';
  return { articleId: selections[0]?.legal_article_id || null,
    reference: selections[0]?.legal_reference || null, selections };
}
