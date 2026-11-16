// openai-responses 协议探针（OpenAI / xAI）。
// 端点 {base}/responses；input 数组；max_output_tokens；reasoning:{effort}；developer 角色；
// 扁平 function tools（name/parameters 顶层）。失败关闭、带超时、绝不输出密钥。
const EFFORT_WIRE = [
  ['none', 'off'], ['minimal', 'minimal'], ['low', 'low'], ['medium', 'medium'],
  ['high', 'high'], ['xhigh', 'xhigh'], ['max', 'max'],
]

export function deriveResponses(evidence) {
  const compat = {}
  if (evidence.developerRole === 'rejected') compat.supportsDeveloperRole = false
  const efforts = {}
  for (const [wire, level] of EFFORT_WIRE) {
    if (evidence.efforts?.[level]?.ok) efforts[level] = wire
  }
  const hasThinking = Object.keys(efforts).some((k) => k !== 'off')
  return { reasoningEfforts: hasThinking ? efforts : false, compat: Object.keys(compat).length ? compat : undefined }
}

export async function probeResponses({ baseURL, apiKey, model, fetchImpl = fetch }) {
  if (!apiKey) throw Object.assign(new Error('missing credential'), { code: 'missing-credential' })
  const url = String(baseURL).replace(/\/+$/, '') + '/responses'
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
  const isOk = (r) => r.status === 200 && !r.j?.error && Array.isArray(r.j?.output)
  const evidence = { efforts: {}, testedAt: new Date().toISOString(), protocol: 'openai-responses' }
  const userMsg = [{ role: 'user', content: 'Reply with exactly: OK' }]

  const base = await call({ model, input: userMsg, max_output_tokens: 64 })
  if (!isOk(base)) throw Object.assign(new Error('model unusable'), { code: 'unusable' })
  evidence.maxTokensField = 'max_output_tokens'

  const dev = await call({ model, input: [{ role: 'developer', content: 'You are terse.' }, ...userMsg], max_output_tokens: 64 })
  evidence.developerRole = isOk(dev) ? 'ok' : 'rejected'

  const tool = await call({
    model,
    input: [{ role: 'user', content: 'What is the weather in Beijing? Call the get_weather tool.' }],
    tools: [{ type: 'function', name: 'get_weather', description: 'Get weather', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] }, strict: false }],
    tool_choice: 'auto',
    max_output_tokens: 256,
  })
  const called = Array.isArray(tool.j?.output) && tool.j.output.some((it) => it?.type === 'function_call')
  evidence.tools = isOk(tool) && called ? 'ok' : 'fail'

  for (const [wire, level] of EFFORT_WIRE) {
    const r = await call({ model, input: userMsg, max_output_tokens: 512, reasoning: { effort: wire } })
    evidence.efforts[level] = { ok: isOk(r), reasoningTokens: r.j?.usage?.output_tokens_details?.reasoning_tokens ?? 0, wire }
  }
  return evidence
}