# dsh-model-hub v0.4.0 设计共识（多平台化，2026-11-16）

起因：用户直接指令——「这种插件肯定是要适配市面上大部分的模型平台 API 的」。v0.1 共识第 2 条本就写明「v0.1 只做百炼，架构留通用 preset 接口」；本版兑现该接口，把单平台管理层升级为多平台模型库。

## 调研事实（本版设计的地基）

1. 官方 `@deepseek-ai/dsh-llm-pi-ai`（0.2.2-rc.3，pi-ai ^1.3.0）内置约 35 个平台目录（`dist/providers/data/*.json`），含逐模型 contextWindow/maxTokens/input/reasoning/thinkingLevelMap/compat——**这是比任何手写文档都权威的元数据来源**。
2. 适配器路由分两类（`src/catalog.ts resolveRouteModels`）：
   - **目录路由**（route key 命中 pi-ai 内置目录，如 deepseek/openai/anthropic）：显式 `models` 列表替换目录，但每个条目未声明的字段从同 id 内置条目继承（`...base` spread）；`api`/`baseURL` 逐模型回退内置值（L918/L923）。
   - **自定义路由**（aliyun/zhipu/siliconflow/volcengine 等）：无内置目录，条目必须自带容量/协议。
3. **`entry.maxTokens` 会成为请求级输出上限**（`configuredMaxTokens`，L941）——把目录能力值原样写进配置等于给每个请求加了没人选过的 cap。目录路由应省略容量字段让其继承。
4. 手写路由可选协议仅 4 种（`src/provider.ts PROTOCOLS`）：openai-completions / openai-responses / anthropic-messages / google-generative-ai。mistral 原生协议 mistral-conversations 不在其列，但**目录路由可保留原生协议**，且其端点就是 `{base}/v1/chat/completions`（OpenAI 同形），探针可走 OpenAI 方言。
5. compat 字段按协议门禁（`PiAiCompatProfile` 注释）：supportsDeveloperRole/maxTokensField/thinkingFormat 仅 openai-completions（devRole 另含 responses 系）；anthropic 专属 forceAdaptiveThinking 等。跨协议写 compat 会被官方 schema 拒绝。
6. 推理分发形态：openai-responses 走 `reasoning.effort`；anthropic 新模型走 `thinking:{type:'adaptive'}`+`output_config:{effort}`（forceAdaptiveThinking），旧模型/MiniMax 走 `thinking:{type:'enabled',budget_tokens}`；google gemini-3 走 `thinkingConfig.thinkingLevel`，2.5 系走 `thinkingConfig.thinkingBudget`。
7. 选择器 label slot 的 `model` 是适配器目录条目（ModelCatalogModel），**不含** evidence/recommended——v0.3 的徽标逻辑实际拿不到这两个字段。本版用 hub 目录索引缓存修复并泛化到全平台。
8. 本机凭据仅 ALIYUN_API_KEY 可解析（~/.dsh/.credentials.yaml refs）。其他平台无法开发期实测。

## 决策

1. **范围**：16 平台 × 4 协议方言。平台清单：aliyun（百炼，已实测）、deepseek、moonshotai-cn（Kimi）、zhipu（智谱通用 API，自定义路由）、siliconflow（自定义）、volcengine（火山方舟，自定义）、minimax-cn、openai、anthropic、google、openrouter、groq、xai、mistral、together、cerebras。不做 Bedrock/Vertex/Azure/Codex（鉴权形态超出 apiKeyEnv 表达力，官方目录路由本身可用，hub 不接管）。
2. **preset 来源分层**：目录路由平台的 preset 由脚本从本机安装的 pi-ai 目录数据提取（`scripts/gen-presets.mjs`，经 Electron-as-Node 读 asar），快照仅用于面板展示与推荐标记；自定义路由平台（zhipu/siliconflow/volcengine）为文档基线 + 发现兜底。**除百炼外全部条目 evidence:null（未验证）**，诚实清单延续 v0.1。
3. **目录路由薄写入**：apply 只写 `{id,name}` + 用户手动编辑过的字段（manualFields 追踪）；未实测/未编辑的 reasoningEfforts/compat/容量一律不写，继承官方 pi-ai 目录。理由：事实 3（cap 陷阱）+ 事实 5/6（effort 派生不忠实风险）+ pi-ai 目录随升级演进，薄写入永不落后。
4. **自定义路由全量写入**：保持 v0.3 行为（ADAPTER_FIELDS 全字段），verify 自动派生 efforts/compat 并双写。
5. **verify 语义分层**：自定义路由＝探测→派生→写目录→（已应用则）写配置；目录路由＝探测→只记录 evidence（面板展示实测证据），不自动改配置，用户经编辑器手动覆盖才写入。面板与文档明示该差异。
6. **协议方言引擎**（lib/protocols.js 分发）：
   - openai-completions：现 probe.js 逻辑原样保留（11 平台共用，含 mistral 经 probeBaseURL=…/v1）。
   - openai-responses：POST {base}/responses；input 数组；max_output_tokens；reasoning:{effort}；developer 角色；扁平 function tools；usage.output_tokens_details.reasoning_tokens。
   - anthropic-messages：POST {base}/v1/messages；x-api-key + anthropic-version:2023-06-01；adaptive 模型探 output_config.effort（max_tokens=1024），budget 模型探 thinking.budget_tokens（low/medium/high=1024/2048/4096，max_tokens=budget+1024，成本受控）；无 developer 角色概念（不写 compat）；tools=input_schema 形态。
   - google-generative-ai：POST {base}/models/{id}:generateContent；x-goog-api-key；gemini-3 探 thinkingConfig.thinkingLevel（maxOutputTokens=1024），2.5 系探 thinkingBudget（minimal=128/low=2048，medium/high 不探——成本，诚实标未测）；systemInstruction 等价 developer；tools=functionDeclarations。
   - 发现方言：openai GET /models（逐平台 nonChat 过滤）；anthropic GET /v1/models；google GET /models（过滤 supportedGenerationMethods 含 generateContent，去 models/ 前缀）。
   - probeMaxOutput 仅 openai-completions 支持；其他协议返回 measured:false + reason（诚实）。
