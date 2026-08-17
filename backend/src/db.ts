import mariadb from 'mariadb'
import type { Pool, PoolConnection } from 'mariadb'
import { mariaDbPoolOptions } from './db/config.js'

let pool: Pool | null = null

export function getPool(): Pool {
  if (pool) return pool

  pool = mariadb.createPool(mariaDbPoolOptions())
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
