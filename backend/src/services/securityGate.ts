/**
 * Security keyword gate — Express returns immediately; never proxies to ai-service.
 * Extend via SECURITY_KEYWORDS env (comma-separated, case-insensitive).
 */

const DEFAULT_KEYWORDS = [
  '보안',
  '기밀',
  '사내 기밀',
  '사내기밀',
  '대외비',
  '유출',
  '비밀번호',
  '시크릿',
  'api키',
  'api key',
  'confidential',
  'secret',
  'password',
  '사내문서',
  '내부문서',
  '금지',
]

export const SECURITY_REDIRECT_REPLY =
  '보안·기밀이 관련된 내용은 일반 상담에서 다룰 수 없습니다. ' +
  '「보안 상담」으로 전환했습니다. 질문을 입력란에 옮겨 두었으니 보내 주세요. (이 PC vLLM 전용 채널)'

function keywordList(): string[] {
  const extra = (process.env.SECURITY_KEYWORDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  // longer phrases first so "사내 기밀" wins cleanly
  return [...DEFAULT_KEYWORDS, ...extra].sort((a, b) => b.length - a.length)
}

export function hasSecurityKeyword(message: string): boolean {
  const normalized = message.toLowerCase().normalize('NFC').replace(/\s+/g, ' ')
  return keywordList().some((kw) => normalized.includes(kw.toLowerCase().normalize('NFC')))
}

export function matchedSecurityKeyword(message: string): string | null {
  const normalized = message.toLowerCase().normalize('NFC').replace(/\s+/g, ' ')
  for (const kw of keywordList()) {
    if (normalized.includes(kw.toLowerCase().normalize('NFC'))) return kw
  }
  return null
}
