import mariadb from 'mariadb'

const pool = mariadb.createPool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'kdt_project',
  connectionLimit: 5,
})

export async function query<T>(sql: string, params?: unknown[]): Promise<T> {
  let conn
  try {
    conn = await pool.getConnection()
    return (await conn.query(sql, params)) as T
  } finally {
    if (conn) conn.release()
  }
}
