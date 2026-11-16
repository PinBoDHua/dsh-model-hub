// 插件配置默认值与解析（纯函数，无 schemastery 依赖；经插件行 config 调整）。
export const CONFIG_DEFAULTS = Object.freeze({
  enabled: true,
  providerId: 'aliyun',
  apiKeyEnv: 'ALIYUN_API_KEY',
  baseURL: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
  api: 'openai-completions',
})

export function resolveConfig(raw) {
  const c = raw && typeof raw === 'object' ? raw : {}
  const str = (v, d) => (typeof v === 'string' && v.trim() !== '' ? v : d)
  return {
    enabled: c.enabled !== false,
    providerId: str(c.providerId, CONFIG_DEFAULTS.providerId),
    apiKeyEnv: str(c.apiKeyEnv, CONFIG_DEFAULTS.apiKeyEnv),
    baseURL: str(c.baseURL, CONFIG_DEFAULTS.baseURL),
    api: str(c.api, CONFIG_DEFAULTS.api),
  }
}