import express from 'express';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { registerDailyReportRoutes } from '../../server/daily-reports/routes.js';
import { requireSameOrigin } from '../../server/session-auth.js';

export function createDynamicLocalRunner(pool, storageRoot) {
  let currentTime = new Date();
  const actor = Symbol('local-operator-account');
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
        const data = JSON.parse(Buffer.concat(chunks).toString());
        if (res.statusCode >= 400) {
          reject(Object.assign(new Error(`${method} ${endpoint}: ${data.error}`), {
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

  const setClockTime = time => {
    currentTime = typeof time === 'string' ? new Date(time) : time;
  };

  return { request, setClockTime, close: () => daily.stop() };
}
