import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateDraft, THINKING_LEVELS, THINKING_FORMATS, MAX_TOKEN_FIELDS } from '../lib/validate.js'

const good = { contextWindow: 1000000, maxTokens: 131072, input: ['text'], reasoningEfforts: { off: 'none', high: 'high' }, compat: { supportsDeveloperRole: false, thinkingFormat: 'openai', maxTokensField: 'max_tokens' } }

test('合法草稿通过', () => assert.deepEqual(validateDraft(good), { ok: true, errors: [] }))
test('空草稿通过（无字段=不改）', () => assert.equal(validateDraft({}).ok, true))
test('reasoningEfforts:false 合法', () => assert.equal(validateDraft({ reasoningEfforts: false }).ok, true))
test('off wire 可为 null', () => assert.equal(validateDraft({ reasoningEfforts: { off: null, high: 'high' } }).ok, true))

test('contextWindow 非正整数拒绝', () => {
  assert.equal(validateDraft({ contextWindow: 0 }).ok, false)
  assert.equal(validateDraft({ contextWindow: 1.5 }).ok, false)
  assert.equal(validateDraft({ contextWindow: 'x' }).ok, false)
})
test('maxTokens 非正整数拒绝', () => assert.equal(validateDraft({ maxTokens: -1 }).ok, false))
test('input 空或非法模态拒绝', () => {
  assert.equal(validateDraft({ input: [] }).ok, false)
  assert.equal(validateDraft({ input: ['video'] }).ok, false)
})
test('effort 非法键拒绝', () => assert.equal(validateDraft({ reasoningEfforts: { bogus: 'high' } }).ok, false))
test('effort 仅 off 拒绝', () => assert.equal(validateDraft({ reasoningEfforts: { off: 'none' } }).ok, false))
test('非 off wire 空拒绝', () => assert.equal(validateDraft({ reasoningEfforts: { off: 'none', high: '' } }).ok, false))
test('compat 非法键拒绝', () => assert.equal(validateDraft({ compat: { bogus: 1 } }).ok, false))
test('compat thinkingFormat 非法枚举拒绝', () => assert.equal(validateDraft({ compat: { thinkingFormat: 'nope' } }).ok, false))
test('compat maxTokensField 非法枚举拒绝', () => assert.equal(validateDraft({ compat: { maxTokensField: 'nope' } }).ok, false))
test('compat supportsDeveloperRole 非布尔拒绝', () => assert.equal(validateDraft({ compat: { supportsDeveloperRole: 'yes' } }).ok, false))
test('compat 空对象合法（=清除）', () => assert.equal(validateDraft({ compat: {} }).ok, true))

test('枚举常量齐全', () => {
  assert.equal(THINKING_LEVELS.length, 7)
  assert.equal(THINKING_FORMATS.length, 11)
  assert.deepEqual(MAX_TOKEN_FIELDS, ['max_tokens', 'max_completion_tokens'])
})