'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, RefreshCw, User } from 'lucide-react'

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

export default function ShellHeader() {
  const pathname = usePathname()
  const router = useRouter()

  const [isLoggedIn] = useState<boolean>(false)
  const [userName] = useState<string>('김현수')

  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isNotifyOpen, setIsNotifyOpen] = useState(false)
  const [notifications, setNotifications] = useState<HeaderNotification[]>(MOCK_NOTIFICATIONS)

  const notifyRef = useRef<HTMLDivElement | null>(null)
  const refreshTimerRef = useRef<number | null>(null)

  const unreadCount = notifications.filter((item) => item.unread).length
  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount)
  const avatarInitial = userName.trim().charAt(0)

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

  return (
    <header className="sticky top-0 z-50 flex h-16 w-full items-center justify-end border-b border-gray-200 bg-white px-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          aria-label="현재 페이지 새로고침"
          title="새로고침"
          className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3"
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
            className="relative inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
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
              className="absolute right-0 top-12 z-50 w-[min(92vw,320px)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
            >
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <strong className="text-sm text-gray-800">알림</strong>
                {unreadCount > 0 ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-gray-500 hover:text-gray-700"
                    onClick={() =>
                      setNotifications((prev) => prev.map((item) => ({ ...item, unread: false })))
                    }
                  >
                    모두 읽음
                  </button>
                ) : null}
              </div>

              {notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-500">
                  새로운 알림이 없습니다.
                </p>
              ) : (
                notifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    className={`block w-full border-b border-gray-50 px-4 py-3 text-left last:border-b-0 hover:bg-gray-50 ${
                      item.unread ? 'bg-blue-50/50' : ''
                    }`}
                    onClick={() =>
                      setNotifications((prev) =>
                        prev.map((row) => (row.id === item.id ? { ...row, unread: false } : row)),
                      )
                    }
                  >
                    <div className="flex justify-between gap-2 text-sm font-semibold text-gray-800">
                      <span className="min-w-0 truncate">{item.title}</span>
                      <span className="shrink-0 text-xs font-normal text-slate-400">{item.time}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{item.message}</p>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        {isLoggedIn ? (
          <button
            type="button"
            aria-label="사용자 프로필"
            title="사용자 프로필"
            className="inline-flex min-h-10 max-w-[200px] items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-700">
              {avatarInitial ? (
                avatarInitial
              ) : (
                <User size={14} aria-hidden />
              )}
            </span>
            <span className="truncate text-sm font-medium text-gray-800">
              {userName} 님
            </span>
          </button>
        ) : (
          <button
            type="button"
            aria-label="로그인"
            title="로그인"
            onClick={() => router.push('/login')}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white py-1.5 pl-1.5 pr-3 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
              <User size={14} aria-hidden />
            </span>
            로그인
          </button>
        )}
      </div>
    </header>
  )
}
