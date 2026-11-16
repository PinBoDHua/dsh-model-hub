// 百炼目录加载与查询。presets/bailian.json 由 scripts/probe-bailian.mjs 实测产出。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const DEFAULT_CATALOG_PATH = fileURLToPath(new URL('../presets/bailian.json', import.meta.url))

export function loadCatalog(path = DEFAULT_CATALOG_PATH) {
  const c = JSON.parse(readFileSync(path, 'utf8'))
  if (c.schemaVersion !== 1 || !Array.isArray(c.models)) {
    throw Object.assign(new Error('bad catalog schema'), { code: 'bad-catalog' })
  }
  return c
}

export function findModel(catalog, id) {
  return catalog.models.find((m) => m.id === id)
}

export function recommendedIds(catalog) {
  return catalog.models.filter((m) => m.recommended).map((m) => m.id)
}