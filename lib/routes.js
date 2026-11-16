// HTTP 契约：/plugins/dsh-model-hub/* 命名路由（与 dsh-memory 同模式）。
// createHandlers 返回纯 (req,res) 处理器，可在传输边界桩上单测；attachRoutes 真实挂载。
// 回环检查；status 回进程 token；写操作校验 X-RPC-Key。
import { timingSafeEqual } from 'node:crypto'

export const API_BASE = '/plugins/dsh-model-hub'
export const CONTROL_HEADER = 'x-rpc-key'
const LOOPBACK_ADDRS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const MAX_BODY_BYTES = 1024 * 1024

function isLoopback(req) {
  const addr = req.socket?.remoteAddress ?? ''
  if (!LOOPBACK_ADDRS.has(addr)) return false
  const host = String(req.headers?.host ?? '')
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)
}

function writeJson(res, status, doc) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(doc))
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY_BYTES) { reject(Object.assign(new Error('body too large'), { code: 'invalid' })); req.destroy?.() }
      else chunks.push(c)
    })
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}) }
      catch { reject(Object.assign(new Error('bad json'), { code: 'invalid' })) }
    })
    req.on('error', reject)
  })
}

const STATUS_BY_CODE = {
  invalid: 400, 'empty-selection': 400, 'missing-credential': 400, 'no-credentials': 400, 'not-found': 404,
  'discover-failed': 502, unusable: 400, 'bad-catalog': 500,
  'no-adapter': 409, 'no-editor': 409, 'no-default-entry': 409,
}

function fail(res, e) {
  const code = e?.code || 'internal'
  writeJson(res, STATUS_BY_CODE[code] || 500, { error: String(e?.message || e), code })
}

export function createHandlers({ hub, token }) {
  const tokenOk = (req) => {
    const got = req.headers?.[CONTROL_HEADER]
    if (typeof got !== 'string' || got.length !== token.length) return false
    try { return timingSafeEqual(Buffer.from(got), Buffer.from(token)) } catch { return false }
  }
  const guard = (req, res) => {
    if (!isLoopback(req)) { writeJson(res, 403, { error: 'forbidden', code: 'forbidden' }); return false }
    return true
  }
  const writeGuard = (req, res) => {
    if (!guard(req, res)) return false
    if (!tokenOk(req)) { writeJson(res, 403, { error: 'unauthorized', code: 'unauthorized' }); return false }
    return true
  }
  return {
    status: async (req, res) => {
      if (!guard(req, res)) return
      try { writeJson(res, 200, { ...(await hub.status()), key: token }) } catch (e) { fail(res, e) }
    },
    catalog: async (req, res) => {
      if (!guard(req, res)) return
      try { writeJson(res, 200, hub.catalog()) } catch (e) { fail(res, e) }
    },
    apply: async (req, res) => {
      if (!writeGuard(req, res)) return
      try { const body = await readJsonBody(req); writeJson(res, 200, await hub.apply(body.modelIds)) } catch (e) { fail(res, e) }
    },
    discover: async (req, res) => {
      if (!writeGuard(req, res)) return
      try { await readJsonBody(req); writeJson(res, 200, await hub.discover()) } catch (e) { fail(res, e) }
    },
    verify: async (req, res) => {
      if (!writeGuard(req, res)) return
      try { const body = await readJsonBody(req); writeJson(res, 200, await hub.verify(body.modelIds)) } catch (e) { fail(res, e) }
    },
    'set-default': async (req, res) => {
      if (!writeGuard(req, res)) return
      try { const body = await readJsonBody(req); writeJson(res, 200, await hub.setDefault(body.provider, body.model)) } catch (e) { fail(res, e) }
    },
    edit: async (req, res) => {
      if (!writeGuard(req, res)) return
      try { const body = await readJsonBody(req); writeJson(res, 200, await hub.editModel(body.id, body.draft)) } catch (e) { fail(res, e) }
    },
    reset: async (req, res) => {
      if (!writeGuard(req, res)) return
      try { await readJsonBody(req); const cat = hub.resetCatalog(); writeJson(res, 200, { models: cat.models.length }) } catch (e) { fail(res, e) }
    },
    'measure-max-output': async (req, res) => {
      if (!writeGuard(req, res)) return
      try { const body = await readJsonBody(req); writeJson(res, 200, await hub.measureMaxOutput(body.id)) } catch (e) { fail(res, e) }
    },
  }
}

export function attachRoutes({ webCtx, hub, token }) {
  const handlers = createHandlers({ hub, token })
  const names = ['status', 'catalog', 'apply', 'discover', 'verify', 'set-default', 'edit', 'reset', 'measure-max-output']
  const disposers = names.map((name) => webCtx.webServer.register({ kind: 'exact', path: `${API_BASE}/${name}`, handler: handlers[name] }))
  return () => {
    for (const dispose of disposers.reverse()) {
      try { dispose() } catch { /* 卸载期容错 */ }
    }
  }
}