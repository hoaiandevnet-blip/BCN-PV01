import express from 'express';
import path from 'node:path';

const publicAssetFolders = [
  'css', 'js', 'geo', 'img', 'templates', 'seedy-assistant', 'fonts', 'data', 'pet-seedy', 'map-tiles'
];

export function securityEvent(event, req, details = {}) {
  console.info(JSON.stringify({
    time: new Date().toISOString(),
    event,
    ip: req.socket?.remoteAddress || null,
    ...details
  }));
}

export function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob: data:",
    "connect-src 'self'",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'self'"
  ].join('; '));
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=86400');
  next();
}

export function registerPublicAssets(app, root) {
  // Explicit mounts keep database files and future runtime folders out of the web root.
  for (const folder of publicAssetFolders) {
    app.use(`/assets/${folder}`, express.static(path.join(root, 'assets', folder), { dotfiles: 'deny' }));
  }
}
