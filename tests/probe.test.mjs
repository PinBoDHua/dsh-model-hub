import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveModel, probeModel, probeMaxOutput } from '../lib/probe.js'

test('deriveModel developer 拒绝 → supportsDeveloperRole:false', () => {
  const d = deriveModel({ developerRole: 'rejected', maxTokensField: 'max_tokens', efforts: { high: { ok: true } } })
  assert.equal(d.compat.supportsDeveloperRole, false)
  assert.equal(d.reasoningEfforts.high, 'high')
})

test('deriveModel developer ok 且 max_tokens → 无 compat', () => {
  const d = deriveModel({ developerRole: 'ok', maxTokensField: 'max_tokens', efforts: { high: { ok: true } } })
  assert.equal(d.compat, undefined)
})

test('deriveModel max_completion_tokens → compat.maxTokensField', () => {
  const d = deriveModel({ developerRole: 'ok', maxTokensField: 'max_completion_tokens', efforts: { low: { ok: true } } })
  assert.equal(d.compat.maxTokensField, 'max_completion_tokens')
})

test('deriveModel 全档位失败 → reasoningEfforts:false', () => {
  const d = deriveModel({ developerRole: 'ok', maxTokensField: 'max_tokens', efforts: { high: { ok: false } } })
  assert.equal(d.reasoningEfforts, false)
})

test('deriveModel 仅 off → reasoningEfforts:false（非推理模型）', () => {
  const d = deriveModel({ developerRole: 'ok', maxTokensField: 'max_tokens', efforts: { off: { ok: true } } })
  assert.equal(d.reasoningEfforts, false)
})

test('deriveModel off+high → 保留两档', () => {
  const d = deriveModel({ developerRole: 'ok', maxTokensField: 'max_tokens', efforts: { off: { ok: true }, high: { ok: true } } })
  assert.deepEqual(d.reasoningEfforts, { off: 'none', high: 'high' })
})

function stubFetch({ devOk = true, toolsOk = true } = {}) {
  return async (url, opts) => {
    const body = JSON.parse(opts.body)
    const isTool = !!body.tools
    const isDev = body.messages?.some((m) => m.role === 'developer')
    const message = { content: 'OK' }
    if (isTool && toolsOk) message.tool_calls = [{ id: '1', type: 'function', function: { name: 'get_weather', arguments: '{}' } }]
    const ok = isDev ? devOk : true
    const rt = body.reasoning_effort && body.reasoning_effort !== 'none' ? 10 : 0
    const j = ok
      ? { choices: [{ message, finish_reason: 'stop' }], usage: { completion_tokens_details: { reasoning_tokens: rt } } }
      : { error: { message: "developer is not one of ['system', 'assistant', 'user', 'tool', 'function']" } }
    return { status: ok ? 200 : 400, text: async () => JSON.stringify(j) }
  }
}

test('probeModel 全通过 → evidence 完整', async () => {
  const ev = await probeModel({ baseURL: 'https://x/v1', apiKey: 'k', model: 'qwen4-max', fetchImpl: stubFetch() })
  assert.equal(ev.developerRole, 'ok')
  assert.equal(ev.tools, 'ok')
  assert.equal(ev.maxTokensField, 'max_tokens')
  assert.equal(ev.efforts.high.ok, true)
  assert.equal(ev.efforts.off.reasoningTokens, 0)
  const d = deriveModel(ev)
  assert.equal(d.reasoningEfforts.max, 'max')
})

test('probeModel developer 拒绝 → rejected', async () => {
  const ev = await probeModel({ baseURL: 'https://x/v1', apiKey: 'k', model: 'deepseek-v4.1-flash-1017', fetchImpl: stubFetch({ devOk: false }) })
  assert.equal(ev.developerRole, 'rejected')
  assert.equal(deriveModel(ev).compat.supportsDeveloperRole, false)
})

test('probeModel 工具失败 → tools:fail', async () => {
  const ev = await probeModel({ baseURL: 'https://x/v1', apiKey: 'k', model: 'x', fetchImpl: stubFetch({ toolsOk: false }) })
  assert.equal(ev.tools, 'fail')
})

test('probeModel 缺密钥抛 missing-credential', async () => {
  await assert.rejects(() => probeModel({ baseURL: 'https://x', apiKey: '', model: 'x' }), (e) => e.code === 'missing-credential')
})

// 拒绝阈值模拟：max_tokens <= T 接受，否则 400。
function thresholdFetch(T) {
  return async (url, opts) => {
    const body = JSON.parse(opts.body)
    const n = body.max_tokens ?? body.max_completion_tokens
    const ok = n <= T
    const j = ok ? { choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] } : { error: { message: 'max_tokens exceeds limit' } }
    return { status: ok ? 200 : 400, text: async () => JSON.stringify(j) }
  }
}

test('probeMaxOutput 二分命中阈值', async () => {
  const r = await probeMaxOutput({ baseURL: 'https://x/v1', apiKey: 'k', model: 'm', fetchImpl: thresholdFetch(131072) })
  assert.equal(r.measured, true)
  assert.equal(r.value, 131072)
})

test('probeMaxOutput 不同阈值', async () => {
  const r = await probeMaxOutput({ baseURL: 'https://x/v1', apiKey: 'k', model: 'm', fetchImpl: thresholdFetch(65536) })
  assert.equal(r.value, 65536)
})

test('probeMaxOutput provider clamp（全接受）→ measured:false', async () => {
  const r = await probeMaxOutput({ baseURL: 'https://x/v1', apiKey: 'k', model: 'm', fetchImpl: thresholdFetch(Infinity) })
  assert.equal(r.measured, false)
})

test('probeMaxOutput 缺密钥抛 missing-credential', async () => {
  await assert.rejects(() => probeMaxOutput({ baseURL: 'https://x', apiKey: '', model: 'm' }), (e) => e.code === 'missing-credential')
})