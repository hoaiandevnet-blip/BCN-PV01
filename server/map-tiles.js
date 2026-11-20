import http from 'node:http';
import path from 'node:path';
import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
const isPng = data => data.length > 8 && data.subarray(0, 8).equals(pngSignature);

export function validTileCoordinates(z, x, y) {
  if (![z, x, y].every(value => /^\d{1,7}$/.test(String(value)))) return false;
  const zoom = Number(z), column = Number(x), row = Number(y);
  return zoom <= 19 && column < 2 ** zoom && row < 2 ** zoom;
}

function renderTile({ host, port, timeoutMs }, key) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname:host, port, path:`/tile/${key}.png`, timeout:timeoutMs }, response => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error('Local renderer returned no tile'));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 4 * 1024 * 1024) {
          response.destroy(new Error('Local tile is too large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const data = Buffer.concat(chunks);
        if (!isPng(data)) reject(new Error('Local renderer returned an invalid PNG'));
        else resolve(data);
      });
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('Local renderer timed out')));
    request.on('error', reject);
  });
}

export function registerMapTileRoutes(app, {
  cacheRoot,
  host = process.env.TILE_SERVER_HOST || '127.0.0.1',
  port = Number(process.env.TILE_SERVER_PORT || 8081),
  timeoutMs = 30000
}) {
  const pending = new Map();
  async function loadTile(key, tileFile) {
    try {
      const cached = await readFile(tileFile);
      if (isPng(cached)) return { data:cached, source:'local-cache' };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (!pending.has(key)) {
      pending.set(key, (async () => {
        const data = await renderTile({ host, port, timeoutMs }, key);
        await mkdir(path.dirname(tileFile), { recursive:true });
        const temporaryFile = `${tileFile}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporaryFile, data, { flag:'wx' });
          await rename(temporaryFile, tileFile);
        } finally {
          await unlink(temporaryFile).catch(() => {});
        }
        return { data, source:'local-renderer' };
      })().finally(() => pending.delete(key)));
    }
    return pending.get(key);
  }
  app.get('/map-tiles/:z/:x/:y.png', async (req, res) => {
    const { z, x, y } = req.params;
    if (!validTileCoordinates(z, x, y)) return res.status(400).json({ error:'Tọa độ ảnh nền không hợp lệ' });
    const key = [Number(z), Number(x), Number(y)].join('/');
    try {
      const tile = await loadTile(key, path.join(cacheRoot, `${key}.png`));
      res.set({ 'Content-Type':'image/png', 'Cache-Control':'public, max-age=2592000', 'X-Map-Source':tile.source });
      res.send(tile.data);
    } catch (_error) {
      res.set('Cache-Control', 'no-store');
      res.status(503).json({ error:'Ảnh nền nội bộ chưa sẵn sàng. Kiểm tra dịch vụ bản đồ và gói dữ liệu trên máy chủ.' });
    }
  });
}
