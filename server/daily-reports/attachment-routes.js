import { attachmentSources, prepareAttachments, storeAttachments, listAttachments } from './attachments.js';

export function registerAttachmentRoutes(app, services) {
  const { base, pool, wrap, fail, audit, transaction, canAccessUnit, hasRole,
    reportingScope, dateKey, clock } = services;
  async function load(client, req, resource, id, lock = false) {
    const source = attachmentSources[resource];
    const { rows: [item] } = await client.query(`select * from ${source.table}
      where id=$1 ${lock ? 'for update' : ''}`, [id]);
    let unitId = item?.unit_id;
    if (item && resource === 'events') {
      const { rows: [parent] } = await client.query('select unit_id from daily_report_cases where id=$1',
        [item.case_id]);
      unitId = parent?.unit_id;
    }
    if (!item || !canAccessUnit(req.dailyActor, unitId)) {
      fail(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy văn bản trong phạm vi được phân công.');
    }
    const canEdit = resource !== 'events' && ['DRAFT', 'RETURNED'].includes(item[source.state])
      && hasRole(req.dailyActor, 'UNIT_REPORTER', unitId);
    return { item, unitId, canEdit, source };
  }
  async function writable(client, req, resource) {
    const target = await load(client, req, resource, req.params.id, true);
    if (!target.canEdit) fail(403, 'ATTACHMENT_READ_ONLY', 'Chỉ bổ sung văn bản khi hồ sơ đang nháp hoặc được trả lại.');
    await reportingScope(req.dailyActor, target.unitId, dateKey(target.item.report_day),
      target.source.kind, target.item.id, clock(), client);
    return target;
  }
  for (const [resource, source] of Object.entries(attachmentSources)) {
    const endpoint = `${base}/${resource}/:id/attachments`;
    app.get(endpoint, wrap(async (req, res) => {
      const target = await load(pool, req, resource, req.params.id);
      res.json({ attachments: await listAttachments(pool, resource, req.params.id), can_edit: target.canEdit });
    }));
    app.post(endpoint, wrap(async (req, res) => {
      const target = await load(pool, req, resource, req.params.id);
      const files = await prepareAttachments(req.body.attachments, { allowVideo: Boolean(target.item.reference_info) });
      if (!files.length) fail(422, 'ATTACHMENT_REQUIRED', 'Chọn ít nhất một văn bản.');
      await transaction(async client => {
        await writable(client, req, resource);
        await storeAttachments(client, resource, req.params.id, req.dailyActor.id, files);
        await client.query(`update ${source.table} set version=version+1,updated_at=now() where id=$1`,
          [req.params.id]);
        await audit(client, req, 'ATTACHMENT_ADDED', source.kind, req.params.id, 'ALLOW', { count: files.length });
      });
      res.status(201).json({ attachments: await listAttachments(pool, resource, req.params.id) });
    }));
    app.get(`${endpoint}/:attachmentId`, wrap(async (req, res) => {
      await load(pool, req, resource, req.params.id);
      const { rows: [file] } = await pool.query(`select * from daily_report_attachments
        where id=$1 and ${source.column}=$2`, [req.params.attachmentId, req.params.id]);
      if (!file) fail(404, 'ATTACHMENT_NOT_FOUND', 'Không tìm thấy văn bản.');
      const inline = req.query.inline === '1'
        && ['application/pdf', 'image/png', 'image/jpeg', 'video/mp4', 'video/quicktime', 'video/webm']
          .includes(file.media_type);
      res.set('Content-Type', file.media_type);
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Content-Security-Policy', "sandbox; default-src 'none'; media-src 'self'; img-src 'self'");
      res.set('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="document"; filename*=UTF-8''`
        + encodeURIComponent(file.file_name).replace(/['()]/g, char => '%' + char.charCodeAt(0).toString(16)));
      await audit(pool, req, 'ATTACHMENT_DOWNLOADED', source.kind, req.params.id,
        'ALLOW', { attachment_id: file.id });
      res.send(file.content);
    }));
    app.delete(`${endpoint}/:attachmentId`, wrap(async (req, res) => {
      await transaction(async client => {
        await writable(client, req, resource);
        const { rows: [file] } = await client.query(`select id,sealed_at from daily_report_attachments
          where id=$1 and ${source.column}=$2 for update`, [req.params.attachmentId, req.params.id]);
        if (!file) fail(404, 'ATTACHMENT_NOT_FOUND', 'Không tìm thấy văn bản.');
        if (file.sealed_at) fail(409, 'ATTACHMENT_SEALED', 'Văn bản đã gửi được giữ nguyên để đối chiếu.');
        await client.query('delete from daily_report_attachments where id=$1', [file.id]);
        await client.query(`update ${source.table} set version=version+1,updated_at=now() where id=$1`,
          [req.params.id]);
        await audit(client, req, 'ATTACHMENT_REMOVED', source.kind, req.params.id,
          'ALLOW', { attachment_id: file.id });
      });
      res.json({ ok: true });
    }));
  }
}
