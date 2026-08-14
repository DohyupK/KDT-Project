import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'
import { diagnoseGmailAuth } from '../src/services/issueReportN8n.js'

async function main() {
  const optedUsers = await query<{ email: string }[]>(
    `SELECT u.email
     FROM users u
     INNER JOIN user_settings s ON s.user_id = u.user_id
     WHERE s.email_check = 'O' AND TRIM(u.email) <> ''
     LIMIT 1`,
  )
  const from =
    (process.env.ISSUE_REPORT_MAIL_FROM || process.env.GOOGLE_MAIL_DELEGATED_USER || '').trim() ||
    optedUsers[0]?.email ||
    ''
  const n8n = Boolean((process.env.N8N_ISSUE_REPORT_WEBHOOK_URL || '').trim())
  const file = Boolean((process.env.GOOGLE_MAIL_SERVICE_ACCOUNT_FILE || '').trim())
  console.log(
    JSON.stringify({
      serviceAccountFile: file ? 'SET' : 'EMPTY',
      mailFrom: (process.env.ISSUE_REPORT_MAIL_FROM || '').trim() ? 'SET' : 'EMPTY',
      delegated: (process.env.GOOGLE_MAIL_DELEGATED_USER || '').trim() ? 'SET' : 'EMPTY',
      n8nWebhook: n8n ? 'SET' : 'EMPTY',
      emailCheckO: optedUsers.length,
    }),
  )
  const auth = await diagnoseGmailAuth(from || undefined)
  console.log(JSON.stringify(auth))
  if (!auth.ok) process.exit(1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
