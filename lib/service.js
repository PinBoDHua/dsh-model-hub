// hub 服务：多平台目录 + 配置应用 + 发现 + 复验的唯一公共边界（路由调用它）。
// v0.4.0：逐平台目录懒加载，持久化到 ~/.dsh/.dsh-model-hub/catalogs/<id>.json；
// 旧版单文件 catalog.json 首启迁移为 catalogs/aliyun.json（保留原件）。
// 全部操作接受可选 providerId，缺省＝默认平台（config.providerId，默认 aliyun）——旧路由/payload 完全兼容。
// verify 分层（共识决策 5）：custom 路由探测→派生→双写；catalog 路由仅记录 evidence（配置继承官方目录）。
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadCatalog, DEFAULT_CATALOG_PATH, loadPreset, recommendedIds } from './catalog.js'
import { resolveProviders, DEFAULT_PROVIDER_ID } from './providers.js'
import { applySelection, setDefault, findPiAiEntry, providerDefaults } from './apply.js'
import { buildProviderConfig } from './merge.js'
import { discoverModels } from './discover.js'
import { probeFor, deriveFor, measureFor } from './protocols.js'
import { validateDraft } from './validate.js'
import { applyEdit } from './edit.js'

function dataRoot() {
  const home = process.env.DSH_HOME?.trim() || path.join(os.homedir(), '.dsh')
  return path.join(home, '.dsh-model-hub')
}

