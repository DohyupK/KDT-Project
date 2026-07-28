import { Router } from 'express'
import {
  getControlStoreMode,
  insertOptimizationEvent,
  revertOptimizationEvent,
} from '../services/controlStore.js'
import { ensureSession } from '../services/chatStore.js'

type RecommendationBody = {
  method?: string
  baseline?: {
    probability?: number
    defect_status?: number
    applied_threshold?: number
    features?: Record<string, unknown>
  }
  suggestion?: {
    deltas?: Record<string, unknown>
    after_features?: Record<string, unknown>
    probability?: number
    defect_status?: number
    applied_threshold?: number
  } | null
  note?: string | null
}

type ApproveBody = {
  session_id?: string | null
  lot_id?: string | null
  recommendation?: RecommendationBody | null
}

export const controlRouter = Router()

/**
 * Approve → insert optimization_events with status=approved (not deleted on Undo).
 * FE: GlobalChatbot 「제안 승인」 → 5s Undo snackbar → POST .../revert → status=reverted.
 */
controlRouter.post('/control/approve', async (req, res) => {
  try {
    const body = req.body as ApproveBody
    const rec = body.recommendation
    const suggestion = rec?.suggestion
    if (!rec || !suggestion || !rec.baseline?.features || !suggestion.after_features) {
      res.status(400).json({
        error: 'recommendation.suggestion with baseline/after features is required',
      })
      return
    }

    const sessionId = await ensureSession(body.session_id)
    const lotId =
      (typeof body.lot_id === 'string' && body.lot_id) ||
      (typeof rec.baseline.features.id === 'string' ? rec.baseline.features.id : null) ||
      (typeof suggestion.after_features.id === 'string'
        ? String(suggestion.after_features.id)
        : null)

    const row = await insertOptimizationEvent({
      sessionId,
      lotId,
      beforeFeatures: rec.baseline.features,
      proposedDeltas: suggestion.deltas || {},
      afterFeatures: suggestion.after_features,
      probBefore: Number(rec.baseline.probability ?? 0),
      probAfter: Number(suggestion.probability ?? 0),
      method: rec.method || 'whatif_grid',
      status: 'approved',
    })

    console.info(
      `[control_approve] event=${row.id} lot=${lotId ?? '-'} store=${getControlStoreMode()}`,
    )

    res.json({
      ok: true,
      event_id: row.id,
      status: row.status,
      control_store: getControlStoreMode(),
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/control/approve]', detail)
    res.status(500).json({ error: detail })
  }
})

/** 5초 Undo: UPDATE status=reverted (history preserved). */
controlRouter.post('/control/approve/:id/revert', async (req, res) => {
  try {
    const idParam = req.params.id
    const eventId = /^\d+$/.test(idParam) ? Number(idParam) : idParam
    const row = await revertOptimizationEvent(eventId)
    if (!row) {
      res.status(404).json({ error: 'optimization event not found' })
      return
    }
    console.info(`[control_revert] event=${row.id} status=${row.status}`)
    res.json({
      ok: true,
      event_id: row.id,
      status: row.status,
      control_store: getControlStoreMode(),
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/control/approve/:id/revert]', detail)
    res.status(500).json({ error: detail })
  }
})
