import pg from 'pg';
import { initializeSchema } from '../server/bootstrap.js';

const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) throw new Error('Cần MIGRATION_DATABASE_URL riêng cho bước cập nhật schema.');
const database = decodeURIComponent(new URL(connectionString).pathname.slice(1));
if (database !== 'BCNPV01' && !database.startsWith('bcnpv01_test_')) {
  throw new Error('Không được cập nhật schema của database khác.');
}
const pool = new pg.Pool({ connectionString });
try {
  await initializeSchema(pool);
  console.log('BCNPV01 schema updated.');
} finally {
  await pool.end();
}
