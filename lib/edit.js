// 编辑合并（纯函数，不可变）：把草稿字段覆盖到目录条目，保留 evidence/recommended，
// 标记容量来源（manual）。capacitySource 是目录元数据，不写入适配器配置（stripEntry 剥离）。
export function applyEdit(entry, draft) {
  const next = structuredClone(entry)
  const d = draft && typeof draft === 'object' ? draft : {}
  const cap = { context: 'estimate', maxOutput: 'estimate', ...(entry.capacitySource || {}) }
  if (d.name !== undefined) next.name = d.name
  if (d.contextWindow !== undefined) { next.contextWindow = d.contextWindow; cap.context = 'manual' }
  if (d.maxTokens !== undefined) { next.maxTokens = d.maxTokens; cap.maxOutput = 'manual' }
  if (d.input !== undefined) next.input = [...d.input]
  if (d.reasoningEfforts !== undefined) next.reasoningEfforts = d.reasoningEfforts === false ? false : structuredClone(d.reasoningEfforts)
  if (d.compat !== undefined) {
    if (Object.keys(d.compat).length === 0) delete next.compat
    else next.compat = { ...d.compat }
  }
  next.capacitySource = cap
  return next
}