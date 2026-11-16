// 真实宿主集成测试：导入真实插件 index.js（apply），用忠实的服务桩驱动完整 host 流程，
// 并用官方 dsh-llm-pi-ai 适配器自己的 Config schema 校验合并配置（决定性证据）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { rmSync } from 'node:fs'
import { apply, name, version, inject } from '../index.js'
import { API_BASE, CONTROL_HEADER } from '../lib/routes.js'

// 隔离测试数据目录：discover/verify 的持久化不污染真实 ~/.dsh；每次运行前清理保证幂等。
const TEST_HOME = fileURLToPath(new URL('../.test-data', import.meta.url))
rmSync(TEST_HOME, { recursive: true, force: true })
process.env.DSH_HOME = TEST_HOME

// 官方适配器 Config schema（npm 全局 dsh 树，0.2.2-alpha.3；与桌面 rc.3 同 schema 家族）。
const ADAPTER = pathToFileURL('C:/Users/李/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js').href
const { Config } = await import(ADAPTER)

const TOKEN_HOLDER = {}
function makeCtx(piAiConfig, defaultConfig, opts = {}) {
  const routes = {}
  const edits = []
  // 真实 cordis Entry 形状：id/name/config 都在 options 下，无顶层 id/name。
  const entries = [
    { options: { id: 'llm-pi-ai', name: '@deepseek-ai/dsh-llm-pi-ai', config: piAiConfig } },
    { options: { id: 'agent-default-model', name: '@deepseek-ai/dsh-agent-default-model', config: defaultConfig } },
  ]
  const configEditor = {
    entries: () => entries,
    edit: async (entry, change) => {
      if (opts.failEdit) throw Object.assign(new Error('simulated config write failure'), { code: 'no-adapter' })
      const current = structuredClone(entry.options.config ?? {})
      const next = change(current, {})
      entry.options.config = next
      edits.push({ id: entry.options.id, next })
    },
  }
  const credentials = { resolve: async (ref) => (ref === 'ALIYUN_API_KEY' ? { value: 'test-key', source: 'store' } : undefined) }
  const services = { configEditor, credentials }
  const ctx = {
    get: (n) => services[n],
    webServer: { register: ({ path, handler }) => { routes[path] = handler; return () => { delete routes[path] } } },
    effect: (fn) => fn(),
    logger: { warn() {}, info() {} },
  }
  return { ctx, routes, edits, entries }
}

function mkReq({ headers = {}, body = null } = {}) {
  const listeners = {}
  return {
    headers: { host: 'localhost', ...headers },
    socket: { remoteAddress: '127.0.0.1' },
    on(ev, fn) { listeners[ev] = fn; return this },
    destroy() {},
    emit() { if (body !== null) listeners.data?.(Buffer.from(JSON.stringify(body))); listeners.end?.() },
  }
}
function mkRes() {
  let status = null, doc = null
  return { writeHead(s) { status = s }, end(d) { doc = JSON.parse(d) }, get status() { return status }, get doc() { return doc } }
}
async function callRoute(routes, route, { token, body } = {}) {
  const res = mkRes()
  const headers = token ? { [CONTROL_HEADER]: token } : {}
  const req = mkReq({ headers, body: body ?? {} })
  const p = routes[API_BASE + '/' + route](req, res)
  req.emit()
  await p
  return res
}

