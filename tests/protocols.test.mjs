import { test } from 'node:test'
import assert from 'node:assert/strict'
import { probeFor, deriveFor, measureFor } from '../lib/protocols.js'
import { deriveResponses } from '../lib/probe-responses.js'
import { usesThinkingLevel } from '../lib/probe-google.js'
import { discoverModels } from '../lib/discover.js'

// ===== openai-responses =====

function responsesStub({ devOk = true, toolsOk = true, rejectEfforts = [] } = {}) {
  return async (url, opts) => {
    assert.ok(url.endsWith('/responses'))
    assert.ok(opts.headers.Authorization.startsWith('Bearer '))
    const body = JSON.parse(opts.body)
    const isDev = Array.isArray(body.input) && body.input.some((m) => m.role === 'developer')
    const effort = body.reasoning?.effort
    const ok = (!isDev || devOk) && (!effort || !rejectEfforts.includes(effort))
    const output = [{ type: 'message', content: [{ type: 'output_text', text: 'OK' }] }]
    if (body.tools && toolsOk) output.push({ type: 'function_call', name: 'get_weather', arguments: '{}' })
    const j = ok
      ? { output, usage: { output_tokens_details: { reasoning_tokens: effort && effort !== 'none' ? 10 : 0 } } }
      : { error: { message: 'rejected' } }
    return { status: ok ? 200 : 400, text: async () => JSON.stringify(j) }
  }
}

test('responses 探针全通过 → evidence 完整', async () => {
  const ev = await probeFor({ protocol: 'openai-responses', baseURL: 'https://x/v1', apiKey: 'k', model: 'gpt-5.4', fetchImpl: responsesStub() })
  assert.equal(ev.protocol, 'openai-responses')
  assert.equal(ev.maxTokensField, 'max_output_tokens')
  assert.equal(ev.developerRole, 'ok')
  assert.equal(ev.tools, 'ok')
  assert.equal(ev.efforts.high.ok, true)
  assert.equal(ev.efforts.high.reasoningTokens, 10)
  assert.equal(ev.efforts.off.reasoningTokens, 0)
})

test('responses developer 拒绝 → derive 写 supportsDeveloperRole:false', async () => {
  const ev = await probeFor({ protocol: 'openai-responses', baseURL: 'https://x/v1', apiKey: 'k', model: 'm', fetchImpl: responsesStub({ devOk: false }) })
  assert.equal(ev.developerRole, 'rejected')
  const d = deriveResponses(ev)
  assert.equal(d.compat.supportsDeveloperRole, false)
  assert.equal(d.reasoningEfforts.max, 'max')
})

test('responses 部分档位拒绝 → 仅收通过档位', async () => {
  const ev = await probeFor({ protocol: 'openai-responses', baseURL: 'https://x/v1', apiKey: 'k', model: 'm', fetchImpl: responsesStub({ rejectEfforts: ['xhigh', 'max', 'none'] }) })
  const d = deriveResponses(ev)
  assert.deepEqual(Object.keys(d.reasoningEfforts).sort(), ['high', 'low', 'medium', 'minimal'])
})

test('responses 基础请求失败 → unusable', async () => {
  const fetchImpl = async () => ({ status: 404, text: async () => '{"error":{"message":"no model"}}' })
  await assert.rejects(() => probeFor({ protocol: 'openai-responses', baseURL: 'https://x/v1', apiKey: 'k', model: 'm', fetchImpl }), (e) => e.code === 'unusable')
})

// ===== anthropic-messages =====

function anthropicStub({ style = 'adaptive', offOk = true, toolsOk = true, maxBudget = 4096, rejectEfforts = [] } = {}) {
  return async (url, opts) => {
    assert.ok(url.endsWith('/v1/messages'))
    assert.equal(opts.headers['x-api-key'], 'k')
    assert.equal(opts.headers['anthropic-version'], '2023-06-01')
    const body = JSON.parse(opts.body)
    const th = body.thinking
    let ok = true
    if (th?.type === 'adaptive') ok = style === 'adaptive' && !rejectEfforts.includes(body.output_config?.effort)
    else if (th?.type === 'enabled') ok = style === 'budget' && th.budget_tokens <= maxBudget && body.max_tokens > th.budget_tokens
    else if (th?.type === 'disabled') ok = offOk
    const content = [{ type: 'text', text: 'OK' }]
    if (body.tools && toolsOk) content.push({ type: 'tool_use', name: 'get_weather', input: {} })
    const j = ok ? { content, usage: { input_tokens: 10, output_tokens: 5 } } : { error: { message: 'rejected' } }
    return { status: ok ? 200 : 400, text: async () => JSON.stringify(j) }
  }
}

