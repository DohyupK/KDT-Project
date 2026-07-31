'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, RefreshCw } from 'lucide-react'
import { useUiSettings } from '@/components/layout/AppShell'
import UserAuthMenu from '@/components/layout/UserAuthMenu'

type HeaderNotification = {
  id: string
  time: string
  title: string
  message: string
  unread: boolean
}

const MOCK_NOTIFICATIONS: HeaderNotification[] = [
  {
    id: 'n1',
    time: '방금 전',
    title: '고위험 LOT 감지',
    message: '위험도가 높은 LOT가 감지되었습니다. 이슈 관리에서 확인해 주세요.',
    unread: true,
  },
  {
    id: 'n2',
    time: '12분 전',
    title: '문의 답변 대기',
    message: '접수된 문의 중 미답변 항목이 있습니다.',
    unread: true,
  },
  {
    id: 'n3',
    time: '1시간 전',
    title: '야간 인수인계 알림',
    message: '미완료 이슈가 인수인계 보고서에 포함되었습니다.',
    unread: false,
  },
]

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function formatHeaderDateTime(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

export default function ShellHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const { isDark } = useUiSettings()

  const [now, setNow] = useState('')

  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isNotifyOpen, setIsNotifyOpen] = useState(false)
  const [notifications, setNotifications] = useState<HeaderNotification[]>(MOCK_NOTIFICATIONS)

  const notifyRef = useRef<HTMLDivElement | null>(null)
  const refreshTimerRef = useRef<number | null>(null)

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
    }
  }, [])

  const handleRefresh = () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    router.refresh()
    refreshTimerRef.current = window.setTimeout(() => {
      setIsRefreshing(false)
      refreshTimerRef.current = null
    }, 600)
  }

  const toggleNotify = () => {
    setIsNotifyOpen((prev) => !prev)
  }

  const iconBtnClass = isDark
    ? 'inline-flex items-center justify-center rounded-lg border border-slate-600/80 bg-slate-800 text-slate-100 shadow-sm transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60'
    : 'inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60'

  return (
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

      <div className="flex shrink-0 items-center gap-4">
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
                    onClick={() =>
                      setNotifications((prev) =>
                        prev.map((row) => (row.id === item.id ? { ...row, unread: false } : row)),
                      )
                    }
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
  )
}