const basePiAi = {
  providers: {
    aliyun: { displayName: '阿里云百炼', apiKeyEnv: 'ALIYUN_API_KEY', baseURL: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1', api: 'openai-completions', models: [{ id: 'glm-5.3' }, { id: 'qwen4-max' }, { id: 'user-custom', name: '我的模型' }] },
    openai: { apiKeyEnv: 'OPENAI_API_KEY', models: [{ id: 'gpt-5' }] },
  },
}

test('插件元数据与注入服务', () => {
  assert.equal(name, 'dsh-model-hub')
  assert.equal(version, '0.2.0')
  assert.deepEqual(inject, ['configEditor', 'webServer', 'credentials'])
})

test('apply 挂载 6 条命名路由', () => {
  const { ctx, routes } = makeCtx(structuredClone(basePiAi), { provider: 'deepseek-account', model: 'deepseek-flash' })
  apply(ctx, {})
  for (const r of ['status', 'catalog', 'apply', 'discover', 'verify', 'set-default']) {
    assert.ok(routes[API_BASE + '/' + r], 'route ' + r)
  }
})

test('status 回 token + provider 状态', async () => {
  const { ctx, routes } = makeCtx(structuredClone(basePiAi), {})
  apply(ctx, {})
  const res = await callRoute(routes, 'status')
  assert.equal(res.status, 200)
  assert.ok(res.doc.key)
  TOKEN_HOLDER.token = res.doc.key
  assert.equal(res.doc.provider.mounted, true)
  assert.equal(res.doc.provider.modelCount, 3)
  assert.equal(res.doc.credential.configured, true)
})

test('apply 合并配置通过官方适配器 Config schema 校验', async () => {
  const { ctx, routes, edits } = makeCtx(structuredClone(basePiAi), {})
  apply(ctx, {})
  const status = await callRoute(routes, 'status')
  const token = status.doc.key
  const res = await callRoute(routes, 'apply', { token, body: { modelIds: ['qwen4-max', 'glm-5.3', 'deepseek-v4.1-flash-1017'] } })
  assert.equal(res.status, 200)
  assert.equal(res.doc.applied, 3)
  const edit = edits.find((e) => e.id === 'llm-pi-ai')
  assert.ok(edit, 'llm-pi-ai edited')
  // 决定性：官方适配器自己的 schema 接受合并配置（非法配置会抛错，见阴性对照）。
  // providers 标 .volatile()，parsed 输出剥离它，故以「不抛错」为接受证据。
  assert.doesNotThrow(() => Config(edit.next))
  // 保留其他 provider
  assert.deepEqual(edit.next.providers.openai, basePiAi.providers.openai)
  const models = edit.next.providers.aliyun.models
  // 保留用户自加模型
  assert.ok(models.some((m) => m.id === 'user-custom' && m.name === '我的模型'))
  // 目录模型带实测 efforts + compat
  const qwen = models.find((m) => m.id === 'qwen4-max')
  assert.equal(qwen.reasoningEfforts.off, 'none')
  assert.equal(qwen.reasoningEfforts.high, 'high')
  assert.equal(qwen.compat.supportsDeveloperRole, false)
  const ds = models.find((m) => m.id === 'deepseek-v4.1-flash-1017')
  assert.equal(ds.compat.supportsDeveloperRole, false)
  // evidence/recommended 不写入配置
  assert.equal(qwen.evidence, undefined)
  assert.equal(qwen.recommended, undefined)
})

test('apply 无 token 403', async () => {
  const { ctx, routes } = makeCtx(structuredClone(basePiAi), {})
  apply(ctx, {})
  const res = await callRoute(routes, 'apply', { body: { modelIds: ['qwen4-max'] } })
  assert.equal(res.status, 403)
})

test('set-default 仅用户触发时改 agent-default-model', async () => {
  const { ctx, routes, edits } = makeCtx(structuredClone(basePiAi), { provider: 'deepseek-account', model: 'deepseek-flash' })
  apply(ctx, {})
  const status = await callRoute(routes, 'status')
  const res = await callRoute(routes, 'set-default', { token: status.doc.key, body: { provider: 'aliyun', model: 'qwen4-max' } })
  assert.equal(res.status, 200)
  const edit = edits.find((e) => e.id === 'agent-default-model')
  assert.equal(edit.next.provider, 'aliyun')
  assert.equal(edit.next.model, 'qwen4-max')
})

test('阴性对照：官方 Config 拒绝非法 effort 键', () => {
  const bad = { providers: { aliyun: { apiKeyEnv: 'K', api: 'openai-completions', baseURL: 'https://x/v1', models: [{ id: 'm', reasoningEfforts: { bogus: 'high' } }] } } }
  assert.throws(() => Config(bad))
})

test('discover 过滤非对话模型并把未知模型并入目录', async () => {
  const { ctx, routes } = makeCtx(structuredClone(basePiAi), {})
  apply(ctx, {})
  const status = await callRoute(routes, 'status')
  const origFetch = globalThis.fetch
  globalThis.fetch = async (url) => ({ ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: 'qwen4-max' }, { id: 'wan2.7-image' }, { id: 'qwen-audio-3.0-tts-plus' }, { id: 'brand-new-model' }] }) })
  try {
    const res = await callRoute(routes, 'discover', { token: status.doc.key, body: {} })
    assert.equal(res.status, 200)
    const ids = res.doc.candidates.map((c) => c.id)
    assert.ok(!ids.includes('wan2.7-image'))
    assert.ok(!ids.includes('qwen-audio-3.0-tts-plus'))
    assert.ok(ids.includes('brand-new-model'))
    assert.equal(res.doc.added, 1)
    const cat = await callRoute(routes, 'catalog')
    assert.ok(cat.doc.models.some((m) => m.id === 'brand-new-model' && m.evidence === null))
  } finally {
    globalThis.fetch = origFetch
  }
})

// ===== v0.2.0 管理深度 =====

