'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { LogOut, User } from 'lucide-react'
import { authApi } from '@/api/authApi'
import {
  AUTH_CHANGED_EVENT,
  clearAuthSession,
  getAuthUser,
  isLoggedIn,
} from '@/lib/authStorage'
import { useUiSettings } from '@/components/layout/AppShell'
import PersonalInfoModal from '@/components/layout/PersonalInfoModal'

type UserAuthMenuProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export default function UserAuthMenu({ open, onOpenChange }: UserAuthMenuProps) {
  const router = useRouter()
  const { isDark } = useUiSettings()
  const [loggedIn, setLoggedIn] = useState(false)
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [authReady, setAuthReady] = useState(false)
  const [internalOpen, setInternalOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const isControlled = typeof open === 'boolean' && typeof onOpenChange === 'function'
  const menuOpen = isControlled ? open : internalOpen

  const setMenuOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    const resolved = typeof next === 'function' ? next(menuOpen) : next
    if (isControlled) onOpenChange?.(resolved)
    else setInternalOpen(resolved)
  }

  useEffect(() => {
    const syncAuth = () => {
      setLoggedIn(isLoggedIn())
      const user = getAuthUser()
      setUserName(user?.name ?? '')
      setUserEmail(user?.email ?? '')
      setAuthReady(true)
    }
    syncAuth()
    window.addEventListener('storage', syncAuth)
    window.addEventListener(AUTH_CHANGED_EVENT, syncAuth)
    return () => {
      window.removeEventListener('storage', syncAuth)
      window.removeEventListener(AUTH_CHANGED_EVENT, syncAuth)
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [menuOpen])

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch {
      // 토큰 만료 등으로 실패해도 클라이언트 세션은 제거
    }
    clearAuthSession()
    setLoggedIn(false)
    setUserName('')
    setUserEmail('')
    setMenuOpen(false)
    setProfileOpen(false)
    router.push('/login')
  }

  const triggerClass = isDark
    ? 'inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-600/80 bg-slate-800 py-1.5 pl-1.5 pr-3 text-sm font-medium text-slate-100 shadow-sm hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40'
    : 'inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200/60 bg-white py-1.5 pl-1.5 pr-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40'

  const avatarClass = isDark
    ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-200'
    : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600'

  if (!authReady) {
    return (
      <div
        className={`inline-flex min-h-10 min-w-[120px] animate-pulse items-center rounded-lg border px-3 ${
          isDark ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-gray-50'
        }`}
        aria-hidden
      />
    )
  }

  if (loggedIn) {
    return (
      <>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="사용자 메뉴"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            title="사용자 메뉴"
            className={triggerClass}
          >
            <span className={avatarClass} aria-hidden>
              {userName.charAt(0) || 'U'}
            </span>
            <span className="min-w-0 text-left">
              <span className="block max-w-[110px] truncate text-sm font-semibold leading-tight sm:max-w-[140px]">
                {userName || '사용자'}
              </span>
              <span
                className={`hidden max-w-[140px] truncate text-[11px] font-normal leading-tight sm:block ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                {userEmail || '로그인됨'}
              </span>
            </span>
          </button>
          {menuOpen && (
            <div
              role="menu"
              className={`absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border shadow-lg ${
                isDark ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-white'
              }`}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  setProfileOpen(true)
                }}
                className={`flex w-full items-center gap-2 px-4 py-3 text-sm transition-colors ${
                  isDark
                    ? 'text-slate-200 hover:bg-slate-800'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <User size={16} aria-hidden />
                내 정보
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                className={`flex w-full items-center gap-2 px-4 py-3 text-sm transition-colors ${
                  isDark
                    ? 'text-slate-200 hover:bg-slate-800'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <LogOut size={16} aria-hidden />
                로그아웃
              </button>
            </div>
          )}
        </div>
        <PersonalInfoModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      </>
    )
  }

  return (
    <Link href="/login" aria-label="로그인" title="로그인" className={triggerClass}>
      <span className={avatarClass}>
        <User size={14} aria-hidden />
      </span>
      로그인
    </Link>
  )
}
