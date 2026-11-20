import express from 'express';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { registerDailyReportRoutes } from '../../server/daily-reports/routes.js';
import { requireSameOrigin } from '../../server/session-auth.js';

export function createLocalRunner(pool, storageRoot) {
  let currentTime = new Date('2026-11-19T08:15:00+07:00');
  const actor = Symbol('local-test-account');
  const app = express();

  const auth = {
    resolve: async req => (await pool.query(`select id, username, is_admin, status from users
      where username = $1 and not is_deleted and status = 'Hoạt động'`, [req[actor]])).rows[0] || null
  };

  const daily = registerDailyReportRoutes(app, {
    pool,
    auth,
    requireSameOrigin,
    storageRoot,
    clock: () => currentTime,
    scheduleMaintenance: false
  });

  app.use((_req, res) => res.status(404).json({ error: 'Không tìm thấy thao tác.' }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({
    error: error.message,
    code: error.code
  }));

  const request = (username, endpoint, { method = 'GET', body } = {}) => new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const req = new IncomingMessage(new Socket());
    req[actor] = username;
    req.method = method;
    req.url = '/api/bao-cao-ngay' + endpoint;
    req.headers = {
      host: 'localhost',
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(payload))
    };

    const res = new ServerResponse(req);
    const chunks = [];
    res.write = chunk => {
      if (chunk) chunks.push(Buffer.from(chunk));
      return true;
    };
    res.end = chunk => {
      if (chunk) chunks.push(Buffer.from(chunk));
      res.finished = true;
      res.emit('finish');
      try {
        const text = Buffer.concat(chunks).toString();
        const data = text ? JSON.parse(text) : {};
        if (res.statusCode >= 400) {
          reject(Object.assign(new Error(`${method} ${endpoint}: ${data.error || 'Thao tác không thành công'}`), {
            status: res.statusCode,
            code: data.code
          }));
        } else {
          resolve(data);
        }
      } catch (error) {
        reject(error);
      }
      return res;
    };

    req.on('error', reject);
    app.handle(req, res, reject);
    if (payload) req.push(payload);
    req.push(null);
  });

  return {
    request,
    setClockTime: value => {
      currentTime = typeof value === 'string' ? new Date(value) : value;
    },
    getClockTime: () => new Date(currentTime),
    close: () => daily.stop()
  };
}
