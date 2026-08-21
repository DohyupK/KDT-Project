/**
 * Interactive: renew GMAIL_REFRESH_TOKEN (expired/revoked → invalid_grant).
 *
 *   cd backend
 *   npx tsx scripts/reauth-gmail-oauth.ts
 *
 * Opens Google consent URL. Paste the ?code= from redirect (even if browser shows error page URL).
 * Writes GMAIL_REFRESH_TOKEN into monorepo root .env (does not print the token).
 */
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import '../src/loadRootEnv.js'

const SCOPE = 'https://www.googleapis.com/auth/gmail.send'
const REDIRECT = 'http://localhost:1/oauth2callback'

async function main() {
  const clientId = (process.env.GMAIL_CLIENT_ID || '').trim()
  const clientSecret = (process.env.GMAIL_CLIENT_SECRET || '').trim()
  if (!clientId || !clientSecret) {
    console.error('GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET 가 .env에 없습니다.')
    process.exit(1)
  }

  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
    }).toString()

  console.log('\n1) 브라우저에서 아래 URL을 여세요 (Google Cloud OAuth 클라이언트의 승인된 리다이렉트에')
  console.log(`   ${REDIRECT} 가 등록되어 있어야 합니다).\n`)
  console.log(authUrl)
  console.log('\n2) 로그인·동의 후 주소창 전체 URL 또는 code= 값을 붙여넣으세요.\n')

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise<string>((resolve) => {
    rl.question('code 또는 redirect URL: ', (v) => {
      rl.close()
      resolve(v.trim())
    })
  })
  let code = answer
  try {
    if (answer.includes('code=')) {
      const u = new URL(answer.replace(/^.*?http/, 'http'))
      code = u.searchParams.get('code') || answer
    }
  } catch {
    const m = answer.match(/code=([^&\s]+)/)
    if (m) code = decodeURIComponent(m[1])
  }
  if (!code) {
    console.error('code 를 파싱하지 못했습니다.')
    process.exit(1)
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT,
    grant_type: 'authorization_code',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = (await res.json()) as {
    refresh_token?: string
    access_token?: string
    error?: string
    error_description?: string
  }
  if (!res.ok || !json.refresh_token) {
    console.error('토큰 교환 실패:', json.error, json.error_description || '')
    console.error('access_token only?', Boolean(json.access_token), '→ prompt=consent 로 다시 시도')
    process.exit(1)
  }

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const envPath = path.join(root, '.env')
  let text = fs.readFileSync(envPath, 'utf8')
  if (/^GMAIL_REFRESH_TOKEN=/m.test(text)) {
    text = text.replace(/^GMAIL_REFRESH_TOKEN=.*$/m, `GMAIL_REFRESH_TOKEN=${json.refresh_token}`)
  } else {
    text += `\nGMAIL_REFRESH_TOKEN=${json.refresh_token}\n`
  }
  fs.writeFileSync(envPath, text, 'utf8')
  console.log('\nOK: GMAIL_REFRESH_TOKEN 을 루트 .env 에 갱신했습니다. (값은 출력하지 않음)')
  console.log('다음: npx tsx scripts/diagnose-gmail-token.ts')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
