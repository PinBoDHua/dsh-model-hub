// 智能合并核心（纯函数，不可变）。
// 安全不变量：按 id 更新/新增选中目录模型；保留用户自加模型；绝不删除；
// 保留 provider 级用户字段（apiKeyEnv/baseURL/headers/retryPolicy/compat 等）。

// 适配器 model schema 字段（presets/bailian.json 的 evidence/recommended 等不得写入配置）。
const ADAPTER_FIELDS = ['id', 'name', 'contextWindow', 'maxTokens', 'input', 'reasoningEfforts', 'compat']

export function stripEntry(m) {
  const out = {}
  for (const k of ADAPTER_FIELDS) {
    if (m[k] !== undefined) out[k] = structuredClone(m[k])
  }
  return out
}

export function mergeModels(currentModels, selected) {
  const cur = Array.isArray(currentModels) ? currentModels : []
  const sel = Array.isArray(selected) ? selected : []
  const byId = new Map(sel.map((m) => [m.id, stripEntry(m)]))
  const out = []
  const seen = new Set()
  for (const m of cur) {
    if (m && byId.has(m.id)) {
      // 目录字段覆盖同名字段；用户在该模型上自加的非目录字段保留。
      out.push({ ...structuredClone(m), ...byId.get(m.id) })
      seen.add(m.id)
    } else {
      out.push(structuredClone(m))
    }
  }
  for (const m of sel) {
    if (!seen.has(m.id)) out.push(stripEntry(m))
  }
  return out
}

export function buildProviderConfig(current, selected, defaults) {
  const cur = current && typeof current === 'object' ? current : {}
  const d = defaults && typeof defaults === 'object' ? defaults : {}
  const next = structuredClone(cur)
  if (next.displayName === undefined && d.displayName) next.displayName = d.displayName
  if (next.apiKeyEnv === undefined && d.apiKeyEnv) next.apiKeyEnv = d.apiKeyEnv
  if (next.baseURL === undefined && d.baseURL) next.baseURL = d.baseURL
  if (next.api === undefined && d.api) next.api = d.api
  next.models = mergeModels(Array.isArray(cur.models) ? cur.models : [], selected)
  return next
}