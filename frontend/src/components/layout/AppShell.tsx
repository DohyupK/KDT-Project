'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  Home,
  LayoutDashboard,
  AlertCircle,
  BookOpen,
  HelpCircle,
  LineChart,
  Settings,
  Shield,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import type { ReactNode } from 'react'
import GlobalChatbot from '@/components/chat/GlobalChatbot'
import ShellHeader from '@/components/layout/ShellHeader'
import { PageChatProvider, usePageChat } from '@/context/PageChatContext'
import { authApi } from '@/api/authApi'
import { AUTH_CHANGED_EVENT, isLoggedIn } from '@/lib/authStorage'

export type UiThemeMode = 0 | 1
export type UiLanguage = 'ko' | 'en'
export type UiFontSize = 10 | 12 | 14 | 16 | 18 | 20 | 22 | 24

export const UI_SETTINGS_EVENT = 'kdt-ui-settings-change'
export const SHELL_REFRESH_EVENT = 'kdt-shell-refresh'
const SETTINGS_STORAGE_KEY = 'kdt-user-settings'
const SYSTEM_SETTINGS_CONFIG_KEY = 'system_settings_config'
const FONT_SCALE_STYLE_ID = 'kdt-font-scale-style'

export const UI_FONT_SIZE_OPTIONS = [10, 12, 14, 16, 18, 20, 22, 24] as const
export const DEFAULT_UI_FONT_SIZE: UiFontSize = 18

export const REFRESH_INTERVAL_OPTIONS = [1, 5, 10, 30] as const
export type RefreshIntervalMinutes = (typeof REFRESH_INTERVAL_OPTIONS)[number]
export const DEFAULT_REFRESH_INTERVAL: RefreshIntervalMinutes = 1
export const DEFAULT_AUTO_REFRESH_ENABLED = true

function isRefreshInterval(value: unknown): value is RefreshIntervalMinutes {
  return typeof value === 'number' && (REFRESH_INTERVAL_OPTIONS as readonly number[]).includes(value)
}

function readStoredRefreshSettings(): {
  autoRefreshEnabled: boolean
  refreshInterval: RefreshIntervalMinutes
} {
  if (typeof window === 'undefined') {
    return {
      autoRefreshEnabled: DEFAULT_AUTO_REFRESH_ENABLED,
      refreshInterval: DEFAULT_REFRESH_INTERVAL,
    }
  }
  try {
    const raw = localStorage.getItem(SYSTEM_SETTINGS_CONFIG_KEY)
    if (!raw) {
      return {
        autoRefreshEnabled: DEFAULT_AUTO_REFRESH_ENABLED,
        refreshInterval: DEFAULT_REFRESH_INTERVAL,
      }
    }
    const parsed = JSON.parse(raw) as {
      autoRefreshEnabled?: unknown
      refreshInterval?: unknown
    }
    return {
      autoRefreshEnabled:
        typeof parsed.autoRefreshEnabled === 'boolean'
          ? parsed.autoRefreshEnabled
          : DEFAULT_AUTO_REFRESH_ENABLED,
      refreshInterval: isRefreshInterval(parsed.refreshInterval)
        ? parsed.refreshInterval
        : DEFAULT_REFRESH_INTERVAL,
    }
  } catch {
    return {
      autoRefreshEnabled: DEFAULT_AUTO_REFRESH_ENABLED,
      refreshInterval: DEFAULT_REFRESH_INTERVAL,
    }
  }
}

function isUiFontSize(value: unknown): value is UiFontSize {
  return typeof value === 'number' && (UI_FONT_SIZE_OPTIONS as readonly number[]).includes(value)
}

