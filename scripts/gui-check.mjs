/**
 * dsh-model-hub 真实 GUI 验证脚本（Edge headless + CDP）—— v0.4.0 多平台 + 自定义无障碍下拉。
 *
 * 为什么需要它：单测覆盖纯逻辑（filterOptions/draft roundtrip），但「button 触发器 +
 * portal listbox」的真实键盘行为、焦点归还、浮层定位/等宽/近底翻转、暗色令牌切换，
 * 只有真实浏览器里才能验证。脚手架自 dsh-memory scripts/gui-check.mjs 移植
 * （Edge headless 启动 + CDP WebSocket + browser-session cookie 自签 + 编号断言）。
 *
 * 用法 Run:
 *   node scripts/gui-check.mjs --url=http://127.0.0.1:52831/ [--edge=<msedge.exe>] [--shots=<目录>]
 *   node scripts/gui-check.mjs --smoke --url=…   # 只跑脚手架冒烟（旧版 GUI 也能过）
 *   node scripts/gui-check.mjs --help
 *   --url 必填（缺省打印用法并非 0 退出）；Edge 路径可用 env EDGE_PATH 覆盖。
 *
 * 检查项（任一失败退出码非 0；9 允许环境不便时 SKIP）：
 *   1 面板渲染（.mh_panel / .mh_ver=0.3.0 / 无原生 select / 触发器≥1）
 *   2 筛选下拉打开（listbox / aria-expanded / 焦点入浮层 / 4 选项 / 选中项 check）
 *   3 键盘 ArrowDown+Enter（高亮移动 / 选中关闭 / 焦点回触发器 / 卡片过滤生效）
 *   4 Esc 关闭（浮层消失 / 焦点回触发器 / aria-expanded=false）
 *   5 点击浮层外关闭（document mousedown）
 *   6 浮层与触发按钮严格等宽（±1px）+ fixed/z-index 1200
 *   7 编辑器下拉（level×行数 + 3 compat / off→wire 禁用清空 / 恢复 / type-ahead q / 取消收起）
 *   8 暗色分支（走宿主主题控件：设置→通用设置→「深色」；宿主把 --dsw-alias-* 写成
 *     body 内联样式，手动挂 data-ds-dark-theme 属性不改令牌=假暗色，必须点主题按钮；
 *     浮层暗色 surface 断言+截图，测完点原主题（缺省「跟随系统」）恢复）
 *   9 近底翻转（CDP 压矮视口构造近底，.mh_select_up 或 pop.top<trigger.top；不便构造则 SKIP）
 *   10 只读安全自检（全程不得发出 apply/edit/reset/discover/verify/set-default/measure 写请求）
 *   11 多平台 UI（平台切换行/16 选项/切 DeepSeek 目录与提示/切回百炼/provider-card 泛化；全读操作）
 *   12 选择器徽标（composer 模型菜单 aliyun 行 ★/✓；尽力而为，可 SKIP；只开菜单不点选）
 *
 * 导航配方（lead 已在 live GUI 手动验证）：主界面无直接「设置」按钮 → 点左下角
 * aria-label=账号菜单 → 菜单项文本为「设置Ctrl+Alt+,」（前缀匹配，勿精确等于）→
 * 设置对话框左侧导航点 normalize-space(.)==="模型" → 等 .mh_panel 且 .mh_ver 含期望版本。
 *
 * 安全：本脚本只做「可逆/不落盘」操作——筛选与编辑器草稿均为客户端本地状态，
 * 编辑器只点「取消」绝不点「保存」；暗色属性与视口覆盖用后恢复；不触碰任何写端点。
 * 浏览器是独立 headless Edge + 一次性临时 profile，不影响用户正在使用的桌面 app。
 * 登录 cookie 由本机 <DSH_HOME>/.credentials.yaml 的 browser-session secret 自签
 * （与 dsh-client-connection 同一算法），仅用于回环地址；输出不打印任何密钥/token。
 * 截图默认写入 docs/verification-assets-v0.4.0/（运行产物，--shots 可覆盖）。
 */
import { spawn } from 'node:child_process'
import { createHash, createHmac } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ===== CLI =====
const argv = process.argv.slice(2)
const argOf = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')
const HELP = argv.includes('--help') || argv.includes('-h')
const SMOKE = argv.includes('--smoke')
const BASE = argOf('url') ?? ''
const SHOTS = path.resolve(argOf('shots') ?? fileURLToPath(new URL('../docs/verification-assets-v0.4.0/', import.meta.url)))
// 动态默认 CDP 端口：固定端口会让并发运行连到同一个 Edge 页面（与 memory 脚本同策略）。
const CDP_PORT = Number(argOf('cdp-port') ?? (9300 + Math.floor(Math.random() * 600)))
const USER_DATA = path.join(os.tmpdir(), `dsh-model-hub-gui-profile-${process.pid}`)
const DSH_HOME = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const USAGE = `用法：node scripts/gui-check.mjs --url=http://127.0.0.1:<端口>/ [选项]
  --url=<地址>    必填，DSH Web GUI 回环地址（如 http://127.0.0.1:52831/）
  --edge=<路径>   Edge 可执行文件；缺省依次尝试 env EDGE_PATH、
                  C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe、
                  C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe
  --shots=<目录>  截图输出目录；缺省 <插件>/docs/verification-assets-v0.4.0/
  --smoke         只跑脚手架冒烟（Edge 启动/cookie 自签/导航 Models 页/.mh_panel），
                  不跑 0.3.0 断言——旧版 GUI 也可用于验证脚手架
  --cdp-port=<n>  CDP 端口（缺省 9300-9899 随机，避免并发互串）
  --help          显示本说明
检查项：1 面板渲染 2 筛选打开 3 键盘选择+过滤 4 Esc 5 外部点击 6 等宽
        7 编辑器下拉 8 暗色分支 9 近底翻转(可 SKIP) 10 只读安全自检 11 多平台 UI 12 选择器徽标(可 SKIP)
退出码：全部通过=0；任一失败或脚手架异常=1；--help=0；缺 --url=1。`

function resolveEdge() {
  const candidates = [
    argOf('edge'),
    process.env.EDGE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean)
  for (const c of candidates) if (existsSync(c)) return c
  throw new Error(`找不到 Edge（尝试：${candidates.join(' | ')}）；可用 --edge=<路径> 或 env EDGE_PATH 指定`)
}

// ===== 浏览器会话 cookie 自签（host: dsh-client-connection browser-session）=====
// 与 dsh-memory gui-check 同一算法；凭据文件路径可能含中文（C:\Users\李\…），
// 必须走 Node fs 读取，不要在 shell 里 cat。任何日志不得输出 secret/cookie 值。
const b64url = (buf) => Buffer.from(buf).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')

function readSigningSecret(file) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  const at = lines.findIndex((line) => line.trim() === 'client-connection/browser-session:')
  if (at === -1) throw new Error(`credentials: ${file} 缺少 client-connection/browser-session 记录`)
  const indent = lines[at].length - lines[at].trimStart().length
  for (let i = at + 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '') continue
    if (lines[i].length - lines[i].trimStart().length <= indent) break
    const matched = /^\s*secret:\s*(\S+)\s*$/.exec(lines[i])
    if (matched !== null) {
      const key = Buffer.from(matched[1].replaceAll('-', '+').replaceAll('_', '/'), 'base64')
      if (key.byteLength !== 32) throw new Error(`credentials: secret 为 ${key.byteLength} 字节，期望 32`)
      return key
    }
  }
  throw new Error('credentials: browser-session secret 缺失')
}

function authCookie(base) {
  const url = new URL(base)
  const key = readSigningSecret(path.join(DSH_HOME, '.credentials.yaml'))
  const issuedAt = Date.now()
  const expiresAt = issuedAt + 30 * 24 * 60 * 60 * 1000
  const body = b64url(Buffer.from(JSON.stringify({ version: 1, authority: url.host, issuedAt, expiresAt }), 'utf8'))
  const signature = b64url(createHmac('sha256', key).update(body).digest())
  const name = 'dsh-auth-' + b64url(createHash('sha256').update(url.host).digest())
  return { name, value: `v1.${body}.${signature}`, url: url.href }
}

