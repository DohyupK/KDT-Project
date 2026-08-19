'use client'

import { useEffect, useRef, useState } from 'react'
import {
  RotateCcw,
  Save,
  Sun,
  Moon,
  Type,
  RefreshCw,
  Bell,
  KeyRound,
} from 'lucide-react'
import { authApi } from '@/api/authApi'
import { getAuthUser, isLoggedIn } from '@/lib/authStorage'
import {
  applyDocumentFontSize,
  EMAIL_CHECK_EVENT,
  notifyEmailCheckChange,
  notifyUiSettingsChange,
} from '@/components/layout/AppShell'
import type { UserSettingsDto } from '@/types'
import { SHELL_CONTENT_CLASS } from '@/components/layout/shellContent'
import { useShellRefresh } from '@/hooks/useShellRefresh'
import { usePageChat } from '@/context/PageChatContext'
import LlmApiKeyVault from '@/components/security/LlmApiKeyVault'

const FONT_SIZE_OPTIONS = [
  10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48,
] as const
const DEFAULT_FONT_SIZE = 18
const SAFE_FONT_SIZE_MAX = 24

const LEGACY_FONT_SCALE_MAP: Record<number, (typeof FONT_SIZE_OPTIONS)[number]> = {
  80: 12,
  90: 14,
  100: 16,
  110: 18,
  120: 20,
}
const DEFAULT_THEME_MODE = 1
const DEFAULT_LANGUAGE = 'ko' as const
const DEFAULT_REFRESH_INTERVAL = 1
const DEFAULT_AUTO_REFRESH_ENABLED = true
const DEFAULT_N8N_ALERT = false

const SETTINGS_STORAGE_KEY = 'kdt-user-settings'
const SYSTEM_SETTINGS_CONFIG_KEY = 'system_settings_config'

const REFRESH_INTERVAL_OPTIONS = [
  { label: '30초', value: 0 },
  { label: '1분', value: 1 },
  { label: '5분', value: 5 },
  { label: '10분', value: 10 },
  { label: '30분', value: 30 },
] as const

type FontSize = (typeof FONT_SIZE_OPTIONS)[number]
type ThemeMode = 0 | 1
type Language = 'ko' | 'en'
type RefreshInterval = (typeof REFRESH_INTERVAL_OPTIONS)[number]['value']

interface UserSettings {
  UserId: string
  FontSize: FontSize
  ThemeMode: ThemeMode
  Language: Language
  RefreshInterval: RefreshInterval
  UpdateAt: string
}

type SavedSettings = UserSettings & { FontScale?: number }

type SystemSettingsConfig = {
  theme: ThemeMode
  language: Language
  fontSize: FontSize
  autoRefreshEnabled: boolean
  refreshInterval: RefreshInterval
  n8nAlert: boolean
}

const parseSavedFontSize = (saved: SavedSettings): FontSize | null => {
  if (FONT_SIZE_OPTIONS.includes(saved.FontSize)) return saved.FontSize
  if (saved.FontScale !== undefined && LEGACY_FONT_SCALE_MAP[saved.FontScale]) {
    return LEGACY_FONT_SCALE_MAP[saved.FontScale]
  }
  return null
}

const applyGlobalThemeMode = (themeMode: ThemeMode) => {
  const isDark = themeMode === 0

  document.documentElement.setAttribute('data-theme-mode', String(themeMode))
  document.documentElement.style.backgroundColor = isDark ? '#0f172a' : ''
  document.documentElement.style.color = isDark ? '#f8fafc' : ''
  document.body.style.backgroundColor = isDark ? '#0f172a' : ''
  document.body.style.color = isDark ? '#f8fafc' : ''
}

const loadSavedSettings = (): SavedSettings | null => {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as SavedSettings
  } catch {
    return null
  }
}

const readSystemSettingsConfig = (): Partial<SystemSettingsConfig> | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SYSTEM_SETTINGS_CONFIG_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Partial<SystemSettingsConfig>
  } catch {
    return null
  }
}

const writeSystemSettingsConfig = (config: SystemSettingsConfig): boolean => {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(SYSTEM_SETTINGS_CONFIG_KEY, JSON.stringify(config))
    return true
  } catch {
    return false
  }
}

const optionSelectedClass =
  'border-2 border-blue-600 bg-blue-50/50 font-semibold text-blue-600 shadow-sm'
const optionIdleClass =
  'border-2 border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 transition-colors'