test('anthropic adaptive 形态 → effort 档位证据', async () => {
  const ev = await probeFor({ protocol: 'anthropic-messages', baseURL: 'https://api.anthropic.com', apiKey: 'k', model: 'claude-opus-5-5', fetchImpl: anthropicStub() })
  assert.equal(ev.thinkingStyle, 'adaptive')
  assert.equal(ev.developerRole, 'unsupported')
  assert.equal(ev.maxTokensField, 'max_tokens')
  assert.equal(ev.tools, 'ok')
  assert.equal(ev.efforts.high.ok, true)
  assert.equal(ev.efforts.max.ok, true)
  assert.equal(ev.efforts.off.ok, true)
})

test('anthropic budget 形态（adaptive 被拒自动回退）', async () => {
  const ev = await probeFor({ protocol: 'anthropic-messages', baseURL: 'https://api.minimaxi.com/anthropic', apiKey: 'k', model: 'MiniMax-M2.7', fetchImpl: anthropicStub({ style: 'budget' }) })
  assert.equal(ev.thinkingStyle, 'budget')
  assert.equal(ev.efforts.low.ok, true)
  assert.equal(ev.efforts.low.wire, '1024')
  assert.equal(ev.efforts.high.wire, '4096')
  assert.equal(ev.efforts.medium.ok, true)
})

test('anthropic thinkingStyle 提示跳过形态探测', async () => {
  let sawAdaptiveProbe = false
  const stub = anthropicStub({ style: 'budget' })
  const fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body)
    if (body.thinking?.type === 'adaptive' && body.output_config?.effort === 'high' && body.max_tokens === 1024 && !body.messages[0].content.includes('weather')) sawAdaptiveProbe = true
    return stub(url, opts)
  }
  const ev = await probeFor({ protocol: 'anthropic-messages', baseURL: 'https://x', apiKey: 'k', model: 'm', fetchImpl, thinkingStyle: 'budget' })
  assert.equal(ev.thinkingStyle, 'budget')
  assert.equal(sawAdaptiveProbe, false)
})

test('anthropic off 拒绝与工具失败如实记录', async () => {
  const ev = await probeFor({ protocol: 'anthropic-messages', baseURL: 'https://x', apiKey: 'k', model: 'claude-fable-5', fetchImpl: anthropicStub({ offOk: false, toolsOk: false }) })
  assert.equal(ev.efforts.off.ok, false)
  assert.equal(ev.tools, 'fail')
})

// ===== google-generative-ai =====

test('usesThinkingLevel 判定 gemini-3+/4+/latest/gemma', () => {
  assert.equal(usesThinkingLevel('gemini-3.5-flash'), true)
  assert.equal(usesThinkingLevel('gemini-3.1-pro-preview'), true)
  assert.equal(usesThinkingLevel('gemini-4-argon'), true)
  assert.equal(usesThinkingLevel('gemini-flash-latest'), true)
  assert.equal(usesThinkingLevel('gemma-4-31b-it'), true)
  assert.equal(usesThinkingLevel('gemini-2.5-pro'), false)
  assert.equal(usesThinkingLevel('gemini-2.5-flash'), false)
})

