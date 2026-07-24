'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
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
import { SelectedLotProvider } from '@/context/SelectedLotContext'

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

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  return (
    <SelectedLotProvider>
      <div className="w-screen h-screen flex overflow-hidden text-gray-800 font-sans">
        <aside
          data-sidebar
          className={`h-full bg-slate-900 text-white flex flex-col shrink-0 transition-[width] duration-300 ease-in-out overflow-hidden ${
            isSidebarOpen ? 'w-[260px] p-6' : 'w-[72px] p-3'
          }`}
        >
          <div
            className={`mb-8 flex items-start justify-between gap-2 ${
              isSidebarOpen ? '' : 'flex-col items-center mb-6'
            }`}
          >
            {isSidebarOpen ? (
              <div className="sidebar-title font-bold text-xl leading-tight text-blue-400">
                양극재 품질 AI
                <br />
                예측 시스템
              </div>
            ) : (
              <div className="font-bold text-sm text-blue-400 text-center leading-tight py-1">
                AI
              </div>
            )}
            <button
              type="button"
              aria-label={isSidebarOpen ? '사이드바 닫기' : '사이드바 열기'}
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="p-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors shrink-0"
            >
              {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeft size={20} />}
            </button>
          </div>

          <ul className="flex flex-col gap-2 flex-1">
            {NAV_MENUS.map((menu) => {
              const Icon = menu.icon
              const active = pathname === menu.path
              return (
                <li key={menu.path}>
                  <Link
                    href={menu.path}
                    title={menu.name}
                    className={`sidebar-menu flex items-center rounded-lg cursor-pointer transition-colors ${
                      isSidebarOpen ? 'gap-3 p-3' : 'justify-center p-3'
                    } ${
                      active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon size={20} className="shrink-0" />
                    {isSidebarOpen ? <span className="font-medium">{menu.name}</span> : null}
                  </Link>
                </li>
              )
            })}
          </ul>

          <div
            className={`mt-auto flex items-center bg-slate-800 rounded-lg ${
              isSidebarOpen ? 'gap-2 p-3' : 'justify-center p-3'
            }`}
            title="시스템 운영 정상"
          >
            <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shrink-0" />
            {isSidebarOpen ? (
              <span className="sidebar-status text-sm font-medium text-slate-300">
                시스템 운영 정상
              </span>
            ) : null}
          </div>
        </aside>

        <div className="flex-1 h-full bg-white flex flex-col min-w-0">
          <main className="h-full w-full min-h-0 overflow-hidden">{children}</main>
        </div>
      </div>

      {/* flex 레이아웃 밖 — 전역 플로팅 챗봇 */}
      <GlobalChatbot />
    </SelectedLotProvider>
  )
}
