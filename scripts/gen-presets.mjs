// gen-presets.mjs — 从本机安装的 pi-ai 官方目录数据生成目录路由平台 preset（展示快照）。
// 用法：
//   1) 提取数据（Electron-as-Node 读 asar）：
//      ELECTRON_RUN_AS_NODE=1 "<DSH安装>/DeepSeek Harness.exe" -e "const fs=require('fs');const s='<asar>/dsh/node_modules/@earendil-works/pi-ai/dist/providers/data';fs.mkdirSync('C:/Temp/pi-data',{recursive:true});for(const f of fs.readdirSync(s))if(f.endsWith('.json'))fs.writeFileSync('C:/Temp/pi-data/'+f,fs.readFileSync(s+'/'+f,'utf8'))"
//   2) node scripts/gen-presets.mjs --data=C:/Temp/pi-data
// preset 只是展示快照 + 推荐标记：目录路由 apply 薄写入 {id,name}+手动字段，
// 容量/协议/推理元数据运行时继承官方目录（共识决策 3），故快照滞后不影响正确性。
// bailian.json 由 probe-bailian.mjs 实测产出，本脚本绝不触碰。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PROVIDERS } from '../lib/providers.js'

const dataDir = (process.argv.find((a) => a.startsWith('--data=')) || '--data=C:/Temp/pi-data').slice(7)
const presetsDir = fileURLToPath(new URL('../presets/', import.meta.url))

// 精选表：id → recommended。未列出的内置模型不进 preset（发现兜底可补）。
const CURATION = {
  deepseek: { 'deepseek-flash': true, 'deepseek-v4-pro': true },
  'moonshotai-cn': { 'kimi-k3': true, 'kimi-k2.7-code': true, 'kimi-k2.6': false, 'kimi-k2.7-code-highspeed': false },
  'minimax-cn': { 'MiniMax-M2.7': true, 'MiniMax-M3': true, 'MiniMax-M2.7-highspeed': false },
  openai: {
    'gpt-6-luna': true, 'gpt-5.5': true, 'gpt-5.4': true, 'gpt-5.4-mini': true, 'gpt-5.3-codex': true,
    'gpt-5.2': false, 'gpt-5.1': false, 'gpt-5': false, 'gpt-5-mini': false, 'gpt-5-nano': false,
    'gpt-5.4-pro': false, 'gpt-5.5-pro': false, 'gpt-4.1': false, 'gpt-4o': false, 'o3': false, 'o4-mini': false,
  },
  anthropic: {
    'claude-opus-5-5': true, 'claude-sonnet-5-5': true, 'claude-haiku-5-5': true,
    'claude-opus-5': false, 'claude-sonnet-5': false, 'claude-opus-4-8': false, 'claude-opus-4-7': false,
    'claude-sonnet-4-6': false, 'claude-fable-5-1': false, 'claude-fable-5': false,
    'claude-haiku-4-5': false, 'claude-sonnet-4-5': false, 'claude-opus-4-5': false,
  },
  google: {
    'gemini-3.8-flash': true, 'gemini-3.7-flash': true, 'gemini-3.5-flash': true, 'gemini-3.1-pro-preview': true,
    'gemini-3.1-flash-lite': false, 'gemini-2.5-pro': false, 'gemini-2.5-flash': false, 'gemini-2.5-flash-lite': false,
    'gemini-4-argon': false, 'gemini-flash-latest': false, 'gemini-flash-lite-latest': false,
  },
  openrouter: {
    'anthropic/claude-opus-4.5': true, 'anthropic/claude-sonnet-4.5': true, 'anthropic/claude-haiku-4.5': false,
    'openai/gpt-5.2': true, 'openai/gpt-5.4': true, 'openai/gpt-5.4-mini': false, 'openai/gpt-4.1': false, 'openai/o3': false,
    'google/gemini-3.1-pro-preview': true, 'google/gemini-3.5-flash': false,
    'deepseek/deepseek-v4.1-flash': true, 'deepseek/deepseek-v4-pro': false,
    'moonshotai/kimi-k3': true, 'z-ai/glm-5.3': false, 'qwen/qwen3.7-max': false, 'qwen/qwen3-coder-next': false,
    'minimax/minimax-m2.7': false, 'meta-llama/llama-3.3-70b-instruct': false,
  },
  groq: {
    'openai/gpt-oss-120b': true, 'qwen/qwen3.8-27b': true, 'llama-3.3-70b-versatile': true,
    'openai/gpt-oss-20b': false, 'llama-3.1-8b-instant': false, 'qwen/qwen3.6-27b': false, 'openai/gpt-oss-safeguard-20b': false,
  },
  xai: { 'grok-4.7': true, 'grok-4.6': true, 'grok-4.5': false, 'grok-4.3': false },
  mistral: {
    'mistral-large-latest': true, 'mistral-medium-latest': true, 'magistral-medium-latest': true, 'devstral-latest': true,
    'codestral-latest': false, 'mistral-small-latest': false, 'ministral-14b-2512': false, 'ministral-8b-latest': false,
    'ministral-3b-latest': false, 'pixtral-large-latest': false,
  },
  together: {
    'deepseek-ai/DeepSeek-V4.1-Flash': true, 'deepseek-ai/DeepSeek-V4-Pro-0813': true, 'moonshotai/Kimi-K3': true,
    'zai-org/GLM-5.3': true, 'openai/gpt-oss-120b': true, 'MiniMaxAI/MiniMax-M3': false, 'Qwen/Qwen3.6-Plus': false,
    'meta-llama/Llama-3.3-70B-Instruct-Turbo': false, 'nvidia/nemotron-3-ultra-550b-a55b': false, 'thinkingmachines/Inkling': false,
  },
  cerebras: { 'gpt-oss-120b': true, 'qwen-3.8-27b': true },
  // zhipu 是自定义路由，但模型元数据取自 pi-ai 的 zai 目录（同厂同模型同 wire 行为）。
  zhipu: { 'glm-5.3': true, 'glm-5.3-flash': true, 'glm-5.3-highspeed': false, 'glm-5.2': false, 'glm-4.7': false, 'glm-5-turbo': false },
}
const ZHIPU_SOURCE = 'zai'

