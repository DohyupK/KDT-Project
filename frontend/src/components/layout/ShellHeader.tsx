'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react'
import {
  SHELL_REFRESH_EVENT,
  useRefreshSettings,
  useUiSettings,
} from '@/components/layout/AppShell'
import UserAuthMenu from '@/components/layout/UserAuthMenu'
import type { HeaderNotification } from '@/config/headerNotificationSpec'
import { authApi } from '@/api/authApi'
import {
  AUTH_CHANGED_EVENT,
  isLoggedIn,
} from '@/lib/authStorage'
import {
  HEADER_NOTIF_PAGE_SIZE,
  dismissNotifications,
  loadHeaderNotifications,
  markNotificationsRead,
} from '@/lib/headerNotifications'

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function formatHeaderDateTime(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

function formatLastRefreshTime(date: Date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

export default function ShellHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const { isDark } = useUiSettings()
  const { autoRefreshEnabled, refreshInterval } = useRefreshSettings()

  const [now, setNow] = useState('')

  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
  const [refreshToast, setRefreshToast] = useState(false)
  const [isNotifyOpen, setIsNotifyOpen] = useState(false)
  const [notifications, setNotifications] = useState<HeaderNotification[]>([])
  const [notifyLoading, setNotifyLoading] = useState(false)
  const [notifyError, setNotifyError] = useState(false)
  const [notifyPage, setNotifyPage] = useState(1)
  const [emailCheck, setEmailCheck] = useState<'O' | 'X'>('X')
  const [emailCheckLoading, setEmailCheckLoading] = useState(false)
  const [emailCheckSaving, setEmailCheckSaving] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)

  const notifyRef = useRef<HTMLDivElement | null>(null)
  const refreshTimerRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  const unreadCount = notifications.filter((item) => item.unread).length
  const readCount = notifications.filter((item) => !item.unread).length
  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount)

  const totalPages = Math.max(1, Math.ceil(notifications.length / HEADER_NOTIF_PAGE_SIZE))
  const safePage = Math.min(notifyPage, totalPages)
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * HEADER_NOTIF_PAGE_SIZE
    return notifications.slice(start, start + HEADER_NOTIF_PAGE_SIZE)
  }, [notifications, safePage])

  useEffect(() => {
    if (notifyPage > totalPages) setNotifyPage(totalPages)
  }, [notifyPage, totalPages])

  const fetchNotifications = useCallback(async () => {
    setNotifyLoading(true)
    setNotifyError(false)
    try {
      const items = await loadHeaderNotifications()
      setNotifications(items)
      setNotifyPage((prev) => {
        const pages = Math.max(1, Math.ceil(items.length / HEADER_NOTIF_PAGE_SIZE))
        return Math.min(prev, pages)
      })
    } catch {
      setNotifyError(true)
    } finally {
      setNotifyLoading(false)
    }
  }, [])

  const triggerShellDataRefresh = useCallback(
    (options?: { toast?: boolean; source?: 'auto' | 'manual' }) => {
      const source = options?.source ?? 'manual'
      setLastRefreshedAt(new Date())
      if (options?.toast) {
        setRefreshToast(true)
        if (toastTimerRef.current !== null) {
          window.clearTimeout(toastTimerRef.current)
        }
        toastTimerRef.current = window.setTimeout(() => {
          setRefreshToast(false)
          toastTimerRef.current = null
        }, 2000)
      }
      router.refresh()
      window.dispatchEvent(
        new CustomEvent(SHELL_REFRESH_EVENT, {
          detail: { source },
        }),
      )
      void fetchNotifications()
    },
    [router, fetchNotifications],
  )

  useEffect(() => {
    setNow(formatHeaderDateTime(new Date()))
    const timer = window.setInterval(() => {
      setNow(formatHeaderDateTime(new Date()))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const fetchEmailCheck = useCallback(async () => {
    if (!isLoggedIn()) {
      setLoggedIn(false)
      setEmailCheck('X')
      return
    }
    setLoggedIn(true)
    setEmailCheckLoading(true)
    try {
      const { data } = await authApi.getSettings()
      setEmailCheck(data.settings.emailCheck === 'O' ? 'O' : 'X')
    } catch {
      setEmailCheck('X')
    } finally {
      setEmailCheckLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchNotifications()
  }, [fetchNotifications])

  useEffect(() => {
    const syncAuth = () => {
      setLoggedIn(isLoggedIn())
      void fetchEmailCheck()
      void fetchNotifications()
    }
    syncAuth()
    window.addEventListener(AUTH_CHANGED_EVENT, syncAuth)
    window.addEventListener('storage', syncAuth)
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, syncAuth)
      window.removeEventListener('storage', syncAuth)
    }
  }, [fetchEmailCheck, fetchNotifications])

  /** Settings → auto refresh (skipped on management — Grafana embeds handle their own refresh). */
  useEffect(() => {
    if (!autoRefreshEnabled) return
    const ms = Math.max(1, refreshInterval) * 60_000
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      if (pathname.startsWith('/management')) return
      triggerShellDataRefresh({ toast: false, source: 'auto' })
    }, ms)
    return () => window.clearInterval(timer)
  }, [autoRefreshEnabled, refreshInterval, triggerShellDataRefresh, pathname])

  useEffect(() => {
    setIsNotifyOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!isNotifyOpen) return
    void fetchNotifications()
    void fetchEmailCheck()

    const onPointerDown = (event: globalThis.MouseEvent) => {
      if (notifyRef.current && !notifyRef.current.contains(event.target as Node)) {
        setIsNotifyOpen(false)
      }
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setIsNotifyOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isNotifyOpen, fetchNotifications, fetchEmailCheck])

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
      }
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current)
      }
    }
  }, [])

  const handleRefresh = () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    triggerShellDataRefresh({ toast: true, source: 'manual' })
    refreshTimerRef.current = window.setTimeout(() => {
      setIsRefreshing(false)
      refreshTimerRef.current = null
    }, 600)
  }

  const toggleNotify = () => {
    setIsNotifyOpen((prev) => !prev)
  }

  const openNotification = (item: HeaderNotification) => {
    void markNotificationsRead([item.id])
    setNotifications((prev) =>
      prev.map((row) => (row.id === item.id ? { ...row, unread: false } : row)),
    )
    setIsNotifyOpen(false)
    if (item.href) router.push(item.href)
  }

  const dismissOne = (item: HeaderNotification, event: MouseEvent) => {
    event.stopPropagation()
    void dismissNotifications([item.id])
    setNotifications((prev) => {
      const next = prev.filter((row) => row.id !== item.id)
      const pages = Math.max(1, Math.ceil(next.length / HEADER_NOTIF_PAGE_SIZE))
      setNotifyPage((p) => Math.min(p, pages))
      return next
    })
  }

  const markAllRead = () => {
    void markNotificationsRead(notifications.map((item) => item.id))
    setNotifications((prev) => prev.map((item) => ({ ...item, unread: false })))
  }

  const removeReadNotifications = () => {
    const readIds = notifications.filter((item) => !item.unread).map((item) => item.id)
    if (readIds.length === 0) return
    void dismissNotifications(readIds)
    setNotifications((prev) => {
      const next = prev.filter((item) => item.unread)
      const pages = Math.max(1, Math.ceil(next.length / HEADER_NOTIF_PAGE_SIZE))
      setNotifyPage((p) => Math.min(p, pages))
      return next
    })
  }

  const toggleEmailCheck = async () => {
    if (!loggedIn || emailCheckSaving) return
    const next: 'O' | 'X' = emailCheck === 'O' ? 'X' : 'O'
    const prev = emailCheck
    setEmailCheck(next)
    setEmailCheckSaving(true)
    try {
      const { data } = await authApi.updateSettings({ emailCheck: next })
      setEmailCheck(data.settings.emailCheck === 'O' ? 'O' : 'X')
    } catch {
      setEmailCheck(prev)
    } finally {
      setEmailCheckSaving(false)
    }
  }

  const iconBtnClass = isDark
    ? 'inline-flex items-center justify-center rounded-lg border border-slate-600/80 bg-slate-800 text-slate-100 shadow-sm transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60'
    : 'inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60'

  const notifyActionBtnClass = isDark
    ? 'inline-flex items-center justify-center rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-200 transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-slate-800'
    : 'inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white'

  return (
    <>
    <header
      className={`sticky top-0 z-50 flex h-16 w-full items-center justify-between gap-4 border-b px-6 ${
        isDark
          ? 'border-slate-700/80 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800'
          : 'border-slate-200/80 bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50'
      }`}
    >
      <time
        dateTime={now || undefined}
        aria-live="polite"
        aria-atomic="true"
        className={`min-w-0 truncate font-mono text-sm tabular-nums tracking-tight sm:text-base ${
          isDark ? 'text-slate-300' : 'text-slate-600'
        }`}
      >
        {now || '\u00A0'}
      </time>

      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
        {lastRefreshedAt ? (
          <span
            className={`hidden text-xs tabular-nums md:inline ${
              isDark ? 'text-slate-500' : 'text-slate-400'
            }`}
            title="마지막 새로고침 시각"
          >
            갱신 {formatLastRefreshTime(lastRefreshedAt)}
          </span>
        ) : null}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          aria-label="현재 페이지 새로고침"
          title="새로고침"
          className={`${iconBtnClass} min-h-10 min-w-10 gap-1.5 px-2.5 text-sm font-medium sm:px-3`}
        >
          <RefreshCw
            size={16}
            aria-hidden
            className={isRefreshing ? 'animate-spin' : undefined}
          />
          <span className="hidden sm:inline">새로고침</span>
        </button>

        <div className="relative" ref={notifyRef}>
          <button
            type="button"
            onClick={toggleNotify}
            aria-label="알림 열기"
            title="알림"
            aria-expanded={isNotifyOpen}
            aria-haspopup="menu"
            className={`${iconBtnClass} relative min-h-12 min-w-12`}
          >
            <Bell size={20} aria-hidden />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {badgeLabel}
              </span>
            ) : null}
          </button>

          {isNotifyOpen ? (
            <div
              role="menu"
              className={`absolute right-0 top-12 z-50 w-[min(92vw,400px)] overflow-hidden rounded-xl border shadow-lg ${
                isDark ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-white'
              }`}
            >
              <div
                className={`flex items-center justify-between gap-2 border-b px-4 py-3 ${
                  isDark ? 'border-slate-700' : 'border-gray-100'
                }`}
              >
                <strong className={`text-sm ${isDark ? 'text-slate-100' : 'text-gray-800'}`}>
                  알림
                </strong>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {unreadCount > 0 ? (
                    <button type="button" className={notifyActionBtnClass} onClick={markAllRead}>
                      모두 읽음
                    </button>
                  ) : null}
                  {notifications.length > 0 ? (
                    <button
                      type="button"
                      className={notifyActionBtnClass}
                      disabled={readCount === 0}
                      onClick={removeReadNotifications}
                    >
                      읽은 알림 제거
                    </button>
                  ) : null}
                </div>
              </div>

              {notifyLoading && notifications.length === 0 ? (
                <p
                  className={`px-4 py-8 text-center text-sm ${
                    isDark ? 'text-slate-400' : 'text-gray-500'
                  }`}
                >
                  알림을 불러오는 중…
                </p>
              ) : notifyError && notifications.length === 0 ? (
                <p
                  className={`px-4 py-8 text-center text-sm ${
                    isDark ? 'text-slate-400' : 'text-gray-500'
                  }`}
                >
                  알림을 불러오지 못했습니다.
                </p>
              ) : notifications.length === 0 ? (
                <p
                  className={`px-4 py-8 text-center text-sm ${
                    isDark ? 'text-slate-400' : 'text-gray-500'
                  }`}
                >
                  새로운 알림이 없습니다.
                </p>
              ) : (
                <>
                  {pageItems.map((item) => (
                    <div
                      key={item.id}
                      role="menuitem"
                      className={`flex w-full border-b last:border-b-0 ${
                        isDark
                          ? `border-slate-800 ${item.unread ? 'bg-blue-950/40' : ''}`
                          : `border-gray-50 ${item.unread ? 'bg-blue-50/50' : ''}`
                      }`}
                    >
                      <button
                        type="button"
                        className={`min-w-0 flex-1 px-4 py-3 text-left ${
                          isDark ? 'hover:bg-slate-800' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => openNotification(item)}
                      >
                        <div
                          className={`flex justify-between gap-2 text-sm font-semibold ${
                            isDark ? 'text-slate-100' : 'text-gray-800'
                          }`}
                        >
                          <span className="min-w-0 truncate">{item.title}</span>
                          <span
                            className={`shrink-0 text-xs font-normal ${
                              isDark ? 'text-slate-500' : 'text-slate-400'
                            }`}
                          >
                            {item.time}
                          </span>
                        </div>
                        <p className={`mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                          {item.message}
                        </p>
                      </button>
                      <button
                        type="button"
                        aria-label="알림 제거"
                        title="알림 제거"
                        className={`shrink-0 px-3 ${
                          isDark
                            ? 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
                            : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'
                        }`}
                        onClick={(event) => dismissOne(item, event)}
                      >
                        <X size={14} aria-hidden />
                      </button>
                    </div>
                  ))}

                  <div
                    className={`flex items-center justify-between gap-2 border-t px-3 py-2 ${
                      isDark ? 'border-slate-700' : 'border-gray-100'
                    }`}
                  >
                    <button
                      type="button"
                      aria-label="이전 알림 페이지"
                      disabled={safePage <= 1}
                      className={`${iconBtnClass} h-8 w-8 min-h-0 min-w-0`}
                      onClick={() => setNotifyPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft size={16} aria-hidden />
                    </button>
                    <span
                      className={`text-xs tabular-nums ${
                        isDark ? 'text-slate-400' : 'text-gray-500'
                      }`}
                    >
                      {safePage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      aria-label="다음 알림 페이지"
                      disabled={safePage >= totalPages}
                      className={`${iconBtnClass} h-8 w-8 min-h-0 min-w-0`}
                      onClick={() => setNotifyPage((p) => Math.min(totalPages, p + 1))}
                    >
                      <ChevronRight size={16} aria-hidden />
                    </button>
                  </div>
                </>
              )}

              <div
                className={`flex items-start justify-between gap-3 border-t px-4 py-3 ${
                  isDark ? 'border-slate-700 bg-slate-950/50' : 'border-gray-100 bg-slate-50/80'
                }`}
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-semibold ${
                      isDark ? 'text-slate-100' : 'text-gray-800'
                    }`}
                  >
                    이메일 자동 발신
                  </p>
                  <p
                    className={`mt-0.5 text-xs leading-relaxed ${
                      isDark ? 'text-slate-400' : 'text-gray-500'
                    }`}
                  >
                    {loggedIn
                      ? '위험등급이 심각인 LOT 이슈 보고서를 메일로 받습니다.'
                      : '로그인 후 수신 여부를 설정할 수 있습니다.'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={emailCheck === 'O'}
                  aria-label="이메일 자동 발신"
                  disabled={!loggedIn || emailCheckLoading || emailCheckSaving}
                  onClick={() => {
                    void toggleEmailCheck()
                  }}
                  className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 ${
                    emailCheck === 'O'
                      ? 'bg-blue-600'
                      : isDark
                        ? 'bg-slate-600'
                        : 'bg-slate-300'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      emailCheck === 'O' ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <UserAuthMenu />
      </div>
    </header>

    {refreshToast ? (
      <div
        role="status"
        aria-live="polite"
        className={`fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg border px-4 py-2.5 text-sm font-medium shadow-lg ${
          isDark
            ? 'border-slate-600 bg-slate-800 text-slate-100'
            : 'border-slate-200 bg-white text-slate-800'
        }`}
      >
        페이지 데이터를 새로고침했습니다.
      </div>
    ) : null}
    </>
  )
}
