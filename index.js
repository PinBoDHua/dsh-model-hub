// dsh-model-hub — DeepSeek Harness 百炼模型接入管理层 Host entry。
//
// 机制（均为已验证的 DSH API，参照 dsh-memory / dsh-smart-router）：
// - 不 import 任何 @deepseek-ai/*：本地链接目录的 ESM 解析够不到 DSH 安装树；
//   服务经 ctx.get / ctx.inject 取（configEditor、webServer、credentials）。
// - lib/apply.js 经 ctx.configEditor.edit() 把目录智能合并进 llm-pi-ai 的 aliyun 条目。
// - lib/routes.js 经 ctx.webServer 命名路由 /plugins/dsh-model-hub/* 提供数据面
//   （进程级 token + 回环检查，写操作校验 X-RPC-Key）。
// - 凭据经 ctx.credentials.resolve 复用 ALIYUN_API_KEY；插件不自存密钥，探针/日志不输出密钥。
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from './lib/config.js'
import { createHubService } from './lib/service.js'
import { attachRoutes } from './lib/routes.js'

const pkgPath = fileURLToPath(new URL('./package.json', import.meta.url))
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

export const name = 'dsh-model-hub'
export const version = typeof pkg.version === 'string' ? pkg.version : '0.0.0'
export const inject = ['configEditor', 'webServer', 'credentials']

export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)
  if (!config.enabled) return

  // 版本号每次 apply 实时读取：宿主 ESM 模块可能被缓存，模块级常量会滞后于实际安装版本。
  let liveVersion = version
  try {
    const fresh = JSON.parse(readFileSync(pkgPath, 'utf8')).version
    if (typeof fresh === 'string' && fresh !== '') liveVersion = fresh
  } catch { /* 保留模块级 version */ }

  const token = randomBytes(24).toString('hex')
  const hub = createHubService({ ctx, config, version: liveVersion })
  ctx.effect(() => attachRoutes({ webCtx: ctx, hub, token }))
}