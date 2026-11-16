/**
 * dsh-model-hub 浏览器客户端 —— 手写 classic script，无构建步骤。
 * 纯逻辑函数经 UMD 尾部导出供 node 单测；浏览器侧注册惰性 factory。
 * 与 dsh-memory 同一产物形态：window.__ModuleLoader__.load。
 *
 * UI：官方 Models 设置页 footer 槽（模型库面板）+ provider-card 槽（aliyun 快捷状态）
 * + conversation.input.model.label 槽（选择器已验证/推荐徽标，非交互内联）。
 * 数据面：同源 fetch /plugins/dsh-model-hub/*（进程级 token，写操作带 X-RPC-Key）。
 * 视觉：扁平克制、跟随宿主明暗主题（--dsw-alias-* 令牌 + body[data-ds-dark-theme]）。
 */
(function (global) {
  'use strict'

  // ===== 纯逻辑（node 可测） =====

  function nextToken(current, response) {
    var payload = response && response.payload
    if (payload && typeof payload.key === 'string' && payload.key !== '') return payload.key
    if (response && response.status === 403) return ''
    return current || ''
  }

  function toggleId(selected, id) {
    var out = (selected || []).slice()
    var i = out.indexOf(id)
    if (i >= 0) out.splice(i, 1)
    else out.push(id)
    return out
  }

  function badgeKind(model) {
    if (model && model.recommended) return 'recommended'
    if (model && model.evidence) return 'verified'
    return 'unverified'
  }

  function filterModels(models, query, filter) {
    var q = String(query || '').trim().toLowerCase()
    var list = Array.isArray(models) ? models : []
    return list.filter(function (m) {
      if (filter === 'recommended' && !m.recommended) return false
      if (filter === 'verified' && !m.evidence) return false
      if (filter === 'unverified' && m.evidence) return false
      if (!q) return true
      return String(m.id).toLowerCase().indexOf(q) >= 0 || String(m.name || '').toLowerCase().indexOf(q) >= 0
    })
  }

  function effortSummary(reasoningEfforts) {
    if (!reasoningEfforts) return null
    var keys = Object.keys(reasoningEfforts)
    return keys.length ? keys.join(' / ') : null
  }

  function fmtTokens(n) {
    var v = Number(n)
    if (!isFinite(v) || v <= 0) return '—'
    if (v >= 1000000) return (v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1) + 'M'
    if (v >= 1000) return (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'K'
    return String(v)
  }

  // ===== v0.2 编辑纯逻辑 =====

  var LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
  var FORMATS = ['openai', 'deepseek', 'openrouter', 'together', 'baseten', 'zai', 'qwen', 'chat-template', 'qwen-chat-template', 'string-thinking', 'ant-ling']
  var MAXFIELDS = ['max_tokens', 'max_completion_tokens']

  // 目录条目 → 编辑器草稿（efforts 拆成行，compat 拆成三控件值，''=未设置）
  function draftFromEntry(entry) {
    var re = entry && entry.reasoningEfforts
    var rows = []
    if (re && typeof re === 'object') {
      for (var k in re) rows.push({ level: k, wire: re[k] === null ? '' : String(re[k]) })
    }
    var c = (entry && entry.compat) || {}
    return {
      contextWindow: entry ? entry.contextWindow : undefined,
      maxTokens: entry ? entry.maxTokens : undefined,
      input: ((entry && entry.input) || ['text']).slice(),
      reasoning: re !== false,
      rows: rows,
      devRole: c.supportsDeveloperRole === undefined ? '' : String(c.supportsDeveloperRole),
      thinkingFormat: c.thinkingFormat || '',
      maxTokensField: c.maxTokensField || '',
    }
  }

  // 编辑器草稿 → 服务端 draft
  function draftToPayload(d) {
    var re = false
    if (d.reasoning) {
      re = {}
      for (var i = 0; i < d.rows.length; i++) {
        var r = d.rows[i]
        re[r.level] = r.level === 'off' ? (r.wire === '' ? null : r.wire) : r.wire
      }
    }
    var compat = {}
    if (d.devRole !== '') compat.supportsDeveloperRole = d.devRole === 'true'
    if (d.thinkingFormat !== '') compat.thinkingFormat = d.thinkingFormat
    if (d.maxTokensField !== '') compat.maxTokensField = d.maxTokensField
    return {
      contextWindow: Number(d.contextWindow),
      maxTokens: Number(d.maxTokens),
      input: d.input.slice(),
      reasoningEfforts: re,
      compat: compat,
    }
  }

  // 客户端即时校验（服务端 validate 仍权威）
  function clientValidate(d) {
    var errs = []
    if (!Number.isInteger(Number(d.contextWindow)) || Number(d.contextWindow) <= 0) errs.push('contextWindow')
    if (!Number.isInteger(Number(d.maxTokens)) || Number(d.maxTokens) <= 0) errs.push('maxTokens')
    if (!d.input.length) errs.push('input')
    if (d.reasoning) {
      if (!d.rows.some(function (r) { return r.level !== 'off' })) errs.push('effort-level')
      for (var i = 0; i < d.rows.length; i++) {
        var r = d.rows[i]
        if (r.level !== 'off' && !String(r.wire).trim()) errs.push('effort-wire')
      }
      var seen = {}
      for (var j = 0; j < d.rows.length; j++) { if (seen[d.rows[j].level]) errs.push('effort-dup'); seen[d.rows[j].level] = 1 }
    }
    return errs
  }

  // ===== v0.3 下拉选项纯逻辑 =====

  function filterOptions(t) {
    return [
      { value: 'all', label: t('filterAll'), icon: 'layers' },
      { value: 'recommended', label: t('filterRecommended'), icon: 'star' },
      { value: 'verified', label: t('filterVerified'), icon: 'check' },
      { value: 'unverified', label: t('filterUnverified'), icon: 'alert' },
    ]
  }

  function devRoleOptions(t) {
    return [{ value: '', label: t('unset') }, { value: 'false', label: 'false' }, { value: 'true', label: 'true' }]
  }

  function levelOptions() {
    return LEVELS.map(function (L) { return { value: L, label: L } })
  }

  function formatOptions(t) {
    return [{ value: '', label: t('unset') }].concat(FORMATS.map(function (f) { return { value: f, label: f } }))
  }

  function fieldOptions(t) {
    return [{ value: '', label: t('unset') }].concat(MAXFIELDS.map(function (f) { return { value: f, label: f } }))
  }

  // Select 值匹配：String 宽松比较（与 dsh-memory 同口径），未命中 -1
  function selectedIndexOf(options, value) {
    var list = Array.isArray(options) ? options : []
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].value) === String(value)) return i
    }
    return -1
  }

  // ===== locale =====

  var NS = 'dsh-model-hub'
  var ZH = {
    title: '百炼模型库', subtitle: '实测目录 · 一键接入 · 智能合并',
    search: '搜索模型 id / 名称', filterLabel: '筛选模型', filterAll: '全部', filterRecommended: '推荐', filterVerified: '已验证', filterUnverified: '未验证',
    selectRecommended: '选中推荐', clear: '清空选择', applySelected: '应用选中', discover: '发现新模型', verifyAll: '全部复验',
    context: '上下文', maxOutput: '最大输出', input: '输入', effort: '推理档位', effortNone: '非推理',
    recommended: '推荐', verified: '已验证', unverified: '未验证',
    setDefault: '设为默认', verify: '复验', text: '文本', image: '图片',
    mounted: '适配器已挂载', notMounted: '适配器未挂载', configured: '已接入', notConfigured: '未接入',
    credentialOk: '凭据就绪', credentialMissing: '凭据缺失', modelsUnit: '个模型',
    loading: '加载中…', empty: '没有匹配的模型', loadError: '加载失败',
    toastApplied: '已应用 {n} 个模型', toastDiscovered: '发现 {n} 个模型，新增 {a} 个', toastVerified: '已复验 {n} 个模型',
    toastDefault: '已设为默认：{m}', toastError: '操作失败：{e}', retry: '重试',
    cardTitle: '模型库接入', applyRecommended: '应用推荐', selectorBadge: '已验证',
    edit: '编辑', collapse: '收起', save: '保存', cancel: '取消', measure: '实测最大输出', measuring: '实测中…',
    reset: '重置目录', resetConfirm: '确认重置?', reasoningModel: '推理模型', addLevel: '加档位', level: '档位', wire: 'API 值',
    compatDev: 'developer 角色', compatFormat: '思考格式', compatField: '输出字段', unset: '默认',
    evidence: '实测证据', capacitySource: '容量来源', estimate: '估计', manual: '手动', measured: '实测',
    toastEdited: '已保存 {m}', toastReset: '目录已重置', toastMeasured: '{m} 最大输出实测 {v}', toastMeasureFail: '无法实测：{r}',
    errFields: '字段无效：{f}', devOk: '接受', devRejected: '拒绝', toolsOk: '支持', toolsFail: '不支持',
  }
  var EN = {
    title: 'Bailian Model Hub', subtitle: 'Verified catalog · one-click apply · smart merge',
    search: 'Search model id / name', filterLabel: 'Filter models', filterAll: 'All', filterRecommended: 'Recommended', filterVerified: 'Verified', filterUnverified: 'Unverified',
    selectRecommended: 'Select recommended', clear: 'Clear', applySelected: 'Apply selected', discover: 'Discover', verifyAll: 'Re-verify all',
    context: 'Context', maxOutput: 'Max output', input: 'Input', effort: 'Effort', effortNone: 'Non-reasoning',
    recommended: 'Recommended', verified: 'Verified', unverified: 'Unverified',
    setDefault: 'Set default', verify: 'Verify', text: 'text', image: 'image',
    mounted: 'Adapter mounted', notMounted: 'Adapter not mounted', configured: 'Configured', notConfigured: 'Not configured',
    credentialOk: 'Credential ready', credentialMissing: 'Credential missing', modelsUnit: 'models',
    loading: 'Loading…', empty: 'No matching models', loadError: 'Load failed',
    toastApplied: 'Applied {n} models', toastDiscovered: 'Found {n} models, {a} new', toastVerified: 'Re-verified {n} models',
    toastDefault: 'Default set: {m}', toastError: 'Failed: {e}', retry: 'Retry',
    cardTitle: 'Model Hub', applyRecommended: 'Apply recommended', selectorBadge: 'verified',
    edit: 'Edit', collapse: 'Collapse', save: 'Save', cancel: 'Cancel', measure: 'Measure max output', measuring: 'Measuring…',
    reset: 'Reset catalog', resetConfirm: 'Confirm reset?', reasoningModel: 'Reasoning model', addLevel: 'Add level', level: 'Level', wire: 'API value',
    compatDev: 'developer role', compatFormat: 'Thinking format', compatField: 'Output field', unset: 'default',
    evidence: 'Probe evidence', capacitySource: 'Capacity source', estimate: 'estimate', manual: 'manual', measured: 'measured',
    toastEdited: 'Saved {m}', toastReset: 'Catalog reset', toastMeasured: '{m} max output measured {v}', toastMeasureFail: 'Cannot measure: {r}',
    errFields: 'Invalid fields: {f}', devOk: 'accepts', devRejected: 'rejects', toolsOk: 'supported', toolsFail: 'unsupported',
  }

  function fmt(template, vars) {
    return String(template).replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] !== undefined ? vars[k] : '' })
  }

  // ===== CSS =====

  var CSS = [
    '.mh_panel{margin-top:16px;border:1px solid var(--dsw-alias-line,#e5e7eb);border-radius:12px;padding:16px;background:var(--dsw-alias-bg-container,#fff);color:var(--dsw-alias-text-primary,#1f2937);font-size:13px;}',
    '.mh_head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:4px;}',
    '.mh_title{font-size:15px;font-weight:600;}',
    '.mh_ver{font-size:11px;color:var(--dsw-alias-text-caption,#9ca3af);}',
    '.mh_sub{font-size:12px;color:var(--dsw-alias-text-caption,#6b7280);margin-bottom:12px;}',
    '.mh_status{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;margin-bottom:12px;color:var(--dsw-alias-text-secondary,#4b5563);}',
    '.mh_dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;vertical-align:middle;}',
    '.mh_dot_ok{background:#10b981;}.mh_dot_bad{background:#ef4444;}.mh_dot_idle{background:#9ca3af;}',
    '.mh_toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;}',
    '.mh_search{flex:1;min-width:160px;padding:6px 10px;border:1px solid var(--dsw-alias-line,#e5e7eb);border-radius:8px;background:transparent;color:inherit;font-size:13px;}',
    '.mh_btn{padding:6px 12px;border:1px solid var(--dsw-alias-line,#e5e7eb);border-radius:8px;background:transparent;color:inherit;font-size:12px;cursor:pointer;}',
    '.mh_btn:hover{background:var(--dsw-alias-fill-hover,rgba(0,0,0,.04));}',
    '.mh_btn:disabled{opacity:.5;cursor:default;}',
    '.mh_btn_primary{background:var(--dsw-alias-brand,#2563eb);border-color:var(--dsw-alias-brand,#2563eb);color:#fff;}',
    '.mh_btn_primary:hover{filter:brightness(1.08);background:var(--dsw-alias-brand,#2563eb);}',
    '.mh_grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;}',
    '.mh_card{border:1px solid var(--dsw-alias-line,#e5e7eb);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;}',
    '.mh_card_sel{border-color:var(--dsw-alias-brand,#2563eb);}',
    '.mh_card_top{display:flex;align-items:center;gap:8px;}',
    '.mh_name{font-weight:600;font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.mh_id{font-family:ui-monospace,monospace;font-size:11px;color:var(--dsw-alias-text-caption,#9ca3af);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.mh_badge{font-size:10px;padding:1px 6px;border-radius:6px;white-space:nowrap;}',
    '.mh_badge_recommended{background:rgba(245,158,11,.15);color:#b45309;}',
    '.mh_badge_verified{background:rgba(16,185,129,.15);color:#047857;}',
    '.mh_badge_unverified{background:rgba(156,163,175,.18);color:#6b7280;}',
    '.mh_meta{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:11px;color:var(--dsw-alias-text-secondary,#6b7280);}',
    '.mh_effort{font-size:11px;color:var(--dsw-alias-text-secondary,#4b5563);}',
    '.mh_card_actions{display:flex;gap:6px;margin-top:2px;}',
    '.mh_mini{font-size:11px;padding:2px 8px;border:1px solid var(--dsw-alias-line,#e5e7eb);border-radius:6px;background:transparent;color:inherit;cursor:pointer;}',
    '.mh_mini:hover{background:var(--dsw-alias-fill-hover,rgba(0,0,0,.04));}',
    '.mh_check{width:15px;height:15px;accent-color:var(--dsw-alias-brand,#2563eb);cursor:pointer;}',
    '.mh_empty{padding:24px;text-align:center;color:var(--dsw-alias-text-caption,#9ca3af);}',
    '.mh_toast{margin-top:12px;padding:8px 12px;border-radius:8px;font-size:12px;background:var(--dsw-alias-fill-hover,rgba(0,0,0,.05));}',
    '.mh_toast_err{background:rgba(239,68,68,.12);color:#b91c1c;}',
    '.mh_cardrow{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 0;font-size:12px;}',
    '.mh_label_badge{font-size:9px;padding:0 4px;border-radius:4px;margin-left:5px;background:rgba(16,185,129,.18);color:#047857;vertical-align:middle;}',
    '.mh_label_rec{background:rgba(245,158,11,.18);color:#b45309;}',
    'body[data-ds-dark-theme] .mh_panel{background:var(--dsw-alias-bg-container,#1f2937);border-color:var(--dsw-alias-line,#374151);color:var(--dsw-alias-text-primary,#f3f4f6);}',
    'body[data-ds-dark-theme] .mh_badge_recommended{color:#fbbf24;}body[data-ds-dark-theme] .mh_badge_verified{color:#34d399;}body[data-ds-dark-theme] .mh_badge_unverified{color:#9ca3af;}',
    'body[data-ds-dark-theme] .mh_label_badge{color:#34d399;}body[data-ds-dark-theme] .mh_label_rec{color:#fbbf24;}',
    '.mh_editor{border-top:1px dashed var(--dsw-alias-line,#e5e7eb);margin-top:8px;padding-top:8px;display:flex;flex-direction:column;gap:8px;}',
    '.mh_erow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}',
    '.mh_elabel{font-size:11px;color:var(--dsw-alias-text-caption,#6b7280);min-width:70px;}',
    '.mh_enum{width:110px;padding:4px 6px;border:1px solid var(--dsw-alias-line,#e5e7eb);border-radius:6px;background:transparent;color:inherit;font-size:12px;}',
    '.mh_ewire{width:90px;padding:4px 6px;border:1px solid var(--dsw-alias-line,#e5e7eb);border-radius:6px;background:transparent;color:inherit;font-size:12px;font-family:ui-monospace,monospace;}',
    '.mh_echeck{display:flex;gap:6px;align-items:center;font-size:12px;}',
    '.mh_evidence{font-size:11px;color:var(--dsw-alias-text-caption,#6b7280);display:flex;flex-wrap:wrap;gap:4px 10px;}',
    '.mh_eactions{display:flex;gap:8px;}',
    '.mh_btn_danger{border-color:#ef4444;color:#b91c1c;}',
    'body[data-ds-dark-theme] .mh_btn_danger{color:#f87171;}',
    // ---- v0.3 自定义下拉：派生令牌（宿主令牌名已核实定义）+ Select 规则，移植自 dsh-memory ----
    '.mh_panel,.mh_select_pop{--mh-bg:var(--dsw-alias-bg-base,#f6f8fc);--mh-surface:var(--dsw-alias-bg-layer-1,#ffffff);--mh-raised:color-mix(in srgb,var(--mh-ink) 3.5%,var(--mh-bg));--mh-ink:var(--dsw-alias-label-primary,#141821);--mh-ink2:var(--dsw-alias-label-secondary,#4b5565);--mh-ink3:var(--dsw-alias-label-tertiary,#8a93a3);--mh-line:var(--dsw-alias-border-l1,#dbe2ee);--mh-line2:var(--dsw-alias-border-l2,#c6d2e4);--mh-primary:var(--dsw-alias-state-business-primary,#2154ce);--mh-accent-soft:color-mix(in srgb,var(--mh-primary) 10%,transparent);--mh-accent-line:color-mix(in srgb,var(--mh-primary) 38%,transparent);--mh-mono:var(--ds-font-family-code,ui-monospace,"Cascadia Mono",Consolas,monospace);--mh-pop:0 14px 40px -18px rgba(16,25,45,.32),0 2px 6px rgba(16,25,45,.06);--mh-ring:0 0 0 3px color-mix(in srgb,var(--mh-primary) 20%,transparent);}',
    'body[data-ds-dark-theme] .mh_panel,body[data-ds-dark-theme] .mh_select_pop{--mh-bg:var(--dsw-alias-bg-base,#0f1115);--mh-surface:var(--dsw-alias-bg-layer-1,#171a21);--mh-ink:var(--dsw-alias-label-primary,#e8eaf0);--mh-ink2:var(--dsw-alias-label-secondary,#a8aebd);--mh-ink3:var(--dsw-alias-label-tertiary,#6f7688);--mh-line:var(--dsw-alias-border-l1,rgba(232,234,240,.08));--mh-line2:var(--dsw-alias-border-l2,rgba(232,234,240,.16));--mh-pop:0 18px 44px -20px rgba(0,0,0,.85),0 2px 8px rgba(0,0,0,.45);}',
    '.mh_select_trigger{display:inline-flex;align-items:center;gap:7px;height:32px;width:100%;box-sizing:border-box;border:1px solid var(--mh-line);border-radius:6px;background:transparent;color:var(--mh-ink2);padding:0 8px 0 10px;font:inherit;font-size:12.5px;cursor:pointer;max-width:320px;transition:color .13s,background-color .13s,border-color .13s;}',
    '.mh_select_trigger:hover{color:var(--mh-ink);background:var(--mh-raised);border-color:var(--mh-line2);}',
    '.mh_select_trigger:focus-visible{outline:none;border-color:var(--mh-primary);box-shadow:var(--mh-ring);}',
    '.mh_select_open{border-color:var(--mh-accent-line);background:var(--mh-surface);color:var(--mh-ink);}',
    '.mh_select_disabled{opacity:.42;cursor:default;}',
    '.mh_select_val_icon{display:flex;color:var(--mh-ink3);flex-shrink:0;}',
    '.mh_select_value{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;}',
    '.mh_select_chev{display:flex;color:var(--mh-ink3);flex-shrink:0;transition:transform .18s;}',
    '.mh_select_open .mh_select_chev{transform:rotate(180deg);color:var(--mh-ink2);}',
    '.mh_select_pop{position:fixed;z-index:1200;box-sizing:border-box;background:var(--mh-surface);border:1px solid var(--mh-line2);border-radius:8px;box-shadow:var(--mh-pop);padding:5px;max-height:320px;overflow-y:auto;animation:mh_fade .12s ease;transform-origin:top center;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--mh-ink) 20%,transparent) transparent;}',
    '.mh_select_pop::-webkit-scrollbar{width:8px;}',
    '.mh_select_pop::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--mh-ink) 18%,transparent);border-radius:8px;}',
    '.mh_select_up{transform-origin:bottom center;}',
    '.mh_select_opt{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:6px;cursor:pointer;font-size:12.5px;color:var(--mh-ink);transition:background-color .1s,color .1s;}',
    '.mh_select_opt_active{background:color-mix(in srgb,var(--mh-ink) 6%,transparent);}',
    '.mh_select_opt_sel{color:var(--mh-ink);font-weight:600;background:var(--mh-accent-soft);}',
    '.mh_select_opt_sel.mh_select_opt_active{background:color-mix(in srgb,var(--mh-primary) 16%,transparent);}',
    '.mh_select_opt_disabled{opacity:.4;cursor:default;}',
    '.mh_select_opt_icon{display:flex;color:var(--mh-ink3);flex-shrink:0;}',
    '.mh_select_opt_sel .mh_select_opt_icon{color:var(--mh-primary);}',
    '.mh_select_opt_spacer{width:14px;}',
    '.mh_select_opt_label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.mh_select_opt_hint{font:500 10.5px var(--mh-mono);color:var(--mh-ink3);flex-shrink:0;}',
    '.mh_select_opt_check{color:var(--mh-primary);flex-shrink:0;}',
    '.mh_editor .mh_select_trigger{height:30px;max-width:240px;border:1px solid var(--mh-line2);background:var(--mh-bg);}',
    '@keyframes mh_fade{from{opacity:0;}to{opacity:1;}}',
    '@media (prefers-reduced-motion:reduce){.mh_select_trigger,.mh_select_chev,.mh_select_pop{animation:none !important;transition:none !important;}}',
    '.mh_select_disabled:hover{border-color:var(--mh-line);background:transparent;}',
  ].join('\n')

  var API_BASE = '/plugins/dsh-model-hub'

  // ===== 浏览器 factory =====

  if (global.__ModuleLoader__) global.__ModuleLoader__.load({
    id: 'dsh-model-hub',
    factory: function (require) {
      var React = require('react')
      var h = React.createElement
      var useState = React.useState
      var useEffect = React.useEffect
      var useLayoutEffect = React.useLayoutEffect
      var useRef = React.useRef
      var useCallback = React.useCallback
      var ReactDOM = require('react-dom')
      var selectSeq = 0

      // ===== 图标（内联 SVG，stroke=currentColor；路径取自 dsh-memory ICONS 字典） =====
      var ICONS = {
        check: ['M5 13l4 4L19 7'],
        chevD: ['M6 9l6 6 6-6'],
        alert: ['M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M12 9v4', 'M12 17h.01'],
        star: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z'],
        info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 8h.01', 'M12 11v5'],
        layers: ['M12 3l9 5-9 5-9-5 9-5z', 'M3 13l9 5 9-5'],
      }

      function Icon(props) {
        var paths = ICONS[props.name] || ICONS.info
        var size = props.size || 16
        return h('svg', {
          width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
          stroke: 'currentColor', strokeWidth: props.strokeWidth || 1.8,
          strokeLinecap: 'round', strokeLinejoin: 'round',
          'aria-hidden': true, className: props.className, style: props.style,
        }, paths.map(function (d, i) { return h('path', { key: i, d: d }) }))
      }

      function createApi(tokenRef) {
        function request(path, options) {
          var opts = Object.assign({ credentials: 'same-origin', cache: 'no-store' }, options)
          var signal = (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(opts.timeoutMs || 30000) : undefined
          delete opts.timeoutMs
          if (signal) opts.signal = signal
          return fetch(path, opts).then(function (res) {
            return res.json().catch(function () { return null }).then(function (payload) {
              tokenRef.current = nextToken(tokenRef.current, { status: res.status, payload: payload })
              if (!res.ok) { var e = new Error((payload && (payload.error || payload.code)) || ('HTTP ' + res.status)); e.code = payload && payload.code; throw e }
              if (payload === null) { var b = new Error('bad-response'); b.code = 'bad-response'; throw b }
              return payload
            })
          })
        }
        function post(path, input, timeoutMs) {
          return request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-RPC-Key': tokenRef.current }, body: JSON.stringify(input || {}), timeoutMs: timeoutMs })
        }
        return {
          status: function () { return request(API_BASE + '/status') },
          catalog: function () { return request(API_BASE + '/catalog') },
          apply: function (modelIds) { return post(API_BASE + '/apply', { modelIds: modelIds }, 60000) },
          discover: function () { return post(API_BASE + '/discover', {}, 90000) },
          verify: function (modelIds) { return post(API_BASE + '/verify', { modelIds: modelIds }, 300000) },
          setDefault: function (provider, model) { return post(API_BASE + '/set-default', { provider: provider, model: model }) },
          edit: function (id, draft) { return post(API_BASE + '/edit', { id: id, draft: draft }, 60000) },
          reset: function () { return post(API_BASE + '/reset', {}, 60000) },
          measure: function (id) { return post(API_BASE + '/measure-max-output', { id: id }, 300000) },
        }
      }

      function Badge(props) {
        var kind = props.kind
        return h('span', { className: 'mh_badge mh_badge_' + kind }, props.t(kind))
      }

      // 自定义无障碍下拉：button + portal 浮层 listbox，彻底主题化（原生 select 弹出层无法跨浏览器主题化）。
      // 浮层 portal 到 body，避开工具栏的 backdrop-filter 包含块与 overflow 裁剪；fixed 坐标即视口坐标。
      // 自 dsh-memory v0.31.1 Select 行为等价移植（dm→mh 改名），见 docs/DESIGN-CONSENSUS-v0.3.0.md。
      function Select(props) {
        var options = props.options || []
        var value = props.value
        var disabled = props.disabled
        var openState = useState(false)
        var open = openState[0]; var setOpen = openState[1]
        var activeState = useState(-1)
        var active = activeState[0]; var setActive = activeState[1]
        var posState = useState(null)
        var pos = posState[0]; var setPos = posState[1]
        var rootRef = useRef(null)
        var triggerRef = useRef(null)
        var listRef = useRef(null)
        var typeRef = useRef({ buf: '', t: 0 })
        var focusPendingRef = useRef(false)
        var idRef = useRef(null)
        if (idRef.current === null) { selectSeq += 1; idRef.current = 'mh-sel-' + selectSeq }
        var activeRef = useRef(active); activeRef.current = active

        var selectedIndex = selectedIndexOf(options, value)
        var selected = selectedIndex >= 0 ? options[selectedIndex] : null

        function enabledIndexes() {
          var a = []
          for (var k = 0; k < options.length; k++) { if (!options[k].disabled) a.push(k) }
          return a
        }
        function place() {
          var trig = triggerRef.current
          if (!trig) return
          var r = trig.getBoundingClientRect()
          // 严格等宽：弹出层宽度＝触发按钮的渲染宽度（按钮已带稳定最小宽），
          // 左右边缘完全对齐，读起来是同一件控件而非两块板。
          var width = r.width
          var list = listRef.current
          var height = list ? Math.min(list.offsetHeight, 300) : 260
          var spaceBelow = window.innerHeight - r.bottom
          var up = spaceBelow < height + 8 && r.top > spaceBelow
          var top = up ? Math.max(8, r.top - height - 4) : Math.min(r.bottom + 4, Math.max(8, window.innerHeight - height - 8))
          var left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - width - 8))
          setPos({ top: top, left: left, width: width, up: up })
        }
        function openList() {
          if (disabled) return
          var en = enabledIndexes()
          setActive(selectedIndex >= 0 ? selectedIndex : (en.length ? en[0] : -1))
          focusPendingRef.current = true
          setOpen(true)
        }
        function closeList(refocus) {
          setOpen(false)
          setPos(null)
          if (refocus && triggerRef.current) triggerRef.current.focus()
        }
        function choose(idx) {
          var opt = options[idx]
          if (!opt || opt.disabled) return
          props.onChange(opt.value)
          closeList(true)
        }
        function move(delta) {
          var en = enabledIndexes()
          if (en.length === 0) return
          var cur = en.indexOf(activeRef.current)
          var next = cur === -1 ? (delta > 0 ? 0 : en.length - 1) : (cur + delta + en.length) % en.length
          setActive(en[next])
        }
        function edge(which) {
          var en = enabledIndexes()
          if (en.length) setActive(which === 'first' ? en[0] : en[en.length - 1])
        }
        function typeAhead(ch) {
          var now = Date.now()
          var st = typeRef.current
          if (now - st.t > 600) st.buf = ''
          st.t = now
          st.buf += ch.toLowerCase()
          var en = enabledIndexes()
          for (var k = 0; k < en.length; k++) {
            var lbl = String(options[en[k]].label || '').toLowerCase()
            if (lbl.indexOf(st.buf) === 0) { setActive(en[k]); return }
          }
        }

        useLayoutEffect(function () {
          if (!open) return undefined
          place()
          function onDoc(e) {
            var inTrigger = triggerRef.current && triggerRef.current.contains(e.target)
            var inList = listRef.current && listRef.current.contains(e.target)
            if (!inTrigger && !inList) closeList(false)
          }
          function onScroll() { place() }
          function onResize() { place() }
          document.addEventListener('mousedown', onDoc)
          window.addEventListener('scroll', onScroll, true)
          window.addEventListener('resize', onResize)
          return function () {
            document.removeEventListener('mousedown', onDoc)
            window.removeEventListener('scroll', onScroll, true)
            window.removeEventListener('resize', onResize)
          }
        }, [open])

        // 浮层首帧 pos 为空、样式为 visibility:hidden（隐藏元素无法获得焦点），
        // 必须在 place() 定位完成后的下一次布局提交里再聚焦，否则键盘导航无入口。
        useLayoutEffect(function () {
          if (!open || pos === null || !focusPendingRef.current) return
          focusPendingRef.current = false
          var list = listRef.current
          if (list) list.focus()
        }, [open, pos])

        useLayoutEffect(function () {
          if (!open || !listRef.current) return
          var el = listRef.current.querySelector('[data-index="' + active + '"]')
          if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' })
        }, [active, open])

        function onTriggerKey(e) {
          if (disabled) return
          // 正常情况下打开后焦点会移入浮层；若聚焦仍停在触发器（例如浮层刚被重排），
          // Esc 也要能收起浮层而不是误关外层容器。
          if (open && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeList(true); return }
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            openList()
          }
        }
        function onListKey(e) {
          switch (e.key) {
            case 'ArrowDown': e.preventDefault(); move(1); break
            case 'ArrowUp': e.preventDefault(); move(-1); break
            case 'Home': e.preventDefault(); edge('first'); break
            case 'End': e.preventDefault(); edge('last'); break
            case 'Enter': case ' ': e.preventDefault(); choose(activeRef.current); break
            case 'Escape': e.preventDefault(); e.stopPropagation(); closeList(true); break
            case 'Tab': e.preventDefault(); closeList(true); break
            default:
              if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); typeAhead(e.key) }
          }
        }

        var wrapStyle = Object.assign({}, props.minWidth ? { minWidth: props.minWidth } : null, props.style)
        var trigger = h('div', { className: 'mh_selectwrap' + (props.className ? ' ' + props.className : ''), ref: rootRef, style: wrapStyle },
          h('button', {
            type: 'button', ref: triggerRef, id: props.id,
            className: 'mh_select_trigger' + (open ? ' mh_select_open' : '') + (disabled ? ' mh_select_disabled' : ''),
            disabled: disabled, 'aria-haspopup': 'listbox', 'aria-expanded': open, 'aria-label': props.ariaLabel,
            // 浮层未渲染时不设 aria-controls（避免指向不存在的 id）。
            'aria-controls': open ? idRef.current : undefined,
            onClick: function () { if (open) closeList(true); else openList() },
            onKeyDown: onTriggerKey,
          },
            selected && selected.icon ? h(Icon, { name: selected.icon, size: 14, className: 'mh_select_val_icon' }) : null,
            h('span', { className: 'mh_select_value' }, selected ? selected.label : (props.placeholder || '')),
            h('span', { className: 'mh_select_chev' }, h(Icon, { name: 'chevD', size: 14 }))))

        if (!open) return trigger

        var pop = h('div', {
          className: 'mh_select_pop' + (pos && pos.up ? ' mh_select_up' : ''),
          style: pos ? { top: pos.top, left: pos.left, width: pos.width } : { top: -9999, left: -9999, visibility: 'hidden' },
          role: 'listbox', ref: listRef, id: idRef.current, tabIndex: -1, 'aria-label': props.ariaLabel,
          'aria-activedescendant': active >= 0 ? (idRef.current + '-opt-' + active) : undefined,
          onKeyDown: onListKey,
        }, options.map(function (opt, idx) {
          var isSel = String(opt.value) === String(value)
          var isActive = idx === active
          return h('div', {
            key: String(opt.value) + '-' + idx, id: idRef.current + '-opt-' + idx, 'data-index': idx,
            role: 'option', 'aria-selected': isSel, 'aria-disabled': opt.disabled || undefined,
            className: 'mh_select_opt' + (isActive ? ' mh_select_opt_active' : '') + (isSel ? ' mh_select_opt_sel' : '') + (opt.disabled ? ' mh_select_opt_disabled' : ''),
            onMouseEnter: function () { if (!opt.disabled) setActive(idx) },
            onClick: function () { choose(idx) },
          },
            opt.icon ? h(Icon, { name: opt.icon, size: 14, className: 'mh_select_opt_icon' }) : h('span', { className: 'mh_select_opt_icon mh_select_opt_spacer' }),
            h('span', { className: 'mh_select_opt_label', title: opt.label }, opt.label),
            opt.hint ? h('span', { className: 'mh_select_opt_hint' }, opt.hint) : null,
            isSel ? h(Icon, { name: 'check', size: 14, strokeWidth: 2.4, className: 'mh_select_opt_check' }) : null)
        }))

        return h(React.Fragment, null, trigger, ReactDOM.createPortal(pop, document.body))
      }

      function EditorForm(props) {
        var entry = props.entry, t = props.t
        var ds = useState(function () { return draftFromEntry(entry) })
        var draft = ds[0], setDraft = ds[1]
        var es = useState(null), err = es[0], setErr = es[1]
        function set(patch) { setDraft(Object.assign({}, draft, patch)) }
        function setRow(i, patch) { var rows = draft.rows.slice(); rows[i] = Object.assign({}, rows[i], patch); set({ rows: rows }) }
        function addRow() { set({ rows: draft.rows.concat([{ level: 'low', wire: 'low' }]) }) }
        function delRow(i) { var rows = draft.rows.slice(); rows.splice(i, 1); set({ rows: rows }) }
        function toggleInput(mod) { var has = draft.input.indexOf(mod) >= 0; var next = has ? draft.input.filter(function (x) { return x !== mod }) : draft.input.concat([mod]); if (next.length) set({ input: next }) }
        function save() {
          var errs = clientValidate(draft)
          if (errs.length) { setErr(fmt(t('errFields'), { f: errs.join(',') })); return }
          setErr(null)
          props.onSave(draftToPayload(draft))
        }
        var ev = entry.evidence || {}
        var cap = entry.capacitySource || {}
        return h('div', { className: 'mh_editor' },
          h('div', { className: 'mh_erow' },
            h('span', { className: 'mh_elabel' }, t('context')),
            h('input', { className: 'mh_enum', type: 'number', value: draft.contextWindow, onChange: function (e) { set({ contextWindow: e.target.value }) } }),
            h('span', { className: 'mh_elabel' }, t('maxOutput')),
            h('input', { className: 'mh_enum', type: 'number', value: draft.maxTokens, onChange: function (e) { set({ maxTokens: e.target.value }) } }),
            h('button', { className: 'mh_mini', onClick: function () { props.onMeasure(entry.id) }, disabled: props.busy }, t('measure'))),
          h('div', { className: 'mh_erow' },
            h('span', { className: 'mh_elabel' }, t('input')),
            h('label', { className: 'mh_echeck' }, h('input', { type: 'checkbox', checked: draft.input.indexOf('text') >= 0, onChange: function () { toggleInput('text') } }), t('text')),
            h('label', { className: 'mh_echeck' }, h('input', { type: 'checkbox', checked: draft.input.indexOf('image') >= 0, onChange: function () { toggleInput('image') } }), t('image'))),
          h('div', { className: 'mh_erow' },
            h('label', { className: 'mh_echeck' }, h('input', { type: 'checkbox', checked: draft.reasoning, onChange: function (e) { set({ reasoning: e.target.checked }) } }), t('reasoningModel'))),
          draft.reasoning ? h('div', null,
            draft.rows.map(function (r, i) {
              return h('div', { className: 'mh_erow', key: i },
                h(Select, { options: levelOptions(), value: r.level, onChange: function (v) { setRow(i, { level: v, wire: v === 'off' ? '' : (r.wire || v) }) }, minWidth: 110, ariaLabel: t('level') }),
                h('input', { className: 'mh_ewire', value: r.wire, placeholder: t('wire'), disabled: r.level === 'off', onChange: function (e) { setRow(i, { wire: e.target.value }) } }),
                h('button', { className: 'mh_mini', onClick: function () { delRow(i) } }, '×'))
            }),
            h('button', { className: 'mh_mini', onClick: addRow }, t('addLevel'))) : null,
          h('div', { className: 'mh_erow' },
            h('span', { className: 'mh_elabel' }, t('compatDev')),
            h(Select, { options: devRoleOptions(t), value: draft.devRole, onChange: function (v) { set({ devRole: v }) }, minWidth: 100, ariaLabel: t('compatDev') }),
            h('span', { className: 'mh_elabel' }, t('compatFormat')),
            h(Select, { options: formatOptions(t), value: draft.thinkingFormat, onChange: function (v) { set({ thinkingFormat: v }) }, minWidth: 170, ariaLabel: t('compatFormat') }),
            h('span', { className: 'mh_elabel' }, t('compatField')),
            h(Select, { options: fieldOptions(t), value: draft.maxTokensField, onChange: function (v) { set({ maxTokensField: v }) }, minWidth: 180, ariaLabel: t('compatField') })),
          h('div', { className: 'mh_evidence' },
            h('span', null, t('evidence') + ':'),
            h('span', null, 'developer ' + (ev.developerRole === 'ok' ? t('devOk') : ev.developerRole === 'rejected' ? t('devRejected') : '—')),
            h('span', null, 'tools ' + (ev.tools === 'ok' ? t('toolsOk') : ev.tools === 'fail' ? t('toolsFail') : '—')),
            h('span', null, (ev.maxTokensField || '—')),
            h('span', null, (ev.testedAt || '').slice(0, 10)),
            h('span', null, t('capacitySource') + ': ' + t(cap.context || 'estimate') + '/' + t(cap.maxOutput || 'estimate'))),
          err ? h('div', { className: 'mh_toast mh_toast_err' }, err) : null,
          h('div', { className: 'mh_eactions' },
            h('button', { className: 'mh_btn mh_btn_primary', onClick: save, disabled: props.busy }, t('save')),
            h('button', { className: 'mh_btn', onClick: props.onCancel, disabled: props.busy }, t('cancel'))))
      }

      function ModelCard(props) {
        var m = props.model, t = props.t, sel = props.selected
        var ex = useState(false), expanded = ex[0], setExpanded = ex[1]
        var kind = badgeKind(m)
        var efforts = effortSummary(m.reasoningEfforts)
        var inputs = (m.input || ['text']).map(function (x) { return t(x) }).join(' + ')
        return h('div', { className: 'mh_card' + (sel ? ' mh_card_sel' : '') },
          h('div', { className: 'mh_card_top' },
            h('input', { type: 'checkbox', className: 'mh_check', checked: sel, onChange: function () { props.onToggle(m.id) }, 'aria-label': m.id }),
            h('span', { className: 'mh_name', title: m.name || m.id }, m.name || m.id),
            h(Badge, { kind: kind, t: t })),
          h('div', { className: 'mh_id', title: m.id }, m.id),
          h('div', { className: 'mh_meta' },
            h('span', null, t('context') + ' ' + fmtTokens(m.contextWindow)),
            h('span', null, t('maxOutput') + ' ' + fmtTokens(m.maxTokens)),
            h('span', null, t('input') + ' ' + inputs)),
          h('div', { className: 'mh_effort' }, t('effort') + ': ' + (efforts || t('effortNone'))),
          h('div', { className: 'mh_card_actions' },
            h('button', { className: 'mh_mini', onClick: function () { props.onSetDefault(m.id) }, disabled: props.busy }, t('setDefault')),
            h('button', { className: 'mh_mini', onClick: function () { props.onVerify(m.id) }, disabled: props.busy }, t('verify')),
            h('button', { className: 'mh_mini', onClick: function () { setExpanded(!expanded) } }, expanded ? t('collapse') : t('edit'))),
          expanded ? h(EditorForm, { entry: m, t: t, busy: props.busy, onSave: function (payload) { props.onEdit(m.id, payload) }, onCancel: function () { setExpanded(false) }, onMeasure: props.onMeasure }) : null)
      }

      function HubPanel(props) {
        var ctx = props.ctx, t = props.t
        var tokenRef = useRef('')
        var apiRef = useRef(null)
        if (apiRef.current === null) apiRef.current = createApi(tokenRef)
        var api = apiRef.current
        var st = useState({ loading: true, catalog: null, status: null, error: null })
        var state = st[0], setState = st[1]
        var sel = useState([]), selected = sel[0], setSelected = sel[1]
        var q = useState(''), query = q[0], setQuery = q[1]
        var f = useState('all'), filter = f[0], setFilter = f[1]
        var b = useState(''), busy = b[0], setBusy = b[1]
        var tt = useState(null), toast = tt[0], setToast = tt[1]
        var ra = useState(false), resetArm = ra[0], setResetArm = ra[1]

        var showToast = useCallback(function (text, kind) { setToast({ text: text, kind: kind || 'ok', id: Date.now() }) }, [])

        var refresh = useCallback(function () {
          return Promise.all([api.status(), api.catalog()]).then(function (r) {
            setState({ loading: false, catalog: r[1], status: r[0], error: null })
          }).catch(function (e) { setState(function (s) { return Object.assign({}, s, { loading: false, error: String(e.message || e) }) }) })
        }, [api])

        useEffect(function () { refresh() }, [refresh])
        useEffect(function () { if (!toast) return; var id = setTimeout(function () { setToast(null) }, 4000); return function () { clearTimeout(id) } }, [toast])

        function run(name, fn) {
          setBusy(name)
          return fn().then(function (r) { setBusy(''); return r }).catch(function (e) { setBusy(''); showToast(fmt(t('toastError'), { e: String(e.message || e) }), 'err'); throw e })
        }

        function doApply() {
          if (!selected.length) return
          run('apply', function () { return api.apply(selected) }).then(function (r) { showToast(fmt(t('toastApplied'), { n: r.applied })); setSelected([]); refresh() }).catch(function () {})
        }
        function doDiscover() {
          run('discover', function () { return api.discover() }).then(function (r) { showToast(fmt(t('toastDiscovered'), { n: (r.candidates || []).length, a: r.added || 0 })); refresh() }).catch(function () {})
        }
        function doVerify(ids) {
          run('verify', function () { return api.verify(ids) }).then(function (r) { showToast(fmt(t('toastVerified'), { n: r.verified })); refresh() }).catch(function () {})
        }
        function doSetDefault(id) {
          var providerId = (state.status && state.status.providerId) || 'aliyun'
          run('default', function () { return api.setDefault(providerId, id) }).then(function () { showToast(fmt(t('toastDefault'), { m: id })) }).catch(function () {})
        }
        function doEdit(id, payload) {
          run('edit', function () { return api.edit(id, payload) }).then(function () { showToast(fmt(t('toastEdited'), { m: id })); refresh() }).catch(function () {})
        }
        function doMeasure(id) {
          run('measure', function () { return api.measure(id) }).then(function (r) {
            if (r.measured) showToast(fmt(t('toastMeasured'), { m: id, v: fmtTokens(r.value) }))
            else showToast(fmt(t('toastMeasureFail'), { r: r.reason || '' }), 'err')
            refresh()
          }).catch(function () {})
        }
        function doReset() {
          run('reset', function () { return api.reset() }).then(function () { showToast(t('toastReset')); setResetArm(false); refresh() }).catch(function () {})
        }

        if (state.loading) return h('div', { className: 'mh_panel' }, h('div', { className: 'mh_empty' }, t('loading')))
        if (state.error && !state.catalog) return h('div', { className: 'mh_panel' }, h('div', { className: 'mh_empty' }, t('loadError') + ': ' + state.error, ' ', h('button', { className: 'mh_mini', onClick: refresh }, t('retry'))))

        var catalog = state.catalog || { models: [] }
        var status = state.status || {}
        var provider = status.provider || {}
        var credential = status.credential || {}
        var models = filterModels(catalog.models, query, filter)
        var recIds = (catalog.models || []).filter(function (m) { return m.recommended }).map(function (m) { return m.id })

        return h('div', { className: 'mh_panel' },
          h('div', { className: 'mh_head' }, h('span', { className: 'mh_title' }, t('title')), h('span', { className: 'mh_ver' }, 'v' + (status.version || ''))),
          h('div', { className: 'mh_sub' }, t('subtitle')),
          h('div', { className: 'mh_status' },
            h('span', null, h('span', { className: 'mh_dot ' + (provider.mounted ? 'mh_dot_ok' : 'mh_dot_bad') }), provider.mounted ? t('mounted') : t('notMounted')),
            h('span', null, h('span', { className: 'mh_dot ' + (provider.configured ? 'mh_dot_ok' : 'mh_dot_idle') }), (provider.configured ? t('configured') : t('notConfigured')) + ' · ' + (provider.modelCount || 0) + ' ' + t('modelsUnit')),
            h('span', null, h('span', { className: 'mh_dot ' + (credential.configured ? 'mh_dot_ok' : 'mh_dot_bad') }), credential.configured ? t('credentialOk') : t('credentialMissing'))),
          h('div', { className: 'mh_toolbar' },
            h('input', { className: 'mh_search', placeholder: t('search'), value: query, onChange: function (e) { setQuery(e.target.value) } }),
            h(Select, { options: filterOptions(t), value: filter, onChange: setFilter, minWidth: 140, ariaLabel: t('filterLabel') }),
            h('button', { className: 'mh_btn', onClick: function () { setSelected(recIds) }, disabled: busy || !recIds.length }, t('selectRecommended')),
            h('button', { className: 'mh_btn', onClick: function () { setSelected([]) }, disabled: busy || !selected.length }, t('clear')),
            h('button', { className: 'mh_btn mh_btn_primary', onClick: doApply, disabled: busy || !selected.length }, t('applySelected') + (selected.length ? ' (' + selected.length + ')' : '')),
            h('button', { className: 'mh_btn', onClick: doDiscover, disabled: busy }, t('discover')),
            h('button', { className: 'mh_btn', onClick: function () { doVerify() }, disabled: busy }, t('verifyAll')),
            resetArm
              ? h('button', { className: 'mh_btn mh_btn_danger', onClick: doReset, disabled: busy }, t('resetConfirm'))
              : h('button', { className: 'mh_btn', onClick: function () { setResetArm(true) }, disabled: busy }, t('reset'))),
          models.length === 0
            ? h('div', { className: 'mh_empty' }, t('empty'))
            : h('div', { className: 'mh_grid' }, models.map(function (m) {
              return h(ModelCard, { key: m.id, model: m, t: t, selected: selected.indexOf(m.id) >= 0, busy: !!busy, onToggle: function (id) { setSelected(toggleId(selected, id)) }, onSetDefault: doSetDefault, onVerify: function (id) { doVerify([id]) }, onEdit: doEdit, onMeasure: doMeasure })
            })),
          toast ? h('div', { className: 'mh_toast' + (toast.kind === 'err' ? ' mh_toast_err' : '') }, toast.text) : null)
      }

      function ProviderCard(props) {
        var provider = props.provider || {}
        var t = props.t
        if (provider.provider !== 'aliyun') return null
        var tokenRef = useRef('')
        var apiRef = useRef(null)
        if (apiRef.current === null) apiRef.current = createApi(tokenRef)
        var api = apiRef.current
        var st = useState(null), info = st[0], setInfo = st[1]
        var b = useState(false), busy = b[0], setBusy = b[1]
        useEffect(function () { api.status().then(setInfo).catch(function () {}) }, [api])
        function applyRec() {
          setBusy(true)
          api.catalog().then(function (cat) {
            var ids = (cat.models || []).filter(function (m) { return m.recommended }).map(function (m) { return m.id })
            return api.apply(ids)
          }).then(function () { return api.status() }).then(function (s) { setInfo(s); setBusy(false) }).catch(function () { setBusy(false) })
        }
        var p = (info && info.provider) || {}
        var cred = (info && info.credential) || {}
        return h('div', { className: 'mh_cardrow' },
          h('span', null, h('span', { className: 'mh_dot ' + (cred.configured ? 'mh_dot_ok' : 'mh_dot_bad') }), t('cardTitle')),
          h('span', null, (p.modelCount || 0) + ' ' + t('modelsUnit')),
          h('button', { className: 'mh_mini', onClick: applyRec, disabled: busy }, t('applyRecommended')))
      }

      function ModelLabel(props) {
        var provider = props.provider || {}, model = props.model || {}
        var name = model.name || model.id
        if (provider.id !== 'aliyun') {
          return h('span', null, name, model.badge ? h('span', { className: 'mh_label_badge' }, String(model.badge)) : null)
        }
        var kind = badgeKind(model)
        if (kind === 'unverified') return h('span', null, name)
        return h('span', null, name, h('span', { className: 'mh_label_badge' + (kind === 'recommended' ? ' mh_label_rec' : '') }, kind === 'recommended' ? '★' : '✓'))
      }

      return {
        inject: ['slots', 'locale'],
        apply: function (ctx) {
          ctx.effect(function () {
            var disposers = []
            disposers.push(ctx.locale.register(NS, { zh: ZH, en: EN }))
            var t = ctx.locale.bind(NS)
            var style = document.createElement('style')
            style.id = 'dsh-model-hub-style'
            style.textContent = CSS
            document.head.appendChild(style)
            disposers.push(function () { style.remove() })

            function Panel() { return h(HubPanel, { ctx: ctx, t: t }) }
            disposers.push(ctx.slots.inject('settings.models.footer', function () {
              return ctx.slots.register({ name: 'settings.models.footer', id: 'dsh-model-hub', order: 10, locale: NS }, Panel)
            }))
            function Card(pp) { return h(ProviderCard, Object.assign({}, pp, { t: t })) }
            disposers.push(ctx.slots.inject('settings.models.provider-card', function () {
              return ctx.slots.register({ name: 'settings.models.provider-card', key: 'llm-pi-ai', locale: NS }, Card)
            }))
            function Label(pp) { return h(ModelLabel, Object.assign({}, pp, { t: t })) }
            disposers.push(ctx.slots.inject('conversation.input.model.label', function () {
              return ctx.slots.register({ name: 'conversation.input.model.label', locale: NS }, Label)
            }))
            return function () {
              var list = disposers.slice().reverse()
              for (var i = 0; i < list.length; i++) { try { list[i]() } catch (e) { /* 卸载期容错 */ } }
            }
          })
        },
      }
    },
  })

  // ===== UMD 尾部：纯逻辑供 node 单测 =====
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { nextToken: nextToken, toggleId: toggleId, badgeKind: badgeKind, filterModels: filterModels, effortSummary: effortSummary, fmtTokens: fmtTokens, fmt: fmt, draftFromEntry: draftFromEntry, draftToPayload: draftToPayload, clientValidate: clientValidate, LEVELS: LEVELS, FORMATS: FORMATS, MAXFIELDS: MAXFIELDS, filterOptions: filterOptions, devRoleOptions: devRoleOptions, levelOptions: levelOptions, formatOptions: formatOptions, fieldOptions: fieldOptions, selectedIndexOf: selectedIndexOf }
  }
})(typeof window !== 'undefined' ? window : globalThis)