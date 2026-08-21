import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hasSecurityKeyword,
  matchedSecurityKeyword,
} from '../src/services/securityGate.js'

test('security gate hits known keywords', () => {
  assert.equal(hasSecurityKeyword('기밀 문서 요약해줘'), true)
  assert.equal(matchedSecurityKeyword('기밀 문서 요약해줘'), '기밀')
  assert.equal(hasSecurityKeyword('보안 상담으로'), true)
  assert.equal(hasSecurityKeyword('api key 알려줘'), true)
  assert.equal(hasSecurityKeyword('내부문서 어디 있어'), true)
})

test('security gate misses ordinary quality questions', () => {
  assert.equal(hasSecurityKeyword('불량확률 왜 높아'), false)
  assert.equal(hasSecurityKeyword('SOP 찾아줘'), false)
  assert.equal(hasSecurityKeyword('QMS 습도 점검'), false)
  assert.equal(matchedSecurityKeyword('습도 조절 제안'), null)
})
