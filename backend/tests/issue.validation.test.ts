import assert from 'node:assert/strict'
import test from 'node:test'
import { AppError } from '../src/middleware/errorHandler.js'
import { updateIssue, validateIssueListQuery } from '../src/services/issue.service.js'

function isBadRequest(error: unknown): boolean {
  return error instanceof AppError && error.statusCode === 400
}

test('accepts supported issue list filters', () => {
  assert.doesNotThrow(() =>
    validateIssueListQuery({
      date: '2026-07-21',
      riskLevel: '낮음',
      status: '완료',
    }),
  )
})

test('rejects invalid issue list date', () => {
  assert.throws(() => validateIssueListQuery({ date: '2026-02-30' }), isBadRequest)
  assert.throws(() => validateIssueListQuery({ date: '07/21/2026' }), isBadRequest)
})

test('rejects unsupported risk and status filters', () => {
  assert.throws(() => validateIssueListQuery({ riskLevel: '긴급' }), isBadRequest)
  assert.throws(() => validateIssueListQuery({ status: '대기' }), isBadRequest)
})

test('rejects malformed issue update values before querying the database', async () => {
  const actor = { userId: 'tester', name: '테스터' }

  await assert.rejects(
    updateIssue('ISS-TEST', { status: 1 as unknown as string }, actor),
    isBadRequest,
  )
  await assert.rejects(
    updateIssue('ISS-TEST', { actionContent: 1 as unknown as string }, actor),
    isBadRequest,
  )
  await assert.rejects(
    updateIssue('ISS-TEST', { completed: 'yes' as unknown as boolean }, actor),
    isBadRequest,
  )
})