// 输出脱敏：console 捕获里万一出现 cookie/长 token 一律打码。
const redact = (s) => String(s)
  .replace(/v1\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g, 'v1.[REDACTED]')
  .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[REDACTED-LONG]')

// ===== CDP 最小客户端（Node 22+ 自带 WebSocket，无第三方依赖）=====
let ws
let wsReady = false
let nextId = 0
const pending = new Map()
const events = new Map()
const requests = []
const consoleLines = []

async function connect() {
  let targets = null
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)
      targets = await res.json()
      if (Array.isArray(targets) && targets.some((t) => t.type === 'page')) break
    } catch { /* 浏览器尚未就绪 browser not ready */ }
    await sleep(250)
  }
  if (!Array.isArray(targets)) throw new Error(`CDP 端口 ${CDP_PORT} 未就绪`)
  const page = targets.find((t) => t.type === 'page')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  wsReady = true
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data)
    if (data.id !== undefined) {
      const entry = pending.get(data.id)
      if (entry !== undefined) {
        pending.delete(data.id)
        if (data.error) entry.reject(new Error(JSON.stringify(data.error)))
        else entry.resolve(data.result)
      }
      return
    }
    if (data.method === 'Runtime.consoleAPICalled') {
      consoleLines.push(`${data.params.type}: ${(data.params.args ?? []).map((a) => String(a.value ?? a.description ?? '')).join(' ')}`)
    }
    if (data.method === 'Runtime.exceptionThrown') consoleLines.push(`exception: ${data.params.exceptionDetails?.text ?? ''} ${data.params.exceptionDetails?.exception?.description ?? ''}`)
    if (data.method === 'Network.requestWillBeSent') {
      const url = data.params.request?.url ?? ''
      if (url.includes('/plugins/dsh-model-hub/')) requests.push({ url, method: data.params.request?.method ?? 'GET' })
    }
    for (const handler of events.get(data.method) ?? []) handler(data.params)
  }
}

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId
  // CDP 命令超时：Edge 崩溃时不得永久挂起（与 memory 脚本同策略）。
  const timer = setTimeout(() => {
    if (pending.has(id)) { pending.delete(id); reject(new Error(`CDP ${method} 超时 / timed out`)) }
  }, 30000)
  pending.set(id, {
    resolve: (v) => { clearTimeout(timer); resolve(v) },
    reject: (e) => { clearTimeout(timer); reject(e) },
  })
  ws.send(JSON.stringify({ id, method, params }))
})

const once = (method, timeout = 20000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`等待 ${method} 超时`)), timeout)
  const handler = (params) => {
    clearTimeout(timer)
    events.set(method, (events.get(method) ?? []).filter((item) => item !== handler))
    resolve(params)
  }
  events.set(method, [...(events.get(method) ?? []), handler])
})

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(`${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description ?? ''}`)
  return result.result?.value
}

async function key(k, code, vk) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
  await sleep(120)
}

// 真实鼠标点击（产生 document mousedown —— 检查 5 依赖真实事件而非 el.click()）。
async function mouseClick(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
  await sleep(150)
}

// ===== 检查断言（编号输出 ✔/✖/SKIP）=====
const report = { ok: true, checks: [], skips: [] }
// 期望版本（main 里从 ../package.json 读取）；waitCards 的版本门控与检查 1 共用。
let PKG_VERSION = ''
// 检查 8 中途异常时的兜底恢复旗标（themeSwitched=true 表示已点「深色」尚未恢复）。
let themeSwitched = false
function check(id, name, cond, detail = '') {
  report.checks.push({ id, name, ok: Boolean(cond), detail })
  if (!cond) report.ok = false
  const d = String(detail)
  console.log(`${cond ? '✔' : '✖'} [${id}] ${name}${cond || !d ? '' : ` — ${d.slice(0, 400)}`}`)
}
function skip(id, name, reason) {
  report.skips.push({ id, name, reason })
  console.log(`SKIP [${id}] ${name} — ${reason}`)
}

async function shot(name) {
  try {
    mkdirSync(SHOTS, { recursive: true })
    const res = await send('Page.captureScreenshot', { format: 'png' })
    const file = path.join(SHOTS, name)
    writeFileSync(file, Buffer.from(res.data, 'base64'))
    console.log(`  · 截图：${file}`)
  } catch (err) {
    console.log(`  · 截图失败（${name}）：${err?.message ?? err}`)
  }
}

// ===== 中断安全：幂等清理注册表（杀 Edge + 删临时 profile）=====
const cleanupHooks = []
let aborting = false
function registerCleanup(fn) { cleanupHooks.push(fn) }
async function runCleanupHooks() {
  const hooks = cleanupHooks.splice(0).reverse()
  for (const fn of hooks) {
    try { await fn() } catch (err) { console.error('清理钩子失败：', err?.message ?? err) }
  }
}
async function abortAndExit(code, err) {
  if (aborting) return
  aborting = true
  console.error(`GUI CHECK 中断（${code}）：`, err?.message ?? err ?? '')
  await runCleanupHooks()
  process.exit(code)
}
process.once('SIGINT', () => { void abortAndExit(130, new Error('SIGINT')) })
process.once('SIGTERM', () => { void abortAndExit(143, new Error('SIGTERM')) })
process.on('uncaughtException', (err) => { void abortAndExit(1, err) })
process.on('unhandledRejection', (err) => { void abortAndExit(1, err) })

function ownerPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch (err) { return err?.code === 'EPERM' }
}

async function removeProfileDir(dir, attempts = 6) {
  for (let i = 0; i < attempts; i += 1) {
    try { rmSync(dir, { recursive: true, force: true }); return true } catch { await sleep(400) }
  }
  return false
}

// 清扫历史临时 profile：Windows 下 Edge 子进程句柄未释放会让 rm 失败而静默残留。
function sweepStaleProfiles() {
  const base = os.tmpdir()
  let names = []
  try { names = readdirSync(base) } catch { return }
  const now = Date.now()
  for (const name of names) {
    if (!name.startsWith('dsh-model-hub-gui-profile-')) continue
    const full = path.join(base, name)
    let stat
    try { stat = statSync(full) } catch { continue }
    const match = /-(\d+)$/.exec(name)
    const pid = match ? Number(match[1]) : 0
    const stale = !ownerPidAlive(pid) || now - stat.mtimeMs > 3600_000
    if (!stale) continue
    for (let i = 0; i < 3; i += 1) {
      try { rmSync(full, { recursive: true, force: true }); break } catch { /* 句柄仍在，下次再试 */ }
    }
  }
}

// ===== 页面侧定位表达式（类名/aria-label 事实来自 client/client.js v0.3.0）=====
// 筛选 Select：工具栏内 aria-label=筛选模型/Filter models 的触发器。
const FILTER_TRIGGER = `[...document.querySelectorAll('.mh_panel .mh_toolbar .mh_select_trigger')].find(el => /^(筛选模型|Filter models)$/i.test((el.getAttribute('aria-label') || '').trim()))`
// 编辑器第一行档位：同时含 .mh_select_trigger 与 .mh_ewire 的 .mh_erow（compat 行没有 wire）。
const LEVEL_ROW0 = `[...document.querySelectorAll('.mh_panel .mh_editor .mh_erow')].find(r => r.querySelector('.mh_ewire') && r.querySelector('.mh_select_trigger'))`
const EDITOR_TRIGGER_BY_LABEL = (re) => `[...document.querySelectorAll('.mh_panel .mh_editor .mh_select_trigger')].find(el => ${re}.test((el.getAttribute('aria-label') || '').trim()))`

