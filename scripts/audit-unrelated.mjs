import pg from 'pg';
import dotenv from 'dotenv';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const env = dotenv.config({ path: path.join(root, '.env') }).parsed;
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const name = 'bcnpv01_test_before_' + Date.now();
const url = new URL(env.DATABASE_URL);
url.pathname = '/' + name;
let before;
try {
  await pool.query(`create database "${name}"`);
  execFileSync('/Applications/Postgres.app/Contents/Versions/latest/bin/pg_restore',
    ['--dbname', url.toString(), '--no-owner', path.join(root, 'BCNPV01/.private/before-transfer.dump')]);
  before = new pg.Pool({ connectionString: url.toString() });
  const audit = JSON.parse(await readFile(path.join(root, 'BCNPV01/outputs/retirement.json'), 'utf8'));
  const differences = [];
  const normalized = {};
  for (const table of Object.keys(audit.unaffected)) {
    const old = (await before.query(`select * from "${table}" order by 1`)).rows;
    const current = (await pool.query(`select * from "${table}" order by 1`)).rows;
    const changed = new Set();
    for (let index = 0; index < Math.max(old.length, current.length); index += 1) {
      for (const key of new Set([...Object.keys(old[index] || {}), ...Object.keys(current[index] || {})])) {
        if (JSON.stringify(old[index]?.[key]) !== JSON.stringify(current[index]?.[key])) changed.add(key);
      }
    }
    if (changed.size) differences.push({ table, beforeCount: old.length, afterCount: current.length, fields: [...changed] });
    const exclude = table === 'unit_directory_state' ? "-'revision'" : '';
    normalized[table] = (await before.query(`select count(*)::int as count,
      md5(coalesce(string_agg((to_jsonb(t)-'updated_at'${exclude})::text, ''
      order by (to_jsonb(t)-'updated_at'${exclude})::text),'')) as checksum from "${table}" t`)).rows[0];
  }
  await writeFile(path.join(root, 'BCNPV01/outputs/unrelated-audit.json'), JSON.stringify({ differences, normalized }, null, 2));
  console.log(JSON.stringify(differences, null, 2));
} finally {
  if (before) await before.end();
  await pool.query(`drop database if exists "${name}" with (force)`);
  await pool.end();
}
