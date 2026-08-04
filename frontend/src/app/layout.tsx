import type { Metadata } from 'next'
import '@/lib/bigintJson'
import './globals.css'

export const metadata: Metadata = {
  title: 'kdt-project',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
