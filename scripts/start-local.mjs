import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import dotenv from 'dotenv';
import https from 'node:https';
import { readFileSync } from 'node:fs';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = dotenv.config({ path: new URL('../.env', import.meta.url) }).parsed || {};
const port = Number(env.PORT || 4310);
const protocol = env.TLS_CERT_FILE && env.TLS_KEY_FILE ? 'https' : 'http';
const address = `${protocol}://localhost:${port}`;
const run = promisify(execFile);
async function ready() {
  try {
    if (protocol === 'https') {
      return await new Promise(resolve => {
        const request = https.get(address + '/api/health', {
          ca: env.TLS_CA_FILE ? readFileSync(env.TLS_CA_FILE) : undefined,
          timeout: 1200
        }, response => {
          let body = '';
          response.on('data', chunk => { body += chunk; });
          response.on('end', () => {
            try {
              const data = JSON.parse(body);
              resolve(data.application === 'BCNPV01' && data.status === 'ready');
            } catch { resolve(false); }
          });
        });
        request.on('error', () => resolve(false));
        request.on('timeout', () => request.destroy());
      });
    }
    const response = await fetch(address + '/api/health', { signal: AbortSignal.timeout(1200) });
    const result = await response.json();
    return result.application === 'BCNPV01' && result.status === 'ready';
  } catch { return false; }
}
async function openBrowser() {
  if (process.platform === 'darwin') await run('open', [address]);
  console.log('BCNPV01 (máy này): ' + address);
  const interfaces = os.networkInterfaces();
  for (const addrs of Object.values(interfaces)) {
    for (const addr of addrs || []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        console.log(`Link cho người khác (cùng Wi-Fi/LAN): ${protocol}://${addr.address}:${port}`);
      }
    }
  }
}
if (await ready()) {
  await openBrowser();
} else {
  try {
    await run('docker', ['compose', '-f', 'docker-compose.maps.yml', 'up', '-d', 'maps'],
      { cwd: root, timeout: 60000 });
  } catch {
    console.log('Mở Docker Desktop để dùng đầy đủ nền bản đồ nội bộ.');
  }
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, ...env }
  });
  child.on('exit', code => { process.exitCode = code || 0; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await ready()) {
      await openBrowser();
      break;
    }
    if (child.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}
