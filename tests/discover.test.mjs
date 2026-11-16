import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isChatModel, overlayCandidates, discoverModels } from '../lib/discover.js'

const catalog = { models: [{ id: 'qwen4-max', name: 'qwen4-max', contextWindow: 1000000, reasoningEfforts: { off: 'none', high: 'high' }, recommended: true, evidence: {} }] }

test('isChatModel 过滤非对话模型', () => {
  assert.equal(isChatModel('qwen4-max'), true)
  assert.equal(isChatModel('glm-5.3'), true)
  assert.equal(isChatModel('wan2.7-image'), false)
  assert.equal(isChatModel('wan3.0-video'), false)
  assert.equal(isChatModel('qwen-audio-3.0-tts-plus'), false)
  assert.equal(isChatModel('qwen-image-3.0-pro'), false)
  assert.equal(isChatModel(''), false)
})

test('overlayCandidates 已知带元数据 verified:true，未知 verified:false', () => {
  const out = overlayCandidates(['qwen4-max', 'brand-new', 'wan2.7-image', 'qwen4-max'], catalog)
  assert.deepEqual(out.map((m) => m.id), ['qwen4-max', 'brand-new'])
  const known = out.find((m) => m.id === 'qwen4-max')
  assert.equal(known.verified, true)
  assert.equal(known.contextWindow, 1000000)
  assert.equal(known.recommended, true)
  assert.equal(known.evidence, undefined)
  const unknown = out.find((m) => m.id === 'brand-new')
  assert.equal(unknown.verified, false)
})

test('discoverModels 走 /models 并过滤 overlay', async () => {
  const fetchImpl = async (url) => {
    assert.ok(url.endsWith('/models'))
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: 'qwen4-max' }, { id: 'wan2.7-image' }, { id: 'new-x' }] }) }
  }
  const out = await discoverModels({ baseURL: 'https://x/v1', apiKey: 'k', catalog, fetchImpl })
  assert.deepEqual(out.map((m) => m.id), ['qwen4-max', 'new-x'])
})

test('discoverModels 缺密钥抛 missing-credential', async () => {
  await assert.rejects(() => discoverModels({ baseURL: 'https://x', apiKey: '', catalog }), (e) => e.code === 'missing-credential')
})

test('discoverModels 错误响应抛 discover-failed', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: { message: 'bad key' } }) })
  await assert.rejects(() => discoverModels({ baseURL: 'https://x', apiKey: 'k', catalog, fetchImpl }), (e) => e.code === 'discover-failed')
})

test('discoverModels 去掉 baseURL 末尾斜杠', async () => {
  let seen = ''
  const fetchImpl = async (url) => { seen = url; return { ok: true, status: 200, text: async () => '{"data":[]}' } }
  await discoverModels({ baseURL: 'https://x/v1///', apiKey: 'k', catalog, fetchImpl })
  assert.equal(seen, 'https://x/v1/models')
})