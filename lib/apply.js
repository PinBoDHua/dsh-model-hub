// 经官方 configEditor 把目录智能合并进 profile 的 llm-pi-ai 条目。
// current 是完整组合配置（含继承 provider），clone 后仅改目标 provider，不误删其他路由。
import { buildProviderConfig } from './merge.js'

export function findPiAiEntry(editor) {
  return editor.entries().find((e) => e.options?.id === 'llm-pi-ai' || e.options?.name === '@deepseek-ai/dsh-llm-pi-ai')
}

export async function applySelection(ctx, { modelIds }, catalog, config) {
  const editor = ctx.get('configEditor')
  if (!editor) throw Object.assign(new Error('configEditor unavailable'), { code: 'no-editor' })
  const entry = findPiAiEntry(editor)
  if (!entry) throw Object.assign(new Error('llm-pi-ai adapter not mounted'), { code: 'no-adapter' })
  const ids = Array.isArray(modelIds) ? modelIds : []
  const selected = catalog.models.filter((m) => ids.includes(m.id))
  if (selected.length === 0) throw Object.assign(new Error('no models selected'), { code: 'empty-selection' })
  const defaults = { apiKeyEnv: config.apiKeyEnv, baseURL: config.baseURL, api: config.api, displayName: catalog.displayName }
  await editor.edit(entry, (current) => {
    const next = structuredClone(current ?? {})
    next.providers ??= {}
    next.providers[config.providerId] = buildProviderConfig(next.providers[config.providerId], selected, defaults)
    return next
  })
  return { applied: selected.length, providerId: config.providerId, modelIds: selected.map((m) => m.id) }
}

export async function setDefault(ctx, { provider, model }) {
  const editor = ctx.get('configEditor')
  if (!editor) throw Object.assign(new Error('configEditor unavailable'), { code: 'no-editor' })
  const entry = editor.entries().find((e) => e.options?.id === 'agent-default-model' || e.options?.name === '@deepseek-ai/dsh-agent-default-model')
  if (!entry) throw Object.assign(new Error('agent-default-model not mounted'), { code: 'no-default-entry' })
  if (typeof provider !== 'string' || typeof model !== 'string' || !provider || !model) {
    throw Object.assign(new Error('provider and model required'), { code: 'invalid' })
  }
  await editor.edit(entry, (current) => ({ ...structuredClone(current ?? {}), provider, model }))
  return { provider, model }
}