import dotenv from 'dotenv';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Cần cấu hình DATABASE_URL riêng cho BCNPV01.');
const databaseName = decodeURIComponent(new URL(connectionString).pathname.slice(1));
if (databaseName !== 'BCNPV01' && !/^bcnpv01_test_/.test(databaseName)) {
  throw new Error('BCNPV01 chỉ được kết nối database riêng BCNPV01 hoặc bcnpv01_test_*.');
}
export const pool = new pg.Pool({ connectionString, max: 12 });