function googleStub({ levels = ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'], maxBudget = 2048, toolsOk = true } = {}) {
  return async (url, opts) => {
    assert.ok(url.includes(':generateContent'))
    assert.equal(opts.headers['x-goog-api-key'], 'k')
    const body = JSON.parse(opts.body)
    const tc = body.generationConfig?.thinkingConfig
    let ok = true
    if (tc?.thinkingLevel) ok = levels.includes(tc.thinkingLevel)
    else if (tc?.thinkingBudget !== undefined) ok = tc.thinkingBudget <= maxBudget
    const parts = [{ text: 'OK' }]
    if (body.tools && toolsOk) parts.push({ functionCall: { name: 'get_weather', args: {} } })
    const j = ok
      ? { candidates: [{ content: { parts } }], usageMetadata: { thoughtsTokenCount: tc ? 20 : 0 } }
      : { error: { message: 'rejected' } }
    return { status: ok ? 200 : 400, text: async () => JSON.stringify(j) }
  }
}

test('google level 方言（gemini-3）→ 大写 wire 档位证据', async () => {
  const ev = await probeFor({ protocol: 'google-generative-ai', baseURL: 'https://generativelanguage.googleapis.com/v1beta', apiKey: 'k', model: 'gemini-3.5-flash', fetchImpl: googleStub() })
  assert.equal(ev.thinkingStyle, 'level')
  assert.equal(ev.maxTokensField, 'maxOutputTokens')
  assert.equal(ev.developerRole, 'ok')
  assert.equal(ev.tools, 'ok')
  assert.equal(ev.efforts.high.ok, true)
  assert.equal(ev.efforts.high.wire, 'HIGH')
  assert.equal(ev.efforts.high.reasoningTokens, 20)
  assert.equal(ev.efforts.off.ok, true)
})

test('google budget 方言（gemini-2.5）→ 只探 minimal/low', async () => {
  const ev = await probeFor({ protocol: 'google-generative-ai', baseURL: 'https://x/v1beta', apiKey: 'k', model: 'gemini-2.5-flash', fetchImpl: googleStub() })
  assert.equal(ev.thinkingStyle, 'budget')
  assert.equal(ev.efforts.minimal.ok, true)
  assert.equal(ev.efforts.minimal.wire, '128')
  assert.equal(ev.efforts.low.ok, true)
  assert.equal(ev.efforts.medium, undefined, 'medium 不探（成本受控）')
  assert.equal(ev.efforts.high, undefined)
})

// ===== 派生/实测门禁 =====

test('deriveFor：completions/responses 派生，anthropic/google 不派生', () => {
  const ev = { developerRole: 'rejected', maxTokensField: 'max_tokens', efforts: { high: { ok: true } } }
  assert.ok(deriveFor('openai-completions', ev))
  assert.ok(deriveFor('openai-responses', ev))
  assert.equal(deriveFor('anthropic-messages', ev), null)
  assert.equal(deriveFor('google-generative-ai', ev), null)
})

test('measureFor：非 completions 协议诚实返回不支持', async () => {
  for (const protocol of ['openai-responses', 'anthropic-messages', 'google-generative-ai']) {
    const r = await measureFor({ protocol, baseURL: 'https://x', apiKey: 'k', model: 'm' })
    assert.equal(r.measured, false)
    assert.ok(r.reason)
  }
})

test('各协议缺密钥抛 missing-credential', async () => {
  for (const protocol of ['openai-responses', 'anthropic-messages', 'google-generative-ai']) {
    await assert.rejects(() => probeFor({ protocol, baseURL: 'https://x', apiKey: '', model: 'm' }), (e) => e.code === 'missing-credential')
  }
})

// ===== 发现方言 =====

const catalog = { models: [{ id: 'claude-opus-5-5', name: 'Claude Opus 5.5', recommended: true, evidence: {} }] }

test('anthropic 发现走 /v1/models + x-api-key', async () => {
  const fetchImpl = async (url, opts) => {
    assert.ok(url.endsWith('/v1/models'))
    assert.equal(opts.headers['x-api-key'], 'k')
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: 'claude-opus-5-5' }, { id: 'claude-new' }] }) }
  }
  const out = await discoverModels({ baseURL: 'https://api.anthropic.com', apiKey: 'k', catalog, fetchImpl, dialect: 'anthropic' })
  assert.deepEqual(out.map((m) => m.id), ['claude-opus-5-5', 'claude-new'])
  assert.equal(out[0].verified, true)
  assert.equal(out[1].verified, false)
})

test('google 发现过滤 generateContent 并去 models/ 前缀', async () => {
  const fetchImpl = async (url, opts) => {
    assert.ok(url.endsWith('/models'))
    assert.equal(opts.headers['x-goog-api-key'], 'k')
    return { ok: true, status: 200, text: async () => JSON.stringify({ models: [
      { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/aqa', supportedGenerationMethods: ['generateAnswer'] },
    ] }) }
  }
  const out = await discoverModels({ baseURL: 'https://x/v1beta', apiKey: 'k', catalog: { models: [] }, fetchImpl, dialect: 'google', nonChat: '(embedding|image|aqa)' })
  assert.deepEqual(out.map((m) => m.id), ['gemini-3.5-flash'])
})

test('openai 发现 nonChat 参数化过滤', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: 'glm-5.3' }, { id: 'cogview-4' }, { id: 'embedding-3' }] }) })
  const out = await discoverModels({ baseURL: 'https://x/v1', apiKey: 'k', catalog: { models: [] }, fetchImpl, nonChat: '(embedding|cogview)' })
  assert.deepEqual(out.map((m) => m.id), ['glm-5.3'])
})