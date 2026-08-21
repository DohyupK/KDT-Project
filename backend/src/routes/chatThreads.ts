import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { deleteSession, scopedSessionId } from '../services/chatStore.js'

/**
 * Passthrough: FE → Express → ai-service chat thread list/messages.
 * Authenticated passthrough. JWT user identity overrides all client parameters.
 * GET /api/chat/threads?channel=
 * GET /api/chat/threads/:threadId/messages
 * DELETE /api/chat/threads/:threadId?channel=
 */

function aiBase(): string {
  return (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8800').replace(/\/$/, '')
}

export const chatThreadsRouter = Router()

chatThreadsRouter.get('/chat/threads', authMiddleware, async (req, res) => {
  const user_id = req.auth!.userId
  const channel = String(req.query.channel || 'general').trim()
  const limit = String(req.query.limit || '50')
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

chatThreadsRouter.get(
  '/chat/threads/:threadId/messages',
  authMiddleware,
  async (req, res) => {
  const threadId = String(req.params.threadId || '').trim()
  const user_id = req.auth!.userId
  const limit = String(req.query.limit || '200')
  if (!threadId) {
    res.status(400).json({ error: 'threadId required' })
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
  },
)

chatThreadsRouter.delete('/chat/threads/:threadId', authMiddleware, async (req, res) => {
  const threadId = String(req.params.threadId || '').trim()
  const user_id = req.auth!.userId
  const channel = String(req.query.channel || 'general').trim().toLowerCase()
  if (!threadId || !['general', 'security'].includes(channel)) {
    res.status(400).json({ error: 'valid threadId and channel are required' })
    return
  }
  try {
    // Remove the user-scoped legacy copy first. A cleanup failure must not be
    // reported as a successful server-side deletion.
    const legacyId = scopedSessionId(
      user_id,
      threadId,
      channel as 'general' | 'security',
    )
    const legacyDeleted = await deleteSession(legacyId)

    const qs = new URLSearchParams({ user_id, channel })
    const upstream = await fetch(
      `${aiBase()}/chat/threads/${encodeURIComponent(threadId)}?${qs}`,
      { method: 'DELETE' },
    )
    const text = await upstream.text()
    if (!upstream.ok) {
      res.status(upstream.status).type('json').send(text || '{}')
      return
    }

    const parsed = JSON.parse(text || '{}') as Record<string, unknown>
    res.json({ ...parsed, legacy_deleted: legacyDeleted })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[DELETE /api/chat/threads/:id]', detail)
    res.status(502).json({ error: detail })
  }
})