7. **openrouter 统一协议**：preset 默认 route api=openai-completions（OpenRouter 全模型接受 OpenAI 形态；其目录 396 模型中 15 个 anthropic 原生条目被重指后仍可用，损失原生直通优化，文档明示）。发现的新模型因此可解析。openai 目录全为 responses（sharedCatalogApi 单值），无需 route api。
8. **存储与迁移**：runtime 目录 `~/.dsh/.dsh-model-hub/catalogs/<id>.json` 逐平台；首启把旧 `catalog.json` 迁移为 `catalogs/aliyun.json`（保留原件不删）。preset schemaVersion 保持 1，新增 kind/catalogModel 等目录元数据字段（loadCatalog 校验放宽为白名单）。
9. **向后兼容**：config 旧字段（providerId/apiKeyEnv/baseURL/api）语义不变＝默认平台（aliyun）覆盖；新增可选 `providers:{<id>:{apiKeyEnv?,baseURL?}}` 逐平台覆盖。路由路径/payload 不变，全部操作接受可选 `provider`（POST body / GET query），缺省＝默认平台；新增 GET /providers。status 旧字段保留，追加 providers 数组。
10. **UI**：面板标题改「模型库 / Model Hub」；工具栏上方平台 Select（复用 v0.3 无障碍 Select，选项=16 平台 displayName + 已接入数 hint）；切换平台清空选择/搜索保持；状态行/凭据/发现/复验/重置全部逐平台。provider-card 对 16 平台渲染（原仅 aliyun）。选择器徽标经 hub 目录索引缓存（每平台一次 fetch，面板操作后失效重取）对全平台生效。编辑器按协议隐藏不适用的 compat 控件（anthropic/google 无 devRole/thinkingFormat/maxTokensField；responses 无 thinkingFormat/maxTokensField）。
11. **validate 协议感知**：validateDraft(draft, protocol) 按协议门禁 compat 键；客户端 EditorForm 同步隐藏。旧单参调用默认 openai-completions（保绿）。
12. **验证**：既有 116 项保绿（version 断言更新 0.4.0）+ 新增注册表/方言/多目录/路由 provider 参数/preset schema/客户端选项纯逻辑单测 + test:dsh 增「目录路由薄写入过官方 Config schema」决定性证据与阴性对照 + 回环 live-check + 当前 GUI 实测（平台切换/面板/徽标/百炼链路不回退）。真实探测仅百炼（唯一有凭据平台）；其他平台验证到 UI/配置层，不宣称行为实测。
13. **发布**：本地升级（desktop profile link: 直连，plugin_manager remove→install 重载 host），不 git commit、不发 npm。文档全套：本共识 → plans → CHANGELOG 0.4.0 → VERIFICATION-v0.4.0 → README 重写。

## 不变量（继承 v0.1–v0.3）

- 不重写 LLM 适配器、不替换官方选择器；只经 configEditor 智能合并。
- 不删除用户模型；保留 provider 级用户字段；复用凭据引用；插件不自存密钥；探针/日志不输出密钥。
- 不改全局默认模型（除非用户点「设为默认」）；一次 apply 只动一个 provider 条目。
- 探针失败关闭、带超时、输出上限受控（completions/responses ≤512/1024，anthropic/google 按决策 6 的受控预算）。
- 浮层 React portal；Select 交互口径不变。

## 诚实边界

- 除百炼外无开发期实测；preset 元数据来自 pi-ai 官方目录快照或平台公开文档，evidence:null 明示未验证。
- 目录路由的「已验证」徽标＝运行时复验过行为，配置仍继承官方目录（除非手动编辑）——面板证据行明示。
- mistral 探针走 OpenAI 兼容端点，与其原生协议行为可能有细微差异；目录路由配置本身不受影响（保留原生协议）。
- anthropic budget 探测与 google 2.5 探测有真实 token 成本（每次复验每模型约数千 token），仅用户显式触发。