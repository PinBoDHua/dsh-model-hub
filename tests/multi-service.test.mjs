import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { createHubService } from '../lib/service.js'

const TEST_HOME = fileURLToPath(new URL('../.test-data-multi', import.meta.url))
rmSync(TEST_HOME, { recursive: true, force: true })
process.env.DSH_HOME = TEST_HOME

function makeCtx(providersConfig = {}) {
  const entries = [{ options: { id: 'llm-pi-ai', name: '@deepseek-ai/dsh-llm-pi-ai', config: { providers: providersConfig } } }]
  const edits = []
  const configEditor = {
    entries: () => entries,
    edit: async (entry, change) => {
      const cur = structuredClone(entry.options.config ?? {})
      const next = change(cur, {})
      entry.options.config = next
      edits.push(next)
    },
  }
  const keys = { ALIYUN_API_KEY: { value: 'ak', source: 'store' }, ZHIPU_API_KEY: { value: 'zk', source: 'store' }, DEEPSEEK_API_KEY: { value: 'dk', source: 'store' } }
  const credentials = { resolve: async (ref) => keys[ref] }
  const ctx = {
    get: (n) => ({ configEditor, credentials }[n]),
    webServer: { register: () => () => {} },
    effect: (f) => f(),
    logger: { warn() {}, info() {} },
  }
  return { ctx, entries, edits }
}

function completionsStub({ devOk = true } = {}) {
  return async (url, opts) => {
    const body = JSON.parse(opts.body)
    const isDev = body.messages?.some((m) => m.role === 'developer')
    const ok = !isDev || devOk
    const message = { content: 'OK' }
    if (body.tools) message.tool_calls = [{ id: '1', type: 'function', function: { name: 'get_weather', arguments: '{}' } }]
    const j = ok ? { choices: [{ message }] } : { error: { message: 'developer rejected' } }
    return { status: ok ? 200 : 400, text: async () => JSON.stringify(j) }
  }
}

test('逐平台目录隔离，缺省＝aliyun', () => {
  const { ctx } = makeCtx()
  const hub = createHubService({ ctx, config: {}, version: 't' })
  assert.equal(hub.catalog().provider, 'aliyun')
  assert.equal(hub.catalog('deepseek').provider, 'deepseek')
  assert.ok(hub.catalog('deepseek').models.some((m) => m.id === 'deepseek-flash'))
  assert.ok(hub.catalog('aliyun').models.some((m) => m.id === 'qwen4-max'))
})

test('status.providers 覆盖 16 平台且凭据状态逐平台', async () => {
  const { ctx } = makeCtx()
  const hub = createHubService({ ctx, config: {}, version: 't' })
  const s = await hub.status()
  assert.equal(s.providerId, 'aliyun')
  assert.equal(s.providers.length, 16)
  assert.equal(s.providers.find((p) => p.id === 'aliyun').credential.configured, true)
  assert.equal(s.providers.find((p) => p.id === 'openai').credential.configured, false)
  assert.equal(s.providers.find((p) => p.id === 'zhipu').credential.configured, true)
})

