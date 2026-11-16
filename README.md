# dsh-model-hub

面向 DeepSeek Harness 的**百炼模型接入管理层**：在官方 `@deepseek-ai/dsh-llm-pi-ai` 适配器之上，提供经实测的模型目录、一键智能合并应用、运行时复验与端点发现兜底，让官方模型选择器显示更多可用模型与推理强度档位。

不重写 LLM 适配器、不替换官方模型选择器——官方能力（`reasoningEfforts` / `compat` / 发现）齐全，缺的是易用性，本插件补这个。

## 它解决什么

- **模型少**：百炼 token-plan 端点实际提供 16 个对话模型，手工配置往往只写几个。本插件内置实测目录，一键接入。
- **推理强度不能设**：裸 `id/name` 配置不声明 `reasoningEfforts`，官方选择器就不显示 Effort 行。本插件逐模型声明实测档位（off/minimal/low/medium/high/xhigh/max 中该模型真正支持的子集）。
- **选了不能用**：多数百炼模型拒绝 `developer` 角色（DSH 默认用它发系统提示），导致每轮 400。本插件逐模型实测并写入 `compat.supportsDeveloperRole: false`。
- **配置易错**：手写 YAML 易踩坑。本插件经官方 `configEditor` 校验+原子写回，保留注释与其他 provider。

## 功能

- **百炼模型库面板**（嵌入官方 Models 设置页 footer）：模型卡片网格（上下文/最大输出/输入模态/推理档位/验证徽标）、搜索、筛选（全部/推荐/已验证/未验证）、选中推荐、应用选中、发现新模型、全部复验。
- **provider-card 快捷状态**（aliyun 卡片内）：已接入模型数 + 凭据状态 + 一键应用推荐。
- **选择器徽标**（`conversation.input.model.label` slot）：给官方选择器的百炼模型注入 推荐★/已验证✓ 内联徽标（非交互）。
- **智能合并应用**：按 id 更新/新增选中模型，保留用户自加模型，绝不删除；保留 `apiKeyEnv`/`baseURL`/`headers` 等用户字段；复用 `ALIYUN_API_KEY`；只动 aliyun 条目；不改全局默认模型（除非点"设为默认"）。
- **运行时复验**：单模型或全部重新探测（developer 角色/工具/maxTokens 字段/七档 effort），结果持久化到 `~/.dsh/.dsh-model-hub/catalog.json`。
- **发现兜底**：`GET {baseURL}/models`，过滤图像/音频/视频模型，未知模型标"未验证"并入目录（可复验后应用）。

## 安装

```powershell
# 桌面 profile（link 开发态）：编辑 ~/.dsh/profiles/desktop/package.json
#   dependencies 加 "dsh-model-hub": "link:D:/Questions/dsh-model-hub"
#   dsh.profile.bundles 追加 "dsh-model-hub"
# 然后（仅 Electron app CLI 可管理 desktop profile）：
dsh plugin --profile desktop install
# 重启 DeepSeek Harness 桌面 app 加载插件。
```

打开 设置 → 模型，页面底部即"百炼模型库"面板。点"选中推荐"→"应用选中"，composer 模型选择器即出现百炼模型与推理强度行。

## 配置

插件行 config（可选，默认见 `lib/config.js`）：

| 字段 | 默认 | 含义 |
|---|---|---|
| `enabled` | `true` | 关闭则不挂载数据面 |
| `providerId` | `aliyun` | 目标 pi-ai 路由键 |
| `apiKeyEnv` | `ALIYUN_API_KEY` | 复用的凭据引用 |
| `baseURL` | token-plan compatible-mode | 发现/复验端点 |
| `api` | `openai-completions` | 协议 |

## 测试

```powershell
npm test          # 60 项纯逻辑单测（config/catalog/merge/routes/discover/probe/client）
npm run test:dsh  # 8 项真实宿主集成（真实 index.js + 官方适配器 Config schema 校验 + 阴性对照）
npm run verify    # 两者一起
npm run probe     # 重跑开发期探针矩阵，刷新 presets/bailian.json
```

## 诚实清单

- `contextWindow`/`maxTokens` 为保守估计值（非实测）；行为（effort/developer 角色/工具/maxTokens 字段）已实测。
- 复验/发现需要 `ALIYUN_API_KEY` 经 harness 凭据 seam 可解析；探针请求 `max_tokens<=512`、带超时、失败关闭，绝不输出密钥。
- 桌面 profile 由 Electron app 独占管理：CLI 只能 `plugin install`，boot/dump 需 app；安装后需重启 app 加载。
- 选择器徽标经官方 label slot 注入；非百炼 provider 保持原样透传。

## 许可

MIT