'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type PageChatEventType =
  | 'row_click'
  | 'row_select'
  | 'filter_apply'
  | 'panel_open'
  | 'kpi_click'
  | 'download'
  | 'clear'

/** Last UI action on the current page (sent with pagePayload every chat turn). */
export type PageChatLastEvent = {
  type: PageChatEventType
  target: string
  entityId?: string | null
  ts: string
}

/** Internal page-chat context (not shown in UI). Sent with general /api/chat. */
export type PageChatContextPayload = {
  route: string
  focusId?: string | null
  focusPayload?: unknown
  pagePayload?: unknown
  lastEvent?: PageChatLastEvent | null
  supplementHints?: string[]
}

export type PageChatEventInput = {
  type: PageChatEventType
  /** Defaults to current snapshot.route */
  route?: string
  /** focusId / target name, e.g. risk-top-row */
  target: string
  entityId?: string
  payload?: unknown
}

const MAX_JSON_CHARS = 8_000
/** Visible list cap for pagePayload (not a hard product rule beyond UX). */
export const PAGE_CHAT_LIST_LIMIT = 10

export function truncateJson(value: unknown, maxChars = MAX_JSON_CHARS): unknown {
  if (value == null) return value
  try {
    const raw = JSON.stringify(value)
    if (raw.length <= maxChars) return value
    return {
      _truncated: true,
      _originalChars: raw.length,
      preview: raw.slice(0, maxChars),
    }
  } catch {
    return { _error: 'unserializable' }
  }
}

function payloadChars(value: unknown): number {
  try {
    return JSON.stringify(value ?? null)?.length ?? 0
  } catch {
    return -1
  }
}

/** F12 console — use info so default DevTools level shows it. */
function logPageChat(label: string, ctx: PageChatContextPayload) {
  if (typeof console === 'undefined' || typeof console.info !== 'function') return
  console.info('[page-chat]', label, {
    route: ctx.route,
    focusId: ctx.focusId ?? null,
    lastEvent: ctx.lastEvent ?? null,
    focusChars: payloadChars(ctx.focusPayload),
    pageChars: payloadChars(ctx.pagePayload),
    hints: ctx.supplementHints ?? [],
  })
}

function logPageChatEvent(
  event: PageChatEventInput & { route: string },
  payloadTruncated: unknown,
) {
  if (typeof console === 'undefined' || typeof console.info !== 'function') return
  console.info('[page-chat-event]', {
    ts: new Date().toISOString(),
    type: event.type,
    route: event.route,
    target: event.target,
    entityId: event.entityId ?? null,
    payloadChars: payloadChars(payloadTruncated),
    payload: payloadTruncated,
  })
}

type PageChatContextValue = {
  snapshot: PageChatContextPayload
  setPagePayload: (route: string, summary: unknown, hints?: string[]) => void
  setFocus: (focusId: string, payload: unknown) => void
  clearFocus: () => void
  /** Silent UI→chat context injection + F12 structured log (no DB). */
  trackPageChatEvent: (event: PageChatEventInput) => void
  resetForRoute: (pathname: string) => void
  getChatPageContext: () => PageChatContextPayload
}

const PageChatContext = createContext<PageChatContextValue | null>(null)

export function PageChatProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<PageChatContextPayload>({
    route: '/',
    focusId: null,
    focusPayload: null,
    pagePayload: null,
    lastEvent: null,
    supplementHints: [],
  })
  const snapshotRef = useRef(snapshot)

  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  const setPagePayload = useCallback((route: string, summary: unknown, hints?: string[]) => {
    setSnapshot((prev) => {
      const next: PageChatContextPayload = {
        ...prev,
        route,
        pagePayload: truncateJson(summary),
        supplementHints: hints ?? [],
      }
      logPageChat('setPagePayload', next)
      return next
    })
  }, [])

  const setFocus = useCallback((focusId: string, payload: unknown) => {
    setSnapshot((prev) => {
      const next: PageChatContextPayload = {
        ...prev,
        focusId,
        focusPayload: truncateJson(payload),
      }
      logPageChat('setFocus', next)
      return next
    })
  }, [])

  const clearFocus = useCallback(() => {
    setSnapshot((prev) => {
      const next: PageChatContextPayload = {
        ...prev,
        focusId: null,
        focusPayload: null,
        lastEvent: null,
      }
      logPageChat('clearFocus', next)
      return next
    })
  }, [])

  const trackPageChatEvent = useCallback((event: PageChatEventInput) => {
    const route = (event.route || snapshotRef.current.route || '/').trim() || '/'
    const truncated = truncateJson(event.payload ?? null)
    logPageChatEvent({ ...event, route }, truncated)

    if (event.type === 'clear') {
      setSnapshot((prev) => {
        const next: PageChatContextPayload = {
          ...prev,
          route,
          focusId: null,
          focusPayload: null,
          lastEvent: null,
        }
        logPageChat('track:clear', next)
        return next
      })
      return
    }

    const lastEvent: PageChatLastEvent = {
      type: event.type,
      target: event.target,
      entityId: event.entityId != null ? String(event.entityId) : null,
      ts: new Date().toISOString(),
    }

    setSnapshot((prev) => {
      const next: PageChatContextPayload = {
        ...prev,
        route,
        focusId: (event.entityId && String(event.entityId).trim()) || event.target,
        focusPayload: truncated,
        lastEvent,
      }
      logPageChat('track:focus', next)
      return next
    })
  }, [])

  const resetForRoute = useCallback((pathname: string) => {
    const route = pathname?.trim() || '/'
    setSnapshot({
      route,
      focusId: null,
      focusPayload: null,
      pagePayload: null,
      lastEvent: null,
      supplementHints: [],
    })
    logPageChat('resetForRoute', {
      route,
      focusId: null,
      focusPayload: null,
      pagePayload: null,
      lastEvent: null,
      supplementHints: [],
    })
    console.info('[page-chat-event]', {
      ts: new Date().toISOString(),
      type: 'clear',
      route,
      target: 'route-change',
      entityId: null,
      payloadChars: 0,
    })
  }, [])

  const getChatPageContext = useCallback((): PageChatContextPayload => {
    const cur = snapshotRef.current
    const out: PageChatContextPayload = {
      route: cur.route,
      focusId: cur.focusId ?? null,
      focusPayload: truncateJson(cur.focusPayload),
      pagePayload: truncateJson(cur.pagePayload),
      lastEvent: cur.lastEvent ?? null,
      supplementHints: cur.supplementHints ?? [],
    }
    logPageChat('attach', out)
    return out
  }, [])

  const value = useMemo(
    () => ({
      snapshot,
      setPagePayload,
      setFocus,
      clearFocus,
      trackPageChatEvent,
      resetForRoute,
      getChatPageContext,
    }),
    [
      snapshot,
      setPagePayload,
      setFocus,
      clearFocus,
      trackPageChatEvent,
      resetForRoute,
      getChatPageContext,
    ],
  )

  return <PageChatContext.Provider value={value}>{children}</PageChatContext.Provider>
}

export function usePageChat(): PageChatContextValue {
  const ctx = useContext(PageChatContext)
  if (!ctx) {
    throw new Error('usePageChat must be used within PageChatProvider')
  }
  return ctx
}

export function usePageChatOptional(): PageChatContextValue | null {
  return useContext(PageChatContext)
}
