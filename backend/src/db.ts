import mariadb from 'mariadb'
import type { Pool, PoolConnection } from 'mariadb'

let pool: Pool | null = null

export function getPool(): Pool {
  if (pool) return pool

  pool = mariadb.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kdt',
    connectionLimit: Number(process.env.DB_POOL_LIMIT || 5),
  })
  return pool
}

export async function withConn<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection()
  try {
    return await fn(conn)
  } finally {
    conn.release()
  }
}
