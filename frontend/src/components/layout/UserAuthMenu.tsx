'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { LogOut, User } from 'lucide-react'
import { authApi } from '@/api/authApi'
import { clearAuthSession, getAuthUser, isLoggedIn } from '@/lib/authStorage'

export default function UserAuthMenu() {
  const router = useRouter()
  const [loggedIn, setLoggedIn] = useState(false)
  const [userName, setUserName] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const syncAuth = () => {
      setLoggedIn(isLoggedIn())
      setUserName(getAuthUser()?.name ?? '')
    }
    syncAuth()
    window.addEventListener('storage', syncAuth)
    return () => window.removeEventListener('storage', syncAuth)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
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
    setMenuOpen(false)
    router.push('/login')
  }

  if (loggedIn) {
    return (
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label="사용자 메뉴"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200/60 bg-white pl-1.5 pr-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
            {userName.charAt(0) || 'U'}
          </span>
          <span className="max-w-[80px] truncate">{userName || '사용자'}</span>
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-2 w-40 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg z-20">
            <Link
              href="/setting"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <User size={16} />
              설정
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <LogOut size={16} />
              로그아웃
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <Link
      href="/login"
      aria-label="로그인"
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200/60 bg-white pl-1.5 pr-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
        <User size={14} />
      </span>
      로그인
    </Link>
  )
}
