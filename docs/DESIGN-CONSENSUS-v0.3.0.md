# dsh-model-hub v0.3.0 设计共识（grill-me 2026-11-16）

基线：v0.2.0 已交付（内联编辑器 + 目录/配置双写回滚 + max-output 实测）。面板内 5 个下拉框全部是原生 `<select>`，展开弹层由 OS 渲染、不跟随主题。对齐基准：dsh-memory v0.31.1 的自定义无障碍 `Select`（0.8.0 引入替换全部原生 select，0.8.1 打磨等宽对齐，0.24.1 修复键盘/Esc 焦点）——button 触发器 + `ReactDOM.createPortal` 到 body 的 fixed listbox，约 190 行受控 React 组件，7 处复用，无搜索无分组。

## 十二项决策（grill-me 两轮 + 最终确认）

1. **范围**：聚焦下拉框重做，不擅自扩范围；顺带项仅限决策 11 的 locale 格式修复。
2. **基准**：视觉 + 交互都对齐 dsh-memory 的 Select。
3. **痛点**：无额外痛点，「和记忆插件一样」即目标。
4. **兼容**：现有配置无缝兼容——筛选值/编辑草稿保持内存态；路由、payload、catalog 存储结构一律不动。
5. **发布**：本地升级（desktop/web profile 均 link: 直连）+ 当前 GUI 实测；不 git commit、不发 npm。
6. **替换范围**：全部 5 处原生 select 换统一 Select——工具栏筛选（all/recommended/verified/unverified）+ 编辑器 effort 档位 level（7 档）/devRole（''/false/true）/thinkingFormat（''+11 格式）/maxTokensField（''+2 字段）。
7. **移植方式**：拷贝组件 + CSS + 图标路径适配进 `client/client.js` 单文件；类名 `mh_select_*`、id 前缀 `mh-sel-`；零跨插件依赖（memory 未导出 Select；DSH 官方禁止 require 宿主组件包，指引即「复制控件改名换前缀」）。
8. **功能与视觉口径**：交互全套移植——键盘（ArrowUp/Down/Home/End/Enter/Space/Esc/Tab）、type-ahead 前缀跳选（600ms 缓冲）、点击外部关闭、滚动/缩放重定位、近底上翻、浮层严格等宽、间隙 4px、视口 8px 夹取、选中打勾加粗主色软底、全套 ARIA（haspopup/expanded/controls/activedescendant/listbox/option/selected/disabled）、首帧隐藏 + 定位后延迟聚焦、.12s 淡入、`prefers-reduced-motion` 媒体查询。**无搜索框、无分组**（memory 也没有）；**不加「关闭动效」设置项**（model-hub 无此设置，不扩范围）。图标口径对齐 memory：语义选项配图标（筛选四项：全部=layers / 推荐=star / 已验证=check / 未验证=alert，路径取自 memory ICONS 字典），技术枚举（level/devRole/格式/字段）纯文本。尺寸场景映射：工具栏触发器 32px ghost（minWidth 140），编辑器内联紧凑 30px（对应 memory 设置页场景，`.mh_editor` 覆盖，max-width 240px）。
9. **验证**：现有 110 项测试保绿 + 新增选项构造/值匹配纯逻辑单测 + 新增 `scripts/gui-check.mjs`（Edge headless + CDP，借鉴 memory 成熟做法：打开→焦点入浮层→ArrowDown 移高亮→Esc 关闭且焦点回触发器、点击外部关闭、暗色分支）+ 当前 GUI 实测 settings.models 面板。
10. **文档**：沿仓库惯例全套——本共识 → `plans/2026-11-16-v0.3.0.md` → 实施 → CHANGELOG 0.3.0 → `VERIFICATION-v0.3.0.md`。
11. **顺带修复**：仅 `locale/zh.json`、`en.json` 改官方 `meta.title/meta.description` 格式（host-plugin.md L31-L42；现状顶层 name/description 导致 Plugin Manager 回退 package.json）。英文标题按官方 sentence case（Model hub）。其余调查发现记录不动。
12. **微观口径**：图标映射、minWidth（筛选 140 / level 110 / devRole 100 / 格式 170 / 字段 180）、编辑器 30px、reduced-motion 仅媒体查询、浮层 z-index 1200，均按最终确认汇总执行。

## 架构增量（相对 v0.2）

- `client/client.js` factory 内新增 `Select` 受控组件（自 dsh-memory client.js L2708-L2896 行为等价拷贝 + dm→mh 改名）；最小 `ICONS` 字典（chevD/check/layers/star/alert/info）+ `Icon` 组件；factory 头部补 `useLayoutEffect`/`ReactDOM = require('react-dom')`/`selectSeq`。
- 纯逻辑新增（UMD 导出 + node 单测）：`filterOptions(t)`/`devRoleOptions(t)`/`levelOptions()`/`formatOptions(t)`/`fieldOptions(t)`/`selectedIndexOf(options,value)`（String 宽松比较，Select 内部复用）。
- CSS 新增：`--mh-*` 派生令牌块（作用域 `.mh_panel,.mh_select_pop` + `body[data-ds-dark-theme]` 暗色分支；引用的宿主令牌均已核实存在于本安装 0.2.2-rc.3）+ `mh_select_*` 全套规则 + `.mh_editor` 场景覆盖 + `@keyframes mh_fade` + reduced-motion + 禁用态压过 hover；移除本次改动孤儿化的 `.mh_select`/`.mh_esel` 两条旧规则。
- locale：ZH/EN 字典增 `filterLabel` 键（筛选下拉 aria-label）；`locale/*.json` 改 meta 格式。
- `tests/client.test.mjs` 增选项构造/值匹配测试；`scripts/gui-check.mjs` 新增。

## 不变量（继承 v0.1/v0.2）

- 不删除用户模型；保留 provider 级用户字段；复用凭据；不改全局默认；只动 aliyun 条目。
- 路由、payload、catalog 存储结构不变；devRole 保持三值语义（''=未设置不写入 compat）。
- 不替换官方 composer 模型选择器（只注入 label 徽标，非交互）。
- 浮层为 React portal 管理渲染（与官方 ModelSelect.tsx 同形态），随组件卸载清理，非「组件外写 DOM」。

## 已知问题（记录，本次不动）

- 现有面板 CSS 引用的 7 个令牌名（--dsw-alias-line/bg-container/text-primary/text-caption/text-secondary/fill-hover/brand）在本安装主题包中**未定义**，实际靠 fallback 字面值渲染；新 Select 改用 memory 验证过的已定义令牌（bg-base/bg-layer-1/label-primary/secondary/tertiary/border-l1/l2/state-business-primary）。面板整体令牌迁移留待以后。
- devRole 实现为三值下拉，与 v0.2 共识「开关」表述不一致（本次保持三值下拉，不改语义）。
- ModelLabel 未消费 slot 的 placement/selected props；ProviderCard 未用 owner 的 configured/keyConfigured；无 Config schema（激活期不校验行 config）；catalog 直接 fs 写未走 ctx.storage；客户端 LEVELS/FORMATS/MAXFIELDS 与服务端 lib/validate.js 各自硬编码。
- type-ahead 对 label 前缀匹配，中文 label 在 IME 下优雅降级（与 memory 一致，非缺陷）。

## 诚实边界

- Select 为行为等价拷贝 + 改名，非重写；交互正确性由 gui-check 自动化 + 当前 GUI 实测背书，不凭安装成功宣称视觉成功。
- 编辑器内联场景无 Modal，不需要 memory 的弹窗 Esc 让路逻辑；Select 自身 Esc preventDefault + stopPropagation 已防止误关外层。
