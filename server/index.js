import express from 'express';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
import { prepareDatabase } from './bootstrap.js';
import { createSessionAuth, registerSessionRoutes, requireSameOrigin } from './session-auth.js';
import { registerAccountRoutes } from './accounts.js';
import { registerDirectoryRoutes } from './directory.js';
import { registerDailyReportRoutes } from './daily-reports/routes.js';
import { registerDigitalMapRoutes } from './digital-map.js';
import { registerMapTileRoutes } from './map-tiles.js';
import { registerSettingsRoutes } from './settings.js';
import { registerSeedyRoutes } from './seedy-ai/routes.js';
import { registerPublicAssets, securityHeaders } from './security.js';
import { createApplicationServer, transportSettings } from './transport.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', false);
const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const auth = createSessionAuth({ pool });
const parser = express.json({ limit: '10mb', inflate: false });
app.use(securityHeaders);
app.use((req, res, next) => req.path.startsWith('/api/bao-cao-ngay/') ? next() : parser(req, res, next));
registerSessionRoutes(app, { auth });
const { requireLogin } = registerAccountRoutes(app, { pool, auth, sameOrigin: requireSameOrigin, wrap });
registerSeedyRoutes(app, { auth, requireLogin, sameOrigin: requireSameOrigin });
registerDirectoryRoutes(app, { pool, auth, sameOrigin: requireSameOrigin, wrap });
registerSettingsRoutes(app, { pool, auth, sameOrigin: requireSameOrigin, wrap });
const daily = registerDailyReportRoutes(app, { pool, auth, requireSameOrigin,
  storageRoot: process.env.DAILY_REPORT_STORAGE_ROOT || path.join(root, '.private/report-files') });
app.use('/api/digital-map', requireSameOrigin, auth.requireAdmin);
registerDigitalMapRoutes(app, { pool, asyncHandler: wrap,
  getActor: req => req.cameraUser?.username || '',
  logActivity: async (req, event, client = pool) => {
    await client.query(`insert into activity_logs(actor_username,action,module_key,module_name,detail,metadata)
      values($1,$2,$3,$4,$5,$6::jsonb)`, [req.cameraUser.username, event.action,
      event.moduleKey, event.moduleName, event.detail, JSON.stringify(event.metadata || {})]);
  } });
app.use('/api/notifications', requireLogin, requireSameOrigin);
app.get('/api/notifications', wrap(async (req, res) => {
  const scope = req.account.notification_modules;
  const items = !Array.isArray(scope) || scope.includes('dailyReports') ? await daily.notificationFeed.list(req) : [];
  res.json({ items });
}));
app.post('/api/notifications/read-all', wrap(async (req, res) => {
  res.json({ ok: true, count: await daily.notificationFeed.markAllRead(req) });
}));
app.post('/api/notifications/:id/read', wrap(async (req, res) => {
  const id = String(req.params.id).startsWith('bcn:') ? req.params.id.slice(4) : '';
  if (!await daily.notificationFeed.markRead(req, id)) {
    return res.status(404).json({ error: 'Không tìm thấy thông báo.' });
  }
  res.json({ ok: true });
}));
app.get('/api/health', wrap(async (_req, res) => {
  await pool.query('select 1');
  res.json({ application: 'BCNPV01', status: 'ready' });
}));
registerMapTileRoutes(app, { cacheRoot: path.join(root, 'assets/map-tiles/standard') });
registerPublicAssets(app, root);
app.get('/', (_req, res) => res.sendFile(path.join(root, 'index.html')));
app.use((_req, res) => res.status(404).json({ error: 'Không tìm thấy tài nguyên.' }));
app.use((error, _req, res, _next) => {
  console.error(error.code || error.message);
  const status = error.status || (error.type === 'entity.too.large' ? 413 : 500);
  res.status(status).json({ error: status < 500 ? error.message : 'Không xử lý được yêu cầu. Vui lòng thử lại.' });
});
const transport = transportSettings();
await prepareDatabase(pool);
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 4310);
const server = createApplicationServer(app, transport);
server.listen(port, host, () => {
  console.log(`BCNPV01 ready at ${transport.protocol}://localhost:${port}`);
  if (host === '0.0.0.0') {
    const interfaces = os.networkInterfaces();
    for (const addrs of Object.values(interfaces)) {
      for (const addr of addrs || []) {
        if (addr.family === 'IPv4' && !addr.internal) {
          console.log(`Link mạng nội bộ (Wi-Fi/LAN): ${transport.protocol}://${addr.address}:${port}`);
        }
      }
    }
  }
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  auth.close();
  daily.close?.();
  server.close(() => pool.end().then(() => process.exit(0)));
});
