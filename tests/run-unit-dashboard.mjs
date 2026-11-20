import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { pool } from '../server/db.js';
import { hashPassword } from '../server/passwords.js';
import { verifyUnitDashboard } from './verify-unit-dashboard.mjs';

const require = createRequire('/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const { chromium } = require('playwright');
const pgBin = '/Applications/Postgres.app/Contents/Versions/latest/bin/';
const name = 'bcnpv01_test_unit_' + Date.now();
const temp = await mkdtemp(path.join(tmpdir(), 'unit-dashboard-'));
const password = randomBytes(24).toString('hex');
const base = 'http://127.0.0.1:4312';
const output = path.resolve('outputs/unit-dashboard-check');
const checks = [];
const errors = [];
let database;
let server;
let browser;
let log = '';
let result;
const check = message => {
  checks.push(message);
  console.log('PASS', message);
};
async function request(endpoint, { cookie = '', method = 'GET', body } = {}) {
  const response = await fetch(base + endpoint, { method,
    headers: { cookie, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function login(username) {
  const response = await request('/api/login', { method: 'POST', body: { username, password } });
  assert.equal(response.status, 200);
  return response.cookie;
}
try {
  execFileSync(pgBin + 'pg_dump', ['--dbname', pool.options.connectionString, '-Fc', '-f', temp + '/copy.dump']);
  await pool.query(`create database "${name}"`);
  const url = new URL(pool.options.connectionString);
  url.pathname = '/' + name;
  execFileSync(pgBin + 'pg_restore', ['--dbname', url.toString(), '--no-owner', temp + '/copy.dump']);
  database = new pg.Pool({ connectionString: url.toString() });
  await database.query('update users set password_hash=$1', [hashPassword(password)]);
  server = spawn(process.execPath, ['server/index.js'], { env: {
    ...process.env, DATABASE_URL: url.toString(), PORT: '4312', NODE_ENV: 'test'
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', data => { log += data; });
  server.stderr.on('data', data => { log += data; });
  for (let attempt = 0; attempt < 200 && !log.includes('BCNPV01 ready'); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert.ok(log.includes('BCNPV01 ready'), log);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const admin = await login('admin');
  const reporter = await login('demo.canbo02');
  const compiler = await login('ttttch.pv01');
  await verifyUnitDashboard({ request, admin, reporter, compiler, database,
    browser, base, output, password, check, errors });
  assert.deepEqual(errors, []);
  result = { at: new Date().toISOString(), status: 'PASS', checks, errors };
} catch (error) {
  result = { at: new Date().toISOString(), status: 'FAIL', checks, errors, error: error.stack };
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill('SIGTERM');
    await exited;
  }
  await database?.end();
  await pool.query(`drop database if exists "${name}" with (force)`);
  await pool.end();
  await rm(temp, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await writeFile(output + '/result.json', JSON.stringify(result, null, 2));
  await writeFile(output + '/server.log', log);
}
