// 开发期全量探针矩阵：实测百炼 token-plan 端点的对话模型，产出 presets/bailian.json。
// 探测项：developer 角色 / maxTokens 字段 / 工具调用 / reasoning_effort 七档。
// 安全：仅读取 ALIYUN_API_KEY，绝不打印密钥；请求 max_tokens<=512、带超时、失败关闭。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const KEY = readFileSync('C:/Users/李/.dsh/.credentials.yaml', 'utf8').match(/^\s{2}ALIYUN_API_KEY:\s*(\S+)\s*$/m)[1]
const BASE = 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'
const OUT = fileURLToPath(new URL('../presets/bailian.json', import.meta.url))

const CHAT = [
  'qwen3.7-max', 'qwen3.7-plus', 'qwen3.6-flash', 'glm-5.2', 'deepseek-v4-pro',
  'deepseek-v4-flash-0731', 'qwen3.8-max', 'deepseek-v4-pro-0813', 'qwen3.8-flash',
  'deepseek-v4.1-flash', 'glm-5.3', 'auto', 'decision-model-preview',
  'deepseek-v4.1-flash-1017', 'qwen4-max-preview', 'qwen4-max',
]
// wire 值（reasoning_effort）→ 选择器档位键
const EFFORT_WIRE = [
  ['none', 'off'], ['minimal', 'minimal'], ['low', 'low'], ['medium', 'medium'],
  ['high', 'high'], ['xhigh', 'xhigh'], ['max', 'max'],
]
// 策展旗舰子集（"推荐"徽标）；其余模型仍标"已验证"。
const RECOMMENDED = new Set(['qwen4-max', 'qwen4-max-preview', 'qwen3.8-max', 'glm-5.3', 'deepseek-v4.1-flash-1017', 'deepseek-v4-pro'])

async function call(body) {
  const t0 = Date.now()
  try {
    const res = await fetch(BASE + '/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    })
    const text = await res.text()
    let j = null; try { j = JSON.parse(text) } catch {}
    return { status: res.status, j, ms: Date.now() - t0, raw: text }
  } catch (e) {
    return { status: 'THROW', j: null, ms: Date.now() - t0, error: String(e?.message || e) }
  }
}

const errMsg = (r) => (r.j?.error?.message || r.j?.error?.code || r.error || (r.status !== 200 ? 'HTTP ' + r.status : '') || '').toString()
const isOk = (r) => r.status === 200 && !r.j?.error && !!r.j?.choices

async function probeModel(model) {
  const evidence = { efforts: {}, testedAt: new Date().toISOString() }
  const compat = {}

  // 1) baseline + maxTokensField
  let field = 'max_tokens'
  let base = await call({ model, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: 64 })
  if (!isOk(base)) {
    const alt = await call({ model, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_completion_tokens: 64 })
    if (isOk(alt)) { field = 'max_completion_tokens'; compat.maxTokensField = 'max_completion_tokens'; base = alt }
    else return { id: model, usable: false, reason: errMsg(base) + ' | ' + errMsg(alt) }
  }
  evidence.maxTokensField = field

  // 2) developer 角色
  const dev = await call({ model, messages: [{ role: 'developer', content: 'You are terse.' }, { role: 'user', content: 'Reply with exactly: OK' }], [field]: 64 })
  if (isOk(dev)) evidence.developerRole = 'ok'
  else { evidence.developerRole = 'rejected'; evidence.developerError = errMsg(dev).slice(0, 160); compat.supportsDeveloperRole = false }

  // 3) 工具调用
  const tool = await call({
    model,
    messages: [{ role: 'user', content: 'What is the weather in Beijing? Call the get_weather tool.' }],
    tools: [{ type: 'function', function: { name: 'get_weather', description: 'Get weather', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } } }],
    tool_choice: 'auto',
    [field]: 256,
  })
  const tc = tool.j?.choices?.[0]?.message?.tool_calls
  evidence.tools = isOk(tool) && Array.isArray(tc) && tc.length > 0 ? 'ok' : 'fail'
  if (evidence.tools === 'fail') evidence.toolsError = errMsg(tool).slice(0, 160)

  // 4) effort 矩阵
  const efforts = {}
  for (const [wire, level] of EFFORT_WIRE) {
    const r = await call({ model, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], [field]: 512, reasoning_effort: wire })
    const ok = isOk(r)
    const rt = r.j?.usage?.completion_tokens_details?.reasoning_tokens ?? 0
    evidence.efforts[level] = { ok, reasoningTokens: rt, wire }
    if (ok) efforts[level] = wire
  }
  // off 档：none 被接受才保留（wire:none）；否则不声明 off
  if (!efforts.off) delete efforts.off
  const hasThinking = Object.keys(efforts).some((k) => k !== 'off')
  const reasoningEfforts = hasThinking ? efforts : false

  const recommended = RECOMMENDED.has(model) && evidence.tools === 'ok' && hasThinking

  return {
    id: model, usable: true, name: model,
    contextWindow: 1000000, maxTokens: 131072,
    input: ['text'],
    reasoningEfforts,
    compat: Object.keys(compat).length ? compat : undefined,
    recommended: !!recommended,
    evidence,
  }
}

// 并发池（限 4，避免端点限流）
async function pool(items, limit, fn) {
  const out = []
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

const results = await pool(CHAT, 4, async (m) => {
  const r = await probeModel(m)
  if (!r.usable) console.log('SKIP', m, '::', r.reason)
  else console.log('OK  ', m, ':: dev=' + r.evidence.developerRole, 'tools=' + r.evidence.tools, 'field=' + r.evidence.maxTokensField, 'efforts=' + (r.reasoningEfforts === false ? 'none' : Object.keys(r.reasoningEfforts).join('/')), r.recommended ? '[recommended]' : '')
  return r
})

const models = results.filter((r) => r.usable).map((r) => {
  const e = { id: r.id, name: r.name, contextWindow: r.contextWindow, maxTokens: r.maxTokens, input: r.input, reasoningEfforts: r.reasoningEfforts, recommended: r.recommended, evidence: r.evidence }
  if (r.compat) e.compat = r.compat
  return e
})

const catalog = {
  schemaVersion: 1,
  provider: 'aliyun',
  displayName: '阿里云百炼',
  api: 'openai-completions',
  baseURL: BASE,
  apiKeyEnv: 'ALIYUN_API_KEY',
  generatedAt: new Date().toISOString(),
  models,
}
writeFileSync(OUT, JSON.stringify(catalog, null, 2) + '\n')
console.log('\nwrote', OUT, '::', models.length, 'usable models,', models.filter((m) => m.recommended).length, 'recommended')