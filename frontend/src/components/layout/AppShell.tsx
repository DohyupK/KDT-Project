'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Home,
  LayoutDashboard,
  AlertCircle,
  BookOpen,
  HelpCircle,
  Briefcase,
  Settings,
  Shield,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import type { ReactNode } from 'react'
import GlobalChatbot from '@/components/chat/GlobalChatbot'
import ShellHeader from '@/components/layout/ShellHeader'
import { SelectedLotProvider } from '@/context/SelectedLotContext'

export type UiThemeMode = 0 | 1
export type UiLanguage = 'ko' | 'en'

export const UI_SETTINGS_EVENT = 'kdt-ui-settings-change'
const SETTINGS_STORAGE_KEY = 'kdt-user-settings'
const SYSTEM_SETTINGS_CONFIG_KEY = 'system_settings_config'

export const NAV_MENUS = [
  { name: 'Main', icon: Home, path: '/main' },
  { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { name: 'Issue', icon: AlertCircle, path: '/issue' },
  { name: 'Knowledge', icon: BookOpen, path: '/knowledge' },
  { name: 'Inquiry', icon: HelpCircle, path: '/inquiry' },
  { name: 'Management', icon: Briefcase, path: '/management' },
  { name: 'Security', icon: Shield, path: '/security' },
  { name: 'Setting', icon: Settings, path: '/setting' },
] as const

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
      '/management': '관리',
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
      '/management': 'Management',
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

export function readStoredUiSettings(): { themeMode: UiThemeMode; language: UiLanguage } {
  const fallback = { themeMode: 1 as UiThemeMode, language: 'ko' as UiLanguage }
  if (typeof window === 'undefined') return fallback

  let themeMode = fallback.themeMode
  let language = fallback.language

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as { ThemeMode?: unknown; Language?: unknown }
      if (saved.ThemeMode === 0 || saved.ThemeMode === 1) themeMode = saved.ThemeMode
      if (saved.Language === 'ko' || saved.Language === 'en') language = saved.Language
    }
  } catch {
    // keep fallback for this key
  }

  try {
    const raw = window.localStorage.getItem(SYSTEM_SETTINGS_CONFIG_KEY)
    if (raw) {
      const config = JSON.parse(raw) as { theme?: unknown; language?: unknown }
      if (config.theme === 0 || config.theme === 1) themeMode = config.theme
      if (config.language === 'ko' || config.language === 'en') language = config.language
    }
  } catch {
    // keep current values
  }

  return { themeMode, language }
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

export function notifyUiSettingsChange(settings: {
  themeMode: UiThemeMode
  language: UiLanguage
}) {
  if (typeof window === 'undefined') return
  applyDocumentTheme(settings.themeMode)
  document.documentElement.lang = settings.language
  document.documentElement.setAttribute('data-ui-lang', settings.language)
  window.dispatchEvent(new CustomEvent(UI_SETTINGS_EVENT, { detail: settings }))
}

export function useUiSettings() {
  const [themeMode, setThemeMode] = useState<UiThemeMode>(1)
  const [language, setLanguage] = useState<UiLanguage>('ko')

  useEffect(() => {
    const apply = (next: { themeMode: UiThemeMode; language: UiLanguage }) => {
      setThemeMode(next.themeMode)
      setLanguage(next.language)
      applyDocumentTheme(next.themeMode)
      document.documentElement.lang = next.language
      document.documentElement.setAttribute('data-ui-lang', next.language)
    }

    apply(readStoredUiSettings())

    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ themeMode?: unknown; language?: unknown }>).detail
      if (!detail) {
        apply(readStoredUiSettings())
        return
      }
      const current = readStoredUiSettings()
      const nextTheme =
        detail.themeMode === 0 || detail.themeMode === 1 ? detail.themeMode : current.themeMode
      const nextLang =
        detail.language === 'ko' || detail.language === 'en' ? detail.language : current.language
      apply({ themeMode: nextTheme, language: nextLang })
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
    isDark: themeMode === 0,
    copy: UI_COPY[language],
  }
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const { isDark, copy } = useUiSettings()

  return (
    <SelectedLotProvider>
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
            {NAV_MENUS.map((menu) => {
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
    </SelectedLotProvider>
  )
}
