import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hasSecurityKeyword,
  matchedSecurityKeyword,
} from '../src/services/securityGate.js'

test('security gate hits known keywords', () => {
  assert.equal(hasSecurityKeyword('기밀 문서 요약해줘'), true)
  assert.equal(matchedSecurityKeyword('기밀 문서 요약해줘'), '기밀')
  assert.equal(hasSecurityKeyword('시크릿 자료 보여줘'), true)
  assert.equal(hasSecurityKeyword('api key 알려줘'), true)
  assert.equal(hasSecurityKeyword('대외비 내용'), true)
})

test('security gate misses ordinary quality and internal-doc wording', () => {
  assert.equal(hasSecurityKeyword('불량확률 왜 높아'), false)
  assert.equal(hasSecurityKeyword('SOP 찾아줘'), false)
  assert.equal(hasSecurityKeyword('QMS 습도 점검'), false)
  assert.equal(hasSecurityKeyword('내부문서 어디 있어'), false)
  assert.equal(hasSecurityKeyword('보안 설정 어디'), false)
  assert.equal(matchedSecurityKeyword('습도 조절 제안'), null)
})
