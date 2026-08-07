'use client'

import { useEffect, useRef } from 'react'
import { SHELL_REFRESH_EVENT } from '@/components/layout/AppShell'

/**
 * Subscribe to ShellHeader refresh (`SHELL_REFRESH_EVENT`).
 * Callback is kept in a ref so pages can pass unstable lambdas safely.
 */
export function useShellRefresh(callback: () => void | Promise<void>) {
  const cbRef = useRef(callback)
  cbRef.current = callback

  useEffect(() => {
    const handler = () => {
      void cbRef.current()
    }
    window.addEventListener(SHELL_REFRESH_EVENT, handler)
    return () => window.removeEventListener(SHELL_REFRESH_EVENT, handler)
  }, [])
}
