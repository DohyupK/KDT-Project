import mariadb from 'mariadb'
import type { Pool } from 'mariadb'

let pool: Pool | null = null

function getPool(): Pool {
  if (pool) return pool

  pool = mariadb.createPool({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'kdt_project',
    connectionLimit: 5,
  })
  return pool
}

export async function query<T>(sql: string, params?: unknown[]): Promise<T> {
  let conn
  try {
    conn = await getPool().getConnection()
    return (await conn.query(sql, params)) as T
  } finally {
    if (conn) conn.release()
  }
}
