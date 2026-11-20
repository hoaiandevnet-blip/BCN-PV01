export function registerDirectoryRoutes(app, { pool, auth, sameOrigin, wrap }) {
  app.use('/api/manage-directory', sameOrigin, auth.requireAdmin);
  const kinds = new Set(['departments', 'teams', 'ranks', 'positions']);
  const save = async (req, res) => {
    const kind = req.params.kind;
    if (!kinds.has(kind)) return res.status(404).json({ error: 'Danh mục không tồn tại.' });
    const name = String(req.body.name || '').trim();
    if (!name || name.length > 200) return res.status(422).json({ error: 'Tên danh mục không hợp lệ.' });
    const values = { name };
    if (kind === 'departments') {
      values.unit_type = req.body.unit_type || 'Cấp phòng';
      values.parent_id = req.body.parent_id || null;
    }
    if (kind === 'teams') {
      values.department_id = req.body.department_id || null;
      values.parent_team_id = req.body.parent_team_id || null;
    }
    const keys = Object.keys(values);
    const client = await pool.connect();
    try {
      await client.query('begin');
      const parentColumn = kind === 'teams' ? 'parent_team_id' : kind === 'departments' ? 'parent_id' : null;
      if (parentColumn && values[parentColumn] && req.params.id) {
        const cycle = await client.query(`with recursive ancestry as (
          select id,${parentColumn} from ${kind} where id=$1
          union select t.id,t.${parentColumn} from ${kind} t join ancestry a on t.id=a.${parentColumn}
        ) select 1 from ancestry where id=$2`, [values[parentColumn], req.params.id]);
        if (cycle.rowCount) throw Object.assign(new Error('Không thể tạo vòng lặp đơn vị.'), { status: 422 });
      }
      const result = req.params.id
        ? await client.query(`update ${kind} set ${keys.map((key, index) => key + '=$' + (index + 1)).join(',')}
            where id=$${keys.length + 1} returning *`, [...Object.values(values), req.params.id])
        : await client.query(`insert into ${kind}(${keys.join(',')})
            values(${keys.map((_, index) => '$' + (index + 1)).join(',')}) returning *`, Object.values(values));
      await client.query('commit');
      res.status(req.params.id ? 200 : 201).json(result.rows[0]);
    } catch (error) {
      await client.query('rollback');
      if (['23505', '23503'].includes(error.code)) {
        error = Object.assign(new Error('Tên trùng hoặc đơn vị cấp trên không tồn tại.'), { status: 422 });
      }
      throw error;
    } finally {
      client.release();
    }
  };
  app.post('/api/manage-directory/:kind', wrap(save));
  app.put('/api/manage-directory/:kind/:id', wrap(save));
  app.delete('/api/manage-directory/:kind/:id', wrap(async (req, res) => {
    if (!kinds.has(req.params.kind)) return res.status(404).json({ error: 'Danh mục không tồn tại.' });
    try {
      await pool.query(`delete from ${req.params.kind} where id=$1`, [req.params.id]);
      res.json({ ok: true });
    } catch (error) {
      if (error.code === '23503') {
        return res.status(409).json({ error: 'Danh mục đang được dùng bởi tài khoản hoặc báo cáo; không thể xóa.' });
      }
      throw error;
    }
  }));
}
