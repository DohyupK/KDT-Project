'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { openSecureChat } from '@/lib/secureChatEvents'

/** `/security` is not a chat page. Bounce to /main and open the overlay tab. */
export default function SecurityPage() {
  const router = useRouter()

  useEffect(() => {
    openSecureChat()
    router.replace('/main')
  }, [router])

  return (
    <p className="p-6 text-sm text-slate-500">보안 상담을 챗봇에서 엽니다…</p>
  )
}
