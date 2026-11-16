// 平台注册表（v0.4.0 多平台化核心数据）。
// kind:'catalog' = pi-ai 内置目录路由——apply 薄写入 {id,name}+手动字段，其余继承官方目录；
// kind:'custom'  = 自定义路由——无内置目录，apply 全量声明（ADAPTER_FIELDS）。
// probe/discover 是协议方言 id（lib/protocols.js / lib/discover.js 分发）。
// probeBaseURL 仅当探测端点与路由 baseURL 不同时给出（mistral 原生协议 base 不带 /v1）。
// routeApi 仅 openrouter：统一 openai-completions，使发现的新模型可解析（共识决策 7）。
// nonChat 是发现过滤正则（源字符串，i 标志），逐平台保守过滤非对话模型。

export const PROVIDERS = Object.freeze([
  {
    id: 'aliyun', name: { zh: '阿里云百炼', en: 'Aliyun Bailian' }, kind: 'custom',
    api: 'openai-completions', probe: 'openai-completions', discover: 'openai',
    baseURL: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: 'ALIYUN_API_KEY', preset: 'bailian.json',
    nonChat: '^(wan|qwen-audio|qwen-image)',
  },
  {
    id: 'deepseek', name: { zh: 'DeepSeek', en: 'DeepSeek' }, kind: 'catalog',
    api: 'openai-completions', probe: 'openai-completions', discover: 'openai',
    baseURL: 'https://api.deepseek.com', apiKeyEnv: 'DEEPSEEK_API_KEY', preset: 'deepseek.json',
  },
  {
    id: 'moonshotai-cn', name: { zh: 'Kimi（月之暗面）', en: 'Kimi (Moonshot AI)' }, kind: 'catalog',
    api: 'openai-completions', probe: 'openai-completions', discover: 'openai',
    baseURL: 'https://api.moonshot.cn/v1', apiKeyEnv: 'MOONSHOT_API_KEY', preset: 'moonshotai-cn.json',
    nonChat: '(embedding)',
  },
  {
    id: 'zhipu', name: { zh: '智谱 GLM', en: 'Zhipu GLM' }, kind: 'custom',
    api: 'openai-completions', probe: 'openai-completions', discover: 'openai',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4', apiKeyEnv: 'ZHIPU_API_KEY', preset: 'zhipu.json',
    nonChat: '(embedding|cogview|cogvideox|charglm|emo)',
  },
  {
    id: 'siliconflow', name: { zh: '硅基流动', en: 'SiliconFlow' }, kind: 'custom',
    api: 'openai-completions', probe: 'openai-completions', discover: 'openai',
    baseURL: 'https://api.siliconflow.cn/v1', apiKeyEnv: 'SILICONFLOW_API_KEY', preset: 'siliconflow.json',
    nonChat: '(embedding|reranker|flux|stable-diffusion|image|audio|video|tts|asr)',
  },
  {
    id: 'volcengine', name: { zh: '火山方舟（豆包）', en: 'Volcengine Ark (Doubao)' }, kind: 'custom',
    api: 'openai-completions', probe: 'openai-completions', discover: 'openai',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3', apiKeyEnv: 'ARK_API_KEY', preset: 'volcengine.json',
    nonChat: '(seedream|seedance|embedding|rerank|tts|asr|image|video)',
  },
  {
    id: 'minimax-cn', name: { zh: 'MiniMax', en: 'MiniMax' }, kind: 'catalog',
    api: 'anthropic-messages', probe: 'anthropic-messages', discover: 'anthropic',
    baseURL: 'https://api.minimaxi.com/anthropic', apiKeyEnv: 'MINIMAX_CN_API_KEY', preset: 'minimax-cn.json',
  },
  {
    id: 'openai', name: { zh: 'OpenAI', en: 'OpenAI' }, kind: 'catalog',
    api: 'openai-responses', probe: 'openai-responses', discover: 'openai',
    baseURL: 'https://api.openai.com/v1', apiKeyEnv: 'OPENAI_API_KEY', preset: 'openai.json',
    nonChat: '(embedding|whisper|tts|dall-e|gpt-image|moderation|audio|realtime|transcribe|computer-use)',
  },
  {
    id: 'anthropic', name: { zh: 'Anthropic Claude', en: 'Anthropic Claude' }, kind: 'catalog',
    api: 'anthropic-messages', probe: 'anthropic-messages', discover: 'anthropic',
    baseURL: 'https://api.anthropic.com', apiKeyEnv: 'ANTHROPIC_API_KEY', preset: 'anthropic.json',
  },
  {
    id: 'google', name: { zh: 'Google Gemini', en: 'Google Gemini' }, kind: 'catalog',
    api: 'google-generative-ai', probe: 'google-generative-ai', discover: 'google',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta', apiKeyEnv: 'GEMINI_API_KEY', preset: 'google.json',
    nonChat: '(embedding|aqa|imagen|tts|live|computer-use|image)',
  },
  {
    id: 'openrouter', name: { zh: 'OpenRouter', en: 'OpenRouter' }, kind: 'catalog',
    api: 'openai-completions', probe: 'openai-completions', discover: 'openai',
    baseURL: 'https://openrouter.ai/api/v1', apiKeyEnv: 'OPENROUTER_API_KEY', preset: 'openrouter.json',
    routeApi: 'openai-completions',
    nonChat: '(image|flux|dall-e|stable-diffusion|embedding|moderation)',
  },
  {
    id: 'groq', name: { zh: 'Groq', en: 'Groq' }, kind: 'catalog',
    api: 'openai-completions', probe: 'openai-completions', discover: 'openai',
    baseURL: 'https://api.groq.com/openai/v1', apiKeyEnv: 'GROQ_API_KEY', preset: 'groq.json',
    nonChat: '(whisper|playai|tts|embedding)',
  },
  {
    id: 'xai', name: { zh: 'xAI Grok', en: 'xAI Grok' }, kind: 'catalog',
    api: 'openai-responses', probe: 'openai-responses', discover: 'openai',
    baseURL: 'https://api.x.ai/v1', apiKeyEnv: 'XAI_API_KEY', preset: 'xai.json',
    nonChat: '(image|imagine|video)',
  },
  {
    id: 'mistral', name: { zh: 'Mistral AI', en: 'Mistral AI' }, kind: 'catalog',
    api: 'mistral-conversations', probe: 'openai-completions', discover: 'openai',
    baseURL: 'https://api.mistral.ai', probeBaseURL: 'https://api.mistral.ai/v1',
    apiKeyEnv: 'MISTRAL_API_KEY', preset: 'mistral.json',
    nonChat: '(embed|moderation|ocr|voxtral|audio)',
  },
  {
    id: 'together', name: { zh: 'Together AI', en: 'Together AI' }, kind: 'catalog',
    api: 'openai-completions', probe: 'openai-completions', discover: 'openai',
    baseURL: 'https://api.together.ai/v1', apiKeyEnv: 'TOGETHER_API_KEY', preset: 'together.json',
    nonChat: '(embedding|rerank|image|flux|stable-diffusion)',
  },
  {
    id: 'cerebras', name: { zh: 'Cerebras', en: 'Cerebras' }, kind: 'catalog',
    api: 'openai-completions', probe: 'openai-completions', discover: 'openai',
    baseURL: 'https://api.cerebras.ai/v1', apiKeyEnv: 'CEREBRAS_API_KEY', preset: 'cerebras.json',
  },
])

