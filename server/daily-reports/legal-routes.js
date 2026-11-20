import { randomUUID } from 'node:crypto';
import { BUSINESS_CODES } from './rules.js';
import { registerBundledLegalRoutes } from './bundled-legal-catalogue.js';
import { legalEntryOptions } from './legal-entry.js';
import { businessCodeGroup } from './business-codes.js';

const domains = new Set(BUSINESS_CODES);

export function registerLegalRoutes(app, services) {
  registerBundledLegalRoutes(app, services);
  const { base, pool, wrap, requireRole, fail, cleanText, requireDay, transaction, audit } = services;
  const isManager = user => user.is_admin || user.roles.some(role =>
    ['BCN_ADMIN', 'LEGAL_REVIEWER'].includes(role.role_code));
  const announce = async (client, topic, id) => {
    await client.query(`insert into daily_report_outbox
      (event_key,event_type,recipient_user_id,resource_type,resource_id)
      select $1||':'||$2||':'||user_id,$1,user_id,'LEGAL_VERSION',$2
      from (select user_id from daily_report_user_roles where role_code='LEGAL_REVIEWER'
        union select id from users where is_admin and not is_deleted and status='Hoạt động') recipients
      on conflict(event_key) do nothing`, [topic, id]);
  };
  app.post(`${base}/legal/import-drafts`, requireRole('BCN_ADMIN', 'LEGAL_REVIEWER'), wrap(async (req, res) => {
    const articles = req.body?.articles;
    if (!Array.isArray(articles) || !articles.length || articles.length > 5000) {
      fail(422, 'INVALID_ARTICLES', 'Danh mục phải có từ 1 đến 5000 điều/khoản.');
    }
    const seen = new Set();
    const validated = articles.map(item => {
      const article = {
        article_code: cleanText(item.article_code, 40, 'Điều', true),
        clause_code: cleanText(item.clause_code, 40, 'Khoản'),
        title: cleanText(item.title, 500, 'Tên tội danh', true),
        chapter: cleanText(item.chapter, 200, 'Chương'),
        article_text: cleanText(item.article_text, 80000, 'Nội dung điều luật'),
        amendment_note: cleanText(item.amendment_note, 2000, 'Ghi chú sửa đổi'),
        effective_from: requireDay(item.effective_from || req.body.effective_from),
        effective_to: item.effective_to ? requireDay(item.effective_to) : null,
        business_codes: [...new Set(Array.isArray(item.business_codes) ? item.business_codes : [])].sort()
      };
      if (article.effective_to && article.effective_to < article.effective_from) {
        fail(422, 'INVALID_EFFECTIVE_RANGE', 'Khoảng hiệu lực điều luật không hợp lệ.');
      }
      if (!article.business_codes.length || article.business_codes.some(code => !domains.has(code))) {
        fail(422, 'INVALID_MAPPING', 'Phải chỉ định hệ nghiệp vụ hợp lệ theo thẩm định.');
      }
      const key = `${article.article_code}:${article.clause_code}`;
      if (seen.has(key)) fail(422, 'DUPLICATE_ARTICLE', 'Trùng điều/khoản trong cùng phiên bản.');
      seen.add(key);
      return article;
    });
    const result = await transaction(async client => {
      const previous = await client.query(`select * from daily_report_legal_articles where version_id=
        (select id from daily_report_legal_versions where status='PUBLISHED'
          order by effective_from desc,published_at desc limit 1)`);
      const oldByCode = new Map(previous.rows.map(item => [`${item.article_code}:${item.clause_code}`, item]));
      const diff = { added: [], changed: [], retired: [], requires_review: true };
      for (const article of validated) {
        const key = `${article.article_code}:${article.clause_code}`;
        const old = oldByCode.get(key);
        if (!old) diff.added.push(key);
        else if (Object.keys(article).some(field => {
          const value = old[field] instanceof Date ? services.dateKey(old[field]) : old[field];
          return JSON.stringify(value) !== JSON.stringify(article[field]);
        })) diff.changed.push(key);
        oldByCode.delete(key);
      }
      diff.retired = [...oldByCode.keys()];
      const id = randomUUID();
      const { rows } = await client.query(`insert into daily_report_legal_versions
        (id,title,document_number,source_uri,checksum,imported_by,effective_from,diff,supersedes_id)
        values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) returning *`,
      [id, cleanText(req.body.title, 300, 'Tên văn bản', true),
        cleanText(req.body.document_number, 100, 'Số văn bản', true),
        cleanText(req.body.source_uri, 1000, 'Nguồn văn bản', true),
        cleanText(req.body.checksum, 128, 'Checksum nguồn', true), req.dailyActor.id,
        requireDay(req.body.effective_from), JSON.stringify(diff), req.body.supersedes_id || null]);
      for (const article of validated) {
        await client.query(`insert into daily_report_legal_articles
          (id,version_id,article_code,clause_code,title,chapter,amendment_note,effective_from,effective_to,business_codes,article_text)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
        [randomUUID(), id, article.article_code, article.clause_code, article.title, article.chapter,
          article.amendment_note, article.effective_from, article.effective_to, JSON.stringify(article.business_codes), article.article_text]);
      }
      await audit(client, req, 'LEGAL_IMPORTED', 'LEGAL_VERSION', id, 'ALLOW', { article_count: validated.length });
      await announce(client, 'LEGAL_CATALOG_PENDING_REVIEW', id);
      return { version: rows[0], diff };
    });
    res.status(201).json(result);
  }));
  app.post(`${base}/legal/versions/:id/discard`, requireRole('BCN_ADMIN', 'LEGAL_REVIEWER'), wrap(async (req, res) => {
    const result = await pool.query(`update daily_report_legal_versions set status='RETIRED'
      where id=$1 and status='DRAFT' and imported_by=$2 returning id`, [req.params.id, req.dailyActor.id]);
    if (!result.rowCount) fail(409, 'LEGAL_STATE_CONFLICT', 'Chỉ được hủy bản nháp do mình nhập.');
    await audit(pool, req, 'LEGAL_DRAFT_DISCARDED', 'LEGAL_VERSION', req.params.id);
    res.json({ version: result.rows[0] });
  }));
  app.get(`${base}/legal/versions`, wrap(async (req, res) => {
    const { rows } = await pool.query(`select * from daily_report_legal_versions
      where $1::boolean or status='PUBLISHED' order by created_at desc limit 200`, [isManager(req.dailyActor)]);
    res.json({ versions: rows });
  }));
  app.get(`${base}/legal/entry-options`, wrap(async (req, res) => {
    const day = requireDay(req.query.effective_on);
    const businessCode = String(req.query.business_code || '');
    if (!domains.has(businessCode)) fail(422, 'INVALID_BUSINESS_CODE', 'Hệ vụ việc không hợp lệ.');
    res.json({ articles: await legalEntryOptions(pool, day, businessCode) });
  }));
  app.get(`${base}/legal/articles`, wrap(async (req, res) => {
    const effective = req.query.effective_on ? requireDay(req.query.effective_on) : null;
    const result = await pool.query(`select a.*,v.document_number,v.source_uri,v.status
      from daily_report_legal_articles a join daily_report_legal_versions v on v.id=a.version_id
      where ($1::uuid is null or a.version_id=$1)
        and ($2::text is null or a.title ilike '%'||$2||'%' or a.article_code=$2)
        and ($3::boolean or v.status='PUBLISHED')
        and ($4::date is null or (v.effective_from <= $4 and a.effective_from <= $4
          and (a.effective_to is null or a.effective_to >= $4)))
        and ($5::text[] is null or a.business_codes ?| $5::text[])
      order by a.article_code,a.clause_code limit 5000`,
    [req.query.version_id || null, req.query.q || null, isManager(req.dailyActor), effective,
      req.query.business_code ? businessCodeGroup(req.query.business_code) : null]);
    res.json({ articles: result.rows });
  }));
  for (const [action, from, to] of [['review', 'DRAFT', 'REVIEWED'], ['publish', 'REVIEWED', 'PUBLISHED']]) {
    app.post(`${base}/legal/versions/:id/${action}`, requireRole('LEGAL_REVIEWER'), wrap(async (req, res) => {
      const version = await transaction(async client => {
        const result = await client.query(`select * from daily_report_legal_versions where id=$1 for update`,
          [req.params.id]);
        const item = result.rows[0];
        if (!item || item.status !== from || Number(item.imported_by) === Number(req.dailyActor.id)) {
          fail(409, 'LEGAL_REVIEW_CONFLICT', 'Trạng thái không hợp lệ hoặc người nhập không thể tự thẩm định.');
        }
        if (action === 'publish' && req.body.effective_from
          && requireDay(req.body.effective_from) !== services.dateKey(item.effective_from)) {
          fail(409, 'REVIEWED_EFFECTIVE_DATE_IMMUTABLE', 'Ngày hiệu lực đã thẩm định; tạo bản nháp mới để sửa.');
        }
        await client.query(action === 'review'
          ? `update daily_report_legal_versions set status=$2,reviewed_by=$3 where id=$1`
          : `update daily_report_legal_versions set status=$2,published_by=$3,published_at=now() where id=$1`,
        [item.id, to, req.dailyActor.id]);
        await audit(client, req, `LEGAL_${to}`, 'LEGAL_VERSION', item.id);
        if (action === 'publish') await announce(client, 'LEGAL_VERSION_PUBLISHED', item.id);
        return { ...item, status: to };
      });
      res.json({ version });
    }));
  }
  app.post(`${base}/legal/versions/:id/rollback`, requireRole('LEGAL_REVIEWER'), wrap(async (req, res) => {
    const reason = cleanText(req.body.reason, 2000, 'Lý do rollback', true);
    const version = await transaction(async client => {
      const { rows: [item] } = await client.query(`select * from daily_report_legal_versions where id=$1 for update`,
        [req.params.id]);
      if (!item || item.status !== 'PUBLISHED') fail(409, 'LEGAL_STATE_CONFLICT', 'Phiên bản chưa công bố.');
      const linked = await client.query(`select 1 from daily_report_cases c
        join daily_report_legal_articles a on a.id=c.legal_article_id or exists (
          select 1 from jsonb_array_elements(c.classifications) g,
            jsonb_array_elements(g->'legal_selections') s where s->>'legal_article_id'=a.id::text)
        where a.version_id=$1 limit 1`, [item.id]);
      if (linked.rowCount) fail(409, 'LEGAL_VERSION_IN_USE', 'Đã có hồ sơ liên kết; phải tạo phiên bản sửa đổi.');
      await client.query(`update daily_report_legal_versions set status='RETIRED' where id=$1`, [item.id]);
      // Earlier published versions remain available; nothing in historical records is rewritten.
      await audit(client, req, 'LEGAL_ROLLED_BACK', 'LEGAL_VERSION', item.id, 'ALLOW', { reason });
      return { id: item.id, status: 'RETIRED' };
    });
    res.json({ version });
  }));
}
