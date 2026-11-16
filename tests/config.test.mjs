import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG_DEFAULTS, resolveConfig } from '../lib/config.js'

test('空配置返回默认值', () => {
  assert.deepEqual(resolveConfig({}), { ...CONFIG_DEFAULTS })
})

test('enabled 显式 false 关闭', () => {
  assert.equal(resolveConfig({ enabled: false }).enabled, false)
})

test('enabled 缺省为 true', () => {
  assert.equal(resolveConfig({}).enabled, true)
})

test('覆盖 providerId', () => {
  assert.equal(resolveConfig({ providerId: 'custom' }).providerId, 'custom')
})

test('空白字符串字段兜底默认', () => {
  assert.equal(resolveConfig({ baseURL: '   ' }).baseURL, CONFIG_DEFAULTS.baseURL)
  assert.equal(resolveConfig({ apiKeyEnv: '' }).apiKeyEnv, CONFIG_DEFAULTS.apiKeyEnv)
})

test('非对象输入兜底默认', () => {
  assert.deepEqual(resolveConfig(null), { ...CONFIG_DEFAULTS })
  assert.deepEqual(resolveConfig(undefined), { ...CONFIG_DEFAULTS })
  assert.deepEqual(resolveConfig(42), { ...CONFIG_DEFAULTS })
})

test('默认值被冻结', () => {
  assert.ok(Object.isFrozen(CONFIG_DEFAULTS))
})