/** 浮层 + 打开中触发器的完整状态（一次 evaluate 取齐，供多个断言复用）。 */
async function popState() {
  return evaluate(`(() => {
    const pop = document.querySelector('.mh_select_pop')
    const trig = document.querySelector('.mh_select_trigger[aria-expanded="true"]')
    const active = document.activeElement
    const trigLabel = trig ? ((trig.querySelector('.mh_select_value') || {}).textContent || '').trim() : null
    if (!pop) return { open: false, trigExpanded: trig ? trig.getAttribute('aria-expanded') : null, trigLabel, focusCls: active ? String(active.className) : null }
    const opts = [...pop.querySelectorAll('.mh_select_opt')].map(el => ({
      index: el.getAttribute('data-index'),
      id: el.id,
      label: ((el.querySelector('.mh_select_opt_label') || {}).textContent || '').trim(),
      selected: el.getAttribute('aria-selected') === 'true',
      activeCls: el.classList.contains('mh_select_opt_active'),
      check: el.querySelector('svg.mh_select_opt_check') !== null,
      icon: el.querySelector('svg.mh_select_opt_icon') !== null,
    }))
    const pr = pop.getBoundingClientRect()
    const tr = trig ? trig.getBoundingClientRect() : null
    const cs = getComputedStyle(pop)
    return {
      open: true,
      role: pop.getAttribute('role'),
      id: pop.id,
      ad: pop.getAttribute('aria-activedescendant'),
      tabindex: pop.getAttribute('tabindex'),
      up: pop.classList.contains('mh_select_up'),
      position: cs.position,
      zIndex: cs.zIndex,
      bg: cs.backgroundColor,
      focusIsPop: active === pop,
      focusInPop: active === pop || Boolean(active && pop.contains(active)),
      trigLabel,
      trigExpanded: trig ? trig.getAttribute('aria-expanded') : null,
      trigOpenCls: trig ? trig.classList.contains('mh_select_open') : null,
      popRect: { top: pr.top, left: pr.left, width: pr.width, height: pr.height },
      trigRect: tr ? { top: tr.top, left: tr.left, width: tr.width, height: tr.height } : null,
      opts,
    }
  })()`)
}

/** 等待浮层出现且焦点已移入（首帧 visibility:hidden，place() 后的 layout effect 才 focus）。 */
async function waitPop(timeout = 3000) {
  const t0 = Date.now()
  let st = await popState()
  while (Date.now() - t0 < timeout && !(st.open && st.focusInPop)) {
    await sleep(120)
    st = await popState()
  }
  return st
}

async function openFilter() {
  const clicked = await evaluate(`(() => { const t = ${FILTER_TRIGGER}; if (!t) return false; t.click(); return true })()`)
  if (!clicked) throw new Error('找不到筛选 Select 触发器（aria-label=筛选模型/Filter models）')
  return waitPop()
}

async function closePopByEsc() {
  if (await evaluate(`document.querySelector('.mh_select_pop') !== null`)) {
    await key('Escape', 'Escape', 27)
    await sleep(200)
  }
}

/** 点击浮层内指定 data-index 的选项（选中并关闭）。 */
async function pickOptionByIndex(idx) {
  const ok = await evaluate(`(() => { const opt = document.querySelector('.mh_select_pop .mh_select_opt[data-index="${idx}"]'); if (!opt) return false; opt.click(); return true })()`)
  await sleep(350)
  return ok
}

/** 点击浮层内 label 精确匹配的选项。 */
async function pickOptionByLabel(label) {
  const ok = await evaluate(`(() => {
    const opt = [...document.querySelectorAll('.mh_select_pop .mh_select_opt')].find(o => ((o.querySelector('.mh_select_opt_label') || {}).textContent || '').trim() === ${JSON.stringify(label)})
    if (!opt) return false
    opt.click()
    return true
  })()`)
  await sleep(350)
  return ok
}

/** 点击浮层内 label 正则匹配的选项（v0.4 平台名随宿主 locale 变化）。 */
async function pickOptionByRegex(reSrc) {
  const ok = await evaluate(`(() => {
    const re = new RegExp(${JSON.stringify(reSrc)}, 'i')
    const opt = [...document.querySelectorAll('.mh_select_pop .mh_select_opt')].find(o => re.test(((o.querySelector('.mh_select_opt_label') || {}).textContent || '').trim()))
    if (!opt) return false
    opt.click()
    return true
  })()`)
  await sleep(350)
  return ok
}

const filterTriggerState = () => evaluate(`(() => {
  const t = ${FILTER_TRIGGER}
  if (!t) return null
  return { label: ((t.querySelector('.mh_select_value') || {}).textContent || '').trim(), expanded: t.getAttribute('aria-expanded'), focused: document.activeElement === t }
})()`)

const levelRowState = () => evaluate(`(() => {
  const row = ${LEVEL_ROW0}
  if (!row) return null
  const t = row.querySelector('.mh_select_trigger'), w = row.querySelector('.mh_ewire')
  return { level: ((t.querySelector('.mh_select_value') || {}).textContent || '').trim(), wire: w.value, disabled: w.disabled }
})()`)

async function pickLevel(label) {
  const opened = await evaluate(`(() => { const row = ${LEVEL_ROW0}; if (!row) return false; row.querySelector('.mh_select_trigger').click(); return true })()`)
  if (!opened) return false
  await waitPop()
  return pickOptionByLabel(label)
}

// ===== 导航：官方 Models 设置页（面板挂在 settings.models.footer 槽）=====
// GUI 路由未公开文档化，采用 CDP 点击导航。实测（0.2.2 桌面 web GUI）：侧边栏没有
// 直接「设置」按钮，入口藏在「更多」/「账号菜单」弹出菜单里。策略：
//   A. 直接找「设置/Settings」按钮；
//   B. 依次打开「更多」「账号菜单」，在弹出菜单（含 portal）里找「设置」；
//   C. 进入设置后点「模型/Models」导航项 → 等 .mh_panel。
const CLICK_SETTINGS = `(() => {
  const els = [...document.querySelectorAll('button,[role="button"],a,[role="menuitem"],[role="menuitemradio"],li')]
  const aria = (el) => (el.getAttribute('aria-label') || '').trim()
  const text = (el) => (el.textContent || '').trim()
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  // 实测菜单项文本为「设置Ctrl+Alt+,」（标签与快捷键拼接）：精确匹配之外还要前缀匹配。
  const hit = els.find(el => vis(el) && /^(设置|Settings)$/i.test(text(el)))
    || els.find(el => vis(el) && /^(设置|Settings)$/i.test(aria(el)))
    || els.find(el => vis(el) && /^(设置|Settings)/i.test(text(el)) && text(el).length <= 20)
    || els.find(el => vis(el) && /设置|Settings/i.test(aria(el)))
  if (!hit) return null
  hit.click()
  return { aria: aria(hit), text: text(hit).slice(0, 24) }
})()`

const MENU_DUMP = `(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"],[role="menu"] button,[role="dialog"] button,[role="menuitem"]')]
  .map(el => (el.textContent || '').trim().replace(/\\s+/g, ' ')).filter(t => t && t.length <= 30).slice(0, 40))()`

