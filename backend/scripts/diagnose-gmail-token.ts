import '../src/loadRootEnv.js'
import fs from 'node:fs'
import { query } from '../src/db/connection.js'
import { diagnoseGmailAuth } from '../src/services/issueReportN8n.js'

async function main() {
  const optedUsers = await query<{ email: string }[]>(
    `SELECT u.email
     FROM USERS u
     INNER JOIN USER_SETTINGS s ON s.user_id = u.user_id
     WHERE s.email_check = 'O' AND TRIM(u.email) <> ''
     LIMIT 1`,
  )
  const from =
    (process.env.ISSUE_REPORT_MAIL_FROM || process.env.GOOGLE_MAIL_DELEGATED_USER || '').trim() ||
    optedUsers[0]?.email ||
    ''
  const n8n = Boolean((process.env.N8N_ISSUE_REPORT_WEBHOOK_URL || '').trim())
  const filePath = (process.env.GOOGLE_MAIL_SERVICE_ACCOUNT_FILE || '').trim()
  let serviceAccountFileReadable = false
  if (filePath) {
    try {
      fs.accessSync(filePath)
      serviceAccountFileReadable = true
    } catch {
      serviceAccountFileReadable = false
    }
  }
  console.log(
    JSON.stringify({
      gmailClientId: (process.env.GMAIL_CLIENT_ID || '').trim() ? 'SET' : 'EMPTY',
      gmailClientSecret: (process.env.GMAIL_CLIENT_SECRET || '').trim() ? 'SET' : 'EMPTY',
      gmailRefreshToken: (process.env.GMAIL_REFRESH_TOKEN || '').trim() ? 'SET' : 'EMPTY',
      serviceAccountFile: filePath ? 'SET' : 'EMPTY',
      serviceAccountFileReadable,
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
