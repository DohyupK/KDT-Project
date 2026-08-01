'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useUiSettings } from '@/components/layout/AppShell'
import { SHELL_CONTENT_CLASS } from '@/components/layout/shellContent'

type SpcCardTitle =
  | 'd50'
  | 'd90'
  | 'metal_impurity'
  | 'lithium_input'
  | 'additive_ratio'
  | 'process_time'
  | 'sintering_temp'
  | 'humidity'
  | 'tank_pressure'

const SPC_CARD_LABELS: Record<SpcCardTitle, string> = {
  d50: 'd50',
  d90: 'd90',
  metal_impurity: '금속 불순물',
  lithium_input: '리튬 투입량',
  additive_ratio: '첨가제 비율',
  process_time: '공정 시간',
  sintering_temp: '소성 온도',
  humidity: '습도',
  tank_pressure: '탱크 압력',
}

function SpcGraphCard({
  title,
  isDark,
  onExpand,
  expandButtonRef,
}: {
  title: SpcCardTitle
  isDark: boolean
  onExpand: (title: SpcCardTitle) => void
  expandButtonRef: (element: HTMLButtonElement | null) => void
}) {
  return (
    <article
      className={`flex min-h-[340px] flex-col overflow-hidden rounded-2xl border ${
        isDark ? 'border-slate-700 bg-slate-900/60' : 'border-slate-200 bg-white/90'
      }`}
    >
      <div
        className={`flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4 ${
          isDark ? 'border-slate-700' : 'border-slate-100'
        }`}
      >
        <h2
          className={`truncate text-base font-semibold tracking-tight ${
            isDark ? 'text-slate-100' : 'text-slate-900'
          }`}
        >
          {SPC_CARD_LABELS[title]}
        </h2>
        <button
          type="button"
          ref={expandButtonRef}
          onClick={() => onExpand(title)}
          aria-label={`${SPC_CARD_LABELS[title]} 그래프 크게 보기`}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
            isDark
              ? 'bg-slate-800 text-slate-200 hover:bg-slate-700 focus-visible:ring-offset-slate-900'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 focus-visible:ring-offset-white'
          }`}
        >
          확대
        </button>
      </div>
      <div className="flex min-h-[280px] flex-1 items-center justify-center px-5 py-8">
        <p className={`m-0 text-base ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          그래프가 들어갈 자리
        </p>
      </div>
    </article>
  )
}

export default function SpcManagementPage() {
  const { isDark, language, copy } = useUiSettings()
  const [expandedTitle, setExpandedTitle] = useState<SpcCardTitle | null>(null)
  const expandButtonRefs = useRef<Partial<Record<SpcCardTitle, HTMLButtonElement | null>>>({})
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const lastExpandedRef = useRef<SpcCardTitle | null>(null)
  const modalTitleId = useId()

  const closeModal = useCallback(() => {
    setExpandedTitle(null)
  }, [])

  const openModal = useCallback((title: SpcCardTitle) => {
    lastExpandedRef.current = title
    setExpandedTitle(title)
  }, [])

  useEffect(() => {
    if (!expandedTitle) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeModal()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    closeButtonRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [expandedTitle, closeModal])

  useEffect(() => {
    if (expandedTitle !== null) return
    const previousTitle = lastExpandedRef.current
    if (!previousTitle) return
    expandButtonRefs.current[previousTitle]?.focus()
  }, [expandedTitle])

  const setExpandButtonRef = (title: SpcCardTitle) => (element: HTMLButtonElement | null) => {
    expandButtonRefs.current[title] = element
  }

  return (
    <div
      className={`h-full overflow-y-auto ${
        isDark
          ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-100'
          : 'bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50 text-slate-900'
      }`}
    >
      <div className={`${SHELL_CONTENT_CLASS} py-6`}>
        <div className="mb-6 flex flex-col gap-1">
          <p
            className={`text-sm font-bold tracking-wide ${
              isDark ? 'text-blue-400' : 'text-blue-600'
            }`}
          >
            SPC Control
          </p>
          <h1
            className={`mt-1 text-3xl font-bold tracking-tight ${
              isDark ? 'text-slate-100' : 'text-gray-900'
            }`}
          >
            {copy.menus['/management']}
          </h1>
          <p className={`mt-2 max-w-2xl text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            {language === 'en'
              ? 'Monitor process control charts and out-of-limit signals.'
              : '공정 SPC 관리도와 관리 한계 초과 항목을 모니터링합니다.'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          <SpcGraphCard
            title="d50"
            isDark={isDark}
            onExpand={openModal}
            expandButtonRef={setExpandButtonRef('d50')}
          />
          <SpcGraphCard
            title="d90"
            isDark={isDark}
            onExpand={openModal}
            expandButtonRef={setExpandButtonRef('d90')}
          />
          <SpcGraphCard
            title="metal_impurity"
            isDark={isDark}
            onExpand={openModal}
            expandButtonRef={setExpandButtonRef('metal_impurity')}
          />
          <SpcGraphCard
            title="lithium_input"
            isDark={isDark}
            onExpand={openModal}
            expandButtonRef={setExpandButtonRef('lithium_input')}
          />
          <SpcGraphCard
            title="additive_ratio"
            isDark={isDark}
            onExpand={openModal}
            expandButtonRef={setExpandButtonRef('additive_ratio')}
          />
          <SpcGraphCard
            title="process_time"
            isDark={isDark}
            onExpand={openModal}
            expandButtonRef={setExpandButtonRef('process_time')}
          />
          <SpcGraphCard
            title="sintering_temp"
            isDark={isDark}
            onExpand={openModal}
            expandButtonRef={setExpandButtonRef('sintering_temp')}
          />
          <SpcGraphCard
            title="humidity"
            isDark={isDark}
            onExpand={openModal}
            expandButtonRef={setExpandButtonRef('humidity')}
          />
          <SpcGraphCard
            title="tank_pressure"
            isDark={isDark}
            onExpand={openModal}
            expandButtonRef={setExpandButtonRef('tank_pressure')}
          />
        </div>
      </div>

      {expandedTitle ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            className={`flex max-h-[90vh] w-[min(96vw,1600px)] flex-col overflow-hidden rounded-2xl border shadow-xl ${
              isDark
                ? 'border-slate-700 bg-slate-900 text-slate-100'
                : 'border-slate-200 bg-white text-slate-900'
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className={`flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4 ${
                isDark ? 'border-slate-700' : 'border-slate-100'
              }`}
            >
              <h2
                id={modalTitleId}
                className={`truncate text-lg font-semibold tracking-tight ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}
              >
                {SPC_CARD_LABELS[expandedTitle]}
              </h2>
              <button
                type="button"
                ref={closeButtonRef}
                onClick={closeModal}
                aria-label="모달 닫기"
                className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                  isDark
                    ? 'bg-slate-800 text-slate-200 hover:bg-slate-700 focus-visible:ring-offset-slate-900'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 focus-visible:ring-offset-white'
                }`}
              >
                닫기
              </button>
            </div>
            <div className="flex min-h-[60vh] flex-1 items-center justify-center px-6 py-10">
              <p className={`m-0 text-base ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                그래프가 들어갈 자리
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
