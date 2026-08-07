'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, RefreshCw } from 'lucide-react'
import { SHELL_REFRESH_EVENT, useUiSettings } from '@/components/layout/AppShell'
import UserAuthMenu from '@/components/layout/UserAuthMenu'
import { MOCK_HEADER_NOTIFICATIONS } from '@/config/headerNotificationMocks'
import type { HeaderNotification } from '@/config/headerNotificationSpec'

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

  const [now, setNow] = useState('')

  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
  const [refreshToast, setRefreshToast] = useState(false)
  const [isNotifyOpen, setIsNotifyOpen] = useState(false)
  const [notifications, setNotifications] = useState<HeaderNotification[]>(MOCK_HEADER_NOTIFICATIONS)

  const notifyRef = useRef<HTMLDivElement | null>(null)
  const refreshTimerRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  const unreadCount = notifications.filter((item) => item.unread).length
  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount)

  useEffect(() => {
    setNow(formatHeaderDateTime(new Date()))
    const timer = window.setInterval(() => {
      setNow(formatHeaderDateTime(new Date()))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    setIsNotifyOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!isNotifyOpen) return

    const onPointerDown = (event: MouseEvent) => {
      if (notifyRef.current && !notifyRef.current.contains(event.target as Node)) {
        setIsNotifyOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsNotifyOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isNotifyOpen])

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
    setLastRefreshedAt(new Date())
    setRefreshToast(true)
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current)
    }
    toastTimerRef.current = window.setTimeout(() => {
      setRefreshToast(false)
      toastTimerRef.current = null
    }, 2000)
    router.refresh()
    window.dispatchEvent(new Event(SHELL_REFRESH_EVENT))
    refreshTimerRef.current = window.setTimeout(() => {
      setIsRefreshing(false)
      refreshTimerRef.current = null
    }, 600)
  }

  const toggleNotify = () => {
    setIsNotifyOpen((prev) => !prev)
  }

  const openNotification = (item: HeaderNotification) => {
    setNotifications((prev) =>
      prev.map((row) => (row.id === item.id ? { ...row, unread: false } : row)),
    )
    setIsNotifyOpen(false)
    if (item.href) router.push(item.href)
  }

  const iconBtnClass = isDark
    ? 'inline-flex items-center justify-center rounded-lg border border-slate-600/80 bg-slate-800 text-slate-100 shadow-sm transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60'
    : 'inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60'

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
              className={`absolute right-0 top-12 z-50 w-[min(92vw,320px)] overflow-hidden rounded-xl border shadow-lg ${
                isDark ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-white'
              }`}
            >
              <div
                className={`flex items-center justify-between border-b px-4 py-3 ${
                  isDark ? 'border-slate-700' : 'border-gray-100'
                }`}
              >
                <strong className={`text-sm ${isDark ? 'text-slate-100' : 'text-gray-800'}`}>
                  알림
                </strong>
                {unreadCount > 0 ? (
                  <button
                    type="button"
                    className={`text-xs font-medium ${
                      isDark
                        ? 'text-slate-400 hover:text-slate-200'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                    onClick={() =>
                      setNotifications((prev) => prev.map((item) => ({ ...item, unread: false })))
                    }
                  >
                    모두 읽음
                  </button>
                ) : null}
              </div>

              {notifications.length === 0 ? (
                <p
                  className={`px-4 py-8 text-center text-sm ${
                    isDark ? 'text-slate-400' : 'text-gray-500'
                  }`}
                >
                  새로운 알림이 없습니다.
                </p>
              ) : (
                notifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    className={`block w-full border-b px-4 py-3 text-left last:border-b-0 ${
                      isDark
                        ? `border-slate-800 hover:bg-slate-800 ${item.unread ? 'bg-blue-950/40' : ''}`
                        : `border-gray-50 hover:bg-gray-50 ${item.unread ? 'bg-blue-50/50' : ''}`
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
                ))
              )}
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
