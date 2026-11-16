# dsh-model-hub

面向 DeepSeek Harness 的**多平台模型接入管理层**：在官方 `@deepseek-ai/dsh-llm-pi-ai` 适配器之上，提供 16 个主流平台的模型目录、四协议探测引擎、一键智能合并应用、运行时复验与端点发现兜底，让官方模型选择器显示更多可用模型与推理强度档位。

不重写 LLM 适配器、不替换官方模型选择器——官方能力（`reasoningEfforts` / `compat` / 发现）齐全，缺的是易用性，本插件补这个。

## 支持平台

| 平台 | 路由类型 | 协议 | 凭据引用 |
|---|---|---|---|
| 阿里云百炼（已实测） | 自定义 | openai-completions | `ALIYUN_API_KEY` |
| DeepSeek | 官方目录 | openai-completions | `DEEPSEEK_API_KEY` |
| Kimi（月之暗面） | 官方目录 | openai-completions | `MOONSHOT_API_KEY` |
| 智谱 GLM | 自定义 | openai-completions | `ZHIPU_API_KEY` |
| 硅基流动 | 自定义 | openai-completions | `SILICONFLOW_API_KEY` |
| 火山方舟（豆包） | 自定义 | openai-completions | `ARK_API_KEY` |
| MiniMax | 官方目录 | anthropic-messages | `MINIMAX_CN_API_KEY` |
| OpenAI | 官方目录 | openai-responses | `OPENAI_API_KEY` |
| Anthropic Claude | 官方目录 | anthropic-messages | `ANTHROPIC_API_KEY` |
| Google Gemini | 官方目录 | google-generative-ai | `GEMINI_API_KEY` |
| OpenRouter | 官方目录 | openai-completions（统一） | `OPENROUTER_API_KEY` |
| Groq | 官方目录 | openai-completions | `GROQ_API_KEY` |
| xAI Grok | 官方目录 | openai-responses | `XAI_API_KEY` |
| Mistral AI | 官方目录 | 原生（探测走 OpenAI 兼容端点） | `MISTRAL_API_KEY` |
| Together AI | 官方目录 | openai-completions | `TOGETHER_API_KEY` |
| Cerebras | 官方目录 | openai-completions | `CEREBRAS_API_KEY` |

另可在插件 config 的 `providers` 里声明任意 OpenAI 兼容网关（给 `baseURL`+`api` 即可，空目录 + 发现兜底）。Bedrock/Vertex/Azure/Codex 的鉴权形态超出 `apiKeyEnv` 表达力，hub 不接管（官方目录路由本身可用）。

## 它解决什么

- **模型少**：平台端点实际提供的对话模型远多于手工配置。本插件内置目录（百炼逐模型实测；其余取自 pi-ai 官方目录快照或发现兜底），一键接入。
- **推理强度不能设**：裸 `id/name` 配置不声明 `reasoningEfforts`，官方选择器就不显示 Effort 行。本插件为自定义路由逐模型声明档位；官方目录路由继承 pi-ai 目录的推理元数据。
- **选了不能用**：不少模型拒绝 `developer` 角色（DSH 默认用它发系统提示），导致每轮 400。本插件实测并写入 `compat.supportsDeveloperRole: false`（仅 completions/responses 协议适用）。
- **配置易错**：手写 YAML 易踩坑。本插件经官方 `configEditor` 校验+原子写回，保留注释与其他 provider。

## 功能

- **模型库面板**（嵌入官方 Models 设置页 footer）：平台切换下拉（16 平台）、模型卡片网格（上下文/最大输出/输入模态/推理档位/验证徽标）、搜索、筛选（全部/推荐/已验证/未验证）、选中推荐、应用选中、发现新模型、全部复验、重置目录。
- **provider-card 快捷状态**（全部 hub 平台卡片内）：已接入模型数 + 凭据状态 + 一键应用推荐。
- **选择器徽标**（`conversation.input.model.label` slot）：给官方选择器的 hub 平台模型注入 推荐★/已验证✓ 内联徽标（经 hub 目录索引缓存，非交互）。
- **智能合并应用**：按 id 更新/新增选中模型，保留用户自加模型，绝不删除；保留 `apiKeyEnv`/`baseURL`/`headers` 等用户字段；复用凭据引用；一次只动一个 provider 条目；不改全局默认模型（除非点"设为默认"）。
- **目录路由薄写入**：官方目录平台只写 `{id,name}` + 手动编辑过的字段，容量/协议/推理继承 pi-ai 官方目录（避免 maxTokens 变成请求 cap，随 pi-ai 升级不落后）。
- **运行时复验**：单模型或全部重新探测（四协议方言：developer 角色/工具/输出字段/推理档位），结果持久化到 `~/.dsh/.dsh-model-hub/catalogs/<平台>.json`。自定义路由自动派生写回；目录路由仅记录证据，手动编辑才写配置。
- **发现兜底**：OpenAI `GET /models`、Anthropic `GET /v1/models`、Google `GET /models`（generateContent 过滤），逐平台过滤非对话模型，未知模型标"未验证"并入目录。

