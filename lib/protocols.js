// 协议方言分发（v0.4.0）。probe.js 保持 openai-completions 原实现（现有单测不动）；
// responses/anthropic/google 各自独立模块。probeFor/deriveFor/measureFor 是唯一公共边界。
import { probeModel, deriveModel, probeMaxOutput } from './probe.js'
import { probeResponses, deriveResponses } from './probe-responses.js'
import { probeAnthropic } from './probe-anthropic.js'
import { probeGoogle } from './probe-google.js'

export const PROBE_PROTOCOLS = Object.freeze(['openai-completions', 'openai-responses', 'anthropic-messages', 'google-generative-ai'])

export async function probeFor({ protocol, baseURL, apiKey, model, fetchImpl = fetch, thinkingStyle }) {
  const args = { baseURL, apiKey, model, fetchImpl }
  switch (protocol) {
    case 'openai-responses': return probeResponses(args)
    case 'anthropic-messages': return probeAnthropic({ ...args, thinkingStyle })
    case 'google-generative-ai': return probeGoogle(args)
    default: return probeModel(args)
  }
}

// 派生仅用于自定义路由（目录路由只记录 evidence，共识决策 5）。
// anthropic/google 的 budget/level 语义无法忠实派生为 reasoningEfforts → 返回 null（不自动写）。
export function deriveFor(protocol, evidence) {
  if (protocol === 'openai-responses') return deriveResponses(evidence)
  if (protocol === 'openai-completions') return deriveModel(evidence)
  return null
}

// 拒绝法实测最大输出仅 openai-completions 支持（其他协议参数语义不同，诚实返回不支持）。
export async function measureFor({ protocol, baseURL, apiKey, model, field, fetchImpl = fetch }) {
  if (protocol !== 'openai-completions') {
    return { measured: false, reason: 'rejection-based measurement supports openai-completions only' }
  }
  return probeMaxOutput({ baseURL, apiKey, model, field, fetchImpl })
}