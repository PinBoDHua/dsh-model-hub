import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROVIDERS, DEFAULT_PROVIDER_ID, findProvider, resolveProviders } from '../lib/providers.js'

test('注册表 16 平台且 id 唯一', () => {
  assert.equal(PROVIDERS.length, 16)
  assert.equal(new Set(PROVIDERS.map((p) => p.id)).size, 16)
  assert.equal(DEFAULT_PROVIDER_ID, 'aliyun')
})

test('每个平台字段齐全且协议合法', () => {
  const probes = ['openai-completions', 'openai-responses', 'anthropic-messages', 'google-generative-ai']
  const discovers = ['openai', 'anthropic', 'google']
  for (const p of PROVIDERS) {
    assert.ok(p.id && p.name?.zh && p.name?.en, 'name ' + p.id)
    assert.ok(['catalog', 'custom'].includes(p.kind), 'kind ' + p.id)
    assert.ok(probes.includes(p.probe), 'probe ' + p.id)
    assert.ok(discovers.includes(p.discover), 'discover ' + p.id)
    assert.ok(/^https:\/\//.test(p.baseURL), 'baseURL ' + p.id)
    assert.ok(/^[A-Z][A-Z0-9_]*$/.test(p.apiKeyEnv), 'apiKeyEnv ' + p.id)
    assert.ok(p.preset && p.preset.endsWith('.json'), 'preset ' + p.id)
  }
})

test('custom 平台恰为 aliyun/zhipu/siliconflow/volcengine', () => {
  assert.deepEqual(PROVIDERS.filter((p) => p.kind === 'custom').map((p) => p.id), ['aliyun', 'zhipu', 'siliconflow', 'volcengine'])
})

test('mistral 探测端点带 /v1 而路由 baseURL 不带', () => {
  const m = findProvider('mistral')
  assert.equal(m.baseURL, 'https://api.mistral.ai')
  assert.equal(m.probeBaseURL, 'https://api.mistral.ai/v1')
  assert.equal(m.api, 'mistral-conversations')
  assert.equal(m.probe, 'openai-completions')
})

test('openrouter 唯一 routeApi 统一协议', () => {
  assert.equal(findProvider('openrouter').routeApi, 'openai-completions')
  assert.equal(PROVIDERS.filter((p) => p.routeApi).length, 1)
})

test('resolveProviders 默认无覆盖', () => {
  const list = resolveProviders({})
  assert.equal(list.length, 16)
  assert.equal(list[0].apiKeyEnv, 'ALIYUN_API_KEY')
})

test('旧版单平台字段覆盖默认平台', () => {
  const list = resolveProviders({ providerId: 'aliyun', apiKeyEnv: 'MY_KEY', baseURL: 'https://gw/v1' })
  const a = list.find((p) => p.id === 'aliyun')
  assert.equal(a.apiKeyEnv, 'MY_KEY')
  assert.equal(a.baseURL, 'https://gw/v1')
})

test('旧版 providerId 指向其他平台时覆盖该平台', () => {
  const list = resolveProviders({ providerId: 'deepseek', apiKeyEnv: 'DS_KEY' })
  assert.equal(list.find((p) => p.id === 'deepseek').apiKeyEnv, 'DS_KEY')
  assert.equal(list.find((p) => p.id === 'aliyun').apiKeyEnv, 'ALIYUN_API_KEY')
})

test('providers 逐平台覆盖', () => {
  const list = resolveProviders({ providers: { openai: { apiKeyEnv: 'AZURE_KEY', baseURL: 'https://azure/v1' } } })
  const o = list.find((p) => p.id === 'openai')
  assert.equal(o.apiKeyEnv, 'AZURE_KEY')
  assert.equal(o.baseURL, 'https://azure/v1')
})

test('未知 id + baseURL + api → 自定义网关（空 preset）', () => {
  const list = resolveProviders({ providers: { 'my-gw': { baseURL: 'https://gw.local/v1', api: 'openai-completions', displayName: '我的网关' } } })
  assert.equal(list.length, 17)
  const gw = list.find((p) => p.id === 'my-gw')
  assert.equal(gw.kind, 'custom')
  assert.equal(gw.preset, null)
  assert.equal(gw.apiKeyEnv, 'MY_GW_API_KEY')
  assert.equal(gw.name.zh, '我的网关')
})

test('未知 id 缺 baseURL/api 不进注册表', () => {
  const list = resolveProviders({ providers: { bad: { apiKeyEnv: 'X' } } })
  assert.equal(list.length, 16)
})