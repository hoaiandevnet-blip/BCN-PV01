import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { pool } from '../../server/db.js';
import { hashPassword } from '../../server/passwords.js';
import { captureDemo } from './capture.mjs';

const runtime = '/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json';
const { chromium } = createRequire(runtime)('playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'outputs/demo-cases-20261118');
const temporary = await mkdtemp(path.join(output, 'browser-run-'));
const databaseName = 'bcnpv01_test_demo_' + Date.now();
const password = randomBytes(24).toString('hex');
const pgBin = '/Applications/Postgres.app/Contents/Versions/latest/bin/';
const base = 'http://127.0.0.1:4324';
let database;
let server;
let browser;
let created = false;
let log = '';
let result = { status: 'FAIL' };

try {
  execFileSync(pgBin + 'pg_dump', ['--dbname', pool.options.connectionString,
    '-Fc', '-f', temporary + '/source.dump']);
  await pool.query(`create database "${databaseName}"`);
  created = true;
  const url = new URL(pool.options.connectionString);
  url.pathname = '/' + databaseName;
  execFileSync(pgBin + 'pg_restore', ['--dbname', url.toString(), '--no-owner', temporary + '/source.dump']);
  database = new pg.Pool({ connectionString: url.toString() });
  await database.query('update users set password_hash=$1', [hashPassword(password)]);
  const source = await readFile(path.join(root, 'server/index.js'), 'utf8');
  const serverModuleUrl = pathToFileURL(path.join(root, 'server')).href;
  const entry = source.replaceAll("from './", `from '${serverModuleUrl}/`)
    .replace("const root = fileURLToPath(new URL('../', import.meta.url));", `const root = ${JSON.stringify(root)};`)
    .replace("storageRoot: path.join(root, '.private/report-files')",
      `storageRoot: ${JSON.stringify(temporary + '/files')}`);
  await writeFile(temporary + '/server.mjs', entry);
  server = spawn(process.execPath, [temporary + '/server.mjs'], { cwd: root,
    env: { ...process.env, DATABASE_URL: url.toString(), PORT: '4324', HOST: '127.0.0.1', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', data => { log += data; });
  server.stderr.on('data', data => { log += data; });
  const deadline = Date.now() + 30000;
  while (!log.includes('BCNPV01 ready')) {
    if (Date.now() > deadline || server.exitCode !== null) throw new Error('Test server startup failed');
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  const response = await fetch(base + '/api/login', { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'ttttch.pv01', password }) });
  assert.equal(response.status, 200);
  const compiler = response.headers.get('set-cookie').split(';')[0];
  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--window-size=1440,1080'] });
  result = await captureDemo({ browser, compiler, base, output, password });
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) {
    const stopped = new Promise(resolve => server.once('exit', resolve));
    server.kill('SIGTERM');
    await stopped;
  }
  if (database) await database.end();
  if (created) await pool.query(`drop database "${databaseName}" with (force)`);
  await pool.end();
  await mkdir(output, { recursive: true });
  await writeFile(output + '/browser-verification.json', JSON.stringify(result, null, 2));
  await writeFile(output + '/browser-server.log', log);
  await rm(temporary, { recursive: true, force: true });
}
