import http from 'node:http';
import https from 'node:https';
import { readFileSync, statSync } from 'node:fs';

export function transportSettings(environment = process.env) {
  const certificate = environment.TLS_CERT_FILE;
  const key = environment.TLS_KEY_FILE;
  if (Boolean(certificate) !== Boolean(key)) {
    throw new Error('HTTPS cần cấu hình đồng thời TLS_CERT_FILE và TLS_KEY_FILE.');
  }
  if (!certificate) return { protocol: 'http', options: null };
  if ((statSync(key).mode & 0o077) !== 0) {
    throw new Error('Khóa riêng HTTPS phải có quyền 0600 để chỉ chủ sở hữu đọc được.');
  }
  return {
    protocol: 'https',
    options: { cert: readFileSync(certificate), key: readFileSync(key), minVersion: 'TLSv1.2' }
  };
}

export function createApplicationServer(app, settings) {
  return settings.options ? https.createServer(settings.options, app) : http.createServer(app);
}
