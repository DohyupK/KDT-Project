'use client'

import { useEffect, useRef } from 'react'
import { SHELL_REFRESH_EVENT } from '@/components/layout/AppShell'

export type ShellRefreshSource = 'auto' | 'manual'

export type UseShellRefreshOptions = {
  /** When true, ignore settings-driven auto refresh; header button still runs. */
  ignoreAuto?: boolean
}

/**
 * Subscribe to ShellHeader refresh (`SHELL_REFRESH_EVENT`).
 * Callback is kept in a ref so pages can pass unstable lambdas safely.
 */
export function useShellRefresh(
  callback: () => void | Promise<void>,
  options: UseShellRefreshOptions = {},
) {
  const cbRef = useRef(callback)
  cbRef.current = callback
  const ignoreAuto = options.ignoreAuto === true

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ source?: ShellRefreshSource }>).detail
      const source = detail?.source ?? 'manual'
      if (ignoreAuto && source === 'auto') return
      void cbRef.current()
    }
    window.addEventListener(SHELL_REFRESH_EVENT, handler)
    return () => window.removeEventListener(SHELL_REFRESH_EVENT, handler)
  }, [ignoreAuto])
}
