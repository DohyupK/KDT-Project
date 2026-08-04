import { Router } from 'express'
import {
  getControlStoreMode,
  insertOptimizationEvent,
  revertOptimizationEvent,
  updateOptimizationOutcome,
} from '../services/controlStore.js'
import { ensureSession } from '../services/chatStore.js'

type RecommendationBody = {
  method?: string
  baseline?: {
    probability?: number
    defect_status?: number
    applied_threshold?: number
    features?: Record<string, unknown>
    capacity?: number | null
    residual_li?: number | null
  }
  suggestion?: {
    deltas?: Record<string, unknown>
    after_features?: Record<string, unknown>
    probability?: number
    defect_status?: number
    applied_threshold?: number
    capacity_before?: number | null
    capacity_after?: number | null
    residual_before?: number | null
    residual_after?: number | null
  } | null
  note?: string | null
}

type ApproveBody = {
  session_id?: string | null
  lot_id?: string | null
  recommendation?: RecommendationBody | null
}

type OutcomeBody = {
  outcome_quality_defect?: number
  outcome_capacity?: number | null
  outcome_residual_li?: number | null
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

    const capacityBefore =
      suggestion.capacity_before ?? rec.baseline.capacity ?? null
    const capacityAfter = suggestion.capacity_after ?? null
    const residualBefore =
      suggestion.residual_before ?? rec.baseline?.residual_li ?? null
    const residualAfter = suggestion.residual_after ?? null

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
      capacityBefore:
        capacityBefore === null || capacityBefore === undefined
          ? null
          : Number(capacityBefore),
      capacityAfter:
        capacityAfter === null || capacityAfter === undefined
          ? null
          : Number(capacityAfter),
      residualBefore:
        residualBefore === null || residualBefore === undefined
          ? null
          : Number(residualBefore),
      residualAfter:
        residualAfter === null || residualAfter === undefined
          ? null
          : Number(residualAfter),
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

/** Record measured outcome only (no synthetic generation). */
controlRouter.post('/control/approve/:id/outcome', async (req, res) => {
  try {
    const idParam = req.params.id
    const eventId = /^\d+$/.test(idParam) ? Number(idParam) : idParam
    const body = req.body as OutcomeBody
    const defect = body.outcome_quality_defect
    if (defect !== 0 && defect !== 1) {
      res.status(400).json({ error: 'outcome_quality_defect must be 0 or 1' })
      return
    }
    const row = await updateOptimizationOutcome(eventId, {
      outcomeQualityDefect: defect,
      outcomeCapacity:
        body.outcome_capacity === undefined ? null : body.outcome_capacity,
      outcomeResidualLi:
        body.outcome_residual_li === undefined ? null : body.outcome_residual_li,
    })
    if (!row) {
      res.status(404).json({ error: 'optimization event not found' })
      return
    }
    console.info(
      `[control_outcome] event=${row.id} defect=${defect}` +
        ` capacity=${row.outcomeCapacity ?? 'null'}` +
        ` residual_li=${row.outcomeResidualLi ?? 'null'}`,
    )
    res.json({
      ok: true,
      event_id: row.id,
      status: row.status,
      outcome_quality_defect: row.outcomeQualityDefect ?? defect,
      outcome_capacity: row.outcomeCapacity ?? null,
      outcome_residual_li: row.outcomeResidualLi ?? null,
      control_store: getControlStoreMode(),
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/control/approve/:id/outcome]', detail)
    res.status(400).json({ error: detail })
  }
})
