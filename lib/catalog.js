// 多平台目录加载与查询。presets/bailian.json 由 scripts/probe-bailian.mjs 实测产出；
// 其余平台 preset 由 scripts/gen-presets.mjs 从 pi-ai 官方目录提取（展示快照）或文档基线手写。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const DEFAULT_CATALOG_PATH = fileURLToPath(new URL('../presets/bailian.json', import.meta.url))
export const PRESETS_DIR = fileURLToPath(new URL('../presets/', import.meta.url))

export function loadCatalog(path = DEFAULT_CATALOG_PATH) {
  const c = JSON.parse(readFileSync(path, 'utf8'))
  if (c.schemaVersion !== 1 || !Array.isArray(c.models)) {
    throw Object.assign(new Error('bad catalog schema'), { code: 'bad-catalog' })
  }
  return c
}

// 平台 preset 路径；preset:null（用户自定义网关）返回 null。
export function presetPathFor(provider) {
  return provider && provider.preset ? PRESETS_DIR + provider.preset : null
}

// 加载平台 preset；无 preset 的自定义网关合成空目录（发现兜底填充）。
export function loadPreset(provider) {
  const p = presetPathFor(provider)
  if (p) return loadCatalog(p)
  return {
    schemaVersion: 1, provider: provider.id, displayName: provider.name?.zh || provider.id,
    api: provider.api, baseURL: provider.baseURL, apiKeyEnv: provider.apiKeyEnv,
    kind: 'custom', generatedAt: null, models: [],
  }
}

export function findModel(catalog, id) {
  return catalog.models.find((m) => m.id === id)
}

export function recommendedIds(catalog) {
  return catalog.models.filter((m) => m.recommended).map((m) => m.id)
}