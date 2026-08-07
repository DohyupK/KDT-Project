'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useUiSettings } from '@/components/layout/AppShell'
import { SHELL_CONTENT_CLASS } from '@/components/layout/shellContent'
import { useShellRefresh } from '@/hooks/useShellRefresh'

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

/** Preset (Apache Superset) embed 설정 — 카드별 Embedded Dashboard UUID */
const PRESET_DOMAIN = 'https://85e79a99.us1a.app.preset.io'

/** 카드별 Embedded Dashboard UUID — 차트마다 다르면 각각 교체하세요 */
const PRESET_EMBED_IDS: Record<SpcCardTitle, string> = {
  d50: 'e54eed95-6177-4694-bc2e-105cb8a7b1f4',
  d90: '33f8ea9c-1260-4566-bc93-b3ef6d2043f2',
  metal_impurity: '33f8ea9c-1260-4566-bc93-b3ef6d2043f2',
  lithium_input: '33f8ea9c-1260-4566-bc93-b3ef6d2043f2',
  additive_ratio: '33f8ea9c-1260-4566-bc93-b3ef6d2043f2',
  process_time: '33f8ea9c-1260-4566-bc93-b3ef6d2043f2',
  sintering_temp: '33f8ea9c-1260-4566-bc93-b3ef6d2043f2',
  humidity: '33f8ea9c-1260-4566-bc93-b3ef6d2043f2',
  tank_pressure: '33f8ea9c-1260-4566-bc93-b3ef6d2043f2',
}

/**
 * 백엔드 guest-token API가 없을 때 테스트용.
 * Preset에서 발급한 guest token 문자열을 임시로 넣으면 그래프가 표시됩니다.
 * (만료되면 다시 발급해 넣으세요. 운영에서는 비워 두고 API를 쓰세요.)
 */
const PRESET_GUEST_TOKEN_FALLBACK = 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImtleTIiLCJ0eXAiOiJKV1QifQ.eyJ1c2VyIjp7InVzZXJuYW1lIjoiZW1iZWRfdmlld2VyIiwiZmlyc3RfbmFtZSI6IkVtYmVkIiwibGFzdF9uYW1lIjoiVmlld2VyIn0sInJlc291cmNlcyI6W3sidHlwZSI6ImRhc2hib2FyZCIsImlkIjoiZTU0ZWVkOTUtNjE3Ny00Njk0LWJjMmUtMTA1Y2I4YTdiMWY0In1dLCJybHNfcnVsZXMiOltdLCJlbmFibGVfZHJpbGxpbmciOmZhbHNlLCJhdWQiOiI4NWU3OWE5OSIsImlhdCI6MTc4NTU3MTgwMCwiZXhwIjoxNzg1NTcyMTAwLCJ0eXBlIjoiZ3Vlc3QiLCJqdGkiOiJiYWNkMzY0ZS03YTIzLTQ0ZDUtOWU2ZS0wNTczNzljNTBjYmEifQ.BEY6Qodhw5OCIJ0ZJiIBnn_wEJeiNO2McBMbcXXhyuuN2tP765alvNBcTngzKfy6lfuyJ4BganzevA6cbkVLdLF7ULefhn6fCEKMp4f5pF8Tgyj7HODL5UF7gutuiMgKCbjqfWAAB3aeJQbbQmmFtylm7xKeeFXG_lKcUz8qxAjzLbkn3n_x1iTSU6ZoHByp6m3fxSUToZPN1FZ-__DsN9JI5GU4nGj8RiM_sWu03ktZ5X27EdUmheqHSqXDI4Z2MZ9zn8juVNC6Hwp7_73pLr06LCGssENgn18Omrk6N239tBiDpVYgdpl7FT4t8FDWnC-tDbv5J52Uj1ZYF1QrVSTefAFVrM4CkqVZCUhOu3b5qQabK3KMFavVQ6HRt39CFyrvinYtjwc-b-YRYuhs5HWN94DDFfY5rUnT0Gk6-RsFhPq7B44jn6dS6zDPcbOspcGevUvplvhff0eauS1N14XckiNBBFA2HT_oJuQ6A-Y5zwKS0b_opxVVo-8fAhg0P7qk_teJfJxbX3QSdjD5VPSfa1y7Oa5BdTz-nR1sbtfqMKxp5XnOjJxJ1dk5uyTHnpX_eH7rNkY2fclUMDmKTObeo5JdGUBcpF1kvGYbIVsPMLw9NlqOeBwOgIn2D60QKn7BF5KEINK4NZku1O0wtPDPCFy620JFFCZJNjYusNQ'

