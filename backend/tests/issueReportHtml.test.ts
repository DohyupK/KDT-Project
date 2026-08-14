import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLotIssueReportHtml, computeIssueReportKpi } from '../src/services/issueReportHtml.js'
import type { IssueDetail } from '../src/services/issue.service.js'
import { secretsEqual } from '../src/services/issueReportN8n.js'

const sample: IssueDetail = {
  issueId: 'ISS-260813-001',
  createdAt: '2026-08-13 10:00:00',
  lotId: 'LOT-TEST',
  riskLevel: '심각',
  spcStatus: '이탈',
  issueContent: '소성온도 이탈',
  actionContent: null,
  assigneeUserId: null,
  assigneeName: null,
  completed: false,
  completedAt: null,
  analysis: {
    lotId: 'LOT-TEST',
    probability: 0.82,
    spcStatus: '이탈',
    riskLevel: '심각',
    riskReason: '소성온도 UCL 초과',
    createdAt: '2026-08-13 09:00:00',
    scoredAt: '2026-08-13 09:05:00',
  },
}

test('LOT report HTML is not JSON and has no print script', () => {
  const html = buildLotIssueReportHtml({ lotId: 'LOT-TEST', issues: [sample] })
  assert.equal(html.trimStart().startsWith('<!DOCTYPE html>'), true)
  assert.throws(() => JSON.parse(html))
  assert.equal(html.includes('window.print'), false)
  assert.equal(html.includes('No-reply'), true)
  assert.equal(html.includes('회신하지 마세요'), true)
  assert.equal(html.includes('1. 요약 KPI'), true)
  assert.equal(html.includes('4. LOT 상세 분석'), true)
  assert.equal(html.includes('LOT-TEST'), true)
})

test('JSON.parse on HTML throws (mail_contents is not JSON)', () => {
  const html = buildLotIssueReportHtml({ lotId: 'LOT-TEST', issues: [sample] })
  assert.throws(() => JSON.parse(html))
})

test('KPI counts 심각 and SPC 이상', () => {
  const kpi = computeIssueReportKpi([sample])
  assert.equal(kpi.issueCount, 1)
  assert.equal(kpi.riskCritical, 1)
  assert.equal(kpi.spcAbnormal, 1)
})

test('callback secret compare rejects mismatch', () => {
  assert.equal(secretsEqual('abc', 'abc'), true)
  assert.equal(secretsEqual('abc', 'abd'), false)
  assert.equal(secretsEqual('', 'secret'), false)
})