function ToggleSwitch({
  id,
  checked,
  onChange,
  label,
  description,
  isDarkMode,
}: {
  id: string
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  description?: string
  isDarkMode: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className={`block text-sm font-semibold ${isDarkMode ? 'text-slate-100' : 'text-gray-800'}`}>
          {label}
        </label>
        {description ? (
          <p className={`mt-1 text-xs leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            {description}
          </p>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
          checked ? 'bg-blue-600' : isDarkMode ? 'bg-slate-600' : 'bg-slate-300'
        }`}
      >
        <span
          aria-hidden
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

export default function SettingPage() {
  const { setPagePayload } = usePageChat()
  const [fontSize, setFontSize] = useState<FontSize>(DEFAULT_FONT_SIZE)
  const [pendingFontSize, setPendingFontSize] = useState<FontSize | null>(null)
  const [themeMode, setThemeMode] = useState<ThemeMode>(DEFAULT_THEME_MODE)
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>(DEFAULT_REFRESH_INTERVAL)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(DEFAULT_AUTO_REFRESH_ENABLED)
  const [n8nAlert, setN8nAlert] = useState(DEFAULT_N8N_ALERT)
  const [emailCheckSaving, setEmailCheckSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string>('')
  const [toastMessage, setToastMessage] = useState('')
  const toastTimerRef = useRef<number | null>(null)

  const clearToastTimer = () => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
  }

  const showToast = (message: string) => {
    clearToastTimer()
    setToastMessage(message)
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage('')
      toastTimerRef.current = null
    }, 2500)
  }

  useEffect(() => {
    return () => clearToastTimer()
  }, [])

  useEffect(() => {
    if (pendingFontSize === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPendingFontSize(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [pendingFontSize])

  useEffect(() => {
    setPagePayload(
      '/setting',
      {
        page: 'setting',
        fontSize,
        themeMode: themeMode === 0 ? 'dark' : 'light',
        autoRefreshEnabled,
        refreshIntervalMinutes: refreshInterval,
        n8nAlertEnabled: n8nAlert,
        sections: ['font', 'theme', 'autoRefresh', 'n8nAlert', 'llmApiKeys', 'controlBounds'],
        llmApiKeysNote: 'API key values are not sent to chat; manage keys in this page vault only.',
      },
      ['setting'],
    )
  }, [
    setPagePayload,
    fontSize,
    themeMode,
    autoRefreshEnabled,
    refreshInterval,
    n8nAlert,
  ])

  const [vaultRefreshKey, setVaultRefreshKey] = useState(0)

  const cacheSettingsLocally = (settings: UserSettingsDto) => {
    const currentConfig = readSystemSettingsConfig()
    const local: UserSettings = {
      UserId: settings.userId,
      FontSize: settings.fontSize as FontSize,
      ThemeMode: settings.themeMode,
      Language: settings.language ?? currentConfig?.language ?? 'ko',
      RefreshInterval: settings.refreshInterval as RefreshInterval,
      UpdateAt: settings.updatedAt,
    }
    const config: SystemSettingsConfig = {
      theme: settings.themeMode,
      language: settings.language ?? currentConfig?.language ?? 'ko',
      fontSize: settings.fontSize as FontSize,
      autoRefreshEnabled: settings.autoRefreshEnabled ?? currentConfig?.autoRefreshEnabled ?? true,
      refreshInterval: settings.refreshInterval as RefreshInterval,
      n8nAlert: settings.n8nAlert ?? currentConfig?.n8nAlert ?? false,
    }
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(local))
    } catch {
      // ignore cache write failures
    }
    writeSystemSettingsConfig(config)
  }

  const applySettingsToUi = (settings: {
    fontSize: FontSize
    themeMode: ThemeMode
    language: Language
    refreshInterval: RefreshInterval
    autoRefreshEnabled: boolean
    n8nAlert: boolean
  }) => {
    setFontSize(settings.fontSize)
    setThemeMode(settings.themeMode)
    setRefreshInterval(settings.refreshInterval)
    setAutoRefreshEnabled(settings.autoRefreshEnabled)
    setN8nAlert(settings.n8nAlert)
    applyDocumentFontSize(settings.fontSize)
    applyGlobalThemeMode(settings.themeMode)
    notifyUiSettingsChange({
      themeMode: settings.themeMode,
      language: settings.language,
      fontSize: settings.fontSize,
    })
  }

  const reloadPageSettings = async (isCancelled?: () => boolean) => {
    if (isLoggedIn()) {
      try {
        const { data } = await authApi.getSettings()
        if (isCancelled?.()) return
        const s = data.settings
        const currentConfig = readSystemSettingsConfig()
        cacheSettingsLocally(s)
        applySettingsToUi({
          fontSize: s.fontSize as FontSize,
          themeMode: s.themeMode,
          language: s.language ?? currentConfig?.language ?? 'ko',
          refreshInterval: s.refreshInterval as RefreshInterval,
          autoRefreshEnabled: s.autoRefreshEnabled ?? currentConfig?.autoRefreshEnabled ?? true,
          n8nAlert: s.n8nAlert ?? currentConfig?.n8nAlert ?? false,
        })
        return
      } catch {
        if (!isCancelled?.()) {
          setSaveMessage('서버 설정을 불러오지 못했습니다. 로컬 설정을 사용합니다.')
        }
      }
    }

    if (isCancelled?.()) return

    const saved = loadSavedSettings()
    const config = readSystemSettingsConfig()

    let nextFontSize: FontSize = DEFAULT_FONT_SIZE
    let nextTheme: ThemeMode = DEFAULT_THEME_MODE
    let nextInterval: RefreshInterval = DEFAULT_REFRESH_INTERVAL
    let nextAutoRefresh = DEFAULT_AUTO_REFRESH_ENABLED
    let nextN8n = DEFAULT_N8N_ALERT
    let nextLang: Language = DEFAULT_LANGUAGE

    if (saved) {
      const savedFontSize = parseSavedFontSize(saved)
      if (savedFontSize) nextFontSize = savedFontSize
      if (saved.ThemeMode === 0 || saved.ThemeMode === 1) nextTheme = saved.ThemeMode
      if (REFRESH_INTERVAL_OPTIONS.some((opt) => opt.value === saved.RefreshInterval)) {
        nextInterval = saved.RefreshInterval
      }
      if (saved.Language === 'ko' || saved.Language === 'en') nextLang = saved.Language
    }

    if (config) {
      if (typeof config.fontSize === 'number' && FONT_SIZE_OPTIONS.includes(config.fontSize as FontSize)) {
        nextFontSize = config.fontSize as FontSize
      }
      if (config.theme === 0 || config.theme === 1) nextTheme = config.theme
      if (
        typeof config.refreshInterval === 'number' &&
        REFRESH_INTERVAL_OPTIONS.some((opt) => opt.value === config.refreshInterval)
      ) {
        nextInterval = config.refreshInterval as RefreshInterval
      }
      if (typeof config.autoRefreshEnabled === 'boolean') nextAutoRefresh = config.autoRefreshEnabled
      if (typeof config.n8nAlert === 'boolean') nextN8n = config.n8nAlert
      if (config.language === 'ko' || config.language === 'en') nextLang = config.language
    }

    applySettingsToUi({
      fontSize: nextFontSize,
      themeMode: nextTheme,
      language: nextLang,
      refreshInterval: nextInterval,
      autoRefreshEnabled: nextAutoRefresh,
      n8nAlert: nextN8n,
    })
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await reloadPageSettings(() => cancelled)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onEmailCheck = (event: Event) => {
      const detail = (event as CustomEvent<{ emailCheck?: unknown }>).detail
      if (detail?.emailCheck === 'O' || detail?.emailCheck === 'X') {
        setN8nAlert(detail.emailCheck === 'O')
      }
    }
    window.addEventListener(EMAIL_CHECK_EVENT, onEmailCheck)
    return () => window.removeEventListener(EMAIL_CHECK_EVENT, onEmailCheck)
  }, [])

  useShellRefresh(() => {
    void reloadPageSettings()
    setVaultRefreshKey((key) => key + 1)
  })

  useEffect(() => { applyGlobalThemeMode(themeMode) }, [themeMode])

  const persistEmailAlert = async (next: boolean) => {
    if (!isLoggedIn() || !getAuthUser()) {
      showToast('로그인 후 수신 여부를 설정할 수 있습니다.')
      return
    }
    if (emailCheckSaving) return

    const prev = n8nAlert
    setN8nAlert(next)
    setEmailCheckSaving(true)
    setSaveMessage('')
    try {
      const { data } = await authApi.updateSettings({ n8nAlert: next })
      const enabled = data.settings.emailCheck === 'O' || data.settings.n8nAlert === true
      setN8nAlert(enabled)
      cacheSettingsLocally(data.settings)
      notifyEmailCheckChange(enabled ? 'O' : 'X')
    } catch {
      setN8nAlert(prev)
      setSaveMessage('이메일 자동 발신 설정 저장에 실패했습니다.')
    } finally {
      setEmailCheckSaving(false)
    }
  }

  const handleThemeModeChange = (mode: ThemeMode) => {
    setThemeMode(mode)
    setSaveMessage('')
    notifyUiSettingsChange({
      themeMode: mode,
      language: DEFAULT_LANGUAGE,
      fontSize,
    })
  }

  const applyFontSize = (next: FontSize) => {
    setFontSize(next)
    setPendingFontSize(null)
    setSaveMessage('')
    notifyUiSettingsChange({
      themeMode,
      language: DEFAULT_LANGUAGE,
      fontSize: next,
    })
  }

  const handleFontSizeSliderChange = (next: FontSize) => {
    if (next <= SAFE_FONT_SIZE_MAX || fontSize > SAFE_FONT_SIZE_MAX) {
      applyFontSize(next)
      return
    }
    setPendingFontSize(next)
  }

  const handleSaveSettings = async () => {
    if (!isLoggedIn() || !getAuthUser()) {
      setSaveMessage('설정 서버 저장에는 로그인이 필요합니다.')
      showToast('로그인 후 설정을 저장해 주세요.')
      return
    }

    try {
      const { data } = await authApi.updateSettings({
        fontSize,
        themeMode,
        language: DEFAULT_LANGUAGE,
        autoRefreshEnabled,
        refreshInterval,
        n8nAlert,
      })
      cacheSettingsLocally(data.settings)
      applyDocumentFontSize(fontSize)
      notifyUiSettingsChange({
        themeMode,
        language: data.settings.language,
        fontSize,
      })
      notifyEmailCheckChange(data.settings.emailCheck === 'O' ? 'O' : 'X')
      setSaveMessage(`설정이 저장되었습니다. (${data.settings.updatedAt})`)
      showToast('✓ 설정이 성공적으로 저장되었습니다.')
    } catch {
      setSaveMessage('설정 저장에 실패했습니다. backend(:3001)와 로그인을 확인해 주세요.')
    }
  }

  const handleResetSettings = async () => {
    if (!isLoggedIn() || !getAuthUser()) {
      setSaveMessage('설정 초기화에는 로그인이 필요합니다.')
      showToast('로그인 후 초기화해 주세요.')
      return
    }

    try {
      const { data } = await authApi.resetSettings()
      const s = data.settings
      cacheSettingsLocally(s)
      applySettingsToUi({
        fontSize: s.fontSize as FontSize,
        themeMode: s.themeMode,
        language: s.language,
        refreshInterval: s.refreshInterval as RefreshInterval,
        autoRefreshEnabled: s.autoRefreshEnabled,
        n8nAlert: s.n8nAlert,
      })
      notifyEmailCheckChange(s.emailCheck === 'O' ? 'O' : 'X')
      setSaveMessage('')
      showToast('설정이 기본값으로 초기화되었습니다.')
    } catch {
      setSaveMessage('설정 초기화에 실패했습니다. backend(:3001)와 로그인을 확인해 주세요.')
    }
  }

  const isDarkMode = themeMode === 0
  const previewFontSize = `${fontSize}px`
  const textPrimary = isDarkMode ? 'text-slate-100' : 'text-gray-800'
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-gray-500'
  const textMuted = isDarkMode ? 'text-slate-400' : 'text-gray-400'
  const cardClass = isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
  const selectedClass = isDarkMode
    ? 'border-2 border-blue-400 bg-blue-900/40 font-semibold text-blue-300 shadow-sm'
    : optionSelectedClass
  const idleClass = isDarkMode
    ? 'border-2 border-transparent text-slate-300 hover:border-slate-600 hover:bg-slate-700 transition-colors'
    : optionIdleClass

  return (
    <div
      className={`h-full w-full overflow-y-auto font-sans ${textPrimary} ${
        isDarkMode
          ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800'
          : 'bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50'
      }`}
    >
      {toastMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-1/2 z-[120] max-w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-lg"
        >
          {toastMessage}
        </div>
      ) : null}

      {pendingFontSize !== null ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/50 px-4"
          role="presentation"
          onClick={() => setPendingFontSize(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="font-size-warning-title"
            className={`w-full max-w-md rounded-2xl border p-6 shadow-xl ${
              isDarkMode
                ? 'border-slate-600 bg-slate-800 text-slate-100'
                : 'border-gray-200 bg-white text-gray-800'
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="font-size-warning-title" className="text-lg font-bold">
              폰트 크기
            </h2>
            <p className={`mt-3 text-sm leading-relaxed ${textSecondary}`}>
              해당 픽셀을 넘어갈 경우 화면이 깨질 수 있습니다. 진행하시겠습니까?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingFontSize(null)}
                className={`rounded-xl border-2 px-5 py-2.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                  isDarkMode
                    ? 'border-slate-500 text-slate-200 hover:bg-slate-700'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                }`}
              >
                아니오
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pendingFontSize === null) return
                  applyFontSize(pendingFontSize)
                }}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              >
                예
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={`${SHELL_CONTENT_CLASS} flex flex-col gap-6 py-6`}>
        <header>
          <div className="mb-6 flex flex-col gap-1">
            <p className="text-sm font-bold tracking-wide text-blue-600">
              System Preferences
            </p>
            <h1 className={`mt-1 text-3xl font-bold tracking-tight ${textPrimary}`}>설정</h1>
            <p className={`mt-2 text-sm ${textSecondary}`}>
              시스템 환경을 사용자에 맞게 조정합니다.
            </p>
          </div>
        </header>


        <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <section className={`rounded-2xl border p-6 shadow-sm ${cardClass}`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Type size={20} className="text-blue-500" aria-hidden />
                <h2 className={`text-lg font-bold ${textPrimary}`}>폰트 크기</h2>
              </div>
              <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-blue-700">
                {fontSize}px
              </span>
            </div>
            <p className={`mb-6 text-sm ${textSecondary}`}>
              슬라이더로 크기를 바꾸면 화면 전체(글자·박스·아이콘)에 바로 적용됩니다. 서버 저장은 설정 저장 시 반영됩니다.
            </p>
            <div className="flex items-center gap-4">
              <span
                className={`shrink-0 select-none font-bold leading-none ${textPrimary}`}
                style={{ fontSize: '14px' }}
                aria-hidden
              >
                A
              </span>
              <input
                type="range"
                min={0}
                max={FONT_SIZE_OPTIONS.length - 1}
                step={1}
                value={FONT_SIZE_OPTIONS.indexOf(fontSize)}
                onChange={(e) => {
                  const next = FONT_SIZE_OPTIONS[Number(e.target.value)]
                  if (next === undefined) return
                  handleFontSizeSliderChange(next)
                }}
                aria-label="폰트 크기"
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-gray-300 accent-blue-600"
              />
              <span
                className={`shrink-0 select-none font-bold leading-none ${textPrimary}`}
                style={{ fontSize: '48px' }}
                aria-hidden
              >
                A
              </span>
            </div>
            <div
              className={`mt-4 rounded-xl border p-4 ${
                isDarkMode ? 'border-slate-600 bg-slate-700' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <p className={`mb-2 text-xs ${textMuted}`}>미리보기</p>
              <p className={textPrimary} style={{ fontSize: previewFontSize, lineHeight: 1.5 }}>
                양극재 품질 AI 예측 시스템의 텍스트 크기 미리보기입니다.
              </p>
            </div>
          </section>

          <section className={`rounded-2xl border p-6 shadow-sm ${cardClass}`}>
            <div className="mb-4 flex items-center gap-2">
              <Sun size={20} className="text-yellow-500" aria-hidden />
              <h2 className={`text-lg font-bold ${textPrimary}`}>테마 설정</h2>
            </div>
            <p className={`mb-6 text-sm ${textSecondary}`}>원하는 테마 모드를 선택합니다.</p>
            <div className="flex flex-wrap gap-4">
              <button
                type="button"
                aria-pressed={themeMode === 1}
                onClick={() => handleThemeModeChange(1)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                  themeMode === 1 ? selectedClass : idleClass
                }`}
              >
                <Sun size={18} aria-hidden />
                라이트 모드
              </button>
              <button
                type="button"
                aria-pressed={themeMode === 0}
                onClick={() => handleThemeModeChange(0)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                  themeMode === 0 ? selectedClass : idleClass
                }`}
              >
                <Moon size={18} aria-hidden />
                다크 모드
              </button>
            </div>
          </section>
        </div>

        <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <section className={`rounded-2xl border p-6 shadow-sm ${cardClass}`}>
            <div className="mb-4 flex items-center gap-2">
              <RefreshCw size={20} className="text-purple-500" aria-hidden />
              <h2 className={`text-lg font-bold ${textPrimary}`}>자동 새로고침 주기</h2>
            </div>
            <p className={`mb-5 text-sm ${textSecondary}`}>
              대시보드 및 데이터의 자동 새로고침 간격을 설정합니다.
            </p>

            <div className="mb-5">
              <ToggleSwitch
                id="auto-refresh-enabled"
                checked={autoRefreshEnabled}
                onChange={(next) => {
                  setAutoRefreshEnabled(next)
                  setSaveMessage('')
                }}
                label="자동 새로고침 사용"
                isDarkMode={isDarkMode}
              />
            </div>

            <select
              value={refreshInterval}
              disabled={!autoRefreshEnabled}
              onChange={(e) => {
                setRefreshInterval(Number(e.target.value) as RefreshInterval)
                setSaveMessage('')
              }}
              aria-label="자동 새로고침 주기"
              className={`w-full rounded-xl border-2 px-4 py-3 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60 ${
                isDarkMode
                  ? 'border-slate-600 bg-slate-700 text-slate-100 disabled:bg-slate-800'
                  : 'border-gray-200 bg-white text-gray-800'
              }`}
            >
              {REFRESH_INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {autoRefreshEnabled ? (
              <p className={`mt-4 text-sm ${textSecondary}`}>
                현재 주기:{' '}
                <strong className="text-blue-600">
                  {REFRESH_INTERVAL_OPTIONS.find((opt) => opt.value === refreshInterval)?.label ??
                    (refreshInterval === 0 ? '30초' : `${refreshInterval}분`)}
                </strong>
              </p>
            ) : (
              <p className={`mt-4 text-sm font-medium ${textSecondary}`}>자동 새로고침 비활성화됨</p>
            )}
          </section>

          <section className={`rounded-2xl border p-6 shadow-sm ${cardClass}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center gap-2">
                  <Bell size={20} className="text-blue-500" aria-hidden />
                  <h2 className={`text-lg font-bold ${textPrimary}`}>이메일 자동 발신</h2>
                </div>
                <p className={`text-sm ${textSecondary}`}>
                  위험등급이 심각인 LOT 이슈 보고서를 메일로 받습니다.
                </p>
              </div>
              <button
                id="n8n-alert-toggle"
                type="button"
                role="switch"
                aria-checked={n8nAlert}
                aria-label="이메일 자동 발신"
                disabled={emailCheckSaving || !isLoggedIn()}
                onClick={() => {
                  void persistEmailAlert(!n8nAlert)
                }}
                className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 ${
                  n8nAlert ? 'bg-blue-600' : isDarkMode ? 'bg-slate-600' : 'bg-slate-300'
                }`}
              >
                <span
                  aria-hidden
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    n8nAlert ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </section>
        </div>

        <section className={`w-full rounded-2xl border p-6 shadow-sm ${cardClass}`}>
          <div className="mb-4 flex items-center gap-2">
            <KeyRound size={20} className="text-emerald-500" aria-hidden />
            <h2 className={`text-lg font-bold ${textPrimary}`}>일반 챗봇 API 키</h2>
          </div>
          <p className={`mb-4 text-sm ${textSecondary}`}>
            일반 챗봇용 API 키를 등록합니다. 암호문은 ai-service/DB에 저장됩니다.
          </p>
          <LlmApiKeyVault key={`vault-${vaultRefreshKey}`} isDark={isDarkMode} />
        </section>

        <div className="mt-2 flex flex-col items-end gap-2">
          <p className={`text-xs ${textMuted}`}>* 설정 저장 시 모든 항목이 함께 저장됩니다.</p>
          <div className="flex flex-wrap items-center justify-end gap-4">
            <button
              type="button"
              onClick={handleResetSettings}
              className={`flex items-center justify-center gap-2 rounded-xl border-2 px-6 py-3 font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                isDarkMode
                  ? 'border-slate-500 text-slate-200 hover:bg-slate-700'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-100'
              }`}
            >
                  <RotateCcw size={18} aria-hidden />
                  초기화
                </button>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-bold text-white shadow-md transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                >
                  <Save size={18} aria-hidden />
                  설정 저장
                </button>
          </div>
          {saveMessage ? (
            <p
              className={`text-sm font-medium ${
                saveMessage.includes('실패') ? 'text-rose-500' : 'text-green-500'
              }`}
            >
              {saveMessage}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
