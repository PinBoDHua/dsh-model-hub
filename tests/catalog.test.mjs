import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const catalog = JSON.parse(readFileSync(fileURLToPath(new URL('../presets/bailian.json', import.meta.url)), 'utf8'))
const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

test('目录顶层形状', () => {
  assert.equal(catalog.schemaVersion, 1)
  assert.equal(catalog.provider, 'aliyun')
  assert.equal(catalog.api, 'openai-completions')
  assert.equal(catalog.apiKeyEnv, 'ALIYUN_API_KEY')
  assert.ok(Array.isArray(catalog.models) && catalog.models.length > 0)
})

test('每个模型有 id 与实测证据', () => {
  for (const m of catalog.models) {
    assert.ok(typeof m.id === 'string' && m.id.length > 0, 'id')
    assert.ok(m.evidence && m.evidence.testedAt, 'evidence.testedAt ' + m.id)
    assert.ok(['ok', 'rejected'].includes(m.evidence.developerRole), 'developerRole ' + m.id)
    assert.ok(['ok', 'fail'].includes(m.evidence.tools), 'tools ' + m.id)
    assert.ok(['max_tokens', 'max_completion_tokens'].includes(m.evidence.maxTokensField), 'maxTokensField ' + m.id)
  }
})

test('reasoningEfforts 键属于固定档位枚举', () => {
  for (const m of catalog.models) {
    if (m.reasoningEfforts === false) continue
    assert.ok(m.reasoningEfforts && typeof m.reasoningEfforts === 'object', 'efforts obj ' + m.id)
    for (const k of Object.keys(m.reasoningEfforts)) assert.ok(LEVELS.includes(k), 'level ' + k + ' ' + m.id)
    assert.ok(Object.keys(m.reasoningEfforts).some((k) => k !== 'off'), '至少一个非 off 档位 ' + m.id)
    for (const [k, v] of Object.entries(m.reasoningEfforts)) {
      if (k === 'off') assert.ok(v === null || typeof v === 'string', 'off wire ' + m.id)
      else assert.ok(typeof v === 'string' && v.length > 0, '非 off wire 非空 ' + m.id)
    }
  }
})

test('拒绝 developer 角色的模型必须声明 supportsDeveloperRole:false', () => {
  for (const m of catalog.models) {
    if (m.evidence.developerRole === 'rejected') {
      assert.equal(m.compat?.supportsDeveloperRole, false, m.id)
    }
  }
})

test('maxTokensField 实测为 max_completion_tokens 时写入 compat', () => {
  for (const m of catalog.models) {
    if (m.evidence.maxTokensField === 'max_completion_tokens') {
      assert.equal(m.compat?.maxTokensField, 'max_completion_tokens', m.id)
    }
  }
})

test('推荐子集有效且为已验证模型', () => {
  const rec = catalog.models.filter((m) => m.recommended)
  assert.ok(rec.length > 0 && rec.length < catalog.models.length, '推荐是真子集')
  for (const m of rec) {
    assert.equal(m.evidence.tools, 'ok', m.id)
    assert.notEqual(m.reasoningEfforts, false, m.id)
  }
})

test('不含非对话模型', () => {
  for (const m of catalog.models) {
    assert.ok(!/^(wan|qwen-audio|qwen-image)/.test(m.id), '非对话模型混入 ' + m.id)
  }
})