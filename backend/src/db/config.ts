/** Shared MariaDB pool options. Both `db.ts` and `db/connection.ts` must use this. */

export const DEFAULT_DB_NAME = 'kdt_project'

export type MariaDbPoolOptions = {
  host: string
  port: number
  user: string
  password: string
  database: string
  connectionLimit: number
}

export function isLoopbackDbHost(host: string | undefined | null): boolean {
  const h = (host || '').trim().toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '::1'
}

export function mariaDbPoolOptions(): MariaDbPoolOptions {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || DEFAULT_DB_NAME,
    connectionLimit: Number(process.env.DB_POOL_LIMIT || 5),
  }
}
