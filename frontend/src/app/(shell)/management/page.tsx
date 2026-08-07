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

/**
 * Grafana solo-panel embed URL (Share → Embed).
 * 실제 URL로 교체하세요. 예:
 * https://<GRAFANA_HOST>/d-solo/<uid>/<slug>?orgId=1&panelId=1&from=now-2h&to=now&refresh=30s&theme=light
 * 패널 자체 refresh를 쓰면 iframe 통째 리로드는 불필요합니다.
 */
const GRAFANA_PANEL_URLS: Record<SpcCardTitle, string> = {
  d50: 'http://localhost:4000/d-solo/adwh4tx/d50?orgId=1&from=now-2h&to=now&timezone=browser&refresh=5m&panelId=panel-1',
  d90: 'http://localhost:4000/d-solo/adwh4tx/d90?orgId=1&from=now-2h&to=now&timezone=browser&refresh=5m&showCategory=Panel%20options&panelId=panel-2',
  metal_impurity: 'http://localhost:4000/d-solo/adwh4tx/d50?orgId=1&from=now-2h&to=now&timezone=browser&refresh=5m&panelId=panel-3',
  lithium_input: 'http://localhost:4000/d-solo/adwh4tx/d50?orgId=1&from=now-2h&to=now&timezone=browser&refresh=5m&panelId=panel-4',
  additive_ratio: 'http://localhost:4000/d-solo/adwh4tx/d50?orgId=1&from=now-2h&to=now&timezone=browser&refresh=5m&panelId=panel-5',
  process_time: 'http://localhost:4000/d-solo/adwh4tx/d50?orgId=1&from=now-2h&to=now&timezone=browser&refresh=5m&panelId=panel-6',
  sintering_temp: 'http://localhost:4000/d-solo/adwh4tx/d50?orgId=1&from=now-2h&to=now&timezone=browser&refresh=5m&panelId=panel-9',
  humidity: 'http://localhost:4000/d-solo/adwh4tx/d50?orgId=1&from=now-2h&to=now&timezone=browser&refresh=5m&panelId=panel-7',
  tank_pressure: 'http://localhost:4000/d-solo/adwh4tx/d50?orgId=1&from=now-2h&to=now&timezone=browser&refresh=5m&panelId=panel-8',
}

function GrafanaEmbed({
  src,
  isDark,
  title,
  variant = 'card',
}: {
  src: string
  isDark: boolean
  title: string
  variant?: 'card' | 'modal'
}) {
  if (!src.trim()) {
    return (
      <div className="flex h-full w-full items-center justify-center px-5 py-8">
        <p className={`m-0 text-center text-sm leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Grafana embed URL을 설정하세요.
          <br />
          <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>
            GRAFANA_PANEL_URLS에 Share → Embed URL을 넣으면 됩니다.
          </span>
        </p>
      </div>
    )
  }

  if (variant === 'modal') {
    return (
      <iframe
        src={src}
        title={title}
        scrolling="no"
        className="block h-full min-h-0 w-full rounded-lg border-0 bg-white"
      />
    )
  }

  return (
    <iframe
      src={src}
      title={title}
      scrolling="no"
      className="absolute inset-0 block h-full w-full border-0"
    />
  )
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
  const panelUrl = GRAFANA_PANEL_URLS[title]
  const label = SPC_CARD_LABELS[title]

  return (
    <article
      className={`flex h-full min-w-0 flex-col overflow-hidden rounded-xl border shadow-sm ${
        isDark ? 'border-slate-700 bg-slate-900/60' : 'border-slate-200 bg-white'
      }`}
    >
      <div
        className={`flex flex-none items-center justify-between gap-3 border-b px-4 py-3 ${
          isDark ? 'border-slate-700' : 'border-slate-100'
        }`}
      >
        <div className="min-w-0">
          <h2
            className={`truncate text-base font-semibold tracking-tight ${
              isDark ? 'text-slate-100' : 'text-slate-900'
            }`}
          >
            {label}
          </h2>
        </div>
        <button
          type="button"
          ref={expandButtonRef}
          onClick={() => onExpand(title)}
          aria-label={`${label} 그래프 크게 보기`}
          className={`relative z-10 shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
            isDark
              ? 'bg-slate-800 text-slate-200 hover:bg-slate-700 focus-visible:ring-offset-slate-900'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 focus-visible:ring-offset-white'
          }`}
        >
          확대
        </button>
      </div>
      <div
        className={`relative h-[240px] min-h-[220px] w-full flex-none overflow-hidden sm:h-[240px] lg:h-[260px] ${
          isDark ? 'bg-slate-900' : 'bg-white'
        }`}
      >
        <GrafanaEmbed src={panelUrl} isDark={isDark} title={`${label} 미리보기`} variant="card" />
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

  const expandedPanelUrl = expandedTitle ? GRAFANA_PANEL_URLS[expandedTitle] : undefined

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

        <div className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
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
            className={`flex h-[85vh] max-h-[calc(100vh-2rem)] min-h-0 min-w-0 w-[calc(100vw-1rem)] max-w-[min(99vw,1800px)] flex-col overflow-hidden rounded-2xl border shadow-xl sm:w-[99vw] ${
              isDark
                ? 'border-slate-700 bg-slate-900 text-slate-100'
                : 'border-slate-200 bg-white text-slate-900'
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className={`flex flex-none items-center justify-between gap-4 border-b px-5 py-4 ${
                isDark ? 'border-slate-700' : 'border-slate-100'
              }`}
            >
              <div className="min-w-0">
                <h2
                  id={modalTitleId}
                  className={`truncate text-lg font-semibold tracking-tight ${
                    isDark ? 'text-slate-100' : 'text-slate-900'
                  }`}
                >
                  {SPC_CARD_LABELS[expandedTitle]}
                </h2>
              </div>
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
            <div
              className={`min-h-0 min-w-0 w-full flex-1 overflow-hidden p-4 ${
                isDark ? 'bg-slate-950/40' : 'bg-slate-50'
              }`}
            >
              {expandedPanelUrl !== undefined ? (
                <GrafanaEmbed
                  src={expandedPanelUrl}
                  isDark={isDark}
                  title={`${SPC_CARD_LABELS[expandedTitle]} 확대 그래프`}
                  variant="modal"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center px-6 py-10">
                  <p className={`m-0 text-base ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    그래프가 들어갈 자리
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
