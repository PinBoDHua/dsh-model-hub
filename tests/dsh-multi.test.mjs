// 多平台真实宿主集成测试：真实 index.js + 官方 dsh-llm-pi-ai Config schema 决定性校验。
// 核心证据：目录路由薄写入 / routeApi / 协议门禁 / 自定义路由全量声明 均被官方 schema 接受。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { rmSync } from 'node:fs'
import { apply } from '../index.js'
import { API_BASE, CONTROL_HEADER } from '../lib/routes.js'

const TEST_HOME = fileURLToPath(new URL('../.test-data-multi-dsh', import.meta.url))
rmSync(TEST_HOME, { recursive: true, force: true })
process.env.DSH_HOME = TEST_HOME

const ADAPTER = pathToFileURL('C:/Users/李/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js').href
const { Config } = await import(ADAPTER)

function makeCtx(piAiConfig = { providers: {} }) {
  const routes = {}
  const edits = []
  const entries = [
    { options: { id: 'llm-pi-ai', name: '@deepseek-ai/dsh-llm-pi-ai', config: piAiConfig } },
    { options: { id: 'agent-default-model', name: '@deepseek-ai/dsh-agent-default-model', config: {} } },
  ]
  const configEditor = {
    entries: () => entries,
    edit: async (entry, change) => {
      const current = structuredClone(entry.options.config ?? {})
      const next = change(current, {})
      entry.options.config = next
      edits.push({ id: entry.options.id, next })
    },
  }
  const credentials = { resolve: async (ref) => (ref === 'ALIYUN_API_KEY' ? { value: 'test-key', source: 'store' } : undefined) }
  const ctx = {
    get: (n) => ({ configEditor, credentials }[n]),
    webServer: { register: ({ path, handler }) => { routes[path] = handler; return () => { delete routes[path] } } },
    effect: (fn) => fn(),
    logger: { warn() {}, info() {} },
  }
  return { ctx, routes, edits }
}

