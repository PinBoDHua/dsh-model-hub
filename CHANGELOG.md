# Changelog

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