export function createHubService({ ctx, config, version, catalogPath = DEFAULT_CATALOG_PATH }) {
  const providers = resolveProviders(config)
  const defaultId = providers.some((p) => p.id === config.providerId) ? config.providerId : DEFAULT_PROVIDER_ID
  const catalogs = new Map()

  // 旧版 runtime 目录迁移（保留原件，迁移失败不阻断——回退直读旧文件）。
  const legacyPath = path.join(dataRoot(), 'catalog.json')
  const aliyunRuntimePath = path.join(dataRoot(), 'catalogs', 'aliyun.json')
  if (existsSync(legacyPath) && !existsSync(aliyunRuntimePath)) {
    try { mkdirSync(path.join(dataRoot(), 'catalogs'), { recursive: true }); copyFileSync(legacyPath, aliyunRuntimePath) } catch { /* 回退直读 */ }
  }

  function providerDef(id) {
    const p = providers.find((x) => x.id === (id || defaultId))
    if (!p) throw Object.assign(new Error('unknown provider ' + id), { code: 'not-found' })
    return p
  }

  function runtimePath(id) {
    return path.join(dataRoot(), 'catalogs', id + '.json')
  }

  function catalogFor(id) {
    const p = providerDef(id)
    if (!catalogs.has(p.id)) {
      const rp = runtimePath(p.id)
      let c
      if (existsSync(rp)) c = loadCatalog(rp)
      else if (p.id === 'aliyun' && existsSync(legacyPath)) c = loadCatalog(legacyPath)
      else if (p.id === 'aliyun' && catalogPath !== DEFAULT_CATALOG_PATH) c = loadCatalog(catalogPath)
      else c = loadPreset(p)
      c.provider = p.id
      catalogs.set(p.id, c)
    }
    return catalogs.get(p.id)
  }

  async function resolveKey(p) {
    const credentials = ctx.get('credentials')
    if (!credentials) throw Object.assign(new Error('credentials unavailable'), { code: 'no-credentials' })
    const resolved = await credentials.resolve(p.apiKeyEnv)
    if (!resolved?.value) throw Object.assign(new Error('missing credential ' + p.apiKeyEnv), { code: 'missing-credential' })
    return resolved.value
  }

  function providerState(p) {
    try {
      const entry = findPiAiEntry(ctx.get('configEditor'))
      if (!entry) return { mounted: false }
      const cfg = entry.options?.config?.providers?.[p.id]
      const models = Array.isArray(cfg?.models) ? cfg.models : []
      return { mounted: true, configured: !!cfg, modelCount: models.length, modelIds: models.map((m) => m.id) }
    } catch {
      return { mounted: false }
    }
  }

  async function credentialState(p) {
    try {
      const resolved = await ctx.get('credentials').resolve(p.apiKeyEnv)
      return { configured: !!resolved?.value, ref: p.apiKeyEnv, source: resolved?.source }
    } catch {
      return { configured: false, ref: p.apiKeyEnv }
    }
  }

  function persist(p) {
    const c = catalogFor(p.id)
    c.generatedAt = new Date().toISOString()
    mkdirSync(path.join(dataRoot(), 'catalogs'), { recursive: true })
    writeFileSync(runtimePath(p.id), JSON.stringify(c, null, 2) + '\n')
  }

  function probeBase(p) {
    return p.probeBaseURL || p.baseURL
  }

  // 双写：先替换目录条目；若已应用到 live 则经 configEditor 同步；config 失败回滚目录。
  async function commitEdit(p, id, updated) {
    const catalog = catalogFor(p.id)
    const idx = catalog.models.findIndex((m) => m.id === id)
    if (idx < 0) throw Object.assign(new Error('not in catalog'), { code: 'not-found' })
    const prev = catalog.models[idx]
    const ps = providerState(p)
    const applied = !!ps.modelIds && ps.modelIds.includes(id)
    catalog.models[idx] = updated
    try {
      if (applied) {
        const editor = ctx.get('configEditor')
        const entry = findPiAiEntry(editor)
        if (!entry) throw Object.assign(new Error('llm-pi-ai not mounted'), { code: 'no-adapter' })
        const defaults = providerDefaults(p, catalog)
        await editor.edit(entry, (current) => {
          const next = structuredClone(current ?? {})
          next.providers ??= {}
          next.providers[p.id] = buildProviderConfig(next.providers[p.id], [updated], defaults)
          return next
        })
      }
      persist(p)
      return { id, applied }
    } catch (e) {
      catalog.models[idx] = prev
      throw e
    }
  }

  async function providerSummary(p) {
    const catalog = catalogFor(p.id)
    return {
      id: p.id, displayName: p.name, kind: p.kind, api: p.api, probe: p.probe,
      baseURL: p.baseURL, apiKeyEnv: p.apiKeyEnv,
      presetModelCount: catalog.models.length,
      recommendedCount: catalog.models.filter((m) => m.recommended).length,
      ...providerState(p),
      credential: await credentialState(p),
    }
  }

  return {
    version,
    providers: () => providers.map((p) => ({ id: p.id, displayName: p.name, kind: p.kind, api: p.api, apiKeyEnv: p.apiKeyEnv })),
    providerList: async () => Promise.all(providers.map(providerSummary)),
    recommendedIds: (id) => recommendedIds(catalogFor(id)),
    status: async () => {
      const p = providerDef(defaultId)
      return {
        version, providerId: p.id, provider: providerState(p), credential: await credentialState(p),
        providers: await Promise.all(providers.map(providerSummary)),
      }
    },
    catalog: (id) => catalogFor(id),
    apply: (modelIds, id) => {
      const p = providerDef(id)
      return applySelection(ctx, { modelIds }, catalogFor(p.id), p)
    },
    setDefault: (provider, model) => setDefault(ctx, { provider, model }),
    discover: async (id) => {
      const p = providerDef(id)
      const catalog = catalogFor(p.id)
      const candidates = await discoverModels({ baseURL: probeBase(p), apiKey: await resolveKey(p), catalog, dialect: p.discover, nonChat: p.nonChat })
      let added = 0
      for (const c of candidates) {
        if (!c.verified && !catalog.models.some((m) => m.id === c.id)) {
          catalog.models.push({ id: c.id, name: c.name || c.id, contextWindow: 1000000, maxTokens: 131072, input: ['text'], reasoningEfforts: false, recommended: false, evidence: null, discovered: true })
          added++
        }
      }
      if (added) { try { persist(p) } catch { /* 持久化失败不影响发现结果 */ } }
      return { candidates, added, providerId: p.id }
    },
    verify: async (modelIds, id) => {
      const p = providerDef(id)
      const catalog = catalogFor(p.id)
      const apiKey = await resolveKey(p)
      const ids = Array.isArray(modelIds) && modelIds.length ? modelIds : catalog.models.map((m) => m.id)
      const results = []
      for (const mid of ids) {
        const entry = catalog.models.find((m) => m.id === mid)
        if (!entry) { results.push({ id: mid, ok: false, error: 'not-in-catalog' }); continue }
        try {
          const evidence = await probeFor({ protocol: p.probe, baseURL: probeBase(p), apiKey, model: mid, thinkingStyle: entry.thinkingStyle })
          entry.evidence = evidence
          // custom 路由：派生 efforts/compat 写入目录（apply 时进配置）；catalog 路由：仅 evidence（共识决策 5）。
          // compat 合并而非覆盖：保留 preset 已知的 thinkingFormat 等键，仅按证据更新派生键。
          if (p.kind === 'custom') {
            const derived = deriveFor(p.probe, evidence)
            if (derived) {
              entry.reasoningEfforts = derived.reasoningEfforts
              const merged = { ...(entry.compat || {}), ...(derived.compat || {}) }
              if (evidence.developerRole === 'ok') delete merged.supportsDeveloperRole
              if (evidence.maxTokensField === 'max_tokens') delete merged.maxTokensField
              if (Object.keys(merged).length) entry.compat = merged
              else delete entry.compat
            }
          }
          results.push({ id: mid, ok: true, evidence })
        } catch (e) {
          results.push({ id: mid, ok: false, error: String(e?.message || e) })
        }
      }
      try { persist(p) } catch { /* 持久化失败不影响本次复验结果 */ }
      return { verified: results.filter((r) => r.ok).length, results, providerId: p.id }
    },
    editModel: async (id, draft, providerId) => {
      const p = providerDef(providerId)
      const catalog = catalogFor(p.id)
      const entry = catalog.models.find((m) => m.id === id)
      if (!entry) throw Object.assign(new Error('not in catalog'), { code: 'not-found' })
      const v = validateDraft(draft, p.api)
      if (!v.ok) throw Object.assign(new Error(v.errors.join('; ')), { code: 'invalid', errors: v.errors })
      return commitEdit(p, id, applyEdit(entry, draft))
    },
    measureMaxOutput: async (id, providerId) => {
      const p = providerDef(providerId)
      const catalog = catalogFor(p.id)
      const entry = catalog.models.find((m) => m.id === id)
      if (!entry) throw Object.assign(new Error('not in catalog'), { code: 'not-found' })
      const field = entry.evidence?.maxTokensField || 'max_tokens'
      // 协议门禁先于凭据解析：不支持的协议无需密钥即可诚实返回。
      const apiKey = p.probe === 'openai-completions' ? await resolveKey(p) : undefined
      const r = await measureFor({ protocol: p.probe, baseURL: probeBase(p), apiKey, model: id, field })
      if (!r.measured) return { id, measured: false, reason: r.reason }
      const updated = structuredClone(entry)
      updated.maxTokens = r.value
      updated.capacitySource = { context: 'estimate', maxOutput: 'estimate', ...(entry.capacitySource || {}), maxOutput: 'measured' }
      // 实测＝用户显式部署选择：目录路由也放行 maxTokens 薄写入。
      updated.manualFields = [...new Set([...(entry.manualFields || []), 'maxTokens'])]
      const c = await commitEdit(p, id, updated)
      return { id, measured: true, value: r.value, applied: c.applied }
    },
    resetCatalog: (id) => {
      const p = providerDef(id)
      const fresh = p.id === 'aliyun' && catalogPath !== DEFAULT_CATALOG_PATH ? loadCatalog(catalogPath) : loadPreset(p)
      fresh.provider = p.id
      catalogs.set(p.id, fresh)
      try { persist(p) } catch { /* 持久化失败不影响重置结果 */ }
      return fresh
    },
  }
}