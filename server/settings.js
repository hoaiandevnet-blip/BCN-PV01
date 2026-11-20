import { appearanceDefaults, validAppearance } from '../assets/js/standalone/palettes.js';

export async function ensureSettingsSchema(pool) {
  await pool.query(`
    create table if not exists bcn_system_settings (
      id smallint primary key check (id = 1),
      palette text not null default 'charcoal',
      mode text not null default 'dark' check (mode in ('light', 'dark')),
      revision integer not null default 1,
      updated_by text,
      updated_at timestamptz not null default now()
    );
    insert into bcn_system_settings(id) values(1) on conflict(id) do nothing;
    insert into modules(module_key, name, icon, is_admin_only)
      values('settings', 'Cài đặt', 'settings', true)
      on conflict(module_key) do update set is_admin_only = true;
  `);
}

export function registerSettingsRoutes(app, { pool, auth, sameOrigin, wrap }) {
  app.get('/api/appearance', wrap(async (_req, res) => {
    const { rows } = await pool.query('select palette, mode, revision from bcn_system_settings where id = 1');
    res.json(rows[0] || appearanceDefaults);
  }));
  app.use('/api/settings', sameOrigin, auth.requireAdmin);
  app.get('/api/settings', wrap(async (_req, res) => {
    const { rows } = await pool.query('select * from bcn_system_settings where id = 1');
    res.json(rows[0]);
  }));
  app.put('/api/settings', wrap(async (req, res) => {
    const value = req.body;
    if (!validAppearance(value) || !Number.isSafeInteger(value.revision) || value.revision < 1 ||
      Object.keys(value).some(key => !['palette', 'mode', 'revision'].includes(key))) {
      return res.status(400).json({ error: 'Chọn bộ màu và chế độ hiển thị hợp lệ.' });
    }
    const client = await pool.connect();
    try {
      await client.query('begin');
      const { rows } = await client.query(`update bcn_system_settings
        set palette = $1, mode = $2, revision = revision + 1, updated_by = $3, updated_at = now()
        where id = 1 and revision = $4 returning *`,
      [value.palette, value.mode, req.cameraUser.username, value.revision]);
      if (!rows.length) {
        await client.query('rollback');
        return res.status(409).json({ error: 'Cài đặt vừa được thay đổi. Mở lại mục Cài đặt trước khi lưu.' });
      }
      await client.query(`insert into activity_logs(actor_username, action, module_key, module_name, detail, metadata)
        values($1, 'UPDATE', 'settings', 'Cài đặt', 'Cập nhật màu giao diện hệ thống', $2::jsonb)`,
      [req.cameraUser.username, JSON.stringify({ palette: value.palette, mode: value.mode })]);
      await client.query('commit');
      res.json(rows[0]);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }));
}