async function navigateToModels() {
  if (await evaluate(`document.querySelector('.mh_panel') !== null`)) return { via: 'already-on-page' }
  const trace = []
  // A. 直接入口
  let settingsClicked = await evaluate(CLICK_SETTINGS)
  trace.push({ strategy: 'direct', settingsClicked })
  // B. 弹出菜单里的入口（账号菜单优先：lead 手动验证的配方；「更多」里只有插件项）
  if (!settingsClicked) {
    for (const opener of ['账号菜单', '更多']) {
      const opened = await evaluate(`(() => {
        const els = [...document.querySelectorAll('button,[role="button"],a')]
        const hit = els.find(el => (el.getAttribute('aria-label') || '').trim() === ${JSON.stringify(opener)} || (el.textContent || '').trim() === ${JSON.stringify(opener)})
        if (!hit) return false
        hit.click()
        return true
      })()`)
      if (!opened) { trace.push({ strategy: 'menu', opener, opened: false }); continue }
      await sleep(700)
      const menu = await evaluate(MENU_DUMP)
      settingsClicked = await evaluate(CLICK_SETTINGS)
      trace.push({ strategy: 'menu', opener, menu, settingsClicked })
      if (settingsClicked) break
      await key('Escape', 'Escape', 27)
      await sleep(300)
    }
  }
  if (!settingsClicked) {
    const diag = await evaluate(`(() => ({
      url: location.href,
      buttons: [...document.querySelectorAll('button,[role="button"],a,[role="tab"]')].slice(0, 80).map(el => ({ aria: el.getAttribute('aria-label') || '', text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 24) })).filter(x => x.aria || x.text),
    }))()`)
    console.error('导航诊断：', JSON.stringify({ trace, diag }, null, 2).slice(0, 4000))
    throw new Error('找不到「设置」入口（直接按钮与 更多/账号菜单 均未命中）')
  }
  await sleep(1000)
  // C. 设置内导航到「模型/Models」
  const modelsClicked = await evaluate(`(() => {
    const els = [...document.querySelectorAll('button,[role="button"],a,[role="tab"],[role="menuitem"],li')]
    const aria = (el) => (el.getAttribute('aria-label') || '').trim()
    const text = (el) => (el.textContent || '').trim()
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
    const hit = els.find(el => vis(el) && /^(模型|Models)$/i.test(text(el)) && el.children.length <= 3)
      || els.find(el => vis(el) && /^(模型|Models)$/i.test(aria(el)))
      || els.find(el => vis(el) && /^(模型|Models)(\\s|$)/i.test(text(el)) && text(el).length <= 12)
    if (!hit) return null
    hit.click()
    return { text: text(hit).slice(0, 24), aria: aria(hit) }
  })()`)
  let panel = false
  for (let i = 0; i < 40; i += 1) {
    panel = await evaluate(`document.querySelector('.mh_panel') !== null`)
    if (panel) break
    await sleep(400)
  }
  if (!panel) {
    // 导航失败：dump 设置页可见候选，便于人工/下一轮修正选择器。
    const diag = await evaluate(`(() => ({
      url: location.href,
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map(d => (d.innerText || '').replace(/\\s+/g, ' ').slice(0, 200)),
      buttons: [...document.querySelectorAll('button,[role="button"],a,[role="tab"]')].slice(0, 80).map(el => ({ aria: el.getAttribute('aria-label') || '', text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 24) })).filter(x => x.aria || x.text),
    }))()`)
    console.error('导航诊断：', JSON.stringify({ trace, settingsClicked, modelsClicked, diag }, null, 2).slice(0, 4000))
    throw new Error('无法导航到 Models 设置页（.mh_panel 未出现）')
  }
  return { via: 'click-nav', trace, modelsClicked, url: await evaluate(`location.href`) }
}

/** 等面板数据加载完成（.mh_card 出现）且版本徽标达到期望（.mh_ver=vPKG_VERSION，
 *  防止对旧版客户端跑断言）；「加载失败」时点一次重试再继续等。 */
async function waitCards(timeoutMs = 30000) {
  const t0 = Date.now()
  let retried = false
  let st = { panel: false, cards: 0, empty: '', ver: '' }
  while (Date.now() - t0 < timeoutMs) {
    st = await evaluate(`(() => {
      const panel = document.querySelector('.mh_panel')
      if (!panel) return { panel: false, cards: 0, empty: '', ver: '' }
      return { panel: true, cards: panel.querySelectorAll('.mh_card').length, empty: ((panel.querySelector('.mh_empty') || {}).textContent || '').trim().slice(0, 80), ver: ((panel.querySelector('.mh_ver') || {}).textContent || '').trim() }
    })()`)
    if (st.panel && st.cards > 0 && st.ver === 'v' + PKG_VERSION) return st
    if (st.panel && /加载失败|Load failed/.test(st.empty) && !retried) {
      retried = true
      await evaluate(`(() => { const b = [...document.querySelectorAll('.mh_panel .mh_mini')].find(x => /重试|Retry/.test(x.textContent || '')); if (b) b.click(); return Boolean(b) })()`)
    }
    await sleep(400)
  }
  return st
}

// ===== [8] 暗色分支 helpers：宿主主题控件（设置→通用设置→浅色/深色/跟随系统）=====
// 宿主把 --dsw-alias-* 令牌写成 body 内联样式：手动 setAttribute('data-ds-dark-theme')
// 不会改写内联令牌，浮层仍白（假暗色）。必须点宿主主题按钮，测完恢复原主题。
const SETTINGS_NAV_CLICK = (re) => `(() => {
  const els = [...document.querySelectorAll('button,[role="tab"],a,[role="menuitem"],li')]
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  const norm = (el) => (el.textContent || '').replace(/\\s+/g, ' ').trim()
  const hit = els.find(el => vis(el) && ${re}.test(norm(el)) && norm(el).length <= 20)
  if (!hit) return null
  hit.click()
  return norm(hit)
})()`
const GENERAL_NAV = '/^(通用设置|通用|General|General settings)$/i'
const MODELS_NAV = '/^(模型|Models)$/i'

const THEME_BUTTONS_DUMP = `(() => [...document.querySelectorAll('button,[role="radio"],[role="menuitemradio"]')]
  .map(el => ({
    text: (el.textContent || '').replace(/\\s+/g, ' ').trim(),
    aria: (el.getAttribute('aria-label') || '').trim(),
    pressed: el.getAttribute('aria-pressed'),
    checked: el.getAttribute('aria-checked'),
    cls: String(el.className || ''),
    dataState: el.getAttribute('data-state') || el.getAttribute('data-active') || '',
  }))
  .filter(b => /^(浅色|深色|跟随系统|Light|Dark|System|Follow system)$/i.test(b.text) || /^(浅色|深色|跟随系统|Light|Dark|System)$/i.test(b.aria)))()`

const themeIsActive = (b) => b.pressed === 'true' || b.checked === 'true'
  || /(^|\s)(active|selected|is-active|is-selected|on)(\s|$)/i.test(b.cls)
  || /^(on|active|true|selected)$/i.test(b.dataState)

async function clickThemeButton(b) {
  return evaluate(`(() => {
    const els = [...document.querySelectorAll('button,[role="radio"],[role="menuitemradio"]')]
    const norm = (el) => (el.textContent || '').replace(/\\s+/g, ' ').trim()
    const hit = els.find(el => (${JSON.stringify(b.text)} !== '' && norm(el) === ${JSON.stringify(b.text)})
      || (${JSON.stringify(b.aria)} !== '' && (el.getAttribute('aria-label') || '').trim() === ${JSON.stringify(b.aria)}))
    if (!hit) return false
    hit.click()
    return true
  })()`)
}

const bodyDarkAttr = () => evaluate(`document.body.getAttribute('data-ds-dark-theme')`)

/** 设置对话框内切到通用设置页；对话框已关则走完整导航重新打开。 */
async function gotoGeneral() {
  let hit = await evaluate(SETTINGS_NAV_CLICK(GENERAL_NAV))
  if (!hit) { await navigateToModels(); hit = await evaluate(SETTINGS_NAV_CLICK(GENERAL_NAV)) }
  return hit
}

/** 回到 Models 页（面板可能已随切页卸载）；对话框已关则走完整导航。 */
async function gotoModels() {
  if (await evaluate(`document.querySelector('.mh_panel') !== null`)) return 'already'
  const hit = await evaluate(SETTINGS_NAV_CLICK(MODELS_NAV))
  if (!hit) { await navigateToModels(); return 'full-nav' }
  return hit
}

