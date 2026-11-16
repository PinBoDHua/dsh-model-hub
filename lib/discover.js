// 端点模型发现：GET {baseURL}/models，过滤非对话模型，与目录 overlay 合并。
// 未知模型标 verified:false（可运行时复验）；已知模型带实测元数据。
import { stripEntry } from './merge.js'

const NON_CHAT = /^(wan|qwen-audio|qwen-image)/

export function isChatModel(id) {
  return typeof id === 'string' && id.length > 0 && !NON_CHAT.test(id)
}

export function overlayCandidates(ids, catalog) {
  const byId = new Map(catalog.models.map((m) => [m.id, m]))
  const out = []
  for (const id of [...new Set(ids)].filter(isChatModel)) {
    const known = byId.get(id)
    if (known) out.push({ ...stripEntry(known), verified: true, recommended: !!known.recommended })
    else out.push({ id, name: id, verified: false })
  }
  return out
}

export async function discoverModels({ baseURL, apiKey, catalog, fetchImpl = fetch }) {
  if (!apiKey) throw Object.assign(new Error('missing credential'), { code: 'missing-credential' })
  const url = String(baseURL).replace(/\/+$/, '') + '/models'
  const res = await fetchImpl(url, { headers: { Authorization: 'Bearer ' + apiKey }, signal: AbortSignal.timeout(60000) })
  const text = await res.text()
  let j = null; try { j = JSON.parse(text) } catch {}
  if (!res.ok || j?.error) {
    throw Object.assign(new Error(j?.error?.message || 'HTTP ' + res.status), { code: 'discover-failed' })
  }
  const data = Array.isArray(j?.data) ? j.data : Array.isArray(j?.models) ? j.models : []
  const ids = data.map((x) => (typeof x === 'string' ? x : x?.id)).filter(Boolean)
  return overlayCandidates(ids, catalog)
}