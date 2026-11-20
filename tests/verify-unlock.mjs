// Focused browser verification with the existing server clock injected after the cutoff.
// All account and request writes go to a disposable copy of the database.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { pool } from '../server/db.js';
import { hashPassword } from '../server/passwords.js';
import { verifyUnlockWorkspace } from './verify-unlock-workspace.mjs';

const require = createRequire('/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'outputs');
await mkdir(output, { recursive: true });
const temporary = await mkdtemp(path.join(output, 'unlock-run-'));
const databaseName = 'bcnpv01_test_unlock_ui_' + Date.now();
const password = randomBytes(24).toString('hex');
const pgBin = '/Applications/Postgres.app/Contents/Versions/latest/bin/';
const checks = [];
const errors = [];
let database;
let server;
let browser;
let created = false;
let log = '';
let result = 'FAIL';
const base = 'http://127.0.0.1:4323';
const check = label => {
  checks.push({ label, at: new Date().toISOString() });
  console.log('PASS', label);
};
const request = async (endpoint, { cookie = '', method = 'GET', body } = {}) => {
  const response = await fetch(base + endpoint, { method,
    headers: { cookie, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: response.status, data: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0] };
};
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
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const source = await readFile(path.join(root, 'server/index.js'), 'utf8');
  assert.ok(source.includes("storageRoot: path.join(root, '.private/report-files')"));
  const entry = source.replaceAll("from './", `from '${pathToFileURL(path.join(root, 'server')).href}/`)
    .replace("const root = fileURLToPath(new URL('../', import.meta.url));", `const root = ${JSON.stringify(root)};`)
    .replace("storageRoot: path.join(root, '.private/report-files')",
      `clock: () => new Date('${day}T12:00:00+07:00'), storageRoot: ${JSON.stringify(temporary + '/files')}`);
  await writeFile(temporary + '/server.mjs', entry);
  server = spawn(process.execPath, [temporary + '/server.mjs'], { cwd: root,
    env: { ...process.env, DATABASE_URL: url.toString(), PORT: '4323', HOST: '127.0.0.1', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', data => { log += data; });
  server.stderr.on('data', data => { log += data; });
  const deadline = Date.now() + 30000;
  while (!log.includes('BCNPV01 ready')) {
    if (Date.now() > deadline || server.exitCode !== null) throw new Error('Server startup failed: ' + log);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  const login = async username => {
    const response = await request('/api/login', { method: 'POST', body: { username, password } });
    assert.equal(response.status, 200);
    return response.cookie;
  };
  const reporter = await login('demo.canbo02');
  const compiler = await login('ttttch.pv01');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  await verifyUnlockWorkspace({ request, reporter, compiler, database, browser, base, output, check, errors });
  result = 'PASS';
  console.log('UNLOCK VERIFICATION PASS:', checks.length, 'checks');
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
  await writeFile(output + '/unlock-ui-20261117/after-cutoff-results.json',
    JSON.stringify({ status: result, checks, errors }, null, 2));
  await writeFile(output + '/unlock-ui-20261117/after-cutoff-server.log', log);
  await rm(temporary, { recursive: true, force: true });
}
