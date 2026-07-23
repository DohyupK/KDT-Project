export const FONT_SIZE_OPTIONS = [10, 12, 14, 16, 18, 20, 22, 24] as const
export const DEFAULT_FONT_SIZE = 18
export const DEFAULT_THEME_MODE = 1 as const
export const DEFAULT_LANGUAGE = 'ko' as const
export const DEFAULT_REFRESH_INTERVAL = 1 as const

export const REFRESH_INTERVAL_OPTIONS = [
  { label: '1분', value: 1 },
  { label: '5분', value: 5 },
  { label: '10분', value: 10 },
  { label: '30분', value: 30 },
] as const

export type FontSize = (typeof FONT_SIZE_OPTIONS)[number]
export type ThemeMode = 0 | 1
export type Language = 'ko' | 'en'
export type RefreshInterval = (typeof REFRESH_INTERVAL_OPTIONS)[number]['value']

const FONT_SCALE_STYLE_ID = 'kdt-font-scale-style'

export function applyGlobalFontSize(fontSize: FontSize) {
  const scale = fontSize / DEFAULT_FONT_SIZE

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

export function applyGlobalThemeMode(themeMode: ThemeMode) {
  const isDark = themeMode === 0

  document.documentElement.setAttribute('data-theme-mode', String(themeMode))
  document.documentElement.style.backgroundColor = isDark ? '#0f172a' : ''
  document.documentElement.style.color = isDark ? '#f8fafc' : ''
  document.body.style.backgroundColor = isDark ? '#0f172a' : ''
  document.body.style.color = isDark ? '#f8fafc' : ''
}

export function getDefaultSettingsState() {
  return {
    fontSize: DEFAULT_FONT_SIZE as FontSize,
    themeMode: DEFAULT_THEME_MODE as ThemeMode,
    language: DEFAULT_LANGUAGE as Language,
    refreshInterval: DEFAULT_REFRESH_INTERVAL as RefreshInterval,
  }
}
