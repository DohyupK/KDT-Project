'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Search,
  Bell,
  User,
  BookText,
  Home,
  LayoutDashboard,
  AlertCircle,
  BookOpen,
  HelpCircle,
  Briefcase,
  Settings,
} from 'lucide-react'
import type { ReactNode } from 'react'

export const NAV_MENUS = [
  { name: 'Main', icon: Home, path: '/main' },
  { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { name: 'Issue', icon: AlertCircle, path: '/issue' },
  { name: 'Knowledge', icon: BookOpen, path: '/knowledge' },
  { name: 'Inquiry', icon: HelpCircle, path: '/inquiry' },
  { name: 'Management', icon: Briefcase, path: '/management' },
  { name: 'Setting', icon: Settings, path: '/setting' },
] as const

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="w-screen h-screen flex overflow-hidden text-gray-800 font-sans">
      <aside className="w-[18%] h-full bg-slate-900 text-white flex flex-col p-6 shrink-0">
        <div className="mb-10 font-bold text-xl leading-tight text-blue-400">
          양극재 품질 AI
          <br />
          예측 시스템
        </div>
        <ul className="flex flex-col gap-2 flex-1">
          {NAV_MENUS.map((menu) => {
            const Icon = menu.icon
            const active = pathname === menu.path
            return (
              <li key={menu.path}>
                <Link
                  href={menu.path}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Icon size={20} />
                  <span className="font-medium">{menu.name}</span>
                </Link>
              </li>
            )
          })}
        </ul>
        <div className="mt-auto flex items-center gap-2 p-3 bg-slate-800 rounded-lg">
          <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-slate-300">시스템 운영 정상</span>
        </div>
      </aside>

      <div className="w-[82%] h-full bg-gray-50 flex flex-col min-w-0">
        <header className="h-[10%] w-full bg-white border-b border-gray-200 flex justify-between items-center px-8 shrink-0">
          <div className="w-[40%] relative flex items-center">
            <Search className="absolute left-3 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="LOT ID 또는 조건을 검색하세요..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            />
          </div>
          <div className="flex items-center gap-6">
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg font-medium hover:bg-blue-100 transition-colors"
            >
              <BookText size={18} />
              <span>사이트 메뉴얼</span>
            </button>
            <button
              type="button"
              className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            >
              <Bell size={24} />
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
            </button>
            <div className="text-gray-600 font-medium whitespace-nowrap">2026-06-25 10:30</div>
            <Link
              href="/login"
              aria-label="로그인"
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors bg-gray-200"
            >
              <User size={24} />
            </Link>
          </div>
        </header>

        <main className="h-[90%] w-full min-h-0 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
