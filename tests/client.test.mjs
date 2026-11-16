import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { nextToken, toggleId, badgeKind, filterModels, effortSummary, fmtTokens, fmt, draftFromEntry, draftToPayload, clientValidate } = require('../client/client.js')

test('nextToken 从 payload.key 取 token', () => {
  assert.equal(nextToken('', { status: 200, payload: { key: 'abc' } }), 'abc')
})
test('nextToken 403 清空', () => {
  assert.equal(nextToken('abc', { status: 403, payload: null }), '')
})
test('nextToken 无 key 保留当前', () => {
  assert.equal(nextToken('abc', { status: 200, payload: {} }), 'abc')
})

test('toggleId 增删', () => {
  assert.deepEqual(toggleId([], 'a'), ['a'])
  assert.deepEqual(toggleId(['a', 'b'], 'a'), ['b'])
  assert.deepEqual(toggleId(['a'], 'b'), ['a', 'b'])
})

test('badgeKind 三态', () => {
  assert.equal(badgeKind({ recommended: true, evidence: {} }), 'recommended')
  assert.equal(badgeKind({ evidence: {} }), 'verified')
  assert.equal(badgeKind({}), 'unverified')
  assert.equal(badgeKind({ evidence: null }), 'unverified')
})

const models = [
  { id: 'qwen4-max', name: 'Qwen4 Max', recommended: true, evidence: {} },
  { id: 'glm-5.3', name: 'GLM 5.3', evidence: {} },
  { id: 'new-x', name: 'New X', evidence: null },
]
test('filterModels 按 id/name 搜索', () => {
  assert.deepEqual(filterModels(models, 'qwen', 'all').map((m) => m.id), ['qwen4-max'])
  assert.deepEqual(filterModels(models, 'glm', 'all').map((m) => m.id), ['glm-5.3'])
})
test('filterModels 推荐/已验证/未验证', () => {
  assert.deepEqual(filterModels(models, '', 'recommended').map((m) => m.id), ['qwen4-max'])
  assert.deepEqual(filterModels(models, '', 'verified').map((m) => m.id), ['qwen4-max', 'glm-5.3'])
  assert.deepEqual(filterModels(models, '', 'unverified').map((m) => m.id), ['new-x'])
})

test('effortSummary', () => {
  assert.equal(effortSummary(false), null)
  assert.equal(effortSummary({ off: 'none', high: 'high' }), 'off / high')
})

test('fmtTokens 十进制 K/M', () => {
  assert.equal(fmtTokens(1000000), '1M')
  assert.equal(fmtTokens(128000), '128K')
  assert.equal(fmtTokens(64), '64')
  assert.equal(fmtTokens(0), '—')
})

test('fmt 模板替换', () => {
  assert.equal(fmt('已应用 {n} 个模型', { n: 3 }), '已应用 3 个模型')
  assert.equal(fmt('Found {n}, {a} new', { n: 5, a: 2 }), 'Found 5, 2 new')
})

// ===== v0.2 编辑纯逻辑 =====

const entry = { id: 'qwen4-max', contextWindow: 1000000, maxTokens: 131072, input: ['text'], reasoningEfforts: { off: 'none', high: 'high' }, compat: { supportsDeveloperRole: false, thinkingFormat: 'qwen' }, evidence: {} }

test('draftFromEntry 拆行与 compat 控件值', () => {
  const d = draftFromEntry(entry)
  assert.equal(d.reasoning, true)
  assert.deepEqual(d.rows, [{ level: 'off', wire: 'none' }, { level: 'high', wire: 'high' }])
  assert.equal(d.devRole, 'false')
  assert.equal(d.thinkingFormat, 'qwen')
  assert.equal(d.maxTokensField, '')
})

test('draftFromEntry 非推理模型', () => {
  const d = draftFromEntry({ reasoningEfforts: false })
  assert.equal(d.reasoning, false)
  assert.deepEqual(d.rows, [])
})

test('draftToPayload _roundtrip', () => {
  const p = draftToPayload(draftFromEntry(entry))
  assert.deepEqual(p.reasoningEfforts, { off: 'none', high: 'high' })
  assert.deepEqual(p.compat, { supportsDeveloperRole: false, thinkingFormat: 'qwen' })
  assert.equal(p.contextWindow, 1000000)
})

test('draftToPayload off 空 wire → null', () => {
  const d = draftFromEntry(entry)
  d.rows[0].wire = ''
  const p = draftToPayload(d)
  assert.equal(p.reasoningEfforts.off, null)
})

test('draftToPayload 非推理 → false', () => {
  const d = draftFromEntry(entry)
  d.reasoning = false
  assert.equal(draftToPayload(d).reasoningEfforts, false)
})

test('draftToPayload compat 未设置不写入', () => {
  const d = draftFromEntry(entry)
  d.devRole = ''; d.thinkingFormat = ''; d.maxTokensField = ''
  assert.deepEqual(draftToPayload(d).compat, {})
})

test('clientValidate 合法通过', () => {
  assert.deepEqual(clientValidate(draftFromEntry(entry)), [])
})

