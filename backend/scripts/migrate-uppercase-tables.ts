/**
 * Rename MariaDB tables to UPPERCASE (Linux lower_case_table_names=0).
 * Windows (=1) is a no-op: names already compare case-insensitively.
 *
 * Run once on the Linux DB after deploying this code:
 *   cd backend && npm run migrate:uppercase-tables
 */
import '../src/loadRootEnv.js'
import mariadb from 'mariadb'

/** [current-or-legacy name, target UPPERCASE]. Feeder SPC_LOT* stay as-is. */
const RENAMES: [string, string][] = [
  ['users', 'USERS'],
  ['user_settings', 'USER_SETTINGS'],
  ['user_header_notif_state', 'USER_HEADER_NOTIF_STATE'],
  ['lots', 'LOTS'],
  ['analysis_lots', 'ANALYSIS_LOTS'],
  ['judgment_lots', 'JUDGMENT_LOTS'],
  ['lot_recommended_actions', 'LOT_RECOMMENDED_ACTIONS'],
  ['lot_results', 'LOT_RESULTS'],
  ['issues', 'ISSUES'],
  ['handover_history', 'HANDOVER_HISTORY'],
  ['user_chat_threads', 'USER_CHAT_THREADS'],
  ['user_chat_messages', 'USER_CHAT_MESSAGES'],
  ['inquiries', 'INQUIRIES'],
  ['inquiry_attachments', 'INQUIRY_ATTACHMENTS'],
  ['AI_Library_analysis', 'AI_LIBRARY_ANALYSIS'],
  ['text_match', 'TEXT_MATCH'],
  ['send_email', 'SEND_EMAIL'],
  ['spc_limits', 'SPC_LIMITS'],
  ['standard', 'STANDARD'],
  ['chat_sessions', 'CHAT_SESSIONS'],
  ['chat_messages', 'CHAT_MESSAGES'],
  ['optimization_events', 'OPTIMIZATION_EVENTS'],
]

function qIdent(name: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`refusing to rename non-identifier: ${name}`)
  }
  return `\`${name}\``
}

async function main() {
  const conn = await mariadb.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  })

  try {
    const lctRows = (await conn.query('SELECT @@lower_case_table_names AS v')) as {
      v: number | string
    }[]
    const lct = Number(lctRows[0]?.v)
    console.log(`[uppercase-tables] lower_case_table_names=${lct} DB=${process.env.DB_NAME}`)
    if (lct === 1) {
      console.log('[uppercase-tables] skip: case-insensitive store (typical Windows)')
      return
    }

    const existing = (await conn.query(
      `SELECT TABLE_NAME AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`,
    )) as { n: string }[]
    const byLower = new Map<string, string>()
    for (const row of existing) byLower.set(row.n.toLowerCase(), row.n)

    const clauses: string[] = []
    for (const [from, to] of RENAMES) {
      const actual = byLower.get(from.toLowerCase())
      if (!actual) {
        console.log(`[uppercase-tables] skip missing ${from}`)
        continue
      }
      if (actual === to) {
        console.log(`[uppercase-tables] already ${to}`)
        continue
      }
      const targetTaken = existing.some((r) => r.n === to && r.n !== actual)
      if (targetTaken) {
        console.warn(`[uppercase-tables] WARN: ${to} already exists; not renaming ${actual}`)
        continue
      }
      clauses.push(`${qIdent(actual)} TO ${qIdent(to)}`)
    }

    if (clauses.length === 0) {
      console.log('[uppercase-tables] nothing to rename')
      return
    }

    const sql = `RENAME TABLE ${clauses.join(', ')}`
    console.log(`[uppercase-tables] ${sql}`)
    await conn.query(sql)
    console.log(`[uppercase-tables] renamed ${clauses.length} table(s)`)
  } finally {
    await conn.end()
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
