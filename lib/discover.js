// 端点模型发现（多协议方言）：openai GET {base}/models；anthropic GET {base}/v1/models；
// google GET {base}/models（supportedGenerationMethods 含 generateContent，去 models/ 前缀）。
// 未知模型标 verified:false（可运行时复验）；已知模型带目录元数据。nonChat 逐平台过滤正则。
import { stripEntry } from './merge.js'

const NON_CHAT_DEFAULT = /^(wan|qwen-audio|qwen-image)/

export function isChatModel(id, nonChat) {
  if (typeof id !== 'string' || id.length === 0) return false
  const re = nonChat instanceof RegExp ? nonChat : (typeof nonChat === 'string' && nonChat !== '' ? new RegExp(nonChat, 'i') : NON_CHAT_DEFAULT)
  return !re.test(id)
}

export function overlayCandidates(ids, catalog, nonChat) {
  const byId = new Map(catalog.models.map((m) => [m.id, m]))
  const out = []
  for (const id of [...new Set(ids)].filter((x) => isChatModel(x, nonChat))) {
    const known = byId.get(id)
    if (known) out.push({ ...stripEntry(known), verified: true, recommended: !!known.recommended })
    else out.push({ id, name: id, verified: false })
  }
  return out
}

async function getJson(url, headers, fetchImpl) {
  const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(60000) })
  const text = await res.text()
  let j = null; try { j = JSON.parse(text) } catch {}
  if (!res.ok || j?.error) {
    throw Object.assign(new Error(j?.error?.message || 'HTTP ' + res.status), { code: 'discover-failed' })
  }
  return j
}

export async function discoverModels({ baseURL, apiKey, catalog, fetchImpl = fetch, dialect = 'openai', nonChat }) {
  if (!apiKey) throw Object.assign(new Error('missing credential'), { code: 'missing-credential' })
  const base = String(baseURL).replace(/\/+$/, '')
  let ids
  if (dialect === 'anthropic') {
    const j = await getJson(base + '/v1/models', { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, fetchImpl)
    const data = Array.isArray(j?.data) ? j.data : []
    ids = data.map((x) => (typeof x === 'string' ? x : x?.id)).filter(Boolean)
  } else if (dialect === 'google') {
    const j = await getJson(base + '/models', { 'x-goog-api-key': apiKey }, fetchImpl)
    const data = Array.isArray(j?.models) ? j.models : []
    ids = data
      .filter((x) => Array.isArray(x?.supportedGenerationMethods) && x.supportedGenerationMethods.includes('generateContent'))
      .map((x) => String(x?.name || '').replace(/^models\//, ''))
      .filter(Boolean)
  } else {
    const j = await getJson(base + '/models', { Authorization: 'Bearer ' + apiKey }, fetchImpl)
    const data = Array.isArray(j?.data) ? j.data : Array.isArray(j?.models) ? j.models : []
    ids = data.map((x) => (typeof x === 'string' ? x : x?.id)).filter(Boolean)
  }
  return overlayCandidates(ids, catalog, nonChat)
}