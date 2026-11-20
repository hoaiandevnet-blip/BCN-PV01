// Disposable visual-review server. Production accounts and data stay untouched.
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { pool } from '../server/db.js';
import { hashPassword } from '../server/passwords.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(path.join(tmpdir(), 'bcn-theme-review-'));
const name = 'bcnpv01_test_theme_' + Date.now();
const password = randomBytes(18).toString('hex');
const pgBin = '/Applications/Postgres.app/Contents/Versions/latest/bin/';
let database;
let server;
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
  await database?.end();
  await pool.query(`drop database if exists "${name}" with (force)`);
  await pool.end();
  await rm(directory, { recursive: true, force: true });
  console.log('Review database and temporary files removed.');
}
process.once('SIGINT', () => stop().then(() => process.exit(0)));
process.once('SIGTERM', () => stop().then(() => process.exit(0)));
try {
  execFileSync(pgBin + 'pg_dump', ['--dbname', pool.options.connectionString, '-Fc', '-f', directory + '/clean.dump']);
  await pool.query(`create database "${name}"`);
  const url = new URL(pool.options.connectionString);
  url.pathname = '/' + name;
  execFileSync(pgBin + 'pg_restore', ['--dbname', url.toString(), '--no-owner', directory + '/clean.dump']);
  database = new pg.Pool({ connectionString: url.toString() });
  await database.query('update users set password_hash=$1 where username=$2', [hashPassword(password), 'admin']);
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url.toString(), PORT: '4312', NODE_ENV: 'test' },
    stdio: ['ignore', 'inherit', 'inherit']
  });
  console.log(JSON.stringify({ url: 'http://127.0.0.1:4312/', username: 'admin', password }));
} catch (error) {
  console.error(error.message);
  await stop();
  process.exitCode = 1;
}
