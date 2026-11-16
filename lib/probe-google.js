// google-generative-ai 协议探针（Gemini）。
// 端点 {base}/models/{id}:generateContent；x-goog-api-key。
// 推理两种形态：gemini-3+/4+/latest 别名/gemma 走 thinkingConfig.thinkingLevel（大写 MINIMAL/LOW/MEDIUM/HIGH）；
// 2.5 系走 thinkingConfig.thinkingBudget（数值）。off 统一 thinkingBudget:0（pi-ai 同口径）。
// 成本受控：level 探针 maxOutputTokens=1024；budget 只探 minimal=128/low=2048（medium/high 不探，诚实标未测）。
// systemInstruction 是 developer 角色的等价物（pi-ai 原生映射），evidence 记录其接受性。
const LEVEL_WIRE = [['MINIMAL', 'minimal'], ['LOW', 'low'], ['MEDIUM', 'medium'], ['HIGH', 'high']]
const BUDGET_LEVELS = [['minimal', 128], ['low', 2048]]

export function usesThinkingLevel(modelId) {
  const id = String(modelId).toLowerCase()
  return /gemini-3(?:\.\d+)?-(?:pro|flash)/.test(id)
    || /gemini-(?:[4-9]|[1-9]\d)/.test(id)
    || id === 'gemini-flash-latest' || id === 'gemini-flash-lite-latest'
    || id.startsWith('gemma')
}

export async function probeGoogle({ baseURL, apiKey, model, fetchImpl = fetch }) {
  if (!apiKey) throw Object.assign(new Error('missing credential'), { code: 'missing-credential' })
  const url = String(baseURL).replace(/\/+$/, '') + '/models/' + encodeURIComponent(model) + ':generateContent'
  const call = async (body) => {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    })
    const text = await res.text()
    let j = null; try { j = JSON.parse(text) } catch {}
    return { status: res.status, j }
  }
  const isOk = (r) => r.status === 200 && !r.j?.error && Array.isArray(r.j?.candidates)
  const evidence = { efforts: {}, testedAt: new Date().toISOString(), protocol: 'google-generative-ai' }
  const contents = [{ role: 'user', parts: [{ text: 'Reply with exactly: OK' }] }]

  const base = await call({ contents, generationConfig: { maxOutputTokens: 64 } })
  if (!isOk(base)) throw Object.assign(new Error('model unusable'), { code: 'unusable' })
  evidence.maxTokensField = 'maxOutputTokens'

  const dev = await call({ contents, systemInstruction: { parts: [{ text: 'You are terse.' }] }, generationConfig: { maxOutputTokens: 64 } })
  evidence.developerRole = isOk(dev) ? 'ok' : 'rejected'

  const tool = await call({
    contents: [{ role: 'user', parts: [{ text: 'What is the weather in Beijing? Call the get_weather tool.' }] }],
    tools: [{ functionDeclarations: [{ name: 'get_weather', description: 'Get weather', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } }] }],
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    generationConfig: { maxOutputTokens: 256 },
  })
  const parts = tool.j?.candidates?.[0]?.content?.parts
  const called = Array.isArray(parts) && parts.some((p) => p?.functionCall)
  evidence.tools = isOk(tool) && called ? 'ok' : 'fail'

  const levelDialect = usesThinkingLevel(model)
  evidence.thinkingStyle = levelDialect ? 'level' : 'budget'

  const off = await call({ contents, generationConfig: { maxOutputTokens: 64, thinkingConfig: { thinkingBudget: 0 } } })
  evidence.efforts.off = { ok: isOk(off), reasoningTokens: 0, wire: '0' }

  if (levelDialect) {
    for (const [wire, level] of LEVEL_WIRE) {
      const r = await call({ contents, generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: wire, includeThoughts: true } } })
      evidence.efforts[level] = { ok: isOk(r), reasoningTokens: r.j?.usageMetadata?.thoughtsTokenCount ?? 0, wire }
    }
  } else {
    for (const [level, budget] of BUDGET_LEVELS) {
      const r = await call({ contents, generationConfig: { maxOutputTokens: budget + 512, thinkingConfig: { thinkingBudget: budget, includeThoughts: true } } })
      evidence.efforts[level] = { ok: isOk(r), reasoningTokens: r.j?.usageMetadata?.thoughtsTokenCount ?? 0, wire: String(budget) }
    }
  }
  return evidence
}