export const DEFAULT_PROVIDER_ID = 'aliyun'

export function findProvider(id) {
  return PROVIDERS.find((p) => p.id === id)
}

// 合并用户覆盖：config.providers.<id>.{apiKeyEnv,baseURL} 逐平台覆盖；
// 旧版单平台字段（providerId/apiKeyEnv/baseURL/api）覆盖默认平台，语义与 v0.3 完全一致。
// 未知 id 若给出 baseURL+api，视为用户自定义 OpenAI 兼容网关（custom，空目录，发现兜底）。
export function resolveProviders(config) {
  const c = config && typeof config === 'object' ? config : {}
  const overrides = c.providers && typeof c.providers === 'object' ? c.providers : {}
  const legacyId = typeof c.providerId === 'string' && c.providerId !== '' ? c.providerId : DEFAULT_PROVIDER_ID
  const out = PROVIDERS.map((p) => {
    const o = overrides[p.id] && typeof overrides[p.id] === 'object' ? overrides[p.id] : {}
    const merged = { ...p }
    if (typeof o.apiKeyEnv === 'string' && o.apiKeyEnv.trim() !== '') merged.apiKeyEnv = o.apiKeyEnv
    if (typeof o.baseURL === 'string' && o.baseURL.trim() !== '') merged.baseURL = o.baseURL
    if (p.id === legacyId) {
      if (typeof c.apiKeyEnv === 'string' && c.apiKeyEnv.trim() !== '') merged.apiKeyEnv = c.apiKeyEnv
      if (typeof c.baseURL === 'string' && c.baseURL.trim() !== '') merged.baseURL = c.baseURL
      if (typeof c.api === 'string' && c.api.trim() !== '' && p.kind === 'custom') merged.api = c.api
    }
    return merged
  })
  for (const [id, o] of Object.entries(overrides)) {
    if (findProvider(id) || !o || typeof o !== 'object') continue
    if (typeof o.baseURL !== 'string' || o.baseURL.trim() === '' || typeof o.api !== 'string' || o.api.trim() === '') continue
    out.push({
      id, name: { zh: o.displayName || id, en: o.displayName || id }, kind: 'custom',
      api: o.api, probe: o.api, discover: 'openai',
      baseURL: o.baseURL, apiKeyEnv: (typeof o.apiKeyEnv === 'string' && o.apiKeyEnv.trim() !== '') ? o.apiKeyEnv : id.toUpperCase().replace(/[^A-Z0-9]+/g, '_') + '_API_KEY',
      preset: null, nonChat: o.nonChat || undefined,
    })
  }
  return out
}