test('目录路由 apply 薄写入：仅 id+name，不写容量/efforts/compat/api/baseURL', async () => {
  const { ctx, edits } = makeCtx()
  const hub = createHubService({ ctx, config: {}, version: 't' })
  const r = await hub.apply(['deepseek-flash'], 'deepseek')
  assert.equal(r.applied, 1)
  const p = edits[0].providers.deepseek
  assert.deepEqual(p.models[0], { id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash' })
  assert.equal(p.apiKeyEnv, 'DEEPSEEK_API_KEY')
  assert.equal(p.api, undefined)
  assert.equal(p.baseURL, undefined)
})

test('openrouter apply 写 routeApi 统一协议', async () => {
  const { ctx, edits } = makeCtx()
  const hub = createHubService({ ctx, config: {}, version: 't' })
  await hub.apply(['openai/gpt-5.2'], 'openrouter')
  assert.equal(edits[0].providers.openrouter.api, 'openai-completions')
})

test('custom 路由 apply 全量声明（zhipu 含容量/compat/efforts）', async () => {
  const { ctx, edits } = makeCtx()
  const hub = createHubService({ ctx, config: {}, version: 't' })
  await hub.apply(['glm-5.3'], 'zhipu')
  const p = edits[0].providers.zhipu
  assert.equal(p.api, 'openai-completions')
  assert.equal(p.baseURL, 'https://open.bigmodel.cn/api/paas/v4')
  const m = p.models[0]
  assert.ok(m.contextWindow > 0 && m.maxTokens > 0)
  assert.equal(m.compat.thinkingFormat, 'zai')
  assert.ok(m.reasoningEfforts.high)
  assert.equal(m.evidence, undefined)
})

test('apply 保留用户自加模型与 provider 级用户字段（跨平台不变量）', async () => {
  const { ctx, edits } = makeCtx({ deepseek: { apiKeyEnv: 'MY_DS_KEY', headers: { 'X-Custom': '1' }, models: [{ id: 'user-model', name: '我的' }] } })
  const hub = createHubService({ ctx, config: {}, version: 't' })
  await hub.apply(['deepseek-flash'], 'deepseek')
  const p = edits[0].providers.deepseek
  assert.equal(p.apiKeyEnv, 'MY_DS_KEY')
  assert.deepEqual(p.headers, { 'X-Custom': '1' })
  assert.ok(p.models.some((m) => m.id === 'user-model'))
})

test('目录路由 verify 仅记录 evidence，不改 reasoningEfforts/compat', async () => {
  const { ctx } = makeCtx()
  const hub = createHubService({ ctx, config: {}, version: 't' })
  const before = structuredClone(hub.catalog('deepseek').models.find((m) => m.id === 'deepseek-flash').reasoningEfforts)
  const origFetch = globalThis.fetch
  globalThis.fetch = completionsStub({ devOk: false })
  try {
    const r = await hub.verify(['deepseek-flash'], 'deepseek')
    assert.equal(r.verified, 1)
    const m = hub.catalog('deepseek').models.find((x) => x.id === 'deepseek-flash')
    assert.ok(m.evidence.testedAt)
    assert.equal(m.evidence.developerRole, 'rejected')
    assert.deepEqual(m.reasoningEfforts, before, '目录路由不自动派生')
    assert.equal(m.compat, undefined)
  } finally { globalThis.fetch = origFetch }
})

test('custom 路由 verify 派生合并：保留 thinkingFormat，按证据更新 devRole', async () => {
  const { ctx } = makeCtx()
  const hub = createHubService({ ctx, config: {}, version: 't' })
  const origFetch = globalThis.fetch
  globalThis.fetch = completionsStub({ devOk: false })
  try {
    await hub.verify(['glm-5.3'], 'zhipu')
    const m = hub.catalog('zhipu').models.find((x) => x.id === 'glm-5.3')
    assert.equal(m.compat.supportsDeveloperRole, false)
    assert.equal(m.compat.thinkingFormat, 'zai', 'preset 已知键保留')
    assert.ok(m.evidence.testedAt)
  } finally { globalThis.fetch = origFetch }
})

test('目录路由手动编辑 maxTokens → manualFields 放行薄写入', async () => {
  const { ctx, edits } = makeCtx()
  const hub = createHubService({ ctx, config: {}, version: 't' })
  await hub.apply(['deepseek-flash'], 'deepseek')
  const r = await hub.editModel('deepseek-flash', { maxTokens: 65536 }, 'deepseek')
  assert.equal(r.applied, true)
  const m = edits[edits.length - 1].providers.deepseek.models.find((x) => x.id === 'deepseek-flash')
  assert.equal(m.maxTokens, 65536)
  assert.equal(m.contextWindow, undefined, '未编辑字段仍继承')
  const cat = hub.catalog('deepseek').models.find((x) => x.id === 'deepseek-flash')
  assert.ok(cat.manualFields.includes('maxTokens'))
})

test('目录路由编辑 compat 被协议门禁拒绝（mistral）', async () => {
  const { ctx } = makeCtx()
  const hub = createHubService({ ctx, config: {}, version: 't' })
  await assert.rejects(() => hub.editModel('mistral-large-latest', { compat: { thinkingFormat: 'openai' } }, 'mistral'), (e) => e.code === 'invalid')
})

test('旧版 catalog.json 迁移为 catalogs/aliyun.json（保留原件）', () => {
  const home = TEST_HOME + '/.dsh-model-hub'
  mkdirSync(home, { recursive: true })
  const legacy = { schemaVersion: 1, provider: 'aliyun', models: [{ id: 'legacy-model', name: '旧目录', contextWindow: 100, maxTokens: 10, input: ['text'], reasoningEfforts: false, evidence: null }] }
  writeFileSync(home + '/catalog.json', JSON.stringify(legacy))
  const { ctx } = makeCtx()
  const hub = createHubService({ ctx, config: {}, version: 't' })
  assert.ok(hub.catalog('aliyun').models.some((m) => m.id === 'legacy-model'))
  assert.ok(existsSync(home + '/catalogs/aliyun.json'))
  assert.ok(existsSync(home + '/catalog.json'), '原件保留')
  rmSync(home + '/catalog.json')
  rmSync(home + '/catalogs/aliyun.json')
})

test('未知平台 not-found', () => {
  const { ctx } = makeCtx()
  const hub = createHubService({ ctx, config: {}, version: 't' })
  assert.throws(() => hub.catalog('nope'), (e) => e.code === 'not-found')
})

test('discover 按平台方言（google）并入未知模型', async () => {
  const { ctx } = makeCtx()
  const hub = createHubService({ ctx, config: {}, version: 't' })
  const origFetch = globalThis.fetch
  globalThis.fetch = async (url, opts) => {
    assert.ok(url.endsWith('/models'))
    assert.equal(opts.headers['x-goog-api-key'], 'gk')
    return { ok: true, status: 200, text: async () => JSON.stringify({ models: [{ name: 'models/gemini-new', supportedGenerationMethods: ['generateContent'] }] }) }
  }
  const keys = { GEMINI_API_KEY: { value: 'gk' } }
  const ctx2 = { get: (n) => (n === 'credentials' ? { resolve: async (ref) => keys[ref] } : ctx.get(n)) }
  const hub2 = createHubService({ ctx: ctx2, config: {}, version: 't' })
  try {
    const r = await hub2.discover('google')
    assert.equal(r.added, 1)
    assert.ok(hub2.catalog('google').models.some((m) => m.id === 'gemini-new' && m.evidence === null))
  } finally { globalThis.fetch = origFetch }
})

test('reset 逐平台回 preset', async () => {
  const { ctx } = makeCtx()
  const hub = createHubService({ ctx, config: {}, version: 't' })
  await hub.editModel('deepseek-flash', { maxTokens: 999 }, 'deepseek')
  hub.resetCatalog('deepseek')
  const m = hub.catalog('deepseek').models.find((x) => x.id === 'deepseek-flash')
  assert.notEqual(m.maxTokens, 999)
  assert.equal(m.manualFields, undefined)
})

test('measure 非 completions 协议诚实返回不支持', async () => {
  const { ctx } = makeCtx()
  const hub = createHubService({ ctx, config: {}, version: 't' })
  const r = await hub.measureMaxOutput('claude-opus-5-5', 'anthropic')
  assert.equal(r.measured, false)
  assert.ok(r.reason)
})

test('runtime 持久化逐平台落盘', async () => {
  const { ctx } = makeCtx()
  const hub = createHubService({ ctx, config: {}, version: 't' })
  await hub.editModel('kimi-k3', { maxTokens: 4096 }, 'moonshotai-cn')
  const f = TEST_HOME + '/.dsh-model-hub/catalogs/moonshotai-cn.json'
  assert.ok(existsSync(f))
  const saved = JSON.parse(readFileSync(f, 'utf8'))
  assert.equal(saved.models.find((m) => m.id === 'kimi-k3').maxTokens, 4096)
})