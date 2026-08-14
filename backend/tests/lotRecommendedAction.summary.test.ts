import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRuleSummary } from '../src/services/lotRecommendedAction.service.js'

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
    /습도\(62\.10%RH\)·금속 불순물\(0\.03ppm\)이 증가하며, 소성 온도\(760\.00°C\)이 감소하여 불량확률 90\.00%에 주요 영향을 미쳤습니다/,
  )
  assert.equal(text.includes('공정 시간'), false)
  assert.match(
    text,
    /리튬 투입량\(2\.90\)·습도\(62\.10%RH\)이 증가하여 잔류리튬 예측 3588\.40 ppm에 주요 영향을 미쳤습니다/,
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
    { probability: 0.22, residualLi: null, riskLevel: '주의' },
  )
  assert.match(text, /습도\(38\.00%RH\)이 감소하여/)
  assert.equal(text.includes('권장 45%RH'), false)
})
