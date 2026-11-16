# Changelog

## 0.4.0 (2026-11-16)

多平台化：从「仅百炼」升级为 16 平台模型库（兑现 v0.1 共识预留的通用 preset 接口）。

- **16 平台注册表**（`lib/providers.js`）：百炼（已实测）/ DeepSeek / Kimi（月之暗面）/ 智谱 GLM / 硅基流动 / 火山方舟（豆包）/ MiniMax / OpenAI / Anthropic Claude / Google Gemini / OpenRouter / Groq / xAI Grok / Mistral / Together AI / Cerebras。另支持 config.providers 声明任意 OpenAI 兼容自定义网关（空目录 + 发现兜底）。
- **四协议探测引擎**（`lib/protocols.js` 分发）：openai-completions（原 probe.js 不变）、openai-responses（reasoning.effort / max_output_tokens / 扁平 tools）、anthropic-messages（adaptive effort 与 budget_tokens 双形态自动判定，x-api-key + anthropic-version）、google-generative-ai（thinkingLevel 大写档位 / thinkingBudget 双形态，x-goog-api-key）。发现方言：OpenAI /models、Anthropic /v1/models、Google /models（generateContent 过滤）。
- **目录路由薄写入**：pi-ai 内置目录平台 apply 只写 `{id,name}` + 用户手动编辑字段（manualFields 追踪），容量/协议/推理元数据继承官方目录——避免 maxTokens 变成请求 cap、避免 effort 派生不忠实、随 pi-ai 升级永不落后。自定义路由（百炼/智谱/硅基/火山）保持全量声明。
- **verify 分层**：自定义路由探测→派生→双写（compat 证据驱动合并，保留 preset 已知 thinkingFormat 等键）；目录路由仅记录 evidence，手动编辑才写配置。面板明示该差异。
- **preset 来源分层**：13 个目录/智谱 preset 由 `scripts/gen-presets.mjs` 从本机 pi-ai 官方目录提取（精选 + 推荐标记 + 展示快照，零缺失 id）；硅基流动/火山方舟为发现优先空目录（discoveryHint 空态提示）。除百炼外全部 evidence:null 诚实标未验证。
- **协议门禁**：validate/编辑器按官方 COMPAT_GATES 口径隐藏/拒绝不适用 compat 键（responses 仅 devRole；anthropic/google/mistral 三键均拒）；实测最大输出仅 completions 支持，其余诚实返回不支持。
- **多平台 UI**：面板标题改「模型库 / Model Hub」+ 平台 Select（16 选项、已接入数 hint、切换竞态守卫）；逐平台状态/凭据/发现/复验/重置；目录路由提示行；provider-card 泛化到全部 hub 平台；选择器徽标经 hub 目录索引缓存修复并泛化（v0.3 徽标因 slot model 不含 evidence 实为死代码，本版实证生效）。
- **存储迁移**：runtime 逐平台 `catalogs/<id>.json`；旧 `catalog.json` 首启迁移为 `catalogs/aliyun.json`（保留原件）。
- **向后兼容**：旧路由/payload 不变（provider 可选，缺省 aliyun）；旧 config 字段语义不变；新增 GET /providers 与 ?provider= 查询。
- **openrouter 统一协议**：routeApi=openai-completions（其目录 396 模型混合协议，统一后发现的模型可解析；文档明示原生直通优化损失）。
- 测试：193 项（170 单测 + 23 集成，含目录路由薄写入/协议门禁/迁移/派生合并过官方 Config schema 决定性证据与阴性对照）；gui-check 增检查 11（多平台 UI）/12（选择器徽标），36 项 GUI 断言全过、0 页面异常、只读安全审计通过。
- 文档：DESIGN-CONSENSUS-v0.4.0 / plans / VERIFICATION-v0.4.0 / README 重写。

## 0.3.0 (2026-11-16)

下拉体验对齐 dsh-memory：5 处原生 `<select>` 全部替换为统一自定义无障碍下拉 `Select`。

