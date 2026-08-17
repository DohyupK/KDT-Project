import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

let staticChunkLogs = 0

/**
 * Dev-only request trace. If `/dashboard` appears here but `/api/dashboard/...`
 * never does, the browser never issued the client fetch (usually blocked /_next).
 */
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.next()
  }

  const { pathname } = request.nextUrl
  const isHmr = pathname.includes('webpack-hmr') || pathname.includes('/_next/hmr')
  const isApi = pathname.startsWith('/api/')
  const isPage =
    pathname === '/dashboard' || pathname === '/main' || pathname === '/issue'
  const isJsChunk =
    pathname.startsWith('/_next/static') && pathname.endsWith('.js')

  if (isHmr || isApi || isPage || (isJsChunk && staticChunkLogs < 5)) {
    if (isJsChunk) staticChunkLogs += 1
    const origin = request.headers.get('origin') ?? '-'
    const host = request.headers.get('host') ?? '-'
    console.log(
      `[dev-proxy] ${request.method} ${pathname} host=${host} origin=${origin}`,
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/api/:path*',
    '/_next/webpack-hmr',
    '/_next/static/:path*',
    '/dashboard',
    '/main',
    '/issue',
  ],
}
