export function registerLeaderDeletionRoutes(app, services) {
  const { base, wrap, requireRole, fail, transaction, audit } = services;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  async function remove(req, res, ids) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 500
      || ids.some(id => typeof id !== 'string' || !uuid.test(id))) {
      fail(422, 'INVALID_LEADER_SELECTION', 'Chọn từ 1 đến 500 lãnh đạo hợp lệ để xóa.');
    }
    const selected = [...new Set(ids.map(id => id.toLowerCase()))];
    const deleted = await transaction(async client => {
      const { rows } = await client.query(`select id from daily_report_leaders
        where id=any($1::uuid[]) and deleted_at is null order by id for update`, [selected]);
      if (rows.length !== selected.length) {
        fail(409, 'LEADER_DELETE_CONFLICT', 'Danh sách đã thay đổi. Hãy cập nhật danh sách rồi chọn lại.');
      }
      // Keep foreign keys and historical signer information; deleted entries never appear in the directory.
      await client.query('update daily_report_leaders set deleted_at=now() where id=any($1::uuid[])', [selected]);
      for (const item of rows) {
        await audit(client, req, 'LEADER_DELETED', 'LEADER', item.id, 'ALLOW', { batch_size: selected.length });
      }
      return rows.map(item => item.id);
    });
    res.json({ deleted_ids: deleted, deleted_count: deleted.length });
  }

  app.delete(`${base}/leaders`, requireRole('BCN_ADMIN'), wrap((req, res) => remove(req, res, req.body?.ids)));
  app.delete(`${base}/leaders/:id`, requireRole('BCN_ADMIN'), wrap((req, res) => remove(req, res, [req.params.id])));
}
