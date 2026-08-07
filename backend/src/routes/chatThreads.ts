import { Router } from 'express'

/**
 * Passthrough: FE → Express → ai-service chat thread list/messages.
 * GET /api/chat/threads?user_id=&channel=
 * GET /api/chat/threads/:threadId/messages?user_id=
 */

function aiBase(): string {
  return (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8800').replace(/\/$/, '')
}

export const chatThreadsRouter = Router()

chatThreadsRouter.get('/chat/threads', async (req, res) => {
  const user_id = String(req.query.user_id || '').trim()
  const channel = String(req.query.channel || 'general').trim()
  const limit = String(req.query.limit || '50')
  if (!user_id) {
    res.status(400).json({ error: 'user_id required' })
    return
  }
  try {
    const qs = new URLSearchParams({ user_id, channel, limit })
    const r = await fetch(`${aiBase()}/chat/threads?${qs}`)
    const text = await r.text()
    res.status(r.status).type('json').send(text || '{}')
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[GET /api/chat/threads]', detail)
    res.status(502).json({ error: detail })
  }
})

chatThreadsRouter.get('/chat/threads/:threadId/messages', async (req, res) => {
  const threadId = String(req.params.threadId || '').trim()
  const user_id = String(req.query.user_id || '').trim()
  const limit = String(req.query.limit || '200')
  if (!user_id || !threadId) {
    res.status(400).json({ error: 'user_id and threadId required' })
    return
  }
  try {
    const qs = new URLSearchParams({ user_id, limit })
    const r = await fetch(
      `${aiBase()}/chat/threads/${encodeURIComponent(threadId)}/messages?${qs}`,
    )
    const text = await r.text()
    res.status(r.status).type('json').send(text || '{}')
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[GET /api/chat/threads/:id/messages]', detail)
    res.status(502).json({ error: detail })
  }
})