async function runDarkCheck() {
  const darkOriginal = await bodyDarkAttr()
  const navGeneral = await gotoGeneral()
  if (!navGeneral) { check(8, '暗色分支：进入通用设置页', false, '找不到「通用设置/通用」导航项'); return }
  await sleep(700)
  const themes = await evaluate(THEME_BUTTONS_DUMP)
  const darkBtn = themes.find(b => /^(深色|Dark)$/i.test(b.text) || /^(深色|Dark)$/i.test(b.aria))
  if (!darkBtn) { check(8, '暗色分支：找到主题三态控件（浅色/深色/跟随系统）', false, JSON.stringify(themes).slice(0, 300)); return }
  const originalActive = themes.find(themeIsActive) || null
  // 恢复目标：原激活主题；探测不到激活态时按 lead 配方恢复「跟随系统」。
  const restoreBtn = originalActive || { text: '跟随系统', aria: '' }
  const clickedDark = await clickThemeButton(darkBtn)
  themeSwitched = true
  let applied = await bodyDarkAttr()
  for (let i = 0; i < 25 && applied === null; i += 1) { await sleep(150); applied = await bodyDarkAttr() }
  check(8, '点「深色」：宿主挂上 data-ds-dark-theme 并改写内联令牌', clickedDark && applied !== null,
    JSON.stringify({ clickedDark, attr: applied, originalActive: originalActive && originalActive.text, themes: themes.map(t => t.text) }))
  if (applied === null) {
    await clickThemeButton(restoreBtn).catch(() => {})
    themeSwitched = false
    return
  }
  // 回 Models 页（面板重挂载会重新加载数据），打开筛选浮层断言暗色 surface。
  const navModels = await gotoModels()
  const cardsDark = await waitCards()
  const s8 = await openFilter()
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(s8.bg || '')
  const lum = rgb ? 0.2126 * Number(rgb[1]) + 0.7152 * Number(rgb[2]) + 0.0722 * Number(rgb[3]) : NaN
  check(8, '暗色分支：浮层 computed background 为暗色 surface（非白色系）',
    s8.open && Boolean(rgb) && lum < 96,
    JSON.stringify({ bg: s8.bg, luminance: Number.isNaN(lum) ? null : Math.round(lum), navModels, cards: cardsDark.cards, darkOriginal }))
  await shot('10-dark-pop.png')
  await closePopByEsc()
  // 恢复原主题。
  await gotoGeneral()
  await sleep(600)
  const clickedRestore = await clickThemeButton(restoreBtn)
  let attrAfter = await bodyDarkAttr()
  for (let i = 0; i < 25 && attrAfter !== darkOriginal; i += 1) { await sleep(150); attrAfter = await bodyDarkAttr() }
  themeSwitched = false
  check(8, `主题已恢复原状（${restoreBtn.text || restoreBtn.aria || '跟随系统'}）`, clickedRestore && attrAfter === darkOriginal,
    JSON.stringify({ before: darkOriginal, after: attrAfter }))
  // 回 Models 页供后续检查（9 近底翻转）。
  await gotoModels()
  await waitCards()
}

