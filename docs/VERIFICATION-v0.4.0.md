# dsh-model-hub v0.4.0 验证报告（2026-11-16）

交付：多平台化——16 平台注册表 + 四协议探测/发现引擎 + 目录路由薄写入 + 多平台 UI（平台切换/provider-card 泛化/选择器徽标修复）+ 存储迁移 + 向后兼容。设计依据见 [DESIGN-CONSENSUS-v0.4.0.md](DESIGN-CONSENSUS-v0.4.0.md)。

## 1. 单元 / 集成测试（npm run verify）

- 单测 **170 项全过**：原 101 项保绿（config/catalog/merge/validate/edit/discover/probe/routes/client）+ 新增 69 项（providers 注册表/覆盖/自定义网关、protocols 三方言 stub 探针/派生门禁/发现方言、presets 16 平台形状/诚实标注/协议白名单、multi-service 薄写入/verify 分层/派生合并/迁移/逐平台持久化、merge stripEntryFor/routeApi、edit manualFields、validate 协议门禁、client providerOptions/compatVisible）。
- 集成 **23 项全过**（原 14 + 新增 9）：真实 index.js 挂载，官方 `dsh-llm-pi-ai` Config schema 决定性校验——deepseek/anthropic/google/mistral 薄写入、openrouter routeApi、zhipu 全量声明、手动 efforts 编辑、用户模型共存均被接受；阴性对照（非法 effort 键）被拒绝。
- 合计 **193 项，0 失败**。`node --check client/client.js` 通过。
- **schema 世代差异（诚实记录）**：集成测试用 npm 全局 alpha.3 适配器，其对协议 compat 门禁较宽松（anthropic 模型写 thinkingFormat 也接受）；桌面安装版 rc.3 源码 `COMPAT_GATES` 明确 anthropic/mistral 不提供该键（调研证据：`dsh-llm-pi-ai/src/catalog.ts` L294-L318/L338-L346）。故协议门禁的阴性证据以 hub 镜像门禁 400 + rc.3 源码为准，alpha 仅证结构接受性。

## 2. 升级与 host 世代

- desktop profile `link:D:/Questions/dsh-model-hub` 直连；`plugin_manager remove_bundle → install_bundle(target=D:/Questions/dsh-model-hub)` 加载新 host（application: applied，version 0.4.0）。
- `GET /plugins/dsh-model-hub/status`（回环 52831）回 `version:"0.4.0"`、`providers` 16 项；aliyun mounted/configured（6 模型，用户既有配置原样）、credential configured（source: file）；deepseek configured:false/credential:false——运行世代已更新且未触碰用户配置。

## 3. 回环 live 验证（真实 host + 真实凭据 seam）

- `GET /providers` → 16 平台摘要（kind: custom/catalog）。
- `GET /catalog?provider=anthropic` → 13 模型，claude-opus-5-5 thinkingStyle:adaptive、evidence:null（未验证诚实标注）。
- `GET /catalog`（缺省）→ aliyun 15 模型（runtime 优先于 preset）。
- **迁移实证**：`~/.dsh/.dsh-model-hub/catalog.json`（原件保留）+ `catalogs/aliyun.json`（迁移产物）并存。
- **无凭据诚实失败**：`POST /verify {provider:'deepseek'}` → 400 `missing credential DEEPSEEK_API_KEY`。
- **百炼真实复验**：`POST /verify {modelIds:['qwen3.6-flash'],provider:'aliyun'}` → 200 verified:1；evidence：developer rejected / tools ok / max_tokens / efforts off·minimal·low·medium·high·xhigh 通过——与 preset 实测一致，多平台服务下原探针链路不回退。

## 4. GUI 自动化（scripts/gui-check.mjs，Edge headless + CDP）

`node scripts/gui-check.mjs --url=http://127.0.0.1:52831/` → **36 通过，0 失败，0 跳过**，页面 JS 异常 0 条，全程只读（检查 10 审计未发任何写请求）。

- 检查 1–9：v0.3 全部交互保绿（面板渲染 v0.4.0/筛选键盘/Esc/点外/等宽/编辑器/暗色/近底翻转）。
- 检查 11（新增）：平台切换行默认百炼；平台下拉 16 选项；切 DeepSeek → 目录变 deepseek 模型 + 目录路由提示行出现 + 凭据缺失状态；切回百炼 → 目录恢复、提示行消失（custom 路由）；provider-card ≥1 行。
- 检查 12（新增）：composer 模型菜单钻取后，aliyun 模型行带 hub 徽标（★/✓，经目录索引缓存）——**修复 v0.3 死代码**（label slot 的 model 不含 evidence/recommended，旧 badgeKind 永远 unverified）；非 hub provider 原样透传。只开菜单不点选，会话选择不变。

截图见 `docs/verification-assets-v0.4.0/`（01-panel … 11-flip-up 沿用 v0.3 编号 + 12-provider-open / 13-provider-deepseek / 14-provider-cards / 15-selector-badges）。

## 5. 视觉复核

- [13-provider-deepseek.png](verification-assets-v0.4.0/13-provider-deepseek.png)：面板「模型库 v0.4.0」+ 平台 Select（DeepSeek）+ 目录路由提示 + 状态行（适配器已挂载/未接入·0 个模型/凭据缺失）+ 两张推荐卡（1M/384K、档位 low/high/max/off）；aliyun 官方卡片内 provider-card「模型库接入·6 个模型·应用推荐」。扁平克制、跟随宿主主题，无装饰性 AI 味。
- [15-selector-badges.png](verification-assets-v0.4.0/15-selector-badges.png)：模型菜单「阿里云百炼」组 glm-5.3★/deepseek-v4.1-flash-1017★/qwen4-max★，触发器 qwen4-max★；Trae/Kimi/GPT（reverse-proxy-connect）无徽标透传。

## 6. 诚实边界

- 真实网络探测仅百炼（本机唯一可解析凭据 ALIYUN_API_KEY）。其余 15 平台验证到 UI/配置/协议 stub 层；preset 元数据来自 pi-ai 官方目录快照（gen-presets 零缺失 id）或文档基线，evidence:null 明示，待用户填凭据后复验。
- 目录路由薄写入的官方接受性由 alpha.3 schema + rc.3 源码门禁调研共同背书；未在 live profile 对他平台执行 apply（不擅自改用户配置）。
- anthropic/google 探针有真实 token 成本（budget 探针受控 ≤5120/2560），仅用户显式触发；google 2.5 系 medium/high 不探（诚实标未测）。
- OpenRouter routeApi 统一协议、Mistral 探测端点差异见 README 诚实清单。