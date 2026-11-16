import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHandlers, API_BASE, CONTROL_HEADER } from '../lib/routes.js'

const TOKEN = 'a'.repeat(48)
const hub = {
  status: async () => ({ version: '0.1.0', providerId: 'aliyun', provider: { mounted: true }, credential: { configured: true } }),
  catalog: () => ({ schemaVersion: 1, models: [{ id: 'qwen4-max' }] }),
  apply: async (ids) => ({ applied: (ids || []).length, modelIds: ids }),
  discover: async () => ({ candidates: [{ id: 'qwen4-max', verified: true }], added: 0 }),
  verify: async () => ({ verified: 1, results: [] }),
  setDefault: async (p, m) => ({ provider: p, model: m }),
}
const handlers = createHandlers({ hub, token: TOKEN })

function mkReq({ headers = {}, addr = '127.0.0.1', host = 'localhost', body = null } = {}) {
  const listeners = {}
  return {
    headers: { host, ...headers },
    socket: { remoteAddress: addr },
    on(ev, fn) { listeners[ev] = fn; return this },
    destroy() {},
    emit() { if (body !== null) listeners.data?.(Buffer.from(JSON.stringify(body))); listeners.end?.() },
  }
}
function mkRes() {
  let status = null, doc = null
  return { writeHead(s) { status = s }, end(d) { doc = JSON.parse(d) }, get status() { return status }, get doc() { return doc } }
}

test('status 回环返回 key 与 version', async () => {
  const res = mkRes()
  await handlers.status(mkReq(), res)
  assert.equal(res.status, 200)
  assert.equal(res.doc.key, TOKEN)
  assert.equal(res.doc.version, '0.1.0')
})

test('status 非回环 403', async () => {
  const res = mkRes()
  await handlers.status(mkReq({ addr: '10.0.0.5' }), res)
  assert.equal(res.status, 403)
})

test('catalog 回环 200', async () => {
  const res = mkRes()
  await handlers.catalog(mkReq(), res)
  assert.equal(res.status, 200)
  assert.equal(res.doc.models[0].id, 'qwen4-max')
})

test('apply 无 token 403', async () => {
  const res = mkRes()
  const req = mkReq({ body: { modelIds: ['qwen4-max'] } })
  const p = handlers.apply(req, res); req.emit(); await p
  assert.equal(res.status, 403)
})

test('apply 正确 token 200', async () => {
  const res = mkRes()
  const req = mkReq({ headers: { [CONTROL_HEADER]: TOKEN }, body: { modelIds: ['qwen4-max', 'glm-5.3'] } })
  const p = handlers.apply(req, res); req.emit(); await p
  assert.equal(res.status, 200)
  assert.equal(res.doc.applied, 2)
})

test('apply 错误 token 403', async () => {
  const res = mkRes()
  const req = mkReq({ headers: { [CONTROL_HEADER]: 'b'.repeat(48) }, body: { modelIds: ['x'] } })
  const p = handlers.apply(req, res); req.emit(); await p
  assert.equal(res.status, 403)
})

test('set-default 正确 token 200', async () => {
  const res = mkRes()
  const req = mkReq({ headers: { [CONTROL_HEADER]: TOKEN }, body: { provider: 'aliyun', model: 'qwen4-max' } })
  const p = handlers['set-default'](req, res); req.emit(); await p
  assert.equal(res.status, 200)
  assert.equal(res.doc.model, 'qwen4-max')
})

test('discover 正确 token 200', async () => {
  const res = mkRes()
  const req = mkReq({ headers: { [CONTROL_HEADER]: TOKEN }, body: {} })
  const p = handlers.discover(req, res); req.emit(); await p
  assert.equal(res.status, 200)
  assert.ok(Array.isArray(res.doc.candidates))
})

test('API_BASE 命名空间', () => {
  assert.equal(API_BASE, '/plugins/dsh-model-hub')
})