/** guest token을 내려주는 백엔드 엔드포인트 (있으면 우선 사용) */
const PRESET_GUEST_TOKEN_URL = '/api/preset/guest-token'

type EmbedDashboardFn = (options: {
  id: string
  supersetDomain: string
  mountPoint: HTMLElement
  fetchGuestToken: () => Promise<string>
  dashboardUiConfig?: {
    hideTitle?: boolean
    hideTab?: boolean
    hideChartControls?: boolean
    filters?: { visible?: boolean; expanded?: boolean }
  }
}) => Promise<unknown>

let embedDashboardPromise: Promise<EmbedDashboardFn> | null = null

function loadEmbedDashboard(): Promise<EmbedDashboardFn> {
  if (!embedDashboardPromise) {
    const sdkUrl = 'https://esm.sh/@superset-ui/embedded-sdk'
    // CDN ESM — 다른 파일(package.json) 수정 없이 SDK 로드
    embedDashboardPromise = import(/* webpackIgnore: true */ sdkUrl).then(
      (mod: { embedDashboard: EmbedDashboardFn }) => mod.embedDashboard,
    )
  }
  return embedDashboardPromise
}

async function fetchPresetGuestToken(dashboardId: string): Promise<string> {
  if (PRESET_GUEST_TOKEN_FALLBACK.trim()) {
    return PRESET_GUEST_TOKEN_FALLBACK.trim()
  }

  const res = await fetch(PRESET_GUEST_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dashboardId }),
  })

  if (!res.ok) {
    throw new Error(`guest token 요청 실패 (${res.status})`)
  }

  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const data = (await res.json()) as { token?: string }
    if (!data.token) throw new Error('응답에 token이 없습니다')
    return data.token
  }

  const text = (await res.text()).trim()
  if (!text) throw new Error('빈 guest token 응답')
  return text
}

/** 카드용 Preset 렌더 기준 크기 — 이 크기로 그린 뒤 카드에 contain scale */
const CARD_EMBED_WIDTH = 900
const CARD_EMBED_HEIGHT = 520

function PresetEmbed({
  dashboardId,
  isDark,
  className,
  compact = false,
  refreshKey = 0,
}: {
  dashboardId: string
  isDark: boolean
  className?: string
  /** 카드처럼 좁은 영역에 맞출 때 Preset을 확대해서 그린 뒤 축소 */
  compact?: boolean
  /** ShellHeader 새로고침 시 embed 재마운트 */
  refreshKey?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [compactScale, setCompactScale] = useState(0.5)

  useEffect(() => {
    if (!compact) return
    const container = containerRef.current
    if (!container) return

    const updateScale = () => {
      const { width, height } = container.getBoundingClientRect()
      if (width <= 0 || height <= 0) return
      // 카드 안에 그래프 전체가 들어오도록 contain
      const next = Math.min(width / CARD_EMBED_WIDTH, height / CARD_EMBED_HEIGHT)
      setCompactScale(Math.max(0.35, Math.min(next, 1)))
    }

    updateScale()
    const observer = new ResizeObserver(updateScale)
    observer.observe(container)
    return () => observer.disconnect()
  }, [compact])

  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    let cancelled = false
    setLoading(true)
    setError(null)
    el.innerHTML = ''

    ;(async () => {
      try {
        const embedDashboard = await loadEmbedDashboard()
        if (cancelled || !mountRef.current) return

        await embedDashboard({
          id: dashboardId,
          supersetDomain: PRESET_DOMAIN,
          mountPoint: mountRef.current,
          fetchGuestToken: () => fetchPresetGuestToken(dashboardId),
          dashboardUiConfig: {
            hideTitle: true,
            hideTab: true,
            hideChartControls: true,
            filters: { visible: false, expanded: false },
          },
        })

        const mount = mountRef.current
        if (mount) {
          mount.style.width = '100%'
          mount.style.height = '100%'
        }
        const iframe = mount?.querySelector('iframe')
        if (iframe) {
          iframe.style.width = '100%'
          iframe.style.height = '100%'
          iframe.style.border = '0'
          iframe.style.display = 'block'
        }

        if (!cancelled) setLoading(false)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Preset embed 실패'
        setError(message)
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      el.innerHTML = ''
    }
  }, [dashboardId, compact, refreshKey])

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${className ?? ''}`}
    >
      {compact ? (
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width: CARD_EMBED_WIDTH,
            height: CARD_EMBED_HEIGHT,
            transform: `translate(-50%, -50%) scale(${compactScale})`,
            transformOrigin: 'center center',
          }}
        >
          <div ref={mountRef} className="h-full w-full overflow-hidden" />
        </div>
      ) : (
        <div ref={mountRef} className="absolute inset-0 h-full w-full overflow-hidden" />
      )}
      {loading && !error ? (
        <div
          className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm ${
            isDark ? 'text-slate-400' : 'text-slate-500'
          }`}
        >
          그래프 로딩 중…
        </div>
      ) : null}
      {error ? (
        <div
          className={`absolute inset-0 z-10 flex items-center justify-center px-4 text-center text-sm ${
            isDark ? 'bg-slate-900/80 text-slate-300' : 'bg-white/90 text-slate-600'
          }`}
        >
          <p className="m-0 max-w-sm leading-relaxed">
            Preset 연결 실패: {error}
            <br />
            <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>
              guest token API 또는 PRESET_GUEST_TOKEN_FALLBACK을 확인하세요.
            </span>
          </p>
        </div>
      ) : null}
    </div>
  )
}