export const NAV_MENUS = [
  { name: 'Main', icon: Home, path: '/main' },
  { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { name: 'Issue', icon: AlertCircle, path: '/issue' },
  { name: 'Knowledge', icon: BookOpen, path: '/knowledge' },
  { name: 'Inquiry', icon: HelpCircle, path: '/inquiry' },
  { name: 'SPC', icon: LineChart, path: '/management' },
  { name: 'Security', icon: Shield, path: '/security' },
  { name: 'Setting', icon: Settings, path: '/setting' },
] as const

/** Sidebar-only hide; route and page stay available (e.g. direct URL). */
const SIDEBAR_HIDDEN_PATHS = new Set<string>(['/security'])

const UI_COPY = {
  ko: {
    brandLine1: '양극재 품질 AI',
    brandLine2: '예측 시스템',
    systemOk: '시스템 운영 정상',
    collapseSidebar: '사이드바 닫기',
    expandSidebar: '사이드바 열기',
    menus: {
      '/main': '메인',
      '/dashboard': '대시보드',
      '/issue': '이슈 관리',
      '/knowledge': '라이브러리',
      '/inquiry': '문의 게시판',
      '/management': 'SPC 관리',
      '/security': '보안',
      '/setting': '환경 설정',
    } as Record<string, string>,
    actions: {
      save: '저장',
      cancel: '취소',
      search: '검색',
      filter: '필터',
      reset: '초기화',
      close: '닫기',
      confirm: '확인',
      add: '추가',
      edit: '수정',
      delete: '삭제',
      viewDetails: '상세 보기',
    },
  },
  en: {
    brandLine1: 'Cathode Quality AI',
    brandLine2: 'Prediction System',
    systemOk: 'System Operating Normally',
    collapseSidebar: 'Collapse sidebar',
    expandSidebar: 'Expand sidebar',
    menus: {
      '/main': 'Main',
      '/dashboard': 'Dashboard',
      '/issue': 'Issue Management',
      '/knowledge': 'Library',
      '/inquiry': 'Inquiry Board',
      '/management': 'SPC Management',
      '/security': 'Security',
      '/setting': 'Settings',
    } as Record<string, string>,
    actions: {
      save: 'Save',
      cancel: 'Cancel',
      search: 'Search',
      filter: 'Filter',
      reset: 'Reset',
      close: 'Close',
      confirm: 'Confirm',
      add: 'Add',
      edit: 'Edit',
      delete: 'Delete',
      viewDetails: 'View Details',
    },
  },
} as const

export type UiCopy = (typeof UI_COPY)[UiLanguage]

export function readStoredUiSettings(): {
  themeMode: UiThemeMode
  language: UiLanguage
  fontSize: UiFontSize
} {
  const fallback = {
    themeMode: 1 as UiThemeMode,
    language: 'ko' as UiLanguage,
    fontSize: DEFAULT_UI_FONT_SIZE,
  }
  if (typeof window === 'undefined') return fallback

  let themeMode = fallback.themeMode
  let language = fallback.language
  let fontSize = fallback.fontSize

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as { ThemeMode?: unknown; Language?: unknown; FontSize?: unknown }
      if (saved.ThemeMode === 0 || saved.ThemeMode === 1) themeMode = saved.ThemeMode
      if (saved.Language === 'ko' || saved.Language === 'en') language = saved.Language
      if (isUiFontSize(saved.FontSize)) fontSize = saved.FontSize
    }
  } catch {
    // keep fallback for this key
  }

  try {
    const raw = window.localStorage.getItem(SYSTEM_SETTINGS_CONFIG_KEY)
    if (raw) {
      const config = JSON.parse(raw) as { theme?: unknown; language?: unknown; fontSize?: unknown }
      if (config.theme === 0 || config.theme === 1) themeMode = config.theme
      if (config.language === 'ko' || config.language === 'en') language = config.language
      if (isUiFontSize(config.fontSize)) fontSize = config.fontSize
    }
  } catch {
    // keep current values
  }

  return { themeMode, language, fontSize }
}

export function applyDocumentTheme(themeMode: UiThemeMode) {
  if (typeof document === 'undefined') return
  const isDark = themeMode === 0
  document.documentElement.setAttribute('data-theme-mode', String(themeMode))
  document.documentElement.style.backgroundColor = isDark ? '#0f172a' : ''
  document.documentElement.style.color = isDark ? '#f8fafc' : ''
  document.body.style.backgroundColor = isDark ? '#0f172a' : ''
  document.body.style.color = isDark ? '#f8fafc' : ''
}