- **自定义 Select**：button 触发器 + `ReactDOM.createPortal` 到 body 的 fixed listbox 浮层，彻底主题化（宿主 `--dsw-alias-*` 令牌 + `body[data-ds-dark-theme]` 暗色分支），消除原生 select 展开层（系统白底/蓝高亮）与页面风格的割裂。自 dsh-memory v0.31.1 Select 行为等价移植（类名改 `mh_select_*`、id 前缀 `mh-sel-`）。
- **交互全套**：ArrowUp/Down/Home/End/Enter/Space/Esc/Tab、type-ahead 前缀跳选（600ms 缓冲）、点击外部关闭、滚动/缩放重定位、近底上翻、浮层严格等宽（间隙 4px、视口 8px 夹取）、选中打勾加粗主色软底、全套 ARIA（haspopup/expanded/controls/activedescendant/listbox/option/selected/disabled）、首帧隐藏 + 定位后延迟聚焦。
- **5 处替换**：工具栏筛选（32px ghost，语义图标 layers/star/check/alert）+ 编辑器 effort 档位 / developer 角色 / 思考格式 / 输出字段（技术枚举纯文本，内联紧凑 30px，`.mh_editor` 覆盖）。
- **动效克制**：仅 .12s 淡入；`prefers-reduced-motion` 关闭动画/过渡；禁用态压过 hover。
- **纯逻辑**：选项构造 filterOptions/devRoleOptions/levelOptions/formatOptions/fieldOptions + selectedIndexOf（String 宽松比较），UMD 导出 + 单测。
- **合规修复**：locale/zh.json、en.json 改官方 `meta.title/meta.description` 格式（Plugin Manager 不再回退 package.json）；英文标题 sentence case（Model hub）。
- **无缝兼容**：筛选值/编辑草稿保持内存态；路由/payload/catalog 存储结构不变；devRole 三值语义不变；官方 composer 选择器不动。
- 测试：115 项（101 单测 + 14 集成）；新增 `scripts/gui-check.mjs`（Edge headless + CDP：打开/焦点/键盘/Esc/点外/等宽/暗色）。

## 0.2.0 (2026-11-16)

管理深度：面板从只读升级为可编辑。

- **逐模型内联编辑器**：上下文/最大输出/输入模态/推理档位行（增删+level+wire）/结构化 compat 三控件（supportsDeveloperRole/thinkingFormat/maxTokensField）/实测证据摘要/保存取消。
- **目录+配置双写**：编辑先更新 runtime 目录；已应用模型同步经 configEditor 更新 live 配置；config 写失败回滚目录编辑；未应用模型只改目录。
- **双层校验**：客户端即时校验 + 服务端 `lib/validate.js` 镜像适配器 schema 约束 + configEditor 权威校验。
- **max-output 实测**：`probeMaxOutput` 极小 prompt 二分探测 provider 接受的最大 max_tokens；clamp 型端点（不拒绝超大值）返回 measured:false 并提示，容量保持手动/估计。
- **容量来源标记** capacitySource（estimate/manual/measured），不写入适配器配置。
- **重置目录**：工具栏两步确认，回 shipped preset、丢弃 runtime 编辑/发现新增、不动 live 配置。
- 新增路由 `POST /edit` `/reset` `/measure-max-output`。
- 测试：110 项（96 单测 + 14 集成，含双写/回滚/未应用/reset/measure/官方 schema）。

## 0.1.0 (2026-11-16)

首个版本：百炼模型接入管理层。

- 实测百炼目录 `presets/bailian.json`：15 个可用对话模型（排除 decision-model-preview 非对话端点），逐模型证据（developer 角色/工具/maxTokens 字段/七档 effort）。
- 一键智能合并应用：经官方 `configEditor.edit()` 写回 `llm-pi-ai` 的 aliyun 条目；按 id 更新/新增、保留用户自加模型与 provider 级字段、复用凭据、不改全局默认。
- 官方 Models 页 footer"百炼模型库"面板 + provider-card 快捷状态 + 选择器 label 徽标。
- 运行时复验（单模型/全部）与端点发现兜底（过滤非对话模型、未知标未验证）。
- 修复：cordis `Entry` 的 id/name 位于 `entry.options`，findPiAiEntry/setDefault 改用 `options.id/options.name`（live 验证发现）。
- 测试：60 单测 + 8 真实宿主集成（含官方适配器 Config schema 接受性校验与阴性对照）。