function SpcGraphCard({
  title,
  isDark,
  onExpand,
  expandButtonRef,
  embedRefreshKey,
}: {
  title: SpcCardTitle
  isDark: boolean
  onExpand: (title: SpcCardTitle) => void
  expandButtonRef: (element: HTMLButtonElement | null) => void
  embedRefreshKey: number
}) {
  const embedId = PRESET_EMBED_IDS[title]

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl border ${
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
      <div className="relative h-[360px] overflow-hidden">
        {embedId ? (
          <PresetEmbed
            dashboardId={embedId}
            isDark={isDark}
            compact
            refreshKey={embedRefreshKey}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-5 py-8">
            <p className={`m-0 text-base ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              그래프가 들어갈 자리
            </p>
          </div>
        )}
      </div>
    </article>
  )
}

export default function SpcManagementPage() {
  const { isDark, language, copy } = useUiSettings()
  const [embedRefreshKey, setEmbedRefreshKey] = useState(0)
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

  useShellRefresh(() => {
    setEmbedRefreshKey((key) => key + 1)
  })

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

  const expandedEmbedId = expandedTitle ? PRESET_EMBED_IDS[expandedTitle] : undefined

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
            embedRefreshKey={embedRefreshKey}
          />
          <SpcGraphCard
            title="d90"
            isDark={isDark}
            onExpand={openModal}
            expandButtonRef={setExpandButtonRef('d90')}
            embedRefreshKey={embedRefreshKey}
          />
          <SpcGraphCard
            title="metal_impurity"
            isDark={isDark}
            onExpand={openModal}
            expandButtonRef={setExpandButtonRef('metal_impurity')}
            embedRefreshKey={embedRefreshKey}
          />
          <SpcGraphCard
            title="lithium_input"
            isDark={isDark}
            onExpand={openModal}
            expandButtonRef={setExpandButtonRef('lithium_input')}
            embedRefreshKey={embedRefreshKey}
          />
          <SpcGraphCard
            title="additive_ratio"
            isDark={isDark}
            onExpand={openModal}
            expandButtonRef={setExpandButtonRef('additive_ratio')}
            embedRefreshKey={embedRefreshKey}
          />
          <SpcGraphCard
            title="process_time"
            isDark={isDark}
            onExpand={openModal}
            expandButtonRef={setExpandButtonRef('process_time')}
            embedRefreshKey={embedRefreshKey}
          />
          <SpcGraphCard
            title="sintering_temp"
            isDark={isDark}
            onExpand={openModal}
            expandButtonRef={setExpandButtonRef('sintering_temp')}
            embedRefreshKey={embedRefreshKey}
          />
          <SpcGraphCard
            title="humidity"
            isDark={isDark}
            onExpand={openModal}
            expandButtonRef={setExpandButtonRef('humidity')}
            embedRefreshKey={embedRefreshKey}
          />
          <SpcGraphCard
            title="tank_pressure"
            isDark={isDark}
            onExpand={openModal}
            expandButtonRef={setExpandButtonRef('tank_pressure')}
            embedRefreshKey={embedRefreshKey}
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
            <div className="relative h-[70vh] overflow-hidden">
              {expandedEmbedId ? (
                <PresetEmbed
                  dashboardId={expandedEmbedId}
                  isDark={isDark}
                  className="h-full"
                  refreshKey={embedRefreshKey}
                />
              ) : (
                <div className="flex h-full items-center justify-center px-6 py-10">
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