/** Apply Setting-page font size to the whole shell via --font-scale. */
export function applyDocumentFontSize(fontSize: number) {
  if (typeof document === 'undefined') return
  const size = isUiFontSize(fontSize) ? fontSize : DEFAULT_UI_FONT_SIZE
  const scale = size / DEFAULT_UI_FONT_SIZE

  document.documentElement.style.fontSize = '16px'
  document.documentElement.style.setProperty('--font-scale', String(scale))

  let styleEl = document.getElementById(FONT_SCALE_STYLE_ID) as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = FONT_SCALE_STYLE_ID
    document.head.appendChild(styleEl)
  }

  styleEl.textContent = `
    html { font-size: 16px !important; }
    body { font-size: 16px !important; line-height: 1.5 !important; }
    .text-xs   { font-size: calc(0.75rem  * var(--font-scale, 1)) !important; line-height: 1rem    !important; }
    .text-sm   { font-size: calc(0.875rem * var(--font-scale, 1)) !important; line-height: 1.25rem !important; }
    .text-base { font-size: calc(1rem     * var(--font-scale, 1)) !important; line-height: 1.5rem  !important; }
    .text-lg   { font-size: calc(1.125rem * var(--font-scale, 1)) !important; line-height: 1.75rem !important; }
    .text-xl   { font-size: calc(1.25rem  * var(--font-scale, 1)) !important; line-height: 1.75rem !important; }
    .text-2xl  { font-size: calc(1.5rem   * var(--font-scale, 1)) !important; line-height: 2rem    !important; }
    .text-3xl  { font-size: calc(1.875rem * var(--font-scale, 1)) !important; line-height: 2.25rem !important; }
    [data-sidebar] .sidebar-title  { font-size: calc(1.25rem  * var(--font-scale, 1)) !important; line-height: 1.75rem !important; }
    [data-sidebar] .sidebar-menu   { font-size: calc(1rem     * var(--font-scale, 1)) !important; line-height: 1.5rem  !important; }
    [data-sidebar] .sidebar-status { font-size: calc(0.875rem * var(--font-scale, 1)) !important; line-height: 1.25rem !important; }
  `
}

export function notifyUiSettingsChange(settings: {
  themeMode: UiThemeMode
  language: UiLanguage
  fontSize?: UiFontSize
}) {
  if (typeof window === 'undefined') return
  applyDocumentTheme(settings.themeMode)
  if (settings.fontSize !== undefined) applyDocumentFontSize(settings.fontSize)
  document.documentElement.lang = settings.language
  document.documentElement.setAttribute('data-ui-lang', settings.language)
  window.dispatchEvent(new CustomEvent(UI_SETTINGS_EVENT, { detail: settings }))
}

