# dsh-model-hub 设计共识（grill-me 2026-11-16）

## 定位
官方 `@deepseek-ai/dsh-llm-pi-ai` 适配器**之上**的模型接入管理层。不重写适配器、不替换官方模型选择器。官方能力（reasoningEfforts/compat/modelOverrides/发现）齐全，缺的是易用性。

## 八项决策
1. **定位**：接入管理层，保留官方适配器 + 选择器。
2. **核心**：百炼实测模型库 + 一键接入；v0.1 只做百炼，架构留通用 preset 接口。
3. **UI**：嵌入官方 Models 页——`settings.models.footer` slot 放"百炼模型库"面板，`settings.models.provider-card` slot 放快捷状态。composer 选择器不动。
4. **验证**：开发期全量实测（16 对话模型 × effort/developer角色/工具/maxTokens字段/模态）+ 运行时"重新验证"按钮。
5. **应用**：`ctx.configEditor.edit()` + 智能合并——按 id 更新/新增、保留用户自加模型、不删除、复用 `ALIYUN_API_KEY`、只动 aliyun 条目。
6. **回退现场**：用户主动停了回答，非配置报错（风险信号解除）。
7. **边界**：不动全局默认模型；可选"设为默认"按钮；选择器徽标（`conversation.input.model.label` slot）；发现兜底（未知模型标"未验证"+可探测）。
8. **命名**：dsh-model-hub。

## 关键事实（探索所得）
- 桌面 app 0.2.2-rc.3 内置 dsh-llm-pi-ai 支持 `reasoningEfforts`（键枚举 off/minimal/low/medium/high/xhigh/max，值=wire 拼写，off 可空）、`compat`（supportsDeveloperRole/thinkingFormat/maxTokensField 等）。
- 官方选择器在模型声明推理元数据时显示 effort 行；当前裸 id/name 配置未声明 → 无 effort 行。
- 端点 `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` 实测：
  - `/models` 返回 23 模型，16 对话模型。
  - qwen4-max：`reasoning_effort=none/low/high/max` 全生效，none 关思考。
  - glm-5.3：user/developer 角色均 OK。
  - deepseek-v4.1-flash-1017：拒绝 developer 角色（400）→ 必须 `compat.supportsDeveloperRole:false`。
- 非对话模型（过滤）：wan2.7-image(-pro)、wan3.0-video、qwen-image-3.0-pro、qwen-audio-3.0-(tts/realtime/asr)。
- 官方设置页已有发现 + effort 编辑器 + 密钥管理，但**不暴露 compat**、发现只回裸 id、无批量接入、不做探测。

## 架构
- cordis bundle：host（index.js + lib/）+ web client（client/client.js，classic script 无构建）。
- host 服务经 ctx.get/inject；configEditor.entries() 找 llm-pi-ai 行 → edit()。
- 数据面：ctx.webServer 命名路由 /plugins/dsh-model-hub/*（进程 token + 回环，dsh-memory 模式）。
- client：__ModuleLoader__.load factory → {inject:['slots','locale'],apply}；ctx.slots.inject/register。
- 目录数据 presets/bailian.json（逐模型 evidence）；通用引擎 discover/probe/merge/apply。

## 共存
只碰 llm-pi-ai 的 aliyun 条目；reverse-proxy-connect（Qoder）、balance-pill、dsh-memory 不受影响；smart-router 当前未安装。

## 交付
v0.1.0；离线单测 + 真实宿主集成测试 + 验证报告；zh/en locale；装到 desktop profile。