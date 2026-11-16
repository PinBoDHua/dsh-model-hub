import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { nextToken, toggleId, badgeKind, filterModels, effortSummary, fmtTokens, fmt, draftFromEntry, draftToPayload, clientValidate } = require('../client/client.js')

test('nextToken 从 payload.key 取 token', () => {
  assert.equal(nextToken('', { status: 200, payload: { key: 'abc' } }), 'abc')
})
test('nextToken 403 清空', () => {
  assert.equal(nextToken('abc', { status: 403, payload: null }), '')
})
test('nextToken 无 key 保留当前', () => {
  assert.equal(nextToken('abc', { status: 200, payload: {} }), 'abc')
})

test('toggleId 增删', () => {
  assert.deepEqual(toggleId([], 'a'), ['a'])
  assert.deepEqual(toggleId(['a', 'b'], 'a'), ['b'])
  assert.deepEqual(toggleId(['a'], 'b'), ['a', 'b'])
})

test('badgeKind 三态', () => {
  assert.equal(badgeKind({ recommended: true, evidence: {} }), 'recommended')
  assert.equal(badgeKind({ evidence: {} }), 'verified')
  assert.equal(badgeKind({}), 'unverified')
  assert.equal(badgeKind({ evidence: null }), 'unverified')
})

const models = [
  { id: 'qwen4-max', name: 'Qwen4 Max', recommended: true, evidence: {} },
  { id: 'glm-5.3', name: 'GLM 5.3', evidence: {} },
  { id: 'new-x', name: 'New X', evidence: null },
]
test('filterModels 按 id/name 搜索', () => {
  assert.deepEqual(filterModels(models, 'qwen', 'all').map((m) => m.id), ['qwen4-max'])
  assert.deepEqual(filterModels(models, 'glm', 'all').map((m) => m.id), ['glm-5.3'])
})
test('filterModels 推荐/已验证/未验证', () => {
  assert.deepEqual(filterModels(models, '', 'recommended').map((m) => m.id), ['qwen4-max'])
  assert.deepEqual(filterModels(models, '', 'verified').map((m) => m.id), ['qwen4-max', 'glm-5.3'])
  assert.deepEqual(filterModels(models, '', 'unverified').map((m) => m.id), ['new-x'])
})

test('effortSummary', () => {
  assert.equal(effortSummary(false), null)
  assert.equal(effortSummary({ off: 'none', high: 'high' }), 'off / high')
})

test('fmtTokens 十进制 K/M', () => {
  assert.equal(fmtTokens(1000000), '1M')
  assert.equal(fmtTokens(128000), '128K')
  assert.equal(fmtTokens(64), '64')
  assert.equal(fmtTokens(0), '—')
})

test('fmt 模板替换', () => {
  assert.equal(fmt('已应用 {n} 个模型', { n: 3 }), '已应用 3 个模型')
  assert.equal(fmt('Found {n}, {a} new', { n: 5, a: 2 }), 'Found 5, 2 new')
})

// ===== v0.2 编辑纯逻辑 =====

const entry = { id: 'qwen4-max', contextWindow: 1000000, maxTokens: 131072, input: ['text'], reasoningEfforts: { off: 'none', high: 'high' }, compat: { supportsDeveloperRole: false, thinkingFormat: 'qwen' }, evidence: {} }

test('draftFromEntry 拆行与 compat 控件值', () => {
  const d = draftFromEntry(entry)
  assert.equal(d.reasoning, true)
  assert.deepEqual(d.rows, [{ level: 'off', wire: 'none' }, { level: 'high', wire: 'high' }])
  assert.equal(d.devRole, 'false')
  assert.equal(d.thinkingFormat, 'qwen')
  assert.equal(d.maxTokensField, '')
})

test('draftFromEntry 非推理模型', () => {
  const d = draftFromEntry({ reasoningEfforts: false })
  assert.equal(d.reasoning, false)
  assert.deepEqual(d.rows, [])
})

test('draftToPayload _roundtrip', () => {
  const p = draftToPayload(draftFromEntry(entry))
  assert.deepEqual(p.reasoningEfforts, { off: 'none', high: 'high' })
  assert.deepEqual(p.compat, { supportsDeveloperRole: false, thinkingFormat: 'qwen' })
  assert.equal(p.contextWindow, 1000000)
})

test('draftToPayload off 空 wire → null', () => {
  const d = draftFromEntry(entry)
  d.rows[0].wire = ''
  const p = draftToPayload(d)
  assert.equal(p.reasoningEfforts.off, null)
})

test('draftToPayload 非推理 → false', () => {
  const d = draftFromEntry(entry)
  d.reasoning = false
  assert.equal(draftToPayload(d).reasoningEfforts, false)
})

test('draftToPayload compat 未设置不写入', () => {
  const d = draftFromEntry(entry)
  d.devRole = ''; d.thinkingFormat = ''; d.maxTokensField = ''
  assert.deepEqual(draftToPayload(d).compat, {})
})

test('clientValidate 合法通过', () => {
  assert.deepEqual(clientValidate(draftFromEntry(entry)), [])
})

test('clientValidate 抓非法容量/空模态/空wire/重复档位', () => {
  const d = draftFromEntry(entry)
  d.contextWindow = 0
  assert.ok(clientValidate(d).includes('contextWindow'))
  const d2 = draftFromEntry(entry)
  d2.input = []
  assert.ok(clientValidate(d2).includes('input'))
  const d3 = draftFromEntry(entry)
  d3.rows[1].wire = ''
  assert.ok(clientValidate(d3).includes('effort-wire'))
  const d4 = draftFromEntry(entry)
  d4.rows.push({ level: 'high', wire: 'high' })
  assert.ok(clientValidate(d4).includes('effort-dup'))
  const d5 = draftFromEntry(entry)
  d5.rows = [{ level: 'off', wire: '' }]
  assert.ok(clientValidate(d5).includes('effort-level'))
})