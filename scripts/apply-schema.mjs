import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.join(__dirname, '../backend');
const require = createRequire(path.join(backendDir, 'package.json'));
const mariadb = require('mariadb');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(backendDir, '.env') });

const dbName = process.env.DB_NAME ?? 'kdt_project';

const rootPool = mariadb.createPool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  connectionLimit: 2,
  multipleStatements: true,
});

async function main() {
  const schemaPath = path.join(backendDir, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  let conn;
  try {
    conn = await rootPool.getConnection();
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${dbName}\``);
    await conn.query(sql);
    const rows = await conn.query("SHOW TABLES LIKE 'users'");
    const cols = await conn.query('DESCRIBE users');
    console.log(JSON.stringify({
      ok: true,
      database: dbName,
      usersTable: rows.length > 0,
      userColumns: cols.map((c) => c.Field),
    }));
  } finally {
    if (conn) conn.release();
    await rootPool.end();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
