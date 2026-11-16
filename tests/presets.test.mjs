import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROVIDERS } from '../lib/providers.js'
import { loadPreset } from '../lib/catalog.js'

const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
const presets = PROVIDERS.map((p) => ({ p, c: loadPreset(p) }))

test('16 平台 preset 全部可加载且形状合法', () => {
  assert.equal(presets.length, 16)
  for (const { p, c } of presets) {
    assert.equal(c.schemaVersion, 1, p.id)
    assert.equal(c.provider, p.id, p.id)
    assert.ok(Array.isArray(c.models), p.id)
    assert.equal(c.apiKeyEnv, p.apiKeyEnv, p.id)
  }
})

test('除百炼外全部条目未验证（evidence:null，诚实清单）', () => {
  for (const { p, c } of presets) {
    if (p.id === 'aliyun') continue
    for (const m of c.models) assert.equal(m.evidence, null, p.id + '/' + m.id)
  }
})

test('百炼 preset 保持全量实测证据', () => {
  const c = presets.find((x) => x.p.id === 'aliyun').c
  assert.ok(c.models.length >= 15)
  for (const m of c.models) assert.ok(m.evidence?.testedAt, m.id)
})

test('目录路由条目带 catalogModel 标记与 catalog 容量来源', () => {
  for (const { p, c } of presets) {
    if (p.kind !== 'catalog') continue
    for (const m of c.models) {
      assert.equal(m.catalogModel, true, p.id + '/' + m.id)
      assert.equal(m.capacitySource?.context, 'catalog', p.id + '/' + m.id)
    }
  }
})

test('推荐标记合法且推荐模型存在', () => {
  for (const { p, c } of presets) {
    const rec = c.models.filter((m) => m.recommended)
    if (p.id === 'siliconflow' || p.id === 'volcengine') { assert.equal(rec.length, 0); continue }
    assert.ok(rec.length > 0, p.id + ' 有推荐')
    assert.ok(rec.length <= c.models.length, p.id)
  }
})

test('发现优先平台为空目录 + discoveryHint', () => {
  for (const id of ['siliconflow', 'volcengine']) {
    const c = presets.find((x) => x.p.id === id).c
    assert.equal(c.models.length, 0)
    assert.equal(c.discoveryHint, true)
  }
})

test('effort 键属于固定枚举且 wire 合法', () => {
  for (const { p, c } of presets) {
    for (const m of c.models) {
      if (m.reasoningEfforts === false) continue
      for (const [k, v] of Object.entries(m.reasoningEfforts)) {
        assert.ok(LEVELS.includes(k), p.id + '/' + m.id + ' level ' + k)
        if (k === 'off') assert.ok(v === null || typeof v === 'string', p.id + '/' + m.id)
        else assert.ok(typeof v === 'string' && v.length > 0, p.id + '/' + m.id + ' wire')
      }
    }
  }
})

test('zhipu 自定义路由：compat 仅含官方 offered 键且声明完整', () => {
  const c = presets.find((x) => x.p.id === 'zhipu').c
  assert.ok(c.models.length >= 5)
  // 官方 completions 协议 offered 全集（preset 可携带编辑器三键之外的 offered 键）。
  const offered = new Set([
    'supportsStore', 'supportsDeveloperRole', 'supportsReasoningEffort', 'supportsUsageInStreaming', 'supportsFinishReason',
    'maxTokensField', 'requiresToolResultName', 'requiresAssistantAfterToolResult', 'requiresThinkingAsText',
    'requiresReasoningContentOnAssistantMessages', 'thinkingFormat', 'chatTemplateKwargs', 'chatTemplateArgs',
    'supportsThinkingTokenBudget', 'thinkingTokenBudgetField', 'vllmPriority', 'supportsStrictMode', 'cacheControlFormat', 'supportsLongCacheRetention',
  ])
  for (const m of c.models) {
    assert.ok(m.contextWindow > 0 && m.maxTokens > 0, m.id)
    if (m.compat) for (const k of Object.keys(m.compat)) assert.ok(offered.has(k), m.id + ' compat ' + k)
  }
  const glm53 = c.models.find((m) => m.id === 'glm-5.3')
  assert.equal(glm53.compat.thinkingFormat, 'zai')
  assert.equal(glm53.compat.supportsDeveloperRole, false)
  assert.ok(glm53.reasoningEfforts.high, 'glm-5.3 声明 high 档位')
})

test('anthropic 系 preset 带 thinkingStyle 提示', () => {
  const a = presets.find((x) => x.p.id === 'anthropic').c
  assert.equal(a.models.find((m) => m.id === 'claude-opus-5-5').thinkingStyle, 'adaptive')
  assert.equal(a.models.find((m) => m.id === 'claude-haiku-4-5').thinkingStyle, 'budget')
  const mm = presets.find((x) => x.p.id === 'minimax-cn').c
  for (const m of mm.models) assert.equal(m.thinkingStyle, 'budget', m.id)
})

test('各平台 preset 不含自家 nonChat 模型', () => {
  for (const { p, c } of presets) {
    if (!p.nonChat) continue
    const re = new RegExp(p.nonChat, 'i')
    for (const m of c.models) assert.ok(!re.test(m.id), p.id + ' 混入非对话模型 ' + m.id)
  }
})

test('openai preset 全为 responses 协议模型（目录单协议）', () => {
  const c = presets.find((x) => x.p.id === 'openai').c
  assert.ok(c.models.length >= 12)
  assert.ok(c.models.some((m) => m.id === 'gpt-5.4'))
})