# dsh-model-hub v0.2.0 验证报告

日期：2026-11-16
环境：桌面 0.2.2-rc.3；web profile 用于 live 验证（link 直连源码）。

## 1. 测试（110 项全过）

- `npm test`：96 项单测（config/catalog/merge/validate/edit/discover/probe/routes/client）。
  - validate：非法容量/模态/effort 键/仅 off/空 wire/compat 非法键与枚举/非布尔 devRole 全拒绝；off wire null 合法；compat 空对象合法。
  - edit：applyEdit 保留 evidence/recommended、容量标 manual、compat 空清除、不可变。
  - probe：probeMaxOutput 二分命中阈值（131072/65536）、clamp 全接受→measured:false、缺密钥抛错。
  - client：draftFromEntry/draftToPayload roundtrip、off 空 wire→null、非推理→false、compat 未设置不写入、clientValidate 抓非法。
- `npm run test:dsh`：14 项集成（真实 index.js + 官方 Config schema）。
  - edit 双写：已应用模型同步目录+live，过官方 schema，capacitySource 不写入配置。
  - edit 非法 400 且不写；未应用只改目录不写 live；**双写失败回滚目录**；measure 二分双写；reset 回 preset。

## 2. Live 验证（web profile + 浏览器）

1. **编辑器渲染**：qwen4-max 卡片展开内联编辑器——容量输入+实测按钮、模态复选、推理开关、七档行（select+wire+删除+加档位）、compat 三控件、证据摘要（developer 拒绝/tools 支持/max_tokens/日期/容量来源）、保存取消。截图 `_scratch/model-hub-v02-editor.png`。
2. **编辑双写**：最大输出改 65536 + 思考格式改 qwen → 保存。web `cordis.patch.yml` qwen4-max `maxTokens: 65536` + compat thinkingFormat qwen；runtime catalog `capacitySource:{context:manual,maxOutput:manual}` + compat qwen。两存储一致。
3. **实测按钮**：点击后对真实端点二分探测。实测发现 token-plan 端点对超大 max_tokens **不拒绝**（2000000/131073/65537 均 200，clamp 型），故 probeMaxOutput 正确返回 measured:false，UI 提示"无法实测"，容量保持 manual。**这是设计内的诚实失败保护，非 bug**；clamp 型端点无法用拒绝法测上限，需手动设容量。
4. **重置两步确认**：点"重置目录"→变"确认重置?"→点击→目录回 preset（qwen4-max maxTokens 131072、capacitySource 清除、compat 回 preset 值），**live 配置不动**（符合语义）。
5. **重应用 reconcile**：重置后"选中推荐→应用选中(6)"使 live 回到 preset（131072），目录与现网重新一致。

## 3. 诚实边界

- clamp 型端点（如本 token-plan）max-output 拒绝法不可测 → measured:false；容量靠手动/估计。contextWindow 仍不实测（输入计费贵）。
- 重置只影响目录；live 与目录可短暂分叉，需重应用 reconcile（设计语义）。
- 桌面 profile 由 Electron 独占；v0.2 经 link 直连，**重启桌面 app 即加载**，无需重装。
- web 恢复用户桌面旧会话时报 "team/mode event unknown"（该会话由更新 harness 写入），与插件无关，不影响 Models 页验证。

## 4. 复跑

```powershell
npm run verify   # 110 项
```