function mkReq({ headers = {}, body = null, url = '/x' } = {}) {
  const listeners = {}
  return {
    url,
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
async function callRoute(routes, route, { token, body, url } = {}) {
  const res = mkRes()
  const headers = token ? { [CONTROL_HEADER]: token } : {}
  const req = mkReq({ headers, body: body ?? {}, url })
  const p = routes[API_BASE + '/' + route](req, res)
  req.emit()
  await p
  return res
}
async function tokenOf(routes) {
  return (await callRoute(routes, 'status')).doc.key
}

test('providers 路由回 16 平台摘要', async () => {
  const { ctx, routes } = makeCtx()
  apply(ctx, {})
  const res = await callRoute(routes, 'providers')
  assert.equal(res.status, 200)
  assert.equal(res.doc.providers.length, 16)
  assert.ok(res.doc.providers.find((p) => p.id === 'anthropic'))
})

test('catalog?provider= 逐平台目录', async () => {
  const { ctx, routes } = makeCtx()
  apply(ctx, {})
  const res = await callRoute(routes, 'catalog', { url: '/plugins/dsh-model-hub/catalog?provider=anthropic' })
  assert.equal(res.status, 200)
  assert.equal(res.doc.provider, 'anthropic')
  assert.ok(res.doc.models.some((m) => m.id === 'claude-opus-5-5'))
})

test('目录路由薄写入过官方 Config schema（deepseek/anthropic/google/mistral）', async () => {
  for (const [provider, model] of [['deepseek', 'deepseek-flash'], ['anthropic', 'claude-opus-5-5'], ['google', 'gemini-3.5-flash'], ['mistral', 'mistral-large-latest']]) {
    const { ctx, routes, edits } = makeCtx()
    apply(ctx, {})
    const token = await tokenOf(routes)
    const res = await callRoute(routes, 'apply', { token, body: { modelIds: [model], provider } })
    assert.equal(res.status, 200, provider)
    const edit = edits.find((e) => e.id === 'llm-pi-ai')
    assert.doesNotThrow(() => Config(edit.next), provider + ' 官方 schema 接受薄写入')
    const m = edit.next.providers[provider].models.find((x) => x.id === model)
    assert.equal(m.contextWindow, undefined, provider + ' 容量继承官方目录')
    assert.equal(m.reasoningEfforts, undefined, provider + ' 推理继承官方目录')
  }
})

test('openrouter routeApi 统一协议过官方 schema', async () => {
  const { ctx, routes, edits } = makeCtx()
  apply(ctx, {})
  const token = await tokenOf(routes)
  const res = await callRoute(routes, 'apply', { token, body: { modelIds: ['openai/gpt-5.2', 'anthropic/claude-sonnet-4.5'], provider: 'openrouter' } })
  assert.equal(res.status, 200)
  const edit = edits.find((e) => e.id === 'llm-pi-ai')
  assert.equal(edit.next.providers.openrouter.api, 'openai-completions')
  assert.doesNotThrow(() => Config(edit.next))
})

test('zhipu 自定义路由全量声明过官方 schema', async () => {
  const { ctx, routes, edits } = makeCtx()
  apply(ctx, {})
  const token = await tokenOf(routes)
  const res = await callRoute(routes, 'apply', { token, body: { modelIds: ['glm-5.3', 'glm-4.7'], provider: 'zhipu' } })
  assert.equal(res.status, 200)
  const edit = edits.find((e) => e.id === 'llm-pi-ai')
  assert.doesNotThrow(() => Config(edit.next))
  const p = edit.next.providers.zhipu
  assert.equal(p.api, 'openai-completions')
  assert.equal(p.baseURL, 'https://open.bigmodel.cn/api/paas/v4')
  assert.equal(p.models.find((m) => m.id === 'glm-5.3').compat.thinkingFormat, 'zai')
})

test('目录路由手动编辑 efforts 后写入并过官方 schema', async () => {
  const { ctx, routes, edits } = makeCtx()
  apply(ctx, {})
  const token = await tokenOf(routes)
  await callRoute(routes, 'apply', { token, body: { modelIds: ['claude-opus-5-5'], provider: 'anthropic' } })
  const res = await callRoute(routes, 'edit', { token, body: { id: 'claude-opus-5-5', provider: 'anthropic', draft: { reasoningEfforts: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' } } } })
  assert.equal(res.status, 200)
  const edit = edits[edits.length - 1]
  assert.doesNotThrow(() => Config(edit.next))
  const m = edit.next.providers.anthropic.models.find((x) => x.id === 'claude-opus-5-5')
  assert.equal(m.reasoningEfforts.max, 'max')
})

test('阴性对照：anthropic 模型写 completions 专属 compat 被 hub 门禁拒绝', async () => {
  const { ctx, routes } = makeCtx()
  apply(ctx, {})
  const token = await tokenOf(routes)
  // hub 门禁镜像桌面 rc.3 官方 COMPAT_GATES（源码调研证据见 VERIFICATION-v0.4.0）。
  // 注意：npm 全局 alpha.3 的 schema 对协议门禁较宽松，不能作为该门禁的阴性证据；
  // 这里用两版都拒绝的非法 effort 键证明官方 schema 确在校验合并配置。
  const res = await callRoute(routes, 'edit', { token, body: { id: 'claude-opus-5-5', provider: 'anthropic', draft: { compat: { thinkingFormat: 'openai' } } } })
  assert.equal(res.status, 400)
  const bad = { providers: { anthropic: { apiKeyEnv: 'K', models: [{ id: 'claude-opus-5-5', reasoningEfforts: { bogus: 'high' } }] } } }
  assert.throws(() => Config(bad))
})

test('阴性对照：目录路由薄写入 + 用户自加模型共存过官方 schema', async () => {
  const { ctx, routes, edits } = makeCtx({ providers: { deepseek: { apiKeyEnv: 'DEEPSEEK_API_KEY', models: [{ id: 'user-extra', name: '用户自加', contextWindow: 8000, maxTokens: 4000 }] } } })
  apply(ctx, {})
  const token = await tokenOf(routes)
  await callRoute(routes, 'apply', { token, body: { modelIds: ['deepseek-v4-pro'], provider: 'deepseek' } })
  const edit = edits.find((e) => e.id === 'llm-pi-ai')
  assert.doesNotThrow(() => Config(edit.next))
  const models = edit.next.providers.deepseek.models
  assert.ok(models.some((m) => m.id === 'user-extra' && m.maxTokens === 4000), '用户模型保留')
  assert.ok(models.some((m) => m.id === 'deepseek-v4-pro'))
})

test('set-default 跨平台（用户显式触发）', async () => {
  const { ctx, routes, edits } = makeCtx()
  apply(ctx, {})
  const token = await tokenOf(routes)
  const res = await callRoute(routes, 'set-default', { token, body: { provider: 'anthropic', model: 'claude-opus-5-5' } })
  assert.equal(res.status, 200)
  const edit = edits.find((e) => e.id === 'agent-default-model')
  assert.equal(edit.next.provider, 'anthropic')
})