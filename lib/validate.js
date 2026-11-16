// 编辑草稿校验（纯函数）：镜像官方 dsh-llm-pi-ai 适配器 schema 约束。
// configEditor.edit 仍做权威校验；本层提供快速友好错误。
export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
export const THINKING_FORMATS = ['openai', 'deepseek', 'openrouter', 'together', 'baseten', 'zai', 'qwen', 'chat-template', 'qwen-chat-template', 'string-thinking', 'ant-ling']
export const MAX_TOKEN_FIELDS = ['max_tokens', 'max_completion_tokens']
export const MODALITIES = ['text', 'image']

const posInt = (v) => Number.isInteger(v) && v > 0

export function validateDraft(draft) {
  const errors = []
  const d = draft && typeof draft === 'object' ? draft : {}
  if (d.contextWindow !== undefined && !posInt(d.contextWindow)) errors.push('contextWindow 须为正整数')
  if (d.maxTokens !== undefined && !posInt(d.maxTokens)) errors.push('maxTokens 须为正整数')
  if (d.input !== undefined) {
    if (!Array.isArray(d.input) || d.input.length === 0 || d.input.some((x) => !MODALITIES.includes(x))) errors.push('input 须为 text/image 的非空子集')
  }
  if (d.reasoningEfforts !== undefined) {
    const re = d.reasoningEfforts
    if (re === false) { /* 非推理模型，合法 */ }
    else if (!re || typeof re !== 'object' || Array.isArray(re)) errors.push('reasoningEfforts 须为 false 或对象')
    else {
      const keys = Object.keys(re)
      for (const k of keys) if (!THINKING_LEVELS.includes(k)) errors.push('非法推理档位 ' + k)
      if (!keys.some((k) => k !== 'off')) errors.push('reasoningEfforts 需至少一个 off 以外档位')
      for (const [k, v] of Object.entries(re)) {
        if (k === 'off') { if (v !== null && typeof v !== 'string') errors.push('off 的 wire 须为字符串或 null') }
        else if (typeof v !== 'string' || v.length === 0) errors.push('档位 wire 须非空 ' + k)
      }
    }
  }
  if (d.compat !== undefined) {
    const c = d.compat
    if (!c || typeof c !== 'object' || Array.isArray(c)) errors.push('compat 须为对象')
    else {
      for (const [k, v] of Object.entries(c)) {
        if (k === 'supportsDeveloperRole') { if (typeof v !== 'boolean') errors.push('supportsDeveloperRole 须为布尔') }
        else if (k === 'thinkingFormat') { if (!THINKING_FORMATS.includes(v)) errors.push('非法 thinkingFormat ' + v) }
        else if (k === 'maxTokensField') { if (!MAX_TOKEN_FIELDS.includes(v)) errors.push('非法 maxTokensField ' + v) }
        else errors.push('不支持的 compat 键 ' + k)
      }
    }
  }
  return { ok: errors.length === 0, errors }
}