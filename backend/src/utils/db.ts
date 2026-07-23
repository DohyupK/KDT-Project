export const INQUIRY_CATEGORIES = [
  '시스템 오류 제보',
  '기능 개선 제안',
  '생산/출하 일정 문의',
  '불량 검사 문의',
  '기타',
] as const

export type InquiryCategory = (typeof INQUIRY_CATEGORIES)[number]

export function isDbUnavailableError(err: unknown) {
  if (!(err instanceof Error)) return false
  const message = err.message.toLowerCase()
  return (
    message.includes('connect') ||
    message.includes('econnrefused') ||
    message.includes("doesn't exist") ||
    message.includes('unknown database') ||
    message.includes('access denied')
  )
}

export function useMockStorage(
  envKey:
    | 'MOCK_SETTINGS'
    | 'MOCK_INQUIRIES'
    | 'MOCK_MAIN'
    | 'MOCK_DASHBOARD'
    | 'MOCK_ISSUES'
    | 'MOCK_KNOWLEDGE'
    | 'MOCK_MANAGEMENT_MAIL'
    | 'MOCK_MANAGEMENT_DEFECT',
) {
  return process.env[envKey] === 'true'
}
