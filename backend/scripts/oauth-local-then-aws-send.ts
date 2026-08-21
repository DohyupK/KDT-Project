/**
 * Gmail OAuth — 웹 클라이언트 + 로컬 루프백 (콘솔 등록 URI와 동일해야 함).
 *
 * Google Cloud 「웹 클라이언트 2」에 등록:
 *   원본:     http://127.0.0.1:5317
 *   리디렉션: http://127.0.0.1:5317/oauth2callback
 *
 *   cd backend
 *   npm.cmd run oauth:local-aws-send
 */
import http from 'node:http'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import '../src/loadRootEnv.js'

const SCOPE = 'https://www.googleapis.com/auth/gmail.send'
const PORT = 5317
/** Must match Authorized redirect URI in Google Cloud exactly. */
const REDIRECT = `http://127.0.0.1:${PORT}/oauth2callback`
const PEM = 'C:\\Users\\OWNER\\Downloads\\LightsailDefaultKey-ap-northeast-2.pem'
const HOST = 'ubuntu@3.38.135.192'
const AWS_ENV = '/home/ubuntu/KDT-Project/.env'

function ssh(remote: string): { status: number; out: string } {
  const r = spawnSync('ssh', ['-i', PEM, HOST, remote], { encoding: 'utf8' })
  return { status: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}` }
}

/** Read GMAIL_CLIENT_ID / SECRET from AWS .env (mail runs there — not local). */
function fetchAwsClientCreds(): { clientId: string; clientSecret: string } {
  const remote = `python3 - <<'PY'
from pathlib import Path
import json
m = {}
for line in Path("${AWS_ENV}").read_text(encoding="utf-8", errors="replace").splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        m[k.strip()] = v.strip().strip('"').strip("'")
print(json.dumps({
  "clientId": m.get("GMAIL_CLIENT_ID", ""),
  "clientSecret": m.get("GMAIL_CLIENT_SECRET", ""),
}))
PY`
  const r = ssh(remote)
  if (r.status !== 0) {
    throw new Error('AWS .env 읽기 실패 (SSH)')
  }
  const line = r.out.trim().split(/\r?\n/).filter(Boolean).pop() || '{}'
  const j = JSON.parse(line) as { clientId?: string; clientSecret?: string }
  const clientId = (j.clientId || '').trim()
  const clientSecret = (j.clientSecret || '').trim()
  if (!clientId || !clientSecret) {
    throw new Error('AWS .env 에 GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET 이 없습니다.')
  }
  return { clientId, clientSecret }
}

/** Open URL in Chrome Incognito or Edge InPrivate (Windows). */
function openInPrivate(url: string): boolean {
  const candidates: { exe: string; args: string[] }[] = [
    {
      exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: ['--incognito', url],
    },
    {
      exe: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      args: ['--incognito', url],
    },
    {
      exe: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      args: ['--inprivate', url],
    },
    {
      exe: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      args: ['--inprivate', url],
    },
  ]
  for (const c of candidates) {
    if (!fs.existsSync(c.exe)) continue
    const r = spawnSync(c.exe, c.args, { stdio: 'ignore', detached: true })
    if (r.error) continue
    return true
  }
  // last resort: edge via shell alias
  const edge = spawnSync('cmd', ['/c', 'start', 'msedge', '--inprivate', url], {
    stdio: 'ignore',
    detached: true,
  })
  return !edge.error
}

async function exchangeCode(code: string, clientId: string, clientSecret: string) {
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
  return (await res.json()) as {
    refresh_token?: string
    access_token?: string
    error?: string
    error_description?: string
  }
}

function patchAwsRefreshToken(token: string) {
  const b64 = Buffer.from(token, 'utf8').toString('base64')
  const remote = `python3 - <<'PY'
from pathlib import Path
import re, base64
token = base64.b64decode("${b64}").decode("utf-8")
path = Path("${AWS_ENV}")
text = path.read_text(encoding="utf-8", errors="replace")
line = "GMAIL_REFRESH_TOKEN=" + token
if re.search(r"^GMAIL_REFRESH_TOKEN=.*$", text, flags=re.M):
    text = re.sub(r"^GMAIL_REFRESH_TOKEN=.*$", line, text, count=1, flags=re.M)
else:
    text = text.rstrip() + "\\n" + line + "\\n"
path.write_text(text, encoding="utf-8")
print("aws_refresh_token_patched")
PY`
  return ssh(remote)
}

async function main() {
  console.log('AWS .env 에서 클라이언트 ID/시크릿 읽음 (로컬 .env GMAIL_* 안 씀)')
  const { clientId, clientSecret } = fetchAwsClientCreds()
  console.log('AWS client_id ...', clientId.slice(-28))
  console.log('웹 클라이언트 2 리디렉션과 동일해야 함:')
  console.log(' ', REDIRECT)
  console.log('')

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

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const u = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
        if (u.pathname === '/' || u.pathname === '') {
          const html = `<!doctype html><html><head><meta charset="utf-8"><title>Gmail OAuth</title></head>
<body style="font-family:sans-serif;padding:40px">
<h1>Gmail OAuth</h1>
<p><a id="go" href="${authUrl.replace(/"/g, '&quot;')}" style="font-size:20px" rel="noopener">Google 로그인 · 동의하러 가기</a></p>
<p style="color:#666">시크릿/InPrivate 창에서 열렸는지 확인하세요. 링크를 클릭하면 동의 화면으로 갑니다.</p>
</body></html>`
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(html)
          return
        }
        if (u.pathname !== '/oauth2callback') {
          res.writeHead(404)
          res.end('not found')
          return
        }
        const err = u.searchParams.get('error')
        if (err) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(`<pre>OAuth error: ${err}</pre>`)
          server.close()
          reject(new Error(err))
          return
        }
        const c = u.searchParams.get('code')
        if (!c) {
          res.writeHead(400)
          res.end('no code')
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<pre>OK. 이 창 닫고 터미널을 보세요.</pre>')
        server.close()
        resolve(c)
      } catch (e) {
        reject(e)
      }
    })
    server.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EADDRINUSE') {
        reject(
          new Error(
            `포트 ${PORT} 사용 중. PowerShell: netstat -ano | findstr :${PORT} 후 taskkill /PID <pid> /F`,
          ),
        )
      } else {
        reject(e)
      }
    })
    server.listen(PORT, '127.0.0.1', () => {
      const localPage = `http://127.0.0.1:${PORT}/`
      console.log('로컬 대기:', REDIRECT)
      console.log('\n시크릿/InPrivate 로 엽니다:', localPage)
      console.log('안 열리면 시크릿 창에서 위 주소를 직접 입력하세요.\n')
      const opened = openInPrivate(localPage)
      if (!opened) {
        console.log('브라우저 자동 실행 실패 — 시크릿 창에 직접:', localPage)
      }
    })
  })

  console.log('code 수신 → AWS 자격으로 교환…')
  const json = await exchangeCode(code, clientId, clientSecret)
  if (!json.refresh_token) {
    console.error('교환 실패:', json.error, json.error_description || '')
    console.error('access_only?', Boolean(json.access_token))
    console.error('→ AWS .env 의 GMAIL_CLIENT_SECRET 이 콘솔「웹 클라이언트 2」와 같은지 확인')
    process.exit(1)
  }

  console.log('AWS .env 에 refresh 만 기록…')
  const patch = patchAwsRefreshToken(json.refresh_token)
  process.stdout.write(patch.out)
  if (patch.status !== 0) process.exit(patch.status)

  console.log('pm2 restart…')
  let r = ssh('pm2 restart kdt-app')
  process.stdout.write(r.out)

  console.log('diagnose…')
  r = ssh('cd /home/ubuntu/KDT-Project/backend && npx --yes tsx scripts/diagnose-gmail-token.ts')
  process.stdout.write(r.out)
  if (r.status !== 0) process.exit(r.status)

  console.log('send…')
  r = ssh('cd /home/ubuntu/KDT-Project/backend && npx --yes tsx scripts/send-one-issue-report.ts')
  process.stdout.write(r.out)
  process.exit(r.status)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