## 安装

```powershell
# 桌面 profile（link 开发态）：编辑 ~/.dsh/profiles/desktop/package.json
#   dependencies 加 "dsh-model-hub": "link:D:/Questions/dsh-model-hub"
#   dsh.profile.bundles 追加 "dsh-model-hub"
# 然后（仅 Electron app CLI 可管理 desktop profile）：
dsh plugin --profile desktop install
# 重启 DeepSeek Harness 桌面 app 加载插件；已装过的升级走 plugin_manager remove→install 重载 host。
```

打开 设置 → 模型，页面底部即"模型库"面板。选平台 →「选中推荐」→「应用选中」，composer 模型选择器即出现该平台模型与推理强度行。凭据在官方 Models 页对应平台卡片填入（插件复用同一凭据引用，不自存密钥）。

## 配置

插件行 config（可选，默认见 `lib/config.js` / `lib/providers.js`）：

| 字段 | 默认 | 含义 |
|---|---|---|
| `enabled` | `true` | 关闭则不挂载数据面 |
| `providerId` | `aliyun` | 默认平台（面板初始选中） |
| `apiKeyEnv`/`baseURL`/`api` | 百炼值 | 旧版单平台覆盖，作用于 `providerId` 所指平台 |
| `providers.<id>.apiKeyEnv/baseURL` | 注册表值 | 逐平台覆盖 |
| `providers.<自定义id>.baseURL/api/displayName` | — | 声明任意 OpenAI 兼容网关 |

## 测试

```powershell
npm test          # 170 项纯逻辑单测（config/catalog/merge/routes/discover/probe/protocols/providers/presets/multi-service/client）
npm run test:dsh  # 23 项真实宿主集成（真实 index.js + 官方适配器 Config schema 校验 + 阴性对照）
npm run verify    # 两者一起
npm run probe     # 重跑百炼开发期探针矩阵，刷新 presets/bailian.json
npm run gen-presets -- --data=<pi-ai目录数据目录>  # 从 pi-ai 官方目录重生成平台 preset
node scripts/gui-check.mjs --url=http://127.0.0.1:<端口>/  # 真实 GUI 36 项断言（Edge headless+CDP）
```

## 诚实清单

- 仅百炼为开发期全量实测；其余平台 preset 元数据来自 pi-ai 官方目录快照或平台公开文档，`evidence:null` 明示未验证——填入凭据后点「复验」即得实测证据。
- 目录路由的「已验证」＝运行时复验过行为；配置仍继承官方目录（除非手动编辑），面板证据行明示。
- `contextWindow`/`maxTokens` 快照为目录值（非实测）；行为（effort/developer 角色/工具/输出字段）复验后为实测。
- 复验/发现需要对应凭据经 harness 凭据 seam 可解析；探针请求输出上限受控（completions/responses ≤512/1024；anthropic budget 探针 ≤5120；google budget 仅探 minimal/low）、带超时、失败关闭，绝不输出密钥。anthropic/google 复验有真实 token 成本，仅用户显式触发。
- 实测最大输出（拒绝法二分）仅 openai-completions 支持；其余协议诚实返回不支持。
- OpenRouter 统一走 openai-completions：其目录中 15 个 anthropic 原生直通模型被重指后仍可用，损失原生直通优化。
- Mistral 配置保留原生 mistral-conversations 协议；探测走其 OpenAI 兼容端点，行为可能有细微差异。
- 桌面 profile 由 Electron app 独占管理：CLI 只能 `plugin install`，boot/dump 需 app；host 改动升级走 plugin_manager remove→install。
- 选择器徽标经官方 label slot 注入；非 hub provider 保持原样透传。

## 许可

MIT