import { query } from '../db/connection'
import { AppError } from '../middleware/errorHandler'
import { isDbUnavailableError, useMockStorage } from '../utils/db'

const FONT_SIZE_OPTIONS = [10, 12, 14, 16, 18, 20, 22, 24] as const
const REFRESH_INTERVAL_OPTIONS = [1, 5, 10, 30] as const

export interface UserSettingsPayload {
  userId: string
  fontSize: number
  themeMode: 0 | 1
  language: 'ko' | 'en'
  refreshInterval: number
  updateAt: string | null
}

interface SettingsRow {
  user_id: string
  font_size: number
  theme_mode: number
  language: string
  refresh_interval: number
  updated_at: Date | string | null
}

const DEFAULT_SETTINGS: Omit<UserSettingsPayload, 'userId' | 'updateAt'> = {
  fontSize: 18,
  themeMode: 1,
  language: 'ko',
  refreshInterval: 1,
}

const memorySettings = new Map<string, UserSettingsPayload>()

function mapRow(row: SettingsRow): UserSettingsPayload {
  return {
    userId: row.user_id,
    fontSize: row.font_size,
    themeMode: row.theme_mode === 0 ? 0 : 1,
    language: row.language === 'en' ? 'en' : 'ko',
    refreshInterval: row.refresh_interval,
    updateAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  }
}

function validateSettings(input: {
  fontSize: number
  themeMode: number
  language: string
  refreshInterval: number
}) {
  if (!FONT_SIZE_OPTIONS.includes(input.fontSize as (typeof FONT_SIZE_OPTIONS)[number])) {
    throw new AppError(400, '유효하지 않은 폰트 크기입니다.')
  }
  if (input.themeMode !== 0 && input.themeMode !== 1) {
    throw new AppError(400, '유효하지 않은 테마 모드입니다.')
  }
  if (input.language !== 'ko' && input.language !== 'en') {
    throw new AppError(400, '유효하지 않은 언어 설정입니다.')
  }
  if (!REFRESH_INTERVAL_OPTIONS.includes(input.refreshInterval as (typeof REFRESH_INTERVAL_OPTIONS)[number])) {
    throw new AppError(400, '유효하지 않은 새로고침 주기입니다.')
  }
}

export async function getUserSettings(userId: string): Promise<UserSettingsPayload> {
  try {
    const rows = await query<SettingsRow[]>(
      `SELECT user_id, font_size, theme_mode, language, refresh_interval, updated_at
       FROM users WHERE user_id = ? LIMIT 1`,
      [userId],
    )

    if (rows[0]) return mapRow(rows[0])

    return {
      userId,
      ...DEFAULT_SETTINGS,
      updateAt: null,
    }
  } catch (err) {
    if (useMockStorage('MOCK_SETTINGS') || isDbUnavailableError(err)) {
      return (
        memorySettings.get(userId) ?? {
          userId,
          ...DEFAULT_SETTINGS,
          updateAt: null,
        }
      )
    }
    throw err
  }
}

export async function saveUserSettings(
  userId: string,
  input: {
    fontSize: number
    themeMode: number
    language: string
    refreshInterval: number
  },
): Promise<UserSettingsPayload> {
  validateSettings(input)

  const payload: UserSettingsPayload = {
    userId,
    fontSize: input.fontSize,
    themeMode: input.themeMode === 0 ? 0 : 1,
    language: input.language === 'en' ? 'en' : 'ko',
    refreshInterval: input.refreshInterval,
    updateAt: new Date().toISOString(),
  }

  try {
    await query(
      `UPDATE users
       SET font_size = ?, theme_mode = ?, language = ?, refresh_interval = ?
       WHERE user_id = ?`,
      [payload.fontSize, payload.themeMode, payload.language, payload.refreshInterval, userId],
    )

    const saved = await getUserSettings(userId)
    memorySettings.set(userId, saved)
    return saved
  } catch (err) {
    if (useMockStorage('MOCK_SETTINGS') || isDbUnavailableError(err)) {
      memorySettings.set(userId, payload)
      return payload
    }
    throw err
  }
}

export async function deleteUserSettings(userId: string) {
  memorySettings.delete(userId)
}
