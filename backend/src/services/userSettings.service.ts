import { query } from '../db/connection.js'
import { AppError } from '../middleware/errorHandler.js'

const FONT_SIZES = [10, 12, 14, 16, 18, 20, 22, 24] as const
const REFRESH_INTERVALS = [1, 5, 10, 30] as const

export type EmailCheck = 'O' | 'X'

export type UserSettingsDto = {
  userId: string
  fontSize: number
  themeMode: 0 | 1
  refreshInterval: number
  emailCheck: EmailCheck
  updatedAt: string
}

type UserSettingsRow = {
  user_id: string
  font_size: number
  theme_mode: number
  refresh_interval: number
  email_check: string | null
  updated_at: Date | string
}

const DEFAULTS = {
  fontSize: 18,
  themeMode: 1 as 0 | 1,
  refreshInterval: 1,
  emailCheck: 'X' as EmailCheck,
}

function formatDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function normalizeEmailCheck(value: unknown): EmailCheck {
  const v = String(value ?? '').trim().toUpperCase()
  return v === 'O' ? 'O' : 'X'
}

function parseEmailCheck(value: unknown): EmailCheck | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const v = String(value).trim().toUpperCase()
  if (v === 'O' || v === 'X') return v
  throw new AppError(400, '이메일 수신 설정이 올바르지 않습니다.')
}

function toDto(row: UserSettingsRow): UserSettingsDto {
  return {
    userId: row.user_id,
    fontSize: Number(row.font_size),
    themeMode: row.theme_mode === 0 ? 0 : 1,
    refreshInterval: Number(row.refresh_interval),
    emailCheck: normalizeEmailCheck(row.email_check),
    updatedAt: formatDate(row.updated_at),
  }
}

function assertValidSettings(input: {
  fontSize: number
  themeMode: number
  refreshInterval: number
}) {
  if (!FONT_SIZES.includes(input.fontSize as (typeof FONT_SIZES)[number])) {
    throw new AppError(400, '폰트 크기가 올바르지 않습니다.')
  }
  if (input.themeMode !== 0 && input.themeMode !== 1) {
    throw new AppError(400, '테마 설정이 올바르지 않습니다.')
  }
  if (!REFRESH_INTERVALS.includes(input.refreshInterval as (typeof REFRESH_INTERVALS)[number])) {
    throw new AppError(400, '새로고침 주기가 올바르지 않습니다.')
  }
}

async function insertDefaults(userId: string): Promise<UserSettingsDto> {
  await query(
    `INSERT INTO user_settings
      (user_id, font_size, theme_mode, refresh_interval, email_check)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, DEFAULTS.fontSize, DEFAULTS.themeMode, DEFAULTS.refreshInterval, DEFAULTS.emailCheck],
  )
  return getUserSettings(userId)
}

export async function getUserSettings(userId: string): Promise<UserSettingsDto> {
  const rows = await query<UserSettingsRow[]>(
    `SELECT user_id, font_size, theme_mode, refresh_interval, email_check, updated_at
     FROM user_settings WHERE user_id = ? LIMIT 1`,
    [userId],
  )
  if (!rows[0]) {
    return insertDefaults(userId)
  }
  return toDto(rows[0])
}

export async function updateUserSettings(
  userId: string,
  body: Record<string, unknown>,
): Promise<UserSettingsDto> {
  const current = await getUserSettings(userId)
  const fontSize = Number(
    body.fontSize ?? body.FontSize ?? current.fontSize,
  )
  const themeMode = Number(
    body.themeMode ?? body.ThemeMode ?? current.themeMode,
  )
  const refreshInterval = Number(
    body.refreshInterval ?? body.RefreshInterval ?? current.refreshInterval,
  )
  const emailCheck =
    parseEmailCheck(body.emailCheck ?? body.email_check) ?? current.emailCheck

  assertValidSettings({ fontSize, themeMode, refreshInterval })

  await query(
    `INSERT INTO user_settings
      (user_id, font_size, theme_mode, refresh_interval, email_check)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       font_size = VALUES(font_size),
       theme_mode = VALUES(theme_mode),
       refresh_interval = VALUES(refresh_interval),
       email_check = VALUES(email_check)`,
    [userId, fontSize, themeMode, refreshInterval, emailCheck],
  )

  return getUserSettings(userId)
}

export async function resetUserSettings(userId: string): Promise<UserSettingsDto> {
  return updateUserSettings(userId, {
    fontSize: DEFAULTS.fontSize,
    themeMode: DEFAULTS.themeMode,
    refreshInterval: DEFAULTS.refreshInterval,
  })
}
