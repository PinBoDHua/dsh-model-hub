// hub 服务：目录 + 配置应用 + 发现 + 复验的唯一公共边界（路由调用它）。
// 复验结果持久化到数据目录 ~/.dsh/.dsh-model-hub/catalog.json，不污染安装包内的 preset。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadCatalog, DEFAULT_CATALOG_PATH, recommendedIds } from './catalog.js'
import { applySelection, setDefault, findPiAiEntry } from './apply.js'
import { buildProviderConfig } from './merge.js'
import { discoverModels } from './discover.js'
import { probeModel, deriveModel, probeMaxOutput } from './probe.js'
import { validateDraft } from './validate.js'
import { applyEdit } from './edit.js'

function dataRoot() {
  const home = process.env.DSH_HOME?.trim() || path.join(os.homedir(), '.dsh')
  return path.join(home, '.dsh-model-hub')
}

export function createHubService({ ctx, config, version, catalogPath = DEFAULT_CATALOG_PATH }) {
  const runtimePath = path.join(dataRoot(), 'catalog.json')
  let catalog = existsSync(runtimePath) ? loadCatalog(runtimePath) : loadCatalog(catalogPath)

  async function resolveKey() {
    const credentials = ctx.get('credentials')
    if (!credentials) throw Object.assign(new Error('credentials unavailable'), { code: 'no-credentials' })
    const resolved = await credentials.resolve(config.apiKeyEnv)
    if (!resolved?.value) throw Object.assign(new Error('missing credential ' + config.apiKeyEnv), { code: 'missing-credential' })
    return resolved.value
  }

  function providerState() {
    try {
      const entry = findPiAiEntry(ctx.get('configEditor'))
      if (!entry) return { mounted: false }
      const p = entry.options?.config?.providers?.[config.providerId]
      const models = Array.isArray(p?.models) ? p.models : []
      return { mounted: true, configured: !!p, modelCount: models.length, modelIds: models.map((m) => m.id) }
    } catch {
      return { mounted: false }
    }
  }

  async function credentialState() {
    try {
      const resolved = await ctx.get('credentials').resolve(config.apiKeyEnv)
      return { configured: !!resolved?.value, ref: config.apiKeyEnv, source: resolved?.source }
    } catch {
      return { configured: false, ref: config.apiKeyEnv }
    }
  }

  function persist() {
    catalog.generatedAt = new Date().toISOString()
    mkdirSync(dataRoot(), { recursive: true })
    writeFileSync(runtimePath, JSON.stringify(catalog, null, 2) + '\n')
  }

  // 双写：先替换目录条目；若已应用到 live 则经 configEditor 同步；config 失败回滚目录。
  async function commitEdit(id, updated) {
    const idx = catalog.models.findIndex((m) => m.id === id)
    if (idx < 0) throw Object.assign(new Error('not in catalog'), { code: 'not-found' })
    const prev = catalog.models[idx]
    const ps = providerState()
    const applied = !!ps.modelIds && ps.modelIds.includes(id)
    catalog.models[idx] = updated
    try {
      if (applied) {
        const editor = ctx.get('configEditor')
        const entry = findPiAiEntry(editor)
        if (!entry) throw Object.assign(new Error('llm-pi-ai not mounted'), { code: 'no-adapter' })
        const defaults = { apiKeyEnv: config.apiKeyEnv, baseURL: config.baseURL, api: config.api, displayName: catalog.displayName }
        await editor.edit(entry, (current) => {
          const next = structuredClone(current ?? {})
          next.providers ??= {}
          next.providers[config.providerId] = buildProviderConfig(next.providers[config.providerId], [updated], defaults)
          return next
        })
      }
      persist()
      return { id, applied }
    } catch (e) {
      catalog.models[idx] = prev
      throw e
    }
  }

  return {
    version,
    recommendedIds: () => recommendedIds(catalog),
    status: async () => ({ version, providerId: config.providerId, provider: providerState(), credential: await credentialState() }),
    catalog: () => catalog,
    apply: (modelIds) => applySelection(ctx, { modelIds }, catalog, config),
    setDefault: (provider, model) => setDefault(ctx, { provider, model }),
    discover: async () => {
      const candidates = await discoverModels({ baseURL: config.baseURL, apiKey: await resolveKey(), catalog })
      let added = 0
      for (const c of candidates) {
        if (!c.verified && !catalog.models.some((m) => m.id === c.id)) {
          catalog.models.push({ id: c.id, name: c.name || c.id, contextWindow: 1000000, maxTokens: 131072, input: ['text'], reasoningEfforts: false, recommended: false, evidence: null, discovered: true })
          added++
        }
      }
      if (added) { try { persist() } catch { /* 持久化失败不影响发现结果 */ } }
      return { candidates, added }
    },
    verify: async (modelIds) => {
      const apiKey = await resolveKey()
      const ids = Array.isArray(modelIds) && modelIds.length ? modelIds : catalog.models.map((m) => m.id)
      const results = []
      for (const id of ids) {
        const entry = catalog.models.find((m) => m.id === id)
        if (!entry) { results.push({ id, ok: false, error: 'not-in-catalog' }); continue }
        try {
          const evidence = await probeModel({ baseURL: config.baseURL, apiKey, model: id })
          const derived = deriveModel(evidence)
          entry.evidence = evidence
          entry.reasoningEfforts = derived.reasoningEfforts
          if (derived.compat) entry.compat = derived.compat
          else delete entry.compat
          results.push({ id, ok: true, evidence })
        } catch (e) {
          results.push({ id, ok: false, error: String(e?.message || e) })
        }
      }
      try { persist() } catch { /* 持久化失败不影响本次复验结果 */ }
      return { verified: results.filter((r) => r.ok).length, results }
    },
    editModel: async (id, draft) => {
      const entry = catalog.models.find((m) => m.id === id)
      if (!entry) throw Object.assign(new Error('not in catalog'), { code: 'not-found' })
      const v = validateDraft(draft)
      if (!v.ok) throw Object.assign(new Error(v.errors.join('; ')), { code: 'invalid', errors: v.errors })
      return commitEdit(id, applyEdit(entry, draft))
    },
    measureMaxOutput: async (id) => {
      const entry = catalog.models.find((m) => m.id === id)
      if (!entry) throw Object.assign(new Error('not in catalog'), { code: 'not-found' })
      const field = entry.evidence?.maxTokensField || 'max_tokens'
      const r = await probeMaxOutput({ baseURL: config.baseURL, apiKey: await resolveKey(), model: id, field })
      if (!r.measured) return { id, measured: false, reason: r.reason }
      const updated = structuredClone(entry)
      updated.maxTokens = r.value
      updated.capacitySource = { context: 'estimate', maxOutput: 'estimate', ...(entry.capacitySource || {}), maxOutput: 'measured' }
      const c = await commitEdit(id, updated)
      return { id, measured: true, value: r.value, applied: c.applied }
    },
    resetCatalog: () => {
      catalog = loadCatalog(catalogPath)
      try { if (existsSync(runtimePath)) writeFileSync(runtimePath, JSON.stringify(catalog, null, 2) + '\n') } catch {}
      return catalog
    },
  }
}