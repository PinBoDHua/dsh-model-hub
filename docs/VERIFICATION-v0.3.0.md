# dsh-model-hub v0.3.0 验证报告（2026-11-16）

交付：5 处原生 `<select>` 全部替换为统一自定义无障碍下拉 `Select`（自 dsh-memory v0.31.1 行为等价移植），视觉+交互对齐记忆插件；顺带修复 locale meta 格式。 host 侧除 locale 资源与版本号外零改动。

## 1. 单元 / 集成测试（npm run verify）

- 单测 **101 项全过**（原 96 + 新增 5：filterOptions/devRoleOptions/levelOptions/formatOptions/fieldOptions/selectedIndexOf）。
- 集成 **14 项全过**（含官方适配器 Config schema 接受性、双写/回滚/reset/measure）。版本断言同步更新为 0.3.0。
- 合计 **115 项，0 失败**。`node --check client/client.js` 通过；面板内原生 `<select>` 残留 0。

## 2. 升级与 host 世代

- desktop profile 为 `link:D:/Questions/dsh-model-hub` 直连。按已验证流程 `plugin_manager remove_bundle → install_bundle(target=D:/Questions/dsh-model-hub)` 加载新 host 世代。
- `GET /plugins/dsh-model-hub/status` 回 `version:"0.3.0"`、provider mounted/configured（6 模型）、credential configured——确认运行世代已更新，非仅 inventory 读盘。

## 3. GUI 自动化（scripts/gui-check.mjs，Edge headless + CDP）

`node scripts/gui-check.mjs --url=http://127.0.0.1:52831/` → **30 通过，0 失败，0 跳过**，页面 JS 异常 0 条，全程只读（未发任何写操作请求）。覆盖：

1. 面板渲染：`.mh_panel` 存在、`.mh_ver`=v0.3.0、原生 select=0、触发器≥1。
2. 打开：浮层 role=listbox、aria-expanded=true、焦点移入浮层、4 选项带图标、选中项 aria-selected+check。
3. 键盘：ArrowDown 移高亮、Enter 选中+过滤+焦点回触发器。
4. Esc：只关浮层、焦点回触发器（外层设置弹窗保留）。
5. 点击外部关闭。
6. 等宽（±1px）+ position:fixed + z-index 1200（portal 到 body）。
7. 编辑器：内联展开、Select 齐备、30px 覆盖、level→off 禁用清空 wire / 选回恢复、type-ahead q→qwen、Esc、取消不保存。
8. 暗色：走宿主主题控件（设置→通用设置→深色）真实切换，浮层暗色 surface，测完恢复原主题。
9. 近底上翻。
10. 只读安全。

截图见 `docs/verification-assets-v0.3.0/`（01-panel / 02-filter-open / 03-filter-recommended / 04-esc-closed / 05-outside-closed / 06-equal-width / 07-editor-open / 07-editor-off / 08-typeahead-q / 09-editor-cancelled / 10-dark-pop / 11-flip-up）。

## 4. 人工 live 复核（ego 浏览器，同源 52831）

- 亮色打开筛选：等宽 140=140、portal 到 body、语义图标 layers/star/check/alert、选中打勾+主色软底。见 [01-filter-open-light.png](verification-assets-v0.3.0/01-filter-open-light.png)。
- 真实暗色（UI 切深色）：浮层 `#151b26`、选中项主色软底+浅字，与记忆插件暗色观感一致。见 [02-filter-open-dark.png](verification-assets-v0.3.0/02-filter-open-dark.png)。测毕恢复「跟随系统」。
- 编辑器 8 个下拉全 30px；level→off 联动、type-ahead、Esc/取消 均与自动化一致。

## 5. 关键机制说明（暗色为何必须走 UI）

宿主主题把 `--dsw-alias-*` 写成 **body 内联样式**，暗色时由主题插件统一改写内联令牌并挂 `body[data-ds-dark-theme]`。手动 `setAttribute` 不改内联令牌，浮层（读宿主令牌）会仍白——此为测试假象而非产品缺陷。Select 与 dsh-memory 同口径读宿主令牌，故真实暗色下正确跟随。gui-check 与人工复核均改用 UI 切换取证。

## 6. 诚实边界 / 已知问题（记录不动）

- 现有面板其余 CSS 引用的 7 个令牌名（line/bg-container/text-* 等）在本安装未定义、靠 fallback 渲染；新 Select 改用已核实定义的令牌。面板整体令牌迁移留待以后。
- devRole 保持三值下拉（与 v0.2 共识「开关」表述不一致，仅记录）。
- ModelLabel/ProviderCard 既有逻辑、Config schema、catalog 存储方式均未动。
- type-ahead 对中文 label 在 IME 下优雅降级（与 memory 一致）。
- 验证为只读+取消，未改动运行时目录/live 配置；编辑保存链路沿用 v0.2 已验证双写回滚。