test('clientValidate 抓非法容量/空模态/空wire/重复档位', () => {
  const d = draftFromEntry(entry)
  d.contextWindow = 0
  assert.ok(clientValidate(d).includes('contextWindow'))
  const d2 = draftFromEntry(entry)
  d2.input = []
  assert.ok(clientValidate(d2).includes('input'))
  const d3 = draftFromEntry(entry)
  d3.rows[1].wire = ''
  assert.ok(clientValidate(d3).includes('effort-wire'))
  const d4 = draftFromEntry(entry)
  d4.rows.push({ level: 'high', wire: 'high' })
  assert.ok(clientValidate(d4).includes('effort-dup'))
  const d5 = draftFromEntry(entry)
  d5.rows = [{ level: 'off', wire: '' }]
  assert.ok(clientValidate(d5).includes('effort-level'))
})

// ===== v0.3 下拉选项纯逻辑 =====

const { filterOptions, devRoleOptions, levelOptions, formatOptions, fieldOptions, selectedIndexOf, LEVELS, FORMATS, MAXFIELDS } = require('../client/client.js')
const tt = (k) => k // locale 桩：键即文案

test('filterOptions 四项 value/label/icon', () => {
  const opts = filterOptions(tt)
  assert.deepEqual(opts.map((o) => o.value), ['all', 'recommended', 'verified', 'unverified'])
  assert.deepEqual(opts.map((o) => o.icon), ['layers', 'star', 'check', 'alert'])
  assert.deepEqual(opts.map((o) => o.label), ['filterAll', 'filterRecommended', 'filterVerified', 'filterUnverified'])
})

test('devRoleOptions 三值，默认在前', () => {
  const opts = devRoleOptions(tt)
  assert.deepEqual(opts.map((o) => o.value), ['', 'false', 'true'])
  assert.equal(opts[0].label, 'unset')
  assert.ok(opts.every((o) => !o.icon))
})

test('levelOptions = LEVELS 纯文本', () => {
  const opts = levelOptions()
  assert.deepEqual(opts.map((o) => o.value), LEVELS)
  assert.ok(opts.every((o) => o.label === o.value && !o.icon))
})

test('formatOptions/fieldOptions 默认在前 + 枚举齐全', () => {
  const f = formatOptions(tt)
  assert.equal(f[0].value, '')
  assert.equal(f[0].label, 'unset')
  assert.deepEqual(f.slice(1).map((o) => o.value), FORMATS)
  const m = fieldOptions(tt)
  assert.equal(m[0].value, '')
  assert.equal(m[0].label, 'unset')
  assert.deepEqual(m.slice(1).map((o) => o.value), MAXFIELDS)
})

test('selectedIndexOf String 宽松比较与未命中', () => {
  const opts = [{ value: '' }, { value: 'false' }, { value: 'true' }]
  assert.equal(selectedIndexOf(opts, ''), 0)
  assert.equal(selectedIndexOf(opts, 'true'), 2)
  assert.equal(selectedIndexOf([{ value: 1 }], '1'), 0)
  assert.equal(selectedIndexOf(opts, 'nope'), -1)
  assert.equal(selectedIndexOf([], 'x'), -1)
  assert.equal(selectedIndexOf(null, 'x'), -1)
})

// ===== v0.4 多平台纯逻辑 =====

const { providerOptions, compatVisible } = require('../client/client.js')

test('providerOptions 经 nameOf 本地化并带已接入数 hint', () => {
  const providers = [
    { id: 'aliyun', displayName: { zh: '阿里云百炼', en: 'Aliyun Bailian' }, configured: true, modelCount: 16 },
    { id: 'deepseek', displayName: { zh: 'DeepSeek', en: 'DeepSeek' }, configured: false, modelCount: 0 },
  ]
  const opts = providerOptions(providers, (p) => p.displayName.en)
  assert.equal(opts[0].value, 'aliyun')
  assert.equal(opts[0].label, 'Aliyun Bailian')
  assert.equal(opts[0].hint, '16')
  assert.equal(opts[1].hint, '')
})

test('providerOptions nameOf 缺失/抛错回退 displayName.zh 或 id', () => {
  const providers = [{ id: 'x', displayName: { zh: '平台X' } }, { id: 'bare' }]
  const opts = providerOptions(providers, null)
  assert.equal(opts[0].label, '平台X')
  assert.equal(opts[1].label, 'bare')
  const opts2 = providerOptions(providers, () => { throw new Error('boom') })
  assert.equal(opts2[0].label, '平台X')
})

test('providerOptions 非数组输入兜底空列表', () => {
  assert.deepEqual(providerOptions(null, null), [])
})

test('compatVisible 协议门禁镜像服务端', () => {
  assert.deepEqual(compatVisible('openai-completions'), { devRole: true, thinkingFormat: true, maxTokensField: true })
  assert.deepEqual(compatVisible('openai-responses'), { devRole: true, thinkingFormat: false, maxTokensField: false })
  for (const p of ['anthropic-messages', 'google-generative-ai', 'mistral-conversations', undefined]) {
    assert.deepEqual(compatVisible(p), { devRole: false, thinkingFormat: false, maxTokensField: false }, String(p))
  }
})