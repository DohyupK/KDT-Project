import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRuleSteps, buildRuleSummary } from '../src/services/lotRecommendedAction.service.js'

test('stable risk uses monitoring template', () => {
  const text = buildRuleSummary(
    {
      defect_causes: [{ labelKo: '습도', directionKo: '증가', valueText: '62.00%RH', sharePct: 40 }],
    },
    { probability: 0.9, residualLi: 3600, riskLevel: '안정' },
  )
  assert.match(text, /표준 샘플링/)
  assert.equal(text.includes('습도'), false)
})

test('summary lists raisers with value and 증가/감소, top 3', () => {
  const text = buildRuleSummary(
    {
      defect_causes: [
        { labelKo: '습도', directionKo: '증가', valueText: '62.1%RH', sharePct: 50 },
        { labelKo: '소성 온도', directionKo: '감소', valueText: '760.00°C', sharePct: 30 },
        { labelKo: '금속 불순물', directionKo: '증가', valueText: '0.031ppm', sharePct: 12 },
        { labelKo: '공정 시간', directionKo: '증가', valueText: '90분', sharePct: 8 },
      ],
      residual_causes: [
        { labelKo: '리튬 투입량', directionKo: '증가', valueText: '2.90', sharePct: 70 },
        { labelKo: '습도', directionKo: '증가', valueText: '62.1%RH', sharePct: 20 },
      ],
    },
    { probability: 0.9, residualLi: 3588.4, riskLevel: '주의' },
  )
  assert.match(
    text,
    /습도\(62\.10%RH\)·금속 불순물\(0\.03ppm\)이 증가하며, 소성 온도\(760\.00°C\)이 감소하여 불량확률 90\.00%에 주요 영향을 미쳤습니다\. 불량확률 저감을 위해 해당 인자를 우선 점검합니다/,
  )
  assert.equal(text.includes('공정 시간'), false)
  assert.match(
    text,
    /리튬 투입량\(2\.90\)·습도\(62\.10%RH\)이 증가하여 잔류리튬 예측 3588\.40 ppm에 주요 영향을 미쳤습니다\. 잔류 안정화로 불량 리스크를 낮춥니다/,
  )
})

test('negative-looking leftover 하락 maps to 감소하여; omits 권장 45%RH', () => {
  const text = buildRuleSummary(
    {
      defect_causes: [
        {
          labelKo: '습도',
          directionKo: '하락',
          valueText: '38.00%RH',
          refLabel: '권장 45%RH',
          sharePct: 40,
        },
      ],
    },
    { probability: 0.62, residualLi: null, riskLevel: '주의' },
  )
  assert.match(text, /습도\(38\.00%RH\)이 감소하여/)
  assert.equal(text.includes('권장 45%RH'), false)
})

test('below defect threshold omits 불량확률 attribution but keeps residual', () => {
  const text = buildRuleSummary(
    {
      defect_causes: [
        { labelKo: '습도', directionKo: '증가', valueText: '62.10%RH', sharePct: 50 },
        { labelKo: '첨가제 비율', directionKo: '감소', valueText: '0.14', sharePct: 20 },
      ],
      residual_causes: [
        { labelKo: '소성 온도', directionKo: '증가', valueText: '830.19°C', sharePct: 40 },
        { labelKo: '리튬 투입량', directionKo: '증가', valueText: '2.67', sharePct: 35 },
      ],
    },
    { probability: 0.22, residualLi: 3326.41, riskLevel: '주의' },
  )
  assert.equal(text.includes('불량확률'), false)
  assert.equal(text.includes('습도'), false)
  assert.equal(text.includes('첨가제 비율'), false)
  assert.match(
    text,
    /소성 온도\(830\.19°C\)·리튬 투입량\(2\.67\)이 증가하여 잔류리튬 예측 3326\.41 ppm에 주요 영향을 미쳤습니다\. 잔류 안정화로 불량 리스크를 낮춥니다/,
  )
})

test('below defect threshold with only defect causes and SPC uses SPC line', () => {
  const text = buildRuleSummary(
    {
      defect_causes: [
        { labelKo: '습도', directionKo: '증가', valueText: '62.10%RH', sharePct: 50 },
      ],
    },
    { probability: 0.1, residualLi: null, riskLevel: '주의', spcStatus: '주의' },
  )
  assert.equal(text.includes('습도'), false)
  assert.match(
    text,
    /SPC 주의가 확인되어 운영 기준을 재확인합니다\. 불량확률 저감을 위해 SPC·검사 수준을 점검합니다/,
  )
})

test('below defect threshold omits defect-cause steps, keeps residual steps', () => {
  const steps = buildRuleSteps(
    {
      defect_causes: [{ feature: 'humidity', labelKo: '습도', sharePct: 50 }],
      residual_causes: [{ feature: 'lithium_input', labelKo: '리튬 투입량', sharePct: 70 }],
    },
    { probability: 0.1, spcStatus: '안정', riskLevel: '주의' },
  )
  assert.equal(steps.some((s) => s.doc_id === 'QMS-GUD-001'), false)
  assert.equal(steps.some((s) => s.doc_id === 'QMS-GUD-004'), true)
})

test('caution residual without shap still gets residual summary and lithium steps', () => {
  const text = buildRuleSummary(
    { defect_causes: [], residual_causes: [] },
    { probability: 0.08, residualLi: 3163, riskLevel: '주의', spcStatus: '안정' },
  )
  assert.equal(text.includes('불량확률'), false)
  assert.match(text, /잔류리튬 예측 3163\.00 ppm이 주의 기준/)
  const steps = buildRuleSteps(
    { defect_causes: [], residual_causes: [] },
    { probability: 0.08, spcStatus: '안정', riskLevel: '주의', residualLi: 3163 },
  )
  assert.equal(steps.some((s) => s.doc_id === 'QMS-GUD-004'), true)
})
