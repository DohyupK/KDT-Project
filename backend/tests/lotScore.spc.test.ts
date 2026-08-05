import assert from 'node:assert/strict'
import test from 'node:test'
import {
  combineLotScore,
  defectProbTier,
  normalizeRiskLevel,
  residualMargin,
  residualTier,
  worstRisk,
} from '../src/services/lotScore.js'
import { evaluateLotSpc, loadPhase1Limits, violatesNelson2to8 } from '../src/services/spcEngine.js'

test('risk vocabulary normalize', () => {
  assert.equal(normalizeRiskLevel('높음'), '심각')
  assert.equal(normalizeRiskLevel('중간'), '주의')
  assert.equal(normalizeRiskLevel('낮음'), '안정')
  assert.equal(normalizeRiskLevel('A'), '심각')
  assert.equal(normalizeRiskLevel('심각'), '심각')
})

test('defect and residual tiers', () => {
  assert.equal(defectProbTier(0.4), '심각')
  assert.equal(defectProbTier(0.25), '주의')
  assert.equal(defectProbTier(0.1), '안정')
  assert.equal(residualTier(3500), '심각')
  assert.equal(residualTier(3200), '주의')
  assert.equal(residualTier(2900), '안정')
  assert.equal(residualMargin(3600), 400)
})

test('worst-of risk', () => {
  assert.equal(worstRisk('안정', '주의', '심각'), '심각')
  assert.equal(worstRisk('안정', '주의'), '주의')
})

test('combineLotScore uses worst-of and USL reasons', () => {
  const scored = combineLotScore({
    defectProb: 0.5,
    residualLi: 3600,
    spcStatus: '이탈',
  })
  assert.equal(scored.risk_level, '심각')
  assert.equal(scored.spc_status, '이탈')
  assert.ok(scored.risk_reason.includes('불량확률'))
})

test('Phase I limits load and OOC detection', () => {
  const limits = loadPhase1Limits()
  assert.ok(Math.abs(limits.d50.CL_I - 4.493629) < 1e-6)
  const hist = {
    d50: [4.5, 4.5, 4.5, 4.5, 10],
    d90: [9, 9, 9, 9, 9],
    metal_impurity: [0.02, 0.02, 0.02, 0.02, 0.02],
    lithium_input: [2.5, 2.5, 2.5, 2.5, 2.5],
    additive_ratio: [0.15, 0.15, 0.15, 0.15, 0.15],
    process_time: [72, 72, 72, 72, 72],
    sintering_temp: [800, 800, 800, 800, 800],
    humidity: [50, 50, 50, 50, 50],
    tank_pressure: [100, 100, 100, 100, 100],
  }
  const evaled = evaluateLotSpc(hist)
  assert.equal(evaled.status.includes('이탈'), true)
  assert.ok(evaled.oocKeys.includes('d50'))
})

test('Nelson rule 2 same-side streak', () => {
  const lim = loadPhase1Limits().humidity
  const above = Array.from({ length: 9 }, () => lim.CL_I + 0.5)
  assert.equal(violatesNelson2to8(above, lim), true)
})
