import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyEdit } from '../lib/edit.js'

const entry = { id: 'qwen4-max', name: 'qwen4-max', contextWindow: 1000000, maxTokens: 131072, input: ['text'], reasoningEfforts: { off: 'none', high: 'high' }, compat: { supportsDeveloperRole: false }, recommended: true, evidence: { testedAt: 'x', developerRole: 'rejected' } }

test('applyEdit 覆盖容量并标 manual', () => {
  const n = applyEdit(entry, { contextWindow: 200000, maxTokens: 65536 })
  assert.equal(n.contextWindow, 200000)
  assert.equal(n.maxTokens, 65536)
  assert.equal(n.capacitySource.context, 'manual')
  assert.equal(n.capacitySource.maxOutput, 'manual')
})

test('applyEdit 保留 evidence/recommended', () => {
  const n = applyEdit(entry, { maxTokens: 1 })
  assert.deepEqual(n.evidence, entry.evidence)
  assert.equal(n.recommended, true)
})

test('applyEdit 未改容量保持 estimate', () => {
  const n = applyEdit(entry, { input: ['text', 'image'] })
  assert.equal(n.capacitySource.context, 'estimate')
  assert.equal(n.capacitySource.maxOutput, 'estimate')
  assert.deepEqual(n.input, ['text', 'image'])
})

test('applyEdit compat 空对象清除', () => {
  const n = applyEdit(entry, { compat: {} })
  assert.equal(n.compat, undefined)
})

test('applyEdit compat 覆盖', () => {
  const n = applyEdit(entry, { compat: { thinkingFormat: 'qwen' } })
  assert.deepEqual(n.compat, { thinkingFormat: 'qwen' })
})

test('applyEdit reasoningEfforts:false', () => {
  const n = applyEdit(entry, { reasoningEfforts: false })
  assert.equal(n.reasoningEfforts, false)
})

test('applyEdit 不修改输入', () => {
  const before = JSON.stringify(entry)
  applyEdit(entry, { maxTokens: 5, compat: {} })
  assert.equal(JSON.stringify(entry), before)
})

test('applyEdit 已有 capacitySource 继承', () => {
  const e = { ...entry, capacitySource: { context: 'manual', maxOutput: 'measured' } }
  const n = applyEdit(e, { contextWindow: 3 })
  assert.equal(n.capacitySource.context, 'manual')
  assert.equal(n.capacitySource.maxOutput, 'measured')
})