export function useUiSettings() {
  const [themeMode, setThemeMode] = useState<UiThemeMode>(1)
  const [language, setLanguage] = useState<UiLanguage>('ko')
  const [fontSize, setFontSize] = useState<UiFontSize>(DEFAULT_UI_FONT_SIZE)

  useEffect(() => {
    const apply = (next: {
      themeMode: UiThemeMode
      language: UiLanguage
      fontSize: UiFontSize
    }) => {
      setThemeMode(next.themeMode)
      setLanguage(next.language)
      setFontSize(next.fontSize)
      applyDocumentTheme(next.themeMode)
      applyDocumentFontSize(next.fontSize)
      document.documentElement.lang = next.language
      document.documentElement.setAttribute('data-ui-lang', next.language)
    }

    apply(readStoredUiSettings())

    if (isLoggedIn()) {
      void authApi
        .getSettings()
        .then(({ data }) => {
          const s = data.settings
          const next = {
            themeMode: (s.themeMode === 0 || s.themeMode === 1 ? s.themeMode : 1) as UiThemeMode,
            language: (s.language === 'en' ? 'en' : 'ko') as UiLanguage,
            fontSize: (isUiFontSize(s.fontSize) ? s.fontSize : DEFAULT_UI_FONT_SIZE) as UiFontSize,
          }
          try {
            let currentLocal: Record<string, any> = {}
            let currentSystem: Record<string, any> = {}
            try {
              const rawLocal = localStorage.getItem(SETTINGS_STORAGE_KEY)
              if (rawLocal) currentLocal = JSON.parse(rawLocal)
            } catch {}
            try {
              const rawSystem = localStorage.getItem(SYSTEM_SETTINGS_CONFIG_KEY)
              if (rawSystem) currentSystem = JSON.parse(rawSystem)
            } catch {}

            localStorage.setItem(
              SETTINGS_STORAGE_KEY,
              JSON.stringify({
                UserId: s.userId,
                FontSize: s.fontSize,
                ThemeMode: s.themeMode,
                Language: s.language ?? currentLocal.Language ?? 'ko',
                RefreshInterval: s.refreshInterval,
                UpdateAt: s.updatedAt,
              }),
            )
            localStorage.setItem(
              SYSTEM_SETTINGS_CONFIG_KEY,
              JSON.stringify({
                theme: s.themeMode,
                language: s.language ?? currentSystem.language ?? 'ko',
                fontSize: s.fontSize,
                autoRefreshEnabled: s.autoRefreshEnabled ?? currentSystem.autoRefreshEnabled ?? true,
                refreshInterval: s.refreshInterval,
                n8nAlert: s.n8nAlert ?? currentSystem.n8nAlert ?? false,
              }),
            )
          } catch {
            // ignore cache write failures
          }
          apply(next)
        })
        .catch(() => {
          // keep localStorage fallback
        })
    }

    const onCustom = (event: Event) => {
      const detail = (
        event as CustomEvent<{ themeMode?: unknown; language?: unknown; fontSize?: unknown }>
      ).detail
      if (!detail) {
        apply(readStoredUiSettings())
        return
      }
      const current = readStoredUiSettings()
      const nextTheme =
        detail.themeMode === 0 || detail.themeMode === 1 ? detail.themeMode : current.themeMode
      const nextLang =
        detail.language === 'ko' || detail.language === 'en' ? detail.language : current.language
      const nextFont = isUiFontSize(detail.fontSize) ? detail.fontSize : current.fontSize
      apply({ themeMode: nextTheme, language: nextLang, fontSize: nextFont })
    }

    const onStorage = (event: StorageEvent) => {
      if (
        event.key !== SETTINGS_STORAGE_KEY &&
        event.key !== SYSTEM_SETTINGS_CONFIG_KEY &&
        event.key !== null
      ) {
        return
      }
      apply(readStoredUiSettings())
    }

    window.addEventListener(UI_SETTINGS_EVENT, onCustom)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(UI_SETTINGS_EVENT, onCustom)
      window.removeEventListener('storage', onStorage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    themeMode,
    language,
    fontSize,
    isDark: themeMode === 0,
    copy: UI_COPY[language],
  }
}

/** Reads auto-refresh prefs from system_settings_config; re-syncs on settings events. */
export function useRefreshSettings() {
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(DEFAULT_AUTO_REFRESH_ENABLED)
  const [refreshInterval, setRefreshInterval] =
    useState<RefreshIntervalMinutes>(DEFAULT_REFRESH_INTERVAL)

  useEffect(() => {
    const apply = () => {
      const next = readStoredRefreshSettings()
      setAutoRefreshEnabled(next.autoRefreshEnabled)
      setRefreshInterval(next.refreshInterval)
    }

    apply()

    const onSettings = () => apply()
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SYSTEM_SETTINGS_CONFIG_KEY && event.key !== null) return
      apply()
    }

    window.addEventListener(UI_SETTINGS_EVENT, onSettings)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(UI_SETTINGS_EVENT, onSettings)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return { autoRefreshEnabled, refreshInterval }
}

/** Drop stale pagePayload/focus when navigating between shell pages. */
function PageChatRouteReset() {
  const pathname = usePathname()
  const { resetForRoute } = usePageChat()
  const prevPath = useRef(pathname)
  useEffect(() => {
    if (pathname === '/security' || prevPath.current === '/security') {
      prevPath.current = pathname
      return
    }
    if (prevPath.current !== pathname) {
      resetForRoute(pathname)
      prevPath.current = pathname
    }
  }, [pathname, resetForRoute])
  return null
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [canSeeKnowledge, setCanSeeKnowledge] = useState(false)
  const { isDark, copy } = useUiSettings()

  useEffect(() => {
    const load = () => {
      if (!isLoggedIn()) {
        setCanSeeKnowledge(false)
        return
      }
      void authApi
        .getSettings()
        .then(({ data }) => {
          setCanSeeKnowledge(data.settings.manage === 'O')
        })
        .catch(() => {
          setCanSeeKnowledge(false)
        })
    }
    load()
    window.addEventListener(AUTH_CHANGED_EVENT, load)
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, load)
  }, [])

  return (
    <PageChatProvider>
      <PageChatRouteReset />
      <div className="w-screen h-screen flex overflow-hidden text-gray-800 font-sans">
        <aside
          data-sidebar
          className={`flex h-full shrink-0 flex-col overflow-hidden bg-slate-900 text-white transition-[width] duration-300 ease-in-out ${
            isSidebarOpen ? 'w-[260px] p-6' : 'w-[72px] p-3'
          }`}
        >
          <div
            className={`mb-8 flex items-start justify-between gap-2 ${
              isSidebarOpen ? '' : 'mb-6 flex-col items-center'
            }`}
          >
            {isSidebarOpen ? (
              <div className="sidebar-title text-xl font-bold leading-tight text-blue-400">
                {copy.brandLine1}
                <br />
                {copy.brandLine2}
              </div>
            ) : (
              <div className="py-1 text-center text-sm font-bold leading-tight text-blue-400">
                AI
              </div>
            )}
            <button
              type="button"
              aria-label={isSidebarOpen ? copy.collapseSidebar : copy.expandSidebar}
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="shrink-0 rounded-lg p-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            >
              {isSidebarOpen ? <PanelLeftClose size={20} aria-hidden /> : <PanelLeft size={20} aria-hidden />}
            </button>
          </div>

          <ul className="flex flex-1 flex-col gap-2">
            {NAV_MENUS.filter((menu) => {
              if (SIDEBAR_HIDDEN_PATHS.has(menu.path)) return false
              if (menu.path === '/knowledge' && !canSeeKnowledge) return false
              return true
            }).map((menu) => {
              const Icon = menu.icon
              const active = pathname === menu.path
              const label = copy.menus[menu.path] ?? menu.name
              return (
                <li key={menu.path}>
                  <Link
                    href={menu.path}
                    title={label}
                    className={`sidebar-menu flex cursor-pointer items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                      isSidebarOpen ? 'gap-3 p-3' : 'justify-center p-3'
                    } ${
                      active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon size={20} className="shrink-0" aria-hidden />
                    {isSidebarOpen ? (
                      <span className="truncate font-medium">{label}</span>
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>

          <div
            className={`mt-auto flex items-center rounded-lg bg-slate-800 ${
              isSidebarOpen ? 'gap-2 p-3' : 'justify-center p-3'
            }`}
            title={copy.systemOk}
          >
            <div className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-green-500" />
            {isSidebarOpen ? (
              <span className="sidebar-status text-sm font-medium text-slate-300">
                {copy.systemOk}
              </span>
            ) : null}
          </div>
        </aside>

        <div
          className={`flex h-full min-w-0 flex-1 flex-col ${
            isDark
              ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-100'
              : 'bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50 text-gray-800'
          }`}
        >
          <ShellHeader />
          <main className="h-full min-h-0 w-full flex-1 overflow-hidden">{children}</main>
        </div>
      </div>

      <GlobalChatbot />
    </PageChatProvider>
  )
}