test('edit 双写：已应用模型同步目录+live 配置且过官方 schema', async () => {
  const { ctx, routes, edits } = makeCtx(structuredClone(basePiAi), {})
  apply(ctx, {})
  const status = await callRoute(routes, 'status')
  const res = await callRoute(routes, 'edit', { token: status.doc.key, body: { id: 'qwen4-max', draft: { maxTokens: 65536, compat: { supportsDeveloperRole: false, thinkingFormat: 'qwen' } } } })
  assert.equal(res.status, 200)
  assert.equal(res.doc.applied, true)
  const edit = edits.find((e) => e.id === 'llm-pi-ai')
  assert.ok(edit, 'live config edited')
  assert.doesNotThrow(() => Config(edit.next))
  const q = edit.next.providers.aliyun.models.find((m) => m.id === 'qwen4-max')
  assert.equal(q.maxTokens, 65536)
  assert.equal(q.compat.thinkingFormat, 'qwen')
  assert.equal(q.capacitySource, undefined, 'capacitySource 不写入配置')
  const cat = await callRoute(routes, 'catalog')
  const cq = cat.doc.models.find((m) => m.id === 'qwen4-max')
  assert.equal(cq.maxTokens, 65536)
  assert.equal(cq.capacitySource.maxOutput, 'manual')
})

test('edit 非法草稿 400 且不写', async () => {
  const { ctx, routes, edits } = makeCtx(structuredClone(basePiAi), {})
  apply(ctx, {})
  const status = await callRoute(routes, 'status')
  const res = await callRoute(routes, 'edit', { token: status.doc.key, body: { id: 'qwen4-max', draft: { maxTokens: -5 } } })
  assert.equal(res.status, 400)
  assert.equal(edits.length, 0)
})

test('edit 未应用模型只改目录不写 live', async () => {
  const { ctx, routes, edits } = makeCtx(structuredClone(basePiAi), {})
  apply(ctx, {})
  const status = await callRoute(routes, 'status')
  const res = await callRoute(routes, 'edit', { token: status.doc.key, body: { id: 'qwen3.8-max', draft: { maxTokens: 4096 } } })
  assert.equal(res.status, 200)
  assert.equal(res.doc.applied, false)
  assert.equal(edits.filter((e) => e.id === 'llm-pi-ai').length, 0)
  const cat = await callRoute(routes, 'catalog')
  assert.equal(cat.doc.models.find((m) => m.id === 'qwen3.8-max').maxTokens, 4096)
})

test('edit 双写失败回滚目录', async () => {
  const { ctx, routes } = makeCtx(structuredClone(basePiAi), {}, { failEdit: true })
  apply(ctx, {})
  const status = await callRoute(routes, 'status')
  const before = (await callRoute(routes, 'catalog')).doc.models.find((m) => m.id === 'qwen4-max').maxTokens
  const res = await callRoute(routes, 'edit', { token: status.doc.key, body: { id: 'qwen4-max', draft: { maxTokens: 999 } } })
  assert.ok(res.status >= 400)
  const after = (await callRoute(routes, 'catalog')).doc.models.find((m) => m.id === 'qwen4-max').maxTokens
  assert.equal(after, before, '目录回滚')
})

test('measure-max-output 二分实测并双写', async () => {
  const { ctx, routes, edits } = makeCtx(structuredClone(basePiAi), {})
  apply(ctx, {})
  const status = await callRoute(routes, 'status')
  const origFetch = globalThis.fetch
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body)
    const ok = (body.max_tokens ?? 0) <= 65536
    return { status: ok ? 200 : 400, text: async () => JSON.stringify(ok ? { choices: [{ message: { content: 'OK' } }] } : { error: { message: 'too large' } }) }
  }
  try {
    const res = await callRoute(routes, 'measure-max-output', { token: status.doc.key, body: { id: 'qwen4-max' } })
    assert.equal(res.status, 200)
    assert.equal(res.doc.measured, true)
    assert.equal(res.doc.value, 65536)
    const cat = await callRoute(routes, 'catalog')
    const cq = cat.doc.models.find((m) => m.id === 'qwen4-max')
    assert.equal(cq.maxTokens, 65536)
    assert.equal(cq.capacitySource.maxOutput, 'measured')
    const edit = edits.find((e) => e.id === 'llm-pi-ai')
    assert.equal(edit.next.providers.aliyun.models.find((m) => m.id === 'qwen4-max').maxTokens, 65536)
  } finally {
    globalThis.fetch = origFetch
  }
})

test('reset 回 preset 丢弃 runtime 编辑', async () => {
  const { ctx, routes } = makeCtx(structuredClone(basePiAi), {})
  apply(ctx, {})
  const status = await callRoute(routes, 'status')
  await callRoute(routes, 'edit', { token: status.doc.key, body: { id: 'qwen3.8-max', draft: { maxTokens: 4096 } } })
  const res = await callRoute(routes, 'reset', { token: status.doc.key, body: {} })
  assert.equal(res.status, 200)
  const cat = await callRoute(routes, 'catalog')
  assert.equal(cat.doc.models.find((m) => m.id === 'qwen3.8-max').maxTokens, 131072, '回 preset 默认')
})