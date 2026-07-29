import { Router } from 'express'
import {
  createLlmKey,
  deleteLlmKey,
  getLlmKeysStoreLabelForDocs,
  listLlmKeys,
  type CreateLlmKeyInput,
} from '../services/llmKeyStore.js'

export const llmKeysRouter = Router()

llmKeysRouter.get('/llm-keys', async (_req, res) => {
  try {
    const keys = await listLlmKeys()
    res.json({
      keys,
      store: getLlmKeysStoreLabelForDocs(),
      db_path: getLlmKeysStoreLabelForDocs(),
      note: 'api_key values are never returned; ciphertext is stored in MariaDB llm_api_keys',
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[GET /api/llm-keys]', detail)
    res.status(500).json({ error: detail })
  }
})

llmKeysRouter.post('/llm-keys', async (req, res) => {
  try {
    const body = req.body as CreateLlmKeyInput
    const created = await createLlmKey(body)
    res.status(201).json({ key: created })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/llm-keys]', detail)
    const status = detail.includes('LLM_KEYS_ENCRYPTION_KEY') ? 503 : 400
    res.status(status).json({ error: detail })
  }
})

llmKeysRouter.delete('/llm-keys/:id', async (req, res) => {
  try {
    const ok = await deleteLlmKey(req.params.id)
    if (!ok) {
      res.status(404).json({ error: 'not found' })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[DELETE /api/llm-keys]', detail)
    res.status(500).json({ error: detail })
  }
})