// 官方 completions 协议 offered compat 白名单（withheld 键写入会被官方 schema 拒绝）。
const OFFERED_COMPLETIONS_COMPAT = new Set([
  'supportsStore', 'supportsDeveloperRole', 'supportsReasoningEffort', 'supportsUsageInStreaming', 'supportsFinishReason',
  'maxTokensField', 'requiresToolResultName', 'requiresAssistantAfterToolResult', 'requiresThinkingAsText',
  'requiresReasoningContentOnAssistantMessages', 'thinkingFormat', 'chatTemplateKwargs', 'chatTemplateArgs',
  'supportsThinkingTokenBudget', 'thinkingTokenBudgetField', 'vllmPriority', 'supportsStrictMode', 'cacheControlFormat', 'supportsLongCacheRetention',
])

function flattenChat(data) {
  const out = new Map()
  for (const api of Object.keys(data)) {
    for (const m of Object.values(data[api])) {
      if (m && m.type === 'chat') out.set(m.id, m)
    }
  }
  return out
}

// 展示用档位快照：仅字符串 wire 档位；off 缺省=可关（送 nothing），off:null=不可关。
// 无非 off 档位 → false（面板按 reasoning 标志显示「持续思考」）。
function displayEfforts(m) {
  if (!m.reasoning) return false
  const map = m.thinkingLevelMap || {}
  const out = {}
  for (const [level, wire] of Object.entries(map)) if (typeof wire === 'string') out[level] = wire
  if (map.off === undefined) out.off = null
  return Object.keys(out).some((k) => k !== 'off') ? out : false
}

// 自定义路由的真实声明：仅字符串 wire（未声明档位被官方解析钉为 null=不支持，忠实还原）。
function declaredEfforts(m) {
  const map = m.thinkingLevelMap || {}
  const out = {}
  for (const [level, wire] of Object.entries(map)) if (typeof wire === 'string') out[level] = wire
  return Object.keys(out).some((k) => k !== 'off') ? out : false
}

function filterCompat(compat) {
  if (!compat) return undefined
  const out = {}
  for (const [k, v] of Object.entries(compat)) if (OFFERED_COMPLETIONS_COMPAT.has(k)) out[k] = v
  return Object.keys(out).length ? out : undefined
}

function snapshot(m, recommended, kind) {
  const entry = {
    id: m.id, name: m.name || m.id,
    contextWindow: m.contextWindow, maxTokens: m.maxTokens, input: m.input || ['text'],
    reasoning: !!m.reasoning,
    reasoningEfforts: kind === 'custom' ? declaredEfforts(m) : displayEfforts(m),
    recommended, evidence: null,
    capacitySource: { context: 'catalog', maxOutput: 'catalog' },
  }
  if (kind === 'catalog') entry.catalogModel = true
  if (m.api === 'anthropic-messages') entry.thinkingStyle = m.compat?.forceAdaptiveThinking === true ? 'adaptive' : 'budget'
  if (kind === 'custom') {
    const compat = filterCompat(m.compat)
    if (compat) entry.compat = compat
  }
  return entry
}

const report = []
for (const p of PROVIDERS) {
  const curation = CURATION[p.id]
  if (!curation) continue
  const sourceId = p.id === 'zhipu' ? ZHIPU_SOURCE : p.id
  const data = JSON.parse(readFileSync(dataDir + '/' + sourceId + '.json', 'utf8'))
  const models = flattenChat(data)
  const picked = []
  const missed = []
  for (const [id, recommended] of Object.entries(curation)) {
    const m = models.get(id)
    if (!m) { missed.push(id); continue }
    picked.push(snapshot(m, recommended, p.kind))
  }
  const preset = {
    schemaVersion: 1, provider: p.id, displayName: p.name.zh,
    api: p.api, baseURL: p.baseURL, apiKeyEnv: p.apiKeyEnv, kind: p.kind,
    generatedAt: new Date().toISOString(),
    source: 'pi-ai installed catalog (' + sourceId + ')',
    models: picked,
  }
  writeFileSync(presetsDir + p.preset, JSON.stringify(preset, null, 2) + '\n')
  report.push({ provider: p.id, models: picked.length, recommended: picked.filter((m) => m.recommended).length, missed })
}
console.log(JSON.stringify(report, null, 1))