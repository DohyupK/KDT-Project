import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { AppError } from '../middleware/errorHandler.js'

const SCOPE = 'https://www.googleapis.com/auth/gmail.send'

/** One-time CSRF state for the in-progress OAuth (process memory). */
let pendingState: string | null = null

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

function rootEnvPath(): string {
  return path.resolve(process.cwd(), '..', '.env')
}

export function gmailOAuthRedirectUri(): string {
  const fromEnv = (process.env.GMAIL_OAUTH_REDIRECT_URI || '').trim()
  if (fromEnv) return fromEnv
  const host = (process.env.GMAIL_OAUTH_PUBLIC_HOST || '').trim()
  if (host) {
    const base = host.startsWith('http') ? host.replace(/\/$/, '') : `http://${host}`
    return `${base}/api/internal/gmail-oauth/callback`
  }
  return 'http://3.38.135.192.sslip.io/api/internal/gmail-oauth/callback'
}

function clientCreds(): { clientId: string; clientSecret: string } {
  const clientId = (process.env.GMAIL_CLIENT_ID || '').trim()
  const clientSecret = (process.env.GMAIL_CLIENT_SECRET || '').trim()
  if (!clientId || !clientSecret) {
    throw new AppError(500, 'GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET 이 없습니다.')
  }
  return { clientId, clientSecret }
}

function writeRefreshToken(token: string): void {
  const envPath = rootEnvPath()
  let text = fs.readFileSync(envPath, 'utf8')
  if (/^GMAIL_REFRESH_TOKEN=/m.test(text)) {
    text = text.replace(/^GMAIL_REFRESH_TOKEN=.*$/m, `GMAIL_REFRESH_TOKEN=${token}`)
  } else {
    text += `\nGMAIL_REFRESH_TOKEN=${token}\n`
  }
  fs.writeFileSync(envPath, text, 'utf8')
}

/** GET /api/internal/gmail-oauth/start → Google consent (AWS redirect). */
export const start = asyncHandler(async (_req, res) => {
  const { clientId } = clientCreds()
  const redirectUri = gmailOAuthRedirectUri()
  pendingState = crypto.randomBytes(16).toString('hex')
  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state: pendingState,
    }).toString()
  res.redirect(302, authUrl)
})

/** GET /api/internal/gmail-oauth/callback?code=&state= */
export const callback = asyncHandler(async (req, res) => {
  const err = req.query.error != null ? String(req.query.error) : ''
  if (err) {
    res.status(400).type('html').send(`<pre>OAuth error: ${err}</pre>`)
    return
  }
  const code = req.query.code != null ? String(req.query.code) : ''
  const state = req.query.state != null ? String(req.query.state) : ''
  if (!code) {
    res.status(400).type('html').send('<pre>code 없음</pre>')
    return
  }
  if (!pendingState || state !== pendingState) {
    res
      .status(400)
      .type('html')
      .send('<pre>state 불일치. /api/internal/gmail-oauth/start 부터 다시 여세요.</pre>')
    return
  }
  pendingState = null

  const { clientId, clientSecret } = clientCreds()
  const redirectUri = gmailOAuthRedirectUri()
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = (await tokenRes.json()) as {
    refresh_token?: string
    access_token?: string
    error?: string
    error_description?: string
  }
  if (!tokenRes.ok || !json.refresh_token) {
    res
      .status(502)
      .type('html')
      .send(
        `<pre>토큰 교환 실패: ${json.error || tokenRes.status} ${json.error_description || ''}\naccess_only=${Boolean(json.access_token)}</pre>`,
      )
    return
  }

  writeRefreshToken(json.refresh_token)
  console.log('[gmail-oauth] refresh_token updated in .env (value not logged)')
  res
    .status(200)
    .type('html')
    .send(
      '<pre>OK: GMAIL_REFRESH_TOKEN 갱신됨 (AWS .env).\n백엔드 재시작 후 메일 테스트하면 됩니다.</pre>',
    )
})
