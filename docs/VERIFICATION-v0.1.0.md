# dsh-model-hub v0.1.0 验证报告

日期：2026-11-16
环境：DeepSeek Harness 桌面 0.2.2-rc.3（app.asar 内置适配器）；npm 全局 dsh 0.2.2-alpha.3；web profile 用于 live 验证（desktop profile 由 Electron 独占，boot 需 app）。

## 1. 端点实测（开发期探针矩阵，scripts/probe-bailian.mjs）

端点 `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`，`/models` 返回 23 模型，16 对话模型入矩阵，15 可用（`decision-model-preview` 返回 url error，非对话端点，排除）。

| 模型 | developer 角色 | 工具 | 实测 effort 档位 |
|---|---|---|---|
| qwen4-max / qwen4-max-preview | 拒绝 | ok | off/minimal/low/medium/high/xhigh/max |
| qwen3.8-max / qwen3.8-flash | 拒绝 | ok | off/minimal/low/medium/high/xhigh/max |
| qwen3.7-max / qwen3.7-plus / qwen3.6-flash | 拒绝 | ok | off/minimal/low/medium/high/xhigh（无 max） |
| glm-5.3 | **接受** | ok | low/high/max |
| glm-5.2 | 拒绝 | ok | off/minimal/low/medium/high/xhigh/max |
| deepseek-v4-pro / deepseek-v4-pro-0813 | 拒绝 | ok | low/medium/high/xhigh/max（无 off） |
| deepseek-v4-flash-0731 / deepseek-v4.1-flash / deepseek-v4.1-flash-1017 | 拒绝 | ok | off/minimal/low/medium/high/xhigh/max |
| auto | 拒绝 | ok | minimal/low/medium/high/xhigh/max（无 off） |

effort 真实性佐证：qwen3.7-max  trivial 提示下 reasoning_tokens 随档位递增（low 127 < high 193 < xhigh 198），off/minimal 为 0。
结论：除 glm-5.3 外全部需 `compat.supportsDeveloperRole:false`；effort 档位逐模型不同，不能一刀切。

## 2. 单元 + 集成测试（68 项全过）

- `npm test`：60 项（config 7 / catalog 7 / merge 11 / routes 9 / discover 6 / probe 10 / client 10）。
- `npm run test:dsh`：8 项真实宿主集成——导入真实 `index.js`，忠实服务桩驱动 apply/status/discover/set-default；**决定性**：合并配置经官方 `dsh-llm-pi-ai` 自己的 `Config` schema 校验不抛错（接受），阴性对照确认非法 effort 键会抛错；保留其他 provider 与用户自加模型；evidence/recommended 不写入配置。

## 3. Live 验证（web profile，boot + 浏览器）

1. 安装：desktop 与 web profile 均 `link:` 接入 + bundles 追加；`plugin install` 成功；web `--dump-config` exit=0、dsh-model-hub 行正确插入、无 patch 警告。
2. 挂载：web boot 后插件激活（启动日志曾列 dsh-model-hub 等待 webServer，注入声明正确）。
3. UI：设置→模型 页 footer 渲染"百炼模型库 v0.1.0"面板（状态行/搜索/筛选/选中推荐/应用选中/发现/复验 + 15 张模型卡，徽标与逐模型档位正确）；aliyun 卡片内 provider-card 渲染"模型库接入·N 个模型·应用推荐"。截图 `_scratch/model-hub-ui-02-models.png`、`-03-fixed.png`。
4. 一键应用：选中推荐→应用选中后，web `cordis.patch.yml` 的 aliyun 写入 6 个推荐模型，逐模型 `reasoningEfforts`（含 glm-5.3 无 off、deepseek-v4-pro 无 off 差异）+ `compat.supportsDeveloperRole:false`（glm-5.3 除外）；YAML 注释与其他条目保留；`agent-default-model` 未变。
5. 选择器：composer 模型列表出现百炼分组 6 模型；选 qwen4-max 后推理等级子菜单显示 Default/Off/Minimal/Low/Medium/High/Xhigh/Max；选 Off 后 composer 显示"qwen4-max · Off"。截图 `_scratch/model-hub-ui-04-request.png`。

## 4. 发现并修复的 bug

cordis `Entry` 的 id/name/config 在 `entry.options` 下，无顶层 `id/name`。初版 `findPiAiEntry`/`setDefault` 用顶层字段导致 live 应用静默失败（no-adapter）。已改用 `options.id/options.name`，集成测试桩同步改为真实 Entry 形状以捕获此类回归。修复后 live 应用成功（见 3.4）。

## 5. 诚实边界（未验证项）

- **完整 live agent 回合未跑通**：web 富文本编辑器对自动化 fill/execCommand 不更新 React state，send 保持 disabled；npm CLI 的 headless 模式对 web profile 不可用。请求路径已逐组件验证（端点 effort/developer 行为实测 + 官方 schema 接受 + 选择器接线 + 落盘配置），但"发一条消息模型回 OK"的整回合未在自动化中执行。用户在 app 内发一条消息即可确认。
- **desktop 需重启加载**：desktop profile 由 Electron 独占，CLI 仅能 plugin install；插件已 link 安装，重启桌面 app 后面板可用。desktop 的 aliyun 仍为原裸配置，重启后经面板"应用选中"升级（未擅自改 desktop 配置）。
- `contextWindow/maxTokens` 为保守估计（1M/131072），非实测容量。
- 选择器徽标对非百炼 provider 透传原 name/badge，未做跨 provider 视觉回归截图。

## 6. 复跑

```powershell
npm run verify     # 68 项
npm run probe      # 刷新实测目录
```