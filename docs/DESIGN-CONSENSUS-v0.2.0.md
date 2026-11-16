# dsh-model-hub v0.2.0 设计共识（grill-me 2026-11-16）

基线：v0.1.0 已交付并在 desktop 生效（aliyun 6 推荐模型 + 逐模型 efforts/compat）。v0.1 面板只读；官方 Models UI 不能编辑 compat；容量为保守估计。

## 九项决策
1. **主线**：管理深度（面板可编辑 + 证据 + 重置 + 容量实测），不做选择器增强/通用化/纯质量加固。
2. **写回模型**：目录+配置双写。编辑先更新 runtime 目录；若模型已应用到 live 则同步经 configEditor 更新现网；config 写失败回滚目录编辑。未应用模型只改目录。
3. **编辑字段**：全字段 + 结构化 compat。contextWindow/maxTokens/input 模态/reasoningEfforts(档位+wire)/compat。
4. **容量策略**：maxTokens 可选"实测最大输出"（极小 prompt 二分探测 provider 接受的最大 max_tokens 参数，便宜）；contextWindow 保持估计/手动（实测输入太贵）；编辑可覆盖并标记来源（估计/实测/手动）。
5. **编辑 UI**：卡片内联展开编辑区（控件+证据摘要+实测按钮+保存/取消）；工具栏加"重置目录"。不新增导航/弹窗/抽屉。
6. **校验安全**：客户端即时字段校验 + 服务端纯函数 validate 镜像适配器 schema 约束 + configEditor.edit 权威校验；config 写失败回滚目录编辑并报错。
7. **compat 控件键**：三键聚焦 supportsDeveloperRole(开关)/thinkingFormat(下拉)/maxTokensField(下拉)。
8. **重置语义**：回 shipped preset，丢弃 runtime 编辑+发现新增；二次确认；不动 live 配置（需再应用才同步）。
9. **交付测试**：标准交付。version 0.2.0；新增单测+集成+client 纯逻辑测试；live web 验证；CHANGELOG+验证报告；desktop link 直连源码重启即加载。

## 架构增量（相对 v0.1）
- `lib/validate.js`：纯函数校验编辑草稿（数字正整数/模态枚举/effort 键枚举+wire 非空(off 可空)/compat 键子集+值枚举/至少一个非 off 档位或 false）。
- `lib/edit.js`：编辑合并（更新目录条目字段，保留 evidence/recommended；标记 capacitySource）；双写编排（目录写→若已应用则 configEditor.edit→失败回滚目录）。
- `lib/probe.js` 增 `probeMaxOutput({baseURL,apiKey,model,field})`：二分最大接受 max_tokens（极小 prompt，按参数值拒绝）。
- `lib/service.js` 增 `editModel(id, draft)`、`resetCatalog()`（已有，接 UI）、`measureMaxOutput(id)`。
- `lib/routes.js` 增 `POST /edit`、`POST /reset`、`POST /measure-max-output`。
- `client/client.js`：卡片内联展开编辑器（容量输入/模态复选/effort 档位行/compat 三控件/证据摘要/实测按钮/保存取消）+ 工具栏重置（二次确认）+ 纯逻辑 UMD 导出。
- 证据摘要：developerRole/tools/maxTokensField/efforts 表/testedAt/capacitySource。

## 不变量（继承 v0.1）
- 不删除用户模型；保留 provider 级用户字段；复用 ALIYUN_API_KEY；不改全局默认；探针极小请求+超时+失败关闭+不输出密钥；只动 aliyun 条目。

## 诚实边界
- contextWindow 仍可为估计/手动（标记来源）；max-output 实测为参数上限非真实输出能力保证。
- 双写回滚保证目录与现网不分叉；但 live 配置被外部（官方 UI/手改）改动时目录可能滞后，以 configEditor 组合结果为准。