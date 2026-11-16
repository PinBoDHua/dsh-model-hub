// anthropic-messages 协议探针（Anthropic / MiniMax）。
// 端点 {base}/v1/messages；x-api-key + anthropic-version；max_tokens 必填。
// 推理两种形态：adaptive（thinking:{type:'adaptive'} + output_config:{effort}，新 Claude）
// 与 budget（thinking:{type:'enabled',budget_tokens}，旧 Claude / MiniMax）。
// thinkingStyle 可由 preset 提示；缺省自动探测（先 adaptive 后 budget）。
// developer 角色无此协议概念（系统提示走 system 参数，pi-ai 原生处理）→ evidence 标 unsupported。
// 成本受控：effort 探针 max_tokens=1024；budget 探针 low/medium/high=1024/2048/4096（max_tokens=budget+1024）。
const ADAPTIVE_WIRE = [['low', 'low'], ['medium', 'medium'], ['high', 'high'], ['xhigh', 'xhigh'], ['max', 'max']]
const BUDGET_LEVELS = [['low', 1024], ['medium', 2048], ['high', 4096]]

export async function probeAnthropic({ baseURL, apiKey, model, fetchImpl = fetch, thinkingStyle }) {
  if (!apiKey) throw Object.assign(new Error('missing credential'), { code: 'missing-credential' })
  const url = String(baseURL).replace(/\/+$/, '') + '/v1/messages'
  const call = async (body) => {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    })
    const text = await res.text()
    let j = null; try { j = JSON.parse(text) } catch {}
    return { status: res.status, j }
  }
  const isOk = (r) => r.status === 200 && !r.j?.error && Array.isArray(r.j?.content)
  const evidence = { efforts: {}, testedAt: new Date().toISOString(), protocol: 'anthropic-messages' }
  const userMsg = [{ role: 'user', content: 'Reply with exactly: OK' }]

  const base = await call({ model, max_tokens: 64, messages: userMsg })
  if (!isOk(base)) throw Object.assign(new Error('model unusable'), { code: 'unusable' })
  evidence.maxTokensField = 'max_tokens'
  evidence.developerRole = 'unsupported'

  const tool = await call({
    model, max_tokens: 256,
    messages: [{ role: 'user', content: 'What is the weather in Beijing? Call the get_weather tool.' }],
    tools: [{ name: 'get_weather', description: 'Get weather', input_schema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } }],
    tool_choice: { type: 'auto' },
  })
  const called = Array.isArray(tool.j?.content) && tool.j.content.some((b) => b?.type === 'tool_use')
  evidence.tools = isOk(tool) && called ? 'ok' : 'fail'

  // 形态判定：preset 提示优先；否则先试 adaptive，再试 budget。
  let style = thinkingStyle === 'adaptive' || thinkingStyle === 'budget' ? thinkingStyle : null
  if (!style) {
    const a = await call({ model, max_tokens: 1024, messages: userMsg, thinking: { type: 'adaptive' }, output_config: { effort: 'high' } })
    if (isOk(a)) style = 'adaptive'
    else {
      const b = await call({ model, max_tokens: 2048, messages: userMsg, thinking: { type: 'enabled', budget_tokens: 1024 } })
      style = isOk(b) ? 'budget' : 'none'
    }
  }
  evidence.thinkingStyle = style

  const off = await call({ model, max_tokens: 64, messages: userMsg, thinking: { type: 'disabled' } })
  evidence.efforts.off = { ok: isOk(off), reasoningTokens: 0, wire: 'disabled' }

  if (style === 'adaptive') {
    for (const [wire, level] of ADAPTIVE_WIRE) {
      const r = await call({ model, max_tokens: 1024, messages: userMsg, thinking: { type: 'adaptive' }, output_config: { effort: wire } })
      evidence.efforts[level] = { ok: isOk(r), reasoningTokens: 0, wire }
    }
  } else if (style === 'budget') {
    for (const [level, budget] of BUDGET_LEVELS) {
      const r = await call({ model, max_tokens: budget + 1024, messages: userMsg, thinking: { type: 'enabled', budget_tokens: budget } })
      evidence.efforts[level] = { ok: isOk(r), reasoningTokens: 0, wire: String(budget) }
    }
  }
  return evidence
}