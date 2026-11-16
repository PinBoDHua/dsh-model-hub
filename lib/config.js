// 插件配置默认值与解析（纯函数，无 schemastery 依赖；经插件行 config 调整）。
// v0.4.0：旧字段语义不变＝默认平台（aliyun）覆盖；新增 providers 逐平台覆盖与自定义网关。
export const CONFIG_DEFAULTS = Object.freeze({
  enabled: true,
  providerId: 'aliyun',
  apiKeyEnv: 'ALIYUN_API_KEY',
  baseURL: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
  api: 'openai-completions',
  providers: Object.freeze({}),
})

export function resolveConfig(raw) {
  const c = raw && typeof raw === 'object' ? raw : {}
  const str = (v, d) => (typeof v === 'string' && v.trim() !== '' ? v : d)
  const providers = {}
  if (c.providers && typeof c.providers === 'object' && !Array.isArray(c.providers)) {
    for (const [id, o] of Object.entries(c.providers)) {
      if (!o || typeof o !== 'object' || Array.isArray(o)) continue
      const e = {}
      for (const k of ['apiKeyEnv', 'baseURL', 'api', 'displayName', 'nonChat']) {
        if (typeof o[k] === 'string' && o[k].trim() !== '') e[k] = o[k]
      }
      providers[id] = e
    }
  }
  return {
    enabled: c.enabled !== false,
    providerId: str(c.providerId, CONFIG_DEFAULTS.providerId),
    apiKeyEnv: str(c.apiKeyEnv, CONFIG_DEFAULTS.apiKeyEnv),
    baseURL: str(c.baseURL, CONFIG_DEFAULTS.baseURL),
    api: str(c.api, CONFIG_DEFAULTS.api),
    providers,
  }
}