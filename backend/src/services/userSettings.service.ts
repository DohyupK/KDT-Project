import { query } from '../db/connection.js'
import { AppError } from '../middleware/errorHandler.js'

const FONT_SIZES = [10, 12, 14, 16, 18, 20, 22, 24] as const
const REFRESH_INTERVALS = [1, 5, 10, 30] as const
const LANGUAGES = ['ko', 'en'] as const

export type UserSettingsDto = {
  userId: string
  fontSize: number
  themeMode: 0 | 1
  language: 'ko' | 'en'
  autoRefreshEnabled: boolean
  refreshInterval: number
  n8nAlert: boolean
  updatedAt: string
}

type UserSettingsRow = {
  user_id: string
  font_size: number
  theme_mode: number
  language: string
  auto_refresh_enabled: number | boolean
  refresh_interval: number
  n8n_alert: number | boolean
  updated_at: Date | string
}

const DEFAULTS = {
  fontSize: 18,
  themeMode: 1 as 0 | 1,
  language: 'ko' as const,
  autoRefreshEnabled: true,
  refreshInterval: 1,
  n8nAlert: true,
}

function formatDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function toDto(row: UserSettingsRow): UserSettingsDto {
  return {
    userId: row.user_id,
    fontSize: Number(row.font_size),
    themeMode: row.theme_mode === 0 ? 0 : 1,
    language: row.language === 'en' ? 'en' : 'ko',
    autoRefreshEnabled: Boolean(row.auto_refresh_enabled),
    refreshInterval: Number(row.refresh_interval),
    n8nAlert: Boolean(row.n8n_alert),
    updatedAt: formatDate(row.updated_at),
  }
}

function assertValidSettings(input: {
  fontSize: number
  themeMode: number
  language: string
  autoRefreshEnabled: boolean
  refreshInterval: number
  n8nAlert: boolean
}) {
  if (!FONT_SIZES.includes(input.fontSize as (typeof FONT_SIZES)[number])) {
    throw new AppError(400, '폰트 크기가 올바르지 않습니다.')
  }
  if (input.themeMode !== 0 && input.themeMode !== 1) {
    throw new AppError(400, '테마 설정이 올바르지 않습니다.')
  }
  if (!LANGUAGES.includes(input.language as (typeof LANGUAGES)[number])) {
    throw new AppError(400, '언어 설정이 올바르지 않습니다.')
  }
  if (!REFRESH_INTERVALS.includes(input.refreshInterval as (typeof REFRESH_INTERVALS)[number])) {
    throw new AppError(400, '새로고침 주기가 올바르지 않습니다.')
  }
  if (typeof input.autoRefreshEnabled !== 'boolean' || typeof input.n8nAlert !== 'boolean') {
    throw new AppError(400, '설정 값이 올바르지 않습니다.')
  }
}

async function insertDefaults(userId: string): Promise<UserSettingsDto> {
  await query(
    `INSERT INTO user_settings
      (user_id, font_size, theme_mode, language, auto_refresh_enabled, refresh_interval, n8n_alert)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      DEFAULTS.fontSize,
      DEFAULTS.themeMode,
      DEFAULTS.language,
      DEFAULTS.autoRefreshEnabled ? 1 : 0,
      DEFAULTS.refreshInterval,
      DEFAULTS.n8nAlert ? 1 : 0,
    ],
  )
  return getUserSettings(userId)
}

export async function getUserSettings(userId: string): Promise<UserSettingsDto> {
  const rows = await query<UserSettingsRow[]>(
    `SELECT user_id, font_size, theme_mode, language, auto_refresh_enabled,
            refresh_interval, n8n_alert, updated_at
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
  const fontSize = Number(body.fontSize ?? body.FontSize ?? DEFAULTS.fontSize)
  const themeMode = Number(body.themeMode ?? body.ThemeMode ?? DEFAULTS.themeMode)
  const language = String(body.language ?? body.Language ?? DEFAULTS.language)
  const autoRefreshEnabled = Boolean(
    body.autoRefreshEnabled ?? body.AutoRefreshEnabled ?? DEFAULTS.autoRefreshEnabled,
  )
  const refreshInterval = Number(
    body.refreshInterval ?? body.RefreshInterval ?? DEFAULTS.refreshInterval,
  )
  const n8nAlert = Boolean(body.n8nAlert ?? body.N8nAlert ?? DEFAULTS.n8nAlert)

  assertValidSettings({
    fontSize,
    themeMode,
    language,
    autoRefreshEnabled,
    refreshInterval,
    n8nAlert,
  })

  await query(
    `INSERT INTO user_settings
      (user_id, font_size, theme_mode, language, auto_refresh_enabled, refresh_interval, n8n_alert)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       font_size = VALUES(font_size),
       theme_mode = VALUES(theme_mode),
       language = VALUES(language),
       auto_refresh_enabled = VALUES(auto_refresh_enabled),
       refresh_interval = VALUES(refresh_interval),
       n8n_alert = VALUES(n8n_alert)`,
    [
      userId,
      fontSize,
      themeMode,
      language,
      autoRefreshEnabled ? 1 : 0,
      refreshInterval,
      n8nAlert ? 1 : 0,
    ],
  )

  return getUserSettings(userId)
}

export async function resetUserSettings(userId: string): Promise<UserSettingsDto> {
  return updateUserSettings(userId, { ...DEFAULTS })
}
