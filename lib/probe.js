// 运行时单模型复验探针。deriveModel 是纯函数（可单测）；probeModel 走网络（fetchImpl 可注入）。
// 失败关闭：探测失败不硬发；请求 max_tokens<=512、带超时；绝不输出密钥。
const EFFORT_WIRE = [
  ['none', 'off'], ['minimal', 'minimal'], ['low', 'low'], ['medium', 'medium'],
  ['high', 'high'], ['xhigh', 'xhigh'], ['max', 'max'],
]

export function deriveModel(evidence) {
  const compat = {}
  if (evidence.developerRole === 'rejected') compat.supportsDeveloperRole = false
  if (evidence.maxTokensField === 'max_completion_tokens') compat.maxTokensField = 'max_completion_tokens'
  const efforts = {}
  for (const [wire, level] of EFFORT_WIRE) {
    if (evidence.efforts?.[level]?.ok) efforts[level] = wire
  }
  const hasThinking = Object.keys(efforts).some((k) => k !== 'off')
  return { reasoningEfforts: hasThinking ? efforts : false, compat: Object.keys(compat).length ? compat : undefined }
}

export async function probeModel({ baseURL, apiKey, model, fetchImpl = fetch }) {
  if (!apiKey) throw Object.assign(new Error('missing credential'), { code: 'missing-credential' })
  const url = String(baseURL).replace(/\/+$/, '') + '/chat/completions'
  const call = async (body) => {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    })
    const text = await res.text()
    let j = null; try { j = JSON.parse(text) } catch {}
    return { status: res.status, j }
  }
  const isOk = (r) => r.status === 200 && !r.j?.error && !!r.j?.choices
  const evidence = { efforts: {}, testedAt: new Date().toISOString() }

  let field = 'max_tokens'
  let base = await call({ model, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: 64 })
  if (!isOk(base)) {
    const alt = await call({ model, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_completion_tokens: 64 })
    if (isOk(alt)) { field = 'max_completion_tokens'; base = alt }
    else throw Object.assign(new Error('model unusable'), { code: 'unusable' })
  }
  evidence.maxTokensField = field

  const dev = await call({ model, messages: [{ role: 'developer', content: 'You are terse.' }, { role: 'user', content: 'Reply with exactly: OK' }], [field]: 64 })
  evidence.developerRole = isOk(dev) ? 'ok' : 'rejected'

  const tool = await call({
    model,
    messages: [{ role: 'user', content: 'What is the weather in Beijing? Call the get_weather tool.' }],
    tools: [{ type: 'function', function: { name: 'get_weather', description: 'Get weather', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } } }],
    tool_choice: 'auto',
    [field]: 256,
  })
  const tc = tool.j?.choices?.[0]?.message?.tool_calls
  evidence.tools = isOk(tool) && Array.isArray(tc) && tc.length > 0 ? 'ok' : 'fail'

  for (const [wire, level] of EFFORT_WIRE) {
    const r = await call({ model, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], [field]: 512, reasoning_effort: wire })
    evidence.efforts[level] = { ok: isOk(r), reasoningTokens: r.j?.usage?.completion_tokens_details?.reasoning_tokens ?? 0, wire }
  }
  return evidence
}

// 实测最大输出：极小 prompt 二分探测 provider 接受的最大 max_tokens 参数值。
// provider 按参数值拒绝（不真正输出那么多），故成本低。若连超大值都接受（clamp/忽略），
// 说明无法用拒绝法测量，返回 measured:false。
export async function probeMaxOutput({ baseURL, apiKey, model, field = 'max_tokens', fetchImpl = fetch, lo = 1024, hi = 2000000 }) {
  if (!apiKey) throw Object.assign(new Error('missing credential'), { code: 'missing-credential' })
  const url = String(baseURL).replace(/\/+$/, '') + '/chat/completions'
  const accepts = async (n) => {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], [field]: n }),
      signal: AbortSignal.timeout(60000),
    })
    const text = await res.text()
    let j = null; try { j = JSON.parse(text) } catch {}
    return res.status === 200 && !j?.error && !!j?.choices
  }
  if (await accepts(hi)) return { measured: false, reason: 'provider accepts oversized max_tokens; cannot measure by rejection' }
  if (!(await accepts(lo))) return { measured: false, reason: 'low bound rejected' }
  let lo0 = lo, hi0 = hi
  while (lo0 + 1 < hi0) {
    const mid = Math.floor((lo0 + hi0) / 2)
    if (await accepts(mid)) lo0 = mid
    else hi0 = mid
  }
  return { measured: true, value: lo0, field }
}