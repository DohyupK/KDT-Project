/**
 * Live smoke: send_email table, HTML round-trip, settings email_check, n8n callback.
 * Does not send a real Gmail unless N8N webhook + Gmail env are both set;
 * dispatch is called and results are printed.
 */
import '../src/loadRootEnv.js'
import http from 'node:http'
import { createApp } from '../src/app.js'
import { query } from '../src/db/connection.js'
import { buildLotIssueReportHtml } from '../src/services/issueReportHtml.js'
import { listOpenIssueDetailsByLotId } from '../src/services/issue.service.js'
import {
  applySendEmailResult,
  dispatchNewRiskTopIssueReports,
} from '../src/services/issueReportN8n.js'
import * as userSettings from '../src/services/userSettings.service.js'

type Ok = { insertId?: number | bigint }

function envSet(name: string): boolean {
  return Boolean((process.env[name] || '').trim())
}

function fail(msg: string): never {
  throw new Error(msg)
}

async function main() {
  const checks: string[] = []
  const warn: string[] = []

  const envNames = [
    'ISSUE_REPORT_MAIL_ENABLED',
    'ISSUE_REPORT_MAIL_FROM',
    'N8N_ISSUE_REPORT_WEBHOOK_URL',
    'N8N_WEBHOOK_SECRET',
    'GOOGLE_MAIL_SERVICE_ACCOUNT_FILE',
    'GOOGLE_MAIL_DELEGATED_USER',
  ]
  for (const name of envNames) {
    const on = envSet(name)
    console.log(`[env] ${name}=${on ? 'SET' : 'EMPTY'}`)
    if (
      [
        'N8N_ISSUE_REPORT_WEBHOOK_URL',
        'N8N_WEBHOOK_SECRET',
        'ISSUE_REPORT_MAIL_FROM',
        'GOOGLE_MAIL_SERVICE_ACCOUNT_FILE',
        'GOOGLE_MAIL_DELEGATED_USER',
      ].includes(name) &&
      !on
    ) {
      warn.push(`${name} empty`)
    }
  }
  if (!envSet('GOOGLE_MAIL_SERVICE_ACCOUNT_FILE') && !envSet('GOOGLE_APPLICATION_CREDENTIALS')) {
    warn.push('Gmail service-account JSON path empty')
  }

  const tables = await query<{ Tables_in?: string }[]>(`SHOW TABLES LIKE 'send_email'`)
  if (!tables.length) fail('send_email table missing — run npm run migrate:send-email')
  checks.push('send_email table exists')

  const usCols = await query<{ Field: string }[]>(`SHOW COLUMNS FROM user_settings LIKE 'email_check'`)
  if (!usCols.length) fail('user_settings.email_check missing')
  checks.push('user_settings.email_check exists')

  const usersCols = await query<{ Field: string }[]>(`SHOW COLUMNS FROM users`)
  const userFields = usersCols.map((c) => c.Field)
  if (!userFields.includes('user_id') || !userFields.includes('email')) {
    fail('users.user_id / email missing')
  }
  checks.push(`users columns unchanged (no extra mail col): ${userFields.join(',')}`)

  const user = (
    await query<{ user_id: string; email: string }[]>(
      `SELECT user_id, email FROM users WHERE email IS NOT NULL AND TRIM(email) <> '' LIMIT 1`,
    )
  )[0]
  const lot = (await query<{ id: string }[]>(`SELECT id FROM lots LIMIT 1`))[0]
  if (!user) fail('no users.email to test FK snapshot')
  if (!lot) fail('no lots.id to test FK')

  const html = buildLotIssueReportHtml({
    lotId: lot.id,
    issues: await listOpenIssueDetailsByLotId(lot.id),
    generatedAt: '2026-08-13 18:00:00',
  })
  if (!html.includes('<!DOCTYPE html>')) fail('HTML builder did not return HTML')
  if (html.includes('window.print')) fail('print script must not be in mail HTML')
  try {
    JSON.parse(html)
    fail('mail HTML parsed as JSON — should not')
  } catch {
    checks.push('mail_contents is HTML, not JSON')
  }

  await query(`DELETE FROM send_email WHERE lot_id = ? AND user_id = ?`, [lot.id, user.user_id])
  const inserted = (await query(
    `INSERT INTO send_email (lot_id, user_id, email, mail_contents, send, error)
     VALUES (?, ?, ?, ?, 'X', 'smoke_test')`,
    [lot.id, user.user_id, user.email, html],
  )) as Ok
  const id = Number(inserted.insertId)
  if (!id) fail('insertId missing')

  const row = (
    await query<{ mail_contents: string; send: string; email: string; user_id: string }[]>(
      `SELECT mail_contents, send, email, user_id FROM send_email WHERE id = ?`,
      [id],
    )
  )[0]
  if (!row) fail('reload after insert failed')
  if (row.send !== 'X') fail(`expected send=X got ${row.send}`)
  if (row.user_id !== user.user_id) fail('user_id mismatch')
  if (row.email !== user.email) fail('email snapshot mismatch')
  if (row.mail_contents !== html) fail('mail_contents round-trip mismatch')
  checks.push(`INSERT/SELECT round-trip id=${id} send=X`)

  const updated = await applySendEmailResult({ id, send: 'O' })
  if (!updated) fail('applySendEmailResult O failed')
  const after = (
    await query<{ send: string; sent_at: Date | string | null }[]>(
      `SELECT send, sent_at FROM send_email WHERE id = ?`,
      [id],
    )
  )[0]
  if (after?.send !== 'O' || !after.sent_at) fail('send=O / sent_at not set')
  checks.push('send O/X update works')

  const prev = await userSettings.getUserSettings(user.user_id)
  const on = await userSettings.updateUserSettings(user.user_id, { n8nAlert: true })
  if (on.emailCheck !== 'O' || on.n8nAlert !== true) fail('email_check O not saved')
  const off = await userSettings.updateUserSettings(user.user_id, { n8nAlert: false })
  if (off.emailCheck !== 'X' || off.n8nAlert !== false) fail('email_check X not saved')
  await userSettings.updateUserSettings(user.user_id, { emailCheck: prev.emailCheck })
  checks.push('user_settings.email_check O/X via n8nAlert')

  const secret = (process.env.N8N_WEBHOOK_SECRET || 'smoke-secret').trim()
  const prevSecret = process.env.N8N_WEBHOOK_SECRET
  process.env.N8N_WEBHOOK_SECRET = secret
  const app = createApp()
  const server = http.createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  try {
    const denied = await fetch(`http://127.0.0.1:${port}/api/internal/n8n/send-email-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, send: 'X' }),
    })
    if (denied.status !== 401) fail(`callback without secret expected 401 got ${denied.status}`)

    const okRes = await fetch(`http://127.0.0.1:${port}/api/internal/n8n/send-email-result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ id, send: 'X', error: 'smoke_callback' }),
    })
    const okJson = (await okRes.json()) as { ok?: boolean; send?: string }
    if (okRes.status !== 200 || okJson.send !== 'X') {
      fail(`callback failed status=${okRes.status} body=${JSON.stringify(okJson)}`)
    }
    checks.push('n8n callback 401 without secret, 200 with secret')
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    )
    if (prevSecret === undefined) delete process.env.N8N_WEBHOOK_SECRET
    else process.env.N8N_WEBHOOK_SECRET = prevSecret
  }

  await query(`DELETE FROM send_email WHERE id = ?`, [id])
  checks.push('smoke row deleted')

  const dispatched = await dispatchNewRiskTopIssueReports()
  console.log('[dispatch]', JSON.stringify(dispatched))
  checks.push(
    `dispatch ran enabled=${dispatched.enabled} baseline=${dispatched.baseline} inserted=${dispatched.inserted} webhooks=${dispatched.webhooks}`,
  )

  console.log('\nPASS')
  for (const c of checks) console.log('  ok ', c)
  if (warn.length) {
    console.log('\nWARN (real mail will not go out until these are set in root .env)')
    for (const w of warn) console.log('  -- ', w)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FAIL', err)
    process.exit(1)
  })
