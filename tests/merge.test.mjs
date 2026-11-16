import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeModels, buildProviderConfig, stripEntry } from '../lib/merge.js'

const cat = (id, extra = {}) => ({ id, name: id, contextWindow: 1000000, maxTokens: 131072, input: ['text'], reasoningEfforts: { off: 'none', high: 'high' }, recommended: true, evidence: { testedAt: 'x' }, ...extra })

test('更新已有 id 的目录字段', () => {
  const out = mergeModels([{ id: 'qwen4-max', name: 'old', contextWindow: 5 }], [cat('qwen4-max')])
  assert.equal(out.length, 1)
  assert.equal(out[0].contextWindow, 1000000)
  assert.equal(out[0].name, 'qwen4-max')
})

test('保留用户自加模型', () => {
  const out = mergeModels([{ id: 'my-custom', name: 'mine' }], [cat('qwen4-max')])
  assert.deepEqual(out.map((m) => m.id).sort(), ['my-custom', 'qwen4-max'])
  assert.equal(out.find((m) => m.id === 'my-custom').name, 'mine')
})

test('绝不删除：空选中保留全部', () => {
  const out = mergeModels([{ id: 'a' }, { id: 'b' }], [])
  assert.equal(out.length, 2)
})

test('新增模型追加在末尾', () => {
  const out = mergeModels([{ id: 'a' }], [cat('b'), cat('c')])
  assert.deepEqual(out.map((m) => m.id), ['a', 'b', 'c'])
})

test('stripEntry 剥离 evidence/recommended 等非目录字段', () => {
  const s = stripEntry(cat('x'))
  assert.deepEqual(Object.keys(s).sort(), ['contextWindow', 'id', 'input', 'maxTokens', 'name', 'reasoningEfforts'])
  assert.equal(s.evidence, undefined)
  assert.equal(s.recommended, undefined)
})

test('stripEntry 保留 compat 与 reasoningEfforts:false', () => {
  const s = stripEntry({ id: 'x', reasoningEfforts: false, compat: { supportsDeveloperRole: false } })
  assert.equal(s.reasoningEfforts, false)
  assert.deepEqual(s.compat, { supportsDeveloperRole: false })
})

test('保留用户模型上的非目录字段', () => {
  const out = mergeModels([{ id: 'x', myNote: 'keep', contextWindow: 1 }], [cat('x')])
  assert.equal(out[0].myNote, 'keep')
  assert.equal(out[0].contextWindow, 1000000)
})

test('不可变：不修改输入', () => {
  const cur = [{ id: 'x', contextWindow: 1 }]
  const sel = [cat('x')]
  mergeModels(cur, sel)
  assert.equal(cur[0].contextWindow, 1)
  assert.equal(sel[0].evidence.testedAt, 'x')
})

test('buildProviderConfig 保留用户 apiKeyEnv/baseURL/headers', () => {
  const cur = { displayName: '自定义', apiKeyEnv: 'MY_KEY', baseURL: 'https://x', api: 'openai-completions', headers: { 'X-A': '1' }, models: [{ id: 'a' }] }
  const next = buildProviderConfig(cur, [cat('qwen4-max')], { apiKeyEnv: 'ALIYUN_API_KEY', baseURL: 'https://default', api: 'openai-completions', displayName: '阿里云百炼' })
  assert.equal(next.apiKeyEnv, 'MY_KEY')
  assert.equal(next.baseURL, 'https://x')
  assert.equal(next.displayName, '自定义')
  assert.deepEqual(next.headers, { 'X-A': '1' })
  assert.ok(next.models.some((m) => m.id === 'a'))
  assert.ok(next.models.some((m) => m.id === 'qwen4-max'))
})

test('buildProviderConfig 为新 provider 填充缺失默认', () => {
  const next = buildProviderConfig(undefined, [cat('qwen4-max')], { apiKeyEnv: 'ALIYUN_API_KEY', baseURL: 'https://default', api: 'openai-completions', displayName: '阿里云百炼' })
  assert.equal(next.apiKeyEnv, 'ALIYUN_API_KEY')
  assert.equal(next.baseURL, 'https://default')
  assert.equal(next.api, 'openai-completions')
  assert.equal(next.displayName, '阿里云百炼')
  assert.equal(next.models.length, 1)
})

test('buildProviderConfig 不修改输入', () => {
  const cur = { models: [{ id: 'a' }] }
  buildProviderConfig(cur, [cat('b')], {})
  assert.equal(cur.models.length, 1)
})