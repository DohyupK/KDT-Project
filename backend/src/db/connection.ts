import { getPool } from '../db.js'

export async function query<T>(sql: string, params?: unknown[]): Promise<T> {
  let conn
  try {
    conn = await getPool().getConnection()
    return (await conn.query(sql, params)) as T
  } finally {
    if (conn) conn.release()
  }
}

/** Run multiple statements in one transaction. */
export async function withTransaction<T>(
  fn: (conn: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) => Promise<T>,
): Promise<T> {
  const conn = await getPool().getConnection()
  try {
    await conn.beginTransaction()
    const result = await fn(conn)
    await conn.commit()
    return result
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}