// ===== 主流程 =====
async function main() {
  if (HELP) { console.log(USAGE); process.exitCode = 0; return }
  if (!BASE) { console.error('缺少 --url 参数。\n\n' + USAGE); process.exitCode = 1; return }
  const EDGE = resolveEdge()
  PKG_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
  sweepStaleProfiles()
  try { rmSync(USER_DATA, { recursive: true, force: true }) } catch { /* ignore */ }
  mkdirSync(USER_DATA, { recursive: true })
  const edge = spawn(EDGE, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1400,950',
    'about:blank',
  ], { stdio: 'ignore' })
  registerCleanup(async () => {
    try { edge.kill() } catch { /* ignore */ }
    await sleep(400)
    await removeProfileDir(USER_DATA)
  })
  // 页面态恢复旗标：检查 8/9 中途异常时，finally 里兜底恢复（一次性 profile，本就不影响真实 app）。
  let overrideSet = false
  let failed = null
  try {
    console.log(`dsh-model-hub GUI check @ ${BASE}${SMOKE ? '（--smoke 脚手架冒烟）' : `（期望 v${PKG_VERSION}）`}`)
    console.log(`  · 截图目录：${SHOTS}`)
    await connect()
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Network.enable')
    if (SMOKE) check('S1', 'Edge headless 启动 + CDP 连接', true, `port=${CDP_PORT}`)
    else console.log(`  · Edge headless 已启动，CDP 端口 ${CDP_PORT}`)

    const cookie = authCookie(BASE)
    await send('Network.setCookie', { name: cookie.name, value: cookie.value, url: cookie.url, path: '/', httpOnly: true, sameSite: 'Strict' })
    if (SMOKE) check('S2', 'browser-session cookie 自签并注入（secret 32B，值不打印）', true)
    else console.log('  · browser-session cookie 已自签注入')

    const loaded = once('Page.loadEventFired')
    // 防浮空 rejection：navigate 失败提前 throw 时 loaded 未被 await，其 20s 超时
    // rejection 会走 unhandledRejection → process.exit 强杀（Windows libuv 风险路径）。
    loaded.catch(() => {})
    const navRes = await send('Page.navigate', { url: BASE })
    if (navRes && navRes.errorText) throw new Error(`页面导航失败：${navRes.errorText}（GUI 未在该端口服务？）`)
    await loaded
    // 等 boot：__DSH_BOOT__ 注入且含 dsh-model-hub 条目（旧版 0.2.0 同样满足）。
    let boot = null
    for (let i = 0; i < 50; i += 1) {
      boot = await evaluate(`(() => ({
        title: document.title,
        url: location.href,
        boot: Boolean(globalThis.__DSH_BOOT__),
        entries: globalThis.__DSH_BOOT__ ? globalThis.__DSH_BOOT__.entries.length : 0,
        hasHub: globalThis.__DSH_BOOT__ ? globalThis.__DSH_BOOT__.entries.some(e => e.id === 'dsh-model-hub') : false,
      }))()`).catch(() => null)
      if (boot && boot.boot && boot.hasHub) break
      await sleep(300)
    }
    if (!boot || !boot.boot || !boot.hasHub) {
      const bodyText = await evaluate(`(document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').slice(0, 200)`).catch(() => '')
      throw new Error(`GUI boot 未加载或不含 dsh-model-hub：${JSON.stringify(boot)} body=${bodyText}（cookie 被拒？）`)
    }
    if (SMOKE) check('S3', 'GUI boot 加载且含 dsh-model-hub 条目（cookie 鉴权通过）', true, JSON.stringify({ title: boot.title, entries: boot.entries }))
    else console.log(`  · boot 已加载：${boot.title}（${boot.entries} 条目，含 dsh-model-hub）`)
    await sleep(1200)

    // 宿主启动时可能弹「预览版说明」对话框（焦点陷阱会挡住键盘操作）：先关掉。
    const dismissed = await evaluate(`(() => {
      const dialog = [...document.querySelectorAll('[role="dialog"]')].find(el => (el.innerText || '').includes('预览版说明'))
      if (!dialog) return 'none'
      const button = dialog.querySelector('button')
      if (!button) return 'no-button'
      button.click()
      return 'dismissed'
    })()`)
    if (dismissed === 'no-button') { await key('Escape', 'Escape', 27); await sleep(500) }
    if (dismissed !== 'none') console.log(`  · 宿主预览对话框：${dismissed}`)

    const nav = await navigateToModels()
    console.log(`  · 已到达 Models 设置页：${JSON.stringify(nav)}`)

    // 同源数据面探针：只取 http 状态与 version，绝不打印 payload 里的进程 token。
    const statusProbe = await evaluate(`fetch('/plugins/dsh-model-hub/status', { credentials: 'same-origin', cache: 'no-store' })
      .then(r => r.json().then(j => ({ http: r.status, version: j && j.version })))
      .catch(e => ({ http: -1, error: String(e && e.message || e) }))`)
    console.log(`  · /status 探针：HTTP ${statusProbe.http}，服务版本 ${statusProbe.version ?? '?'}`)

    if (SMOKE) {
      const panelState = await evaluate(`(() => {
        const p = document.querySelector('.mh_panel')
        if (!p) return { panel: false }
        return { panel: true, ver: ((p.querySelector('.mh_ver') || {}).textContent || '').trim(), cards: p.querySelectorAll('.mh_card').length, triggers: p.querySelectorAll('.mh_select_trigger').length, nativeSelects: p.querySelectorAll('select').length }
      })()`)
      check('S4', 'Models 设置页渲染 .mh_panel（面板存在即冒烟通过，版本不限）', panelState.panel, JSON.stringify(panelState))
      console.log(`  · 冒烟信息：面板版本 ${panelState.ver || '?'}（本机 package.json v${PKG_VERSION}）；卡片 ${panelState.cards}，自定义触发器 ${panelState.triggers}，原生 select ${panelState.nativeSelects}`)
      console.log(`  · 形态判断：${panelState.nativeSelects === 0 && panelState.triggers >= 1 ? '客户端已是 0.3.0 自定义下拉形态（完整断言可跑）' : '客户端疑似旧版原生 select 形态（完整断言待升级后再跑）'}`)
      await shot('00-smoke-models-panel.png')
    } else {
      // ===== 0.3.0 完整断言（desktop profile 升级到 0.3.0 后再跑）=====
      const cards = await waitCards()
      if (!cards.panel || cards.cards === 0 || cards.ver !== 'v' + PKG_VERSION) {
        throw new Error(`面板数据/版本未就绪（等待 .mh_card 且 .mh_ver=v${PKG_VERSION} 超时；若仍服务旧版请升级后再跑）：${JSON.stringify(cards)}`)
      }
      console.log(`  · 面板数据就绪：${cards.cards} 张模型卡，版本 ${cards.ver}`)

      // [1] 面板渲染
      const p1 = await evaluate(`(() => {
        const panel = document.querySelector('.mh_panel')
        if (!panel) return { panel: false }
        return {
          panel: true,
          title: ((panel.querySelector('.mh_title') || {}).textContent || '').trim(),
          ver: ((panel.querySelector('.mh_ver') || {}).textContent || '').trim(),
          nativeSelects: panel.querySelectorAll('select').length,
          triggers: panel.querySelectorAll('.mh_select_trigger').length,
          cards: panel.querySelectorAll('.mh_card').length,
        }
      })()`)
      check(1, '面板渲染：.mh_panel 存在', p1.panel, JSON.stringify(p1))
      check(1, `版本徽标 .mh_ver 显示 v${PKG_VERSION}（来自 /status）`, p1.ver === 'v' + PKG_VERSION, `实际=${p1.ver}`)
      check(1, '面板内原生 <select> 数量 === 0', p1.nativeSelects === 0, String(p1.nativeSelects))
      check(1, '自定义 Select 触发器 .mh_select_trigger ≥ 1', p1.triggers >= 1, String(p1.triggers))
      await shot('01-panel.png')

      // [2] 筛选下拉打开
      const beforeCards = p1.cards
      const s2 = await openFilter()
      check(2, '点击触发器 → 浮层出现且 role=listbox', s2.open && s2.role === 'listbox', JSON.stringify({ open: s2.open, role: s2.role, id: s2.id }))
      check(2, '触发器 aria-expanded=true 且加 .mh_select_open', s2.trigExpanded === 'true' && s2.trigOpenCls === true, JSON.stringify({ expanded: s2.trigExpanded, openCls: s2.trigOpenCls }))
      check(2, 'document.activeElement 是浮层 listbox（定位后焦点移入）', s2.focusIsPop === true, JSON.stringify({ focusIsPop: s2.focusIsPop, focusInPop: s2.focusInPop, tabindex: s2.tabindex }))
      const expectLabels = [['全部', '推荐', '已验证', '未验证'], ['All', 'Recommended', 'Verified', 'Unverified']]
      const labels = s2.opts.map(o => o.label)
      check(2, '选项数 === 4（all/recommended/verified/unverified，带图标）',
        s2.opts.length === 4 && expectLabels.some(set => set.every((l, i) => labels[i] === l)) && s2.opts.every(o => o.icon),
        JSON.stringify(labels))
      const selOpt = s2.opts.find(o => o.selected)
      check(2, '当前选中项 aria-selected=true 且右侧有 check 图标', Boolean(selOpt) && selOpt.check && selOpt.selected, JSON.stringify(selOpt))
      await shot('02-filter-open.png')

      // [3] 键盘：ArrowDown 移高亮 → Enter 选中关闭 → 过滤生效（沿用 [2] 的打开状态）
      const adBefore = s2.ad
      await key('ArrowDown', 'ArrowDown', 40)
      const s3a = await popState()
      const activeOpt = s3a.opts.find(o => o.id === s3a.ad)
      check(3, 'ArrowDown：aria-activedescendant 变化且对应选项带 .mh_select_opt_active',
        Boolean(s3a.ad) && s3a.ad !== adBefore && Boolean(activeOpt) && activeOpt.activeCls,
        `${adBefore} -> ${s3a.ad}（${activeOpt ? activeOpt.label : '?'}）`)
      await key('Enter', 'Enter', 13)
      await sleep(500)
      const s3b = await popState()
      const t3 = await filterTriggerState()
      check(3, 'Enter：浮层关闭、触发器 label 变为新选中项、焦点回触发器',
        !s3b.open && Boolean(t3) && /^(推荐|Recommended)$/.test(t3.label) && t3.focused === true && t3.expanded === 'false',
        JSON.stringify({ popOpen: s3b.open, trigger: t3 }))
      const afterFilter = await evaluate(`(() => {
        const cards = [...document.querySelectorAll('.mh_panel .mh_card')]
        return { n: cards.length, allRec: cards.length > 0 && cards.every(c => c.querySelector('.mh_badge_recommended') !== null), empty: ((document.querySelector('.mh_panel .mh_empty') || {}).textContent || '').trim() }
      })()`)
      // 按实际数据断言：卡片数减少，或全部带推荐徽标，或空态；数据不足（0 卡）降级为 label 断言并注明。
      let filterOk
      let filterNote = ''
      if (beforeCards === 0) { filterOk = true; filterNote = '数据不足（过滤前 0 卡），降级为 label 断言' }
      else filterOk = afterFilter.n < beforeCards || afterFilter.allRec || (afterFilter.n === 0 && /没有匹配|No matching/.test(afterFilter.empty))
      check(3, '卡片过滤生效（推荐视图：数量变化或全部推荐徽标）', filterOk, JSON.stringify({ beforeCards, ...afterFilter, note: filterNote }))
      await shot('03-filter-recommended.png')
      // 还原「全部」，后续检查依赖完整卡片列表。
      await openFilter()
      await pickOptionByIndex(0)
      const tRestore = await filterTriggerState()
      check(3, '筛选已还原为「全部」（后续检查前置条件）', Boolean(tRestore) && /^(全部|All)$/.test(tRestore.label), JSON.stringify(tRestore))

      // [4] Esc 关闭
      await openFilter()
      await key('Escape', 'Escape', 27)
      await sleep(300)
      const s4 = await popState()
      const t4 = await filterTriggerState()
      check(4, 'Esc：浮层消失、aria-expanded=false、焦点回触发器',
        !s4.open && Boolean(t4) && t4.expanded === 'false' && t4.focused === true,
        JSON.stringify({ popOpen: s4.open, trigger: t4 }))
      await shot('04-esc-closed.png')

      // [5] 点击外部关闭（真实 mousedown 落在面板副标题空白处，浮层与触发器之外）
      await openFilter()
      const pt = await evaluate(`(() => {
        const el = document.querySelector('.mh_panel .mh_sub') || document.querySelector('.mh_panel .mh_title')
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.left + Math.min(r.width / 2, 60)), y: Math.round(r.top + r.height / 2) }
      })()`)
      await mouseClick(pt.x, pt.y)
      await sleep(300)
      const s5 = await popState()
      check(5, 'mousedown 面板空白处（浮层外）→ 浮层消失', !s5.open, JSON.stringify({ point: pt, popOpen: s5.open }))
      await shot('05-outside-closed.png')

      // [6] 等宽 + fixed/z-index
      const s6 = await openFilter()
      const dw = s6.open && s6.trigRect ? Math.abs(s6.popRect.width - s6.trigRect.width) : NaN
      check(6, '浮层宽度 === 触发按钮渲染宽度（±1px）', s6.open && dw <= 1, JSON.stringify({ pop: s6.popRect && s6.popRect.width, trigger: s6.trigRect && s6.trigRect.width, diff: dw }))
      check(6, '浮层 position:fixed 且 z-index=1200（portal 到 body）', s6.position === 'fixed' && s6.zIndex === '1200', JSON.stringify({ position: s6.position, zIndex: s6.zIndex }))
      await shot('06-equal-width.png')
      await closePopByEsc()

      // [7] 编辑器下拉（只动草稿，最后「取消」收起，绝不保存）
      const editClicked = await evaluate(`(() => {
        const card = document.querySelector('.mh_panel .mh_card')
        if (!card) return false
        const btn = [...card.querySelectorAll('.mh_card_actions .mh_mini')].find(b => /^(编辑|Edit)$/.test((b.textContent || '').trim()))
        if (!btn) return false
        btn.click()
        return true
      })()`)
      await sleep(500)
      const ed = await evaluate(`(() => {
        const editor = document.querySelector('.mh_panel .mh_card .mh_editor')
        if (!editor) return { open: false }
        const trig = [...editor.querySelectorAll('.mh_select_trigger')]
        const label = (el) => (el.getAttribute('aria-label') || '').trim()
        const levels = trig.filter(el => /^(档位|Level)$/i.test(label(el)))
        const wires = [...editor.querySelectorAll('.mh_ewire')]
        return {
          open: true,
          modelId: ((editor.closest('.mh_card').querySelector('.mh_id') || {}).textContent || '').trim(),
          total: trig.length,
          levelCount: levels.length,
          wireCount: wires.length,
          dev: trig.some(el => /^developer (角色|role)$/i.test(label(el))),
          format: trig.some(el => /^(思考格式|Thinking format)$/i.test(label(el))),
          field: trig.some(el => /^(输出字段|Output field)$/i.test(label(el))),
          triggerHeight: levels[0] ? getComputedStyle(levels[0]).height : null,
        }
      })()`)
      check(7, '第一张卡点「编辑」内联展开 .mh_editor', editClicked && ed.open, JSON.stringify({ editClicked, modelId: ed.modelId }))
      // 代码事实：level Select 每档位行一个（行数=wire 数），另加 devRole/thinkingFormat/maxTokensField 3 个。
      check(7, '编辑器 Select 齐备：level×档位行 + 3 个 compat（总数 ≥ 4）',
        ed.open && ed.wireCount >= 1 && ed.levelCount === ed.wireCount && ed.dev && ed.format && ed.field && ed.total === ed.levelCount + 3 && ed.total >= 4,
        JSON.stringify(ed))
      check(7, '编辑器内触发器高 30px（.mh_editor 覆盖规则）', ed.triggerHeight === '30px', String(ed.triggerHeight))
      await shot('07-editor-open.png')

      // level off → wire 禁用清空；选回非 off → 恢复可编辑。
      let r0 = await levelRowState()
      if (r0 && r0.level === 'off') {
        // 首行初始即 off（preset 首键为 off）：先选 low 建立「非 off 基线」，保证 off 断言有判别力。
        await pickLevel('low')
        r0 = await levelRowState()
      }
      const offOk = await pickLevel('off')
      const rOff = await levelRowState()
      check(7, 'level 选 off：同行 .mh_ewire disabled 且值清空',
        offOk && Boolean(rOff) && rOff.level === 'off' && rOff.disabled === true && rOff.wire === '',
        JSON.stringify(rOff))
      await shot('07-editor-off.png')
      const onOk = await pickLevel('low')
      const rOn = await levelRowState()
      check(7, 'level 选回非 off：wire 恢复可编辑（值回填档位名）',
        onOk && Boolean(rOn) && rOn.level === 'low' && rOn.disabled === false && rOn.wire !== '',
        JSON.stringify(rOn))

      // thinkingFormat type-ahead：按 q → 高亮跳到 q 开头选项（qwen）。
      const fmtOpened = await evaluate(`(() => { const t = ${EDITOR_TRIGGER_BY_LABEL('/^(思考格式|Thinking format)$/i')}; if (!t) return false; t.click(); return true })()`)
      const sFmt = await waitPop()
      const adBeforeFmt = sFmt.ad
      await key('q', 'KeyQ', 81)
      await sleep(250)
      const sQ = await popState()
      const qOpt = sQ.opts.find(o => o.id === sQ.ad)
      check(7, 'thinkingFormat type-ahead：按 q 后 aria-activedescendant 对应 q 开头选项且带高亮',
        fmtOpened && sQ.open && Boolean(qOpt) && /^q/i.test(qOpt.label) && qOpt.activeCls,
        JSON.stringify({ adBefore: adBeforeFmt, ad: sQ.ad, label: qOpt && qOpt.label }))
      await shot('08-typeahead-q.png')
      await key('Escape', 'Escape', 27)
      await sleep(250)
      const sEscFmt = await popState()
      const fmtFocus = await evaluate(`(() => { const a = document.activeElement; return Boolean(a && a.classList.contains('mh_select_trigger') && /^(思考格式|Thinking format)$/i.test((a.getAttribute('aria-label') || '').trim())) })()`)
      check(7, 'thinkingFormat Esc 关闭且焦点回其触发器', !sEscFmt.open && fmtFocus === true, JSON.stringify({ popOpen: sEscFmt.open, fmtFocus }))

      // 「取消」收起编辑器（不保存，避免改运行时目录）。
      const cancelled = await evaluate(`(() => {
        const b = [...document.querySelectorAll('.mh_panel .mh_editor .mh_eactions button')].find(x => /^(取消|Cancel)$/.test((x.textContent || '').trim()))
        if (!b) return false
        b.click()
        return true
      })()`)
      await sleep(400)
      const editorGone = await evaluate(`document.querySelector('.mh_panel .mh_editor') === null`)
      check(7, '点「取消」收起编辑器（未保存）', cancelled && editorGone, JSON.stringify({ cancelled, editorGone }))
      await shot('09-editor-cancelled.png')

      // [8] 暗色分支：走宿主主题控件（手动挂属性=假暗色，见 runDarkCheck 注释）。
      await runDarkCheck()

      // [9] 近底翻转（抽查，尽力而为）：CDP 压矮视口 + 滚动把触发器放到近底。
      await evaluate(`(() => {
        let n = ${FILTER_TRIGGER}, i = 0
        while (n && n !== document.documentElement) {
          if (n.scrollHeight > n.clientHeight + 4) { n.setAttribute('data-mh-gui-scroller', String(i)); n.setAttribute('data-mh-gui-scrolltop', String(n.scrollTop)); i += 1 }
          n = n.parentElement
        }
        return i
      })()`)
      await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 380, deviceScaleFactor: 1, mobile: false })
      overrideSet = true
      await sleep(400)
      const pos = await evaluate(`(() => {
        const t = ${FILTER_TRIGGER}
        if (!t) return null
        t.scrollIntoView({ block: 'end' })
        // 微调：让触发器底边停在视口底边上方 16px（spaceBelow 远小于浮层高度 → 必上翻）。
        for (let pass = 0; pass < 3; pass += 1) {
          const r = t.getBoundingClientRect()
          const diff = r.bottom - (window.innerHeight - 16)
          if (Math.abs(diff) < 2) break
          let n = t.parentElement
          while (n) { if (n.scrollHeight > n.clientHeight + 4) { n.scrollTop += diff; break } n = n.parentElement }
          window.scrollBy(0, diff)
        }
        const r = t.getBoundingClientRect()
        return { top: r.top, bottom: r.bottom, innerHeight: window.innerHeight, spaceBelow: window.innerHeight - r.bottom }
      })()`)
      const constructible = Boolean(pos) && pos.spaceBelow < 100 && pos.top > pos.spaceBelow && pos.bottom <= pos.innerHeight + 1
      if (!constructible) {
        skip(9, '近底翻转', `环境不便构造近底位置（${JSON.stringify(pos)}），不算失败`)
      } else {
        const s9 = await openFilter()
        check(9, '近底打开：浮层上翻（.mh_select_up 或 pop.top < trigger.top）',
          s9.open && (s9.up || (s9.trigRect && s9.popRect.top < s9.trigRect.top)),
          JSON.stringify({ up: s9.up, popTop: s9.popRect && s9.popRect.top, trigTop: s9.trigRect && s9.trigRect.top, spaceBelow: pos.spaceBelow }))
        await shot('11-flip-up.png')
        await closePopByEsc()
      }
      await send('Emulation.clearDeviceMetricsOverride')
      overrideSet = false
      await evaluate(`(() => {
        for (const el of document.querySelectorAll('[data-mh-gui-scroller]')) {
          el.scrollTop = Number(el.getAttribute('data-mh-gui-scrolltop') || '0')
          el.removeAttribute('data-mh-gui-scroller')
          el.removeAttribute('data-mh-gui-scrolltop')
        }
        return true
      })()`)

      // [11] v0.4 多平台 UI：平台切换行 / 16 选项 / 目录切换 / 目录路由提示 / provider-card 泛化。
      // 全部为客户端本地状态 + GET catalog/status，不触碰写端点（[10] 兜底审计）。
      const PROVIDER_TRIGGER = `[...document.querySelectorAll('.mh_panel .mh_provider_row .mh_select_trigger')].find(el => /^(平台|Platform)$/i.test((el.getAttribute('aria-label') || '').trim()))`
      const p11a = await evaluate(`(() => {
        const t = ${PROVIDER_TRIGGER}
        const panel = document.querySelector('.mh_panel')
        return { trigger: Boolean(t), label: t ? ((t.querySelector('.mh_select_value') || {}).textContent || '').trim() : null, cards: panel ? panel.querySelectorAll('.mh_card').length : 0 }
      })()`)
      check(11, '平台切换行存在且默认百炼', p11a.trigger && /百炼|Bailian/i.test(p11a.label || ''), JSON.stringify(p11a))
      await evaluate(`(() => { const t = ${PROVIDER_TRIGGER}; if (t) t.click(); return Boolean(t) })()`)
      const s11 = await waitPop()
      check(11, '平台下拉：16 个平台选项', s11.open && s11.opts.length === 16, JSON.stringify({ open: s11.open, n: s11.opts.length }))
      await shot('12-provider-open.png')
      const pickedDs = await pickOptionByRegex('^DeepSeek$')
      await sleep(1500)
      const p11b = await evaluate(`(() => {
        const panel = document.querySelector('.mh_panel')
        if (!panel) return null
        const ids = [...panel.querySelectorAll('.mh_card .mh_id')].map(x => (x.textContent || '').trim())
        const note = panel.querySelector('.mh_note')
        const t = ${PROVIDER_TRIGGER}
        return { ids, note: note ? (note.textContent || '').slice(0, 40) : null, label: t ? ((t.querySelector('.mh_select_value') || {}).textContent || '').trim() : null }
      })()`)
      check(11, '切到 DeepSeek：目录变为 deepseek 模型 + 目录路由提示出现',
        pickedDs && Boolean(p11b) && p11b.ids.some(x => /^deepseek-/.test(x)) && Boolean(p11b.note) && /DeepSeek/i.test(p11b.label || ''),
        JSON.stringify(p11b))
      await shot('13-provider-deepseek.png')
      await evaluate(`(() => { const t = ${PROVIDER_TRIGGER}; if (t) t.click(); return Boolean(t) })()`)
      await waitPop()
      const pickedBack = await pickOptionByRegex('百炼|Bailian')
      await sleep(1500)
      const p11c = await evaluate(`(() => {
        const panel = document.querySelector('.mh_panel')
        if (!panel) return null
        const ids = [...panel.querySelectorAll('.mh_card .mh_id')].map(x => (x.textContent || '').trim())
        return { n: ids.length, hasQwen: ids.some(x => /qwen/.test(x)), note: Boolean(panel.querySelector('.mh_note')) }
      })()`)
      check(11, '切回百炼：目录恢复且无目录路由提示（custom 路由）',
        pickedBack && Boolean(p11c) && p11c.hasQwen && !p11c.note, JSON.stringify(p11c))
      const cardRows = await evaluate(`document.querySelectorAll('.mh_cardrow').length`)
      check(11, 'provider-card 快捷状态 ≥1 行（泛化到 hub 平台）', cardRows >= 1, String(cardRows))
      await shot('14-provider-cards.png')

      // [12] v0.4 选择器徽标（尽力而为）：composer 模型菜单内 aliyun 模型行应带 ★/✓ 徽标。
      // 只开菜单/钻取模型面板，绝不点选模型行（不改会话选择）。找不到 composer 则 SKIP。
      await key('Escape', 'Escape', 27)
      await sleep(600)
      await evaluate(`(() => { const d = document.querySelector('[role="dialog"]'); if (!d) return false; const b = d.querySelector('button[aria-label="关闭"],button[aria-label="Close"]'); if (b) { b.click(); return true } return false })()`)
      await sleep(800)
      const TRIGGER12 = `[...document.querySelectorAll('button[aria-haspopup="menu"]')].find(b => /^(选择模型，当前|Select model, current)/i.test((b.getAttribute('aria-label') || '').trim()))`
      const trig12 = await evaluate(`(() => { const t = ${TRIGGER12}; if (!t) return null; const r = t.getBoundingClientRect(); return { aria: t.getAttribute('aria-label'), visible: r.width > 0 && r.height > 0 } })()`)
      if (!trig12 || !trig12.visible) {
        skip(12, '选择器徽标', '当前视图无可见 composer 模型触发器（无活动会话或布局不便），不算失败')
      } else {
        await evaluate(`(() => { const t = ${TRIGGER12}; t.click(); return true })()`)
        await sleep(700)
        const drilled = await evaluate(`(() => {
          const menu = document.querySelector('[aria-label="模型与推理等级"],[aria-label="Model and reasoning effort"]')
          if (!menu) return false
          const cell = [...menu.querySelectorAll('button[role="menuitem"]')].find(b => /^(模型|Model)$/.test(((b.querySelector('span') || {}).textContent || '').trim()))
          if (!cell) return false
          cell.click()
          return true
        })()`)
        let badgeState = { badges: 0, aliyunBadges: 0, aliyunRows: 0 }
        const t12 = Date.now()
        while (Date.now() - t12 < 10000) {
          badgeState = await evaluate(`(() => {
            const menu = document.querySelector('[aria-label="模型与推理等级"],[aria-label="Model and reasoning effort"]')
            if (!menu) return { badges: 0, aliyunBadges: 0, aliyunRows: 0 }
            const rows = [...menu.querySelectorAll('[data-provider-id="aliyun"]')]
            return { badges: menu.querySelectorAll('.mh_label_badge').length, aliyunBadges: rows.reduce((n, r) => n + r.querySelectorAll('.mh_label_badge').length, 0), aliyunRows: rows.length }
          })()`)
          if (badgeState.aliyunBadges > 0) break
          await sleep(500)
        }
        check(12, '模型菜单 aliyun 模型行带 hub 徽标（★/✓，经目录索引缓存）', drilled && badgeState.aliyunBadges >= 1, JSON.stringify({ drilled, ...badgeState }))
        await shot('15-selector-badges.png')
        await key('Escape', 'Escape', 27)
        await sleep(300)
        await key('Escape', 'Escape', 27)
        await sleep(300)
      }

      // [10] 只读安全自检：全程不得发出写操作请求（保护运行时目录）。
      const writes = requests.filter(r => r.method !== 'GET' && /\/(apply|discover|verify|set-default|edit|reset|measure-max-output)(\?|$)/.test(r.url))
      check(10, '只读安全：全程未发出写操作请求（apply/edit/reset/discover/verify/set-default/measure）', writes.length === 0, JSON.stringify(writes.slice(0, 5)))
      const exceptions = consoleLines.filter(l => l.startsWith('exception:'))
      console.log(`  · 页面 JS 异常：${exceptions.length} 条（宿主自身异常不计入断言；失败时随 CONSOLE 输出）`)
    }
  } catch (err) {
    failed = err
    console.error('GUI CHECK 异常：', err)
  } finally {
    // 页面态兜底恢复（中途异常时）：关浮层、还原暗色属性、清视口覆盖。一次性 profile，不影响真实 app。
    if (wsReady) {
      try { await closePopByEsc() } catch { /* ignore */ }
      try { if (overrideSet) await send('Emulation.clearDeviceMetricsOverride') } catch { /* ignore */ }
      try {
        if (themeSwitched) {
          // 尽力恢复：通用设置 → 跟随系统（一次性 profile，本就不影响真实 app）。
          await evaluate(SETTINGS_NAV_CLICK(GENERAL_NAV))
          await sleep(500)
          await clickThemeButton({ text: '跟随系统', aria: '' })
          themeSwitched = false
        }
      } catch { /* ignore */ }
    }
    try { ws?.close() } catch { /* ignore */ }
    wsReady = false
    await runCleanupHooks()
  }
  const passed = report.checks.filter(c => c.ok).length
  const failedN = report.checks.filter(c => !c.ok).length
  console.log(`\n结果：${passed} 通过，${failedN} 失败，${report.skips.length} 跳过`)
  if (!report.ok && consoleLines.length > 0) console.log('CONSOLE ' + redact(JSON.stringify(consoleLines.slice(0, 20), null, 2)))
  // 用 exitCode 而非 process.exit()：Windows 上 Edge 子进程/管道收尾时强制 exit 偶发 libuv 断言（memory 脚本同款教训）。
  process.exitCode = failed !== null || !report.ok ? 1 : 0
}

main().catch((err) => { console.error('gui-check 启动失败：', err); process.exitCode = 1 })
