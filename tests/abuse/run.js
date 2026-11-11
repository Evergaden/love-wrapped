#!/usr/bin/env node
'use strict'
/*
 * 本地滥用测试台 runner。不部署云端、不连真实微信接口：
 *   - 云函数用例：直接 require cloudfunctions/<fn>/index.js，把 exports.main 当普通 async 函数调；
 *     wx-server-sdk 由 <root>/node_modules/wx-server-sdk/ 下的 stub 顶住
 *     （require('wx-server-sdk') 从云函数目录逐级向上解析到这里）。
 *   - 客户端用例：直接 require utils/<mod>.js 调用指定函数；wx.* 由最小 stub 顶住。
 *
 * 用法：
 *   node tests/abuse/run.js --all          跑完 cases.json 全部用例，结果写 tests/abuse/results.json（JSON 数组），退出码 0
 *   node tests/abuse/run.js --case <id>    单跑一例，把该例结果 JSON 打到 stdout，退出码 0
 *
 * 退出码：0 = 测试台正常跑完（用例本身 crashed / accepted-bad-input 也算正常完成，结论看结果字段）；
 *        非 0 = 测试台自身故障（cases.json 缺失或损坏、目标文件缺失、未知用例 id、results.json 写不进等）。
 *
 * 每例结果：{"caseId":"...","outcome":"crashed|hung|accepted-bad-input|rejected|graceful|not-runnable","detail":"关键证据摘录"}
 * 判定口径：
 *   未捕获异常或非预期 rejection        → crashed
 *   超过 5 秒没返回                    → hung
 *   expect=reject/forbidden 但返回成功/放行 → accepted-bad-input
 *   expect=reject 且确实拒绝            → rejected
 *   expect=no-crash 且没崩              → graceful
 *   本地没法模拟（清单缺字段/目标文件缺失/不认识的 kind）→ not-runnable
 *
 * 所有路径用 __dirname 拼，不依赖 cwd。
 */

const fs = require('fs')
const path = require('path')

const ABUSE_DIR = __dirname
const ROOT = path.resolve(__dirname, '..', '..')
const CASES_PATH = path.join(ABUSE_DIR, 'cases.json')
const RESULTS_PATH = path.join(ABUSE_DIR, 'results.json')
// stub 源码随仓库走（tests/abuse/wx-server-sdk-stub.js）；node_modules/ 被 gitignore，
// 每次开跑先安装一份到 node_modules/wx-server-sdk/——云函数 require('wx-server-sdk')
// 从各自目录逐级向上解析到这里。安装是覆盖式的，仓库源和生效 stub 永远是同一份。
const STUB_SRC = path.join(ABUSE_DIR, 'wx-server-sdk-stub.js')
const STUB_DIR = path.join(ROOT, 'node_modules', 'wx-server-sdk')
const STUB_ENTRY = path.join(STUB_DIR, 'index.js')
const CASE_TIMEOUT_MS = 5000
const BANNED_MARKER = 'BANNED-MARKER'
// 限频/节流类拒绝的关键词：用于区分「普通业务拒绝」与「限频拒绝」。
const THROTTLE_RE = /限频|频繁|太快|稍后再试|稍后重试|too many|rate|throttle|flood/i

function fail(msg) {
  console.error('[abuse-bench] ' + msg)
  process.exit(1)
}

function loadStub() {
  try {
    if (!fs.existsSync(STUB_SRC)) fail('找不到 stub 源：' + STUB_SRC)
    fs.mkdirSync(STUB_DIR, { recursive: true })
    fs.copyFileSync(STUB_SRC, STUB_ENTRY)
    fs.writeFileSync(
      path.join(STUB_DIR, 'package.json'),
      JSON.stringify({ name: 'wx-server-sdk', version: '0.0.0-abuse-stub', main: 'index.js' }, null, 2) + '\n',
      'utf8'
    )
    return require(STUB_ENTRY)
  } catch (err) {
    fail('安装或加载 wx-server-sdk stub 失败（' + STUB_DIR + '）：' + err.message)
  }
}
const stub = loadStub()

// 捕获用例执行期间游离的 rejection（口径：非预期 rejection = crashed）。
let unhandledCapture = null
process.on('unhandledRejection', (reason) => {
  unhandledCapture = { reason: safeStr(reason) }
})

// ---------------- 小工具 ----------------

function short(s, n) {
  s = String(s)
  const max = n || 240
  return s.length > max ? s.slice(0, max) + '…' : s
}

function safeStr(err) {
  if (err instanceof Error) return short((err.stack || String(err)).split('\n').slice(0, 3).join(' | '), 300)
  let s
  try { s = JSON.stringify(err) } catch (e) { s = String(err) }
  return short(s || String(err), 300)
}

function countBy(arr) {
  const m = {}
  for (const x of arr) m[x] = (m[x] || 0) + 1
  return m
}

function summaryToPairs(m) {
  return Object.keys(m).sort().map((k) => k + '×' + m[k]).join('，')
}

// stub 状态里摘证据：写了/改了哪些集合。
function dbWriteSummary() {
  const s = stub.__abuseState
  const parts = []
  const adds = countBy(s.ops.add.map((a) => a.collection))
  for (const k of Object.keys(adds).sort()) parts.push(k + '.add×' + adds[k])
  const ups = countBy(s.ops.update.map((u) => u.collection))
  for (const k of Object.keys(ups).sort()) parts.push(k + '.update×' + ups[k])
  return parts.length ? parts.join('，') : '无'
}

function querySummary(collectionName) {
  const s = stub.__abuseState
  const q = s.ops.query.filter((x) => !collectionName || x.collection === collectionName)
  return q.length
}

// msgSecCheck 有没有被调、送检了什么。
function secCheckSummary() {
  const calls = stub.__abuseState.msgSecCheckCalls
  if (!calls.length) return 'msgSecCheck 调用 0 次'
  const first = calls[0]
  const len = Array.from(String(first.content || '')).length
  const marker = String(first.content || '').indexOf(BANNED_MARKER) >= 0
  return 'msgSecCheck 调用 ' + calls.length + ' 次，首调实收 ' + len + ' 字、含 BANNED-MARKER=' + marker
}

function j(v, n) {
  let s
  try { s = JSON.stringify(v) } catch (e) { s = String(v) }
  return short(s, n)
}

// ---------------- 执行引擎 ----------------

function withTimeout(p, ms) {
  let timer
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const err = new Error('执行超过 ' + ms + 'ms 未返回')
      err.__abuseTimeout = true
      reject(err)
    }, ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

// 客户端 util 用例：给 wx.* 一个最小 stub（record.js 本身不用 wx，兜住以防万一）。
function installWxStub() {
  if (globalThis.wx) return
  globalThis.wx = {
    getStorageSync: () => '',
    setStorageSync: () => {},
    removeStorageSync: () => {},
    clearStorageSync: () => {},
    getSystemInfoSync: () => ({ platform: 'devtools', windowWidth: 375, windowHeight: 667, pixelRatio: 2, SDKVersion: '0.0.0' }),
    showToast: () => {},
    showModal: () => {},
    request() { throw new Error('abuse bench: wx.request 不应被调用') }
  }
}

function targetFileOf(c, parsed) {
  if (c.kind === 'client-util') return path.join(ROOT, String((parsed && parsed.module) || c.target || ''))
  if (c.kind === 'cloud-function') return path.join(ROOT, 'cloudfunctions', String(c.target || ''), 'index.js')
  return null
}

// 把用例真正跑起来，返回结果数组。抛错交由上层分类。
async function execute(parsed, c, stubCfg, ctx) {
  for (const k of Object.keys((stubCfg && stubCfg.env) || {})) process.env[k] = String(stubCfg.env[k])

  if (c.kind === 'client-util') {
    installWxStub()
    const rel = String((parsed && parsed.module) || c.target)
    const modPath = path.join(ROOT, rel)
    const mod = require(modPath)
    ctx.utilModule = mod
    const fnName = (parsed && parsed.call) || ''
    const fn = mod[fnName]
    if (typeof fn !== 'function') {
      const err = new Error('模块 ' + rel + ' 没有导出函数 ' + JSON.stringify(fnName))
      err.__abuseNotRunnable = true
      throw err
    }
    return [await fn.apply(mod, (parsed && parsed.args) || [])]
  }

  if (c.kind === 'cloud-function') {
    const fnPath = path.join(ROOT, 'cloudfunctions', String(c.target), 'index.js')
    // 每例重新加载云函数：模块级读取（如 reminderSend 的 process.env.REMINDER_TEMPLATE_ID）随本例 env 刷新。
    delete require.cache[require.resolve(fnPath)]
    const mod = require(fnPath)
    if (typeof mod.main !== 'function') {
      const err = new Error('云函数 ' + c.target + ' 的 index.js 没有导出 main')
      err.__abuseNotRunnable = true
      throw err
    }
    const repeat = Number(stubCfg && stubCfg.repeat) || 1
    const concurrency = Number(stubCfg && stubCfg.concurrency) || 1
    if (concurrency > 1) {
      // 并发实例：真实交错（stub 每个操作隔一个 setImmediate）。
      const runs = []
      for (let i = 0; i < concurrency; i++) runs.push(mod.main(parsed.event || {}))
      return await Promise.all(runs)
    }
    const out = []
    for (let i = 0; i < repeat; i++) out.push(await mod.main(parsed.event || {}))
    return out
  }

  const err = new Error('不认识的 kind=' + j(c.kind) + '，本地无法模拟')
  err.__abuseNotRunnable = true
  throw err
}

// ---------------- 判定 ----------------

function evaluate(c, ctx) {
  const returns = ctx.returns || []
  if (ctx.timedOut) {
    return { outcome: 'hung', detail: '执行超过 ' + CASE_TIMEOUT_MS + 'ms 未返回；期间 db 写入：' + dbWriteSummary() }
  }
  if (ctx.error) {
    return { outcome: 'crashed', detail: '未捕获异常：' + safeStr(ctx.error) }
  }
  if (ctx.unhandled) {
    return { outcome: 'crashed', detail: '执行期间出现未捕获 rejection：' + ctx.unhandled.reason }
  }

  switch (c.id) {
    case 'shareBook-bypass-msgseccheck': {
      const r = returns[0] || {}
      const add = stub.__abuseState.ops.add[0]
      const storyHasMarker = !!(add && add.doc && add.doc.answers &&
        String(add.doc.answers.story || '').indexOf(BANNED_MARKER) >= 0)
      if (r.ok === true) {
        return { outcome: 'accepted-bad-input', detail: '返回 ' + j(r) + '；' + secCheckSummary() + '；db 写入：' + dbWriteSummary() + '，落库 story 含 BANNED-MARKER=' + storyHasMarker }
      }
      if (r.ok === false) {
        return { outcome: 'rejected', detail: '返回 ' + j(r) + '；' + secCheckSummary() + '；db 写入：' + dbWriteSummary() }
      }
      return { outcome: 'accepted-bad-input', detail: '返回值不含 ok:false 拒绝语义：' + j(r) + '；' + secCheckSummary() }
    }

    case 'shareBook-title-injection': {
      const r = returns[0] || {}
      const add = stub.__abuseState.ops.add[0]
      const storedTitle = add && add.doc && add.doc.title
      if (r.ok === true) {
        return { outcome: 'accepted-bad-input', detail: '返回 ' + j(r) + '；title 入库值=' + j(storedTitle, 60) + '；' + secCheckSummary() + '；db 写入：' + dbWriteSummary() }
      }
      return { outcome: 'rejected', detail: '返回 ' + j(r) + '；' + secCheckSummary() + '；db 写入：' + dbWriteSummary() }
    }

    case 'contentCheck-window-exhaust': {
      const r = returns[0] || {}
      if (r && r.ok === true && r.risky === false) {
        return { outcome: 'accepted-bad-input', detail: '返回 ' + j(r) + '（BANNED-MARKER 被放行）；' + secCheckSummary() }
      }
      return { outcome: 'rejected', detail: '返回 ' + j(r) + '；' + secCheckSummary() }
    }

    case 'shareBook-oversize-answers': {
      const r = returns[0] || {}
      const add = stub.__abuseState.ops.add[0]
      const a = add && add.doc && add.doc.answers
      const storyLen = a ? Array.from(String(a.story || '')).length : 0
      const junk = a && a.junk !== undefined ? j(a.junk, 60) : '（未保留）'
      if (r.ok === true) {
        return { outcome: 'accepted-bad-input', detail: '返回 ' + j(r) + '；落库 story 长度 ' + storyLen + '、未知字段 junk=' + junk + '（无 normalize/限长/丢未知字段）；db 写入：' + dbWriteSummary() }
      }
      return { outcome: 'rejected', detail: '返回 ' + j(r) + '；db 写入：' + dbWriteSummary() }
    }

    case 'shareBook-no-quota': {
      const okCount = returns.filter((r) => r && r.ok === true).length
      if (okCount > 0) {
        return { outcome: 'accepted-bad-input', detail: 'repeat=' + returns.length + '：' + okCount + ' 次返回 ok:true、每次都发新 token；db 写入：' + dbWriteSummary() + '（无按 OPENID 限频限量）' }
      }
      return { outcome: 'rejected', detail: 'repeat=' + returns.length + ' 全部拒绝，首个拒绝：' + j(returns[0]) + '；db 写入：' + dbWriteSummary() }
    }

    case 'contentCheck-failopen-on-error': {
      const r = returns[0] || {}
      if (r && r.ok === true && r.risky === false) {
        return { outcome: 'accepted-bad-input', detail: 'mock msgSecCheck 抛错后返回 ' + j(r) + '（fail-open 放行 BANNED-MARKER）；' + secCheckSummary() }
      }
      if (r && r.risky === true) {
        return { outcome: 'rejected', detail: '返回 ' + j(r) + '（检测失败未放行）；' + secCheckSummary() }
      }
      return { outcome: 'rejected', detail: '返回 ' + j(r) + '；' + secCheckSummary() }
    }

    case 'reminderSend-concurrent-duplicate': {
      const s = stub.__abuseState
      const sends = s.sendCalls
      const responses = returns.map((r) => j(r, 160)).join(' ; ')
      const foundOk = returns.every((r) => r && typeof r.found === 'number' && r.found >= 1)
      if (!foundOk || sends.length === 0) {
        // due-plan stub 应当至少查到一条到期计划；查不到说明测试台配置问题，不能当业务结论。
        return { outcome: 'not-runnable', detail: 'stub 未命中到期计划（found=0 或无 send），无法验证并发重复；responses=' + responses + '；db 写入：' + dbWriteSummary() }
      }
      const byUser = countBy(sends.map((x) => String(x.touser)))
      const dupMax = Object.keys(byUser).reduce((m, k) => Math.max(m, byUser[k]), 0)
      if (dupMax > 1) {
        return { outcome: 'accepted-bad-input', detail: '并发 ' + returns.length + ' 实例：同一计划被发送 ' + dupMax + ' 次（send 共 ' + sends.length + ' 次）；responses=' + responses + '；db 写入：' + dbWriteSummary() }
      }
      return { outcome: 'rejected', detail: '并发 ' + returns.length + ' 实例仅发送 ' + sends.length + ' 次（无重复）；responses=' + responses + '；db 写入：' + dbWriteSummary() }
    }

    case 'reminderSend-manual-early-trigger': {
      const r = returns[0] || {}
      const sends = stub.__abuseState.sendCalls.length
      if (typeof r.found === 'number' && r.found === 0 && sends === 0) {
        return { outcome: 'not-runnable', detail: 'stub 未注入到期计划（found=0），无法验证手动直调路径；返回 ' + j(r) }
      }
      return { outcome: 'graceful', detail: '正常返回 ' + j(r) + '；subscribeMessage.send 调用 ' + sends + ' 次；db 写入：' + dbWriteSummary() }
    }

    case 'getSharedBook-miss-flood': {
      const queryCount = querySummary('shares')
      const okTrue = returns.filter((r) => r && r.ok === true).length
      const throttled = returns.filter((r) => r && r.ok === false && THROTTLE_RE.test(String(r.error || ''))).length
      if (okTrue > 0) {
        return { outcome: 'accepted-bad-input', detail: 'repeat=' + returns.length + ' 中 ' + okTrue + ' 次返回 ok:true；shares 查询 ' + queryCount + ' 次' }
      }
      if (throttled > 0) {
        return { outcome: 'rejected', detail: 'repeat=' + returns.length + '：出现 ' + throttled + ' 次限频类拒绝；shares 查询 ' + queryCount + ' 次' }
      }
      return { outcome: 'accepted-bad-input', detail: 'repeat=' + returns.length + '：全部返回业务性拒绝（如「' + short((returns[0] && returns[0].error) || '', 40) + '」）、0 次限频信号；shares 查询 ' + queryCount + ' 次全部执行（无未命中节流，配额照常被消耗）' }
    }

    case 'record-pickform-relay-unbounded': {
      const ret = returns[0] || {}
      const arg0 = (ctx.input && ctx.input.args && ctx.input.args[0]) || {}
      const inLen = Array.from(String(arg0.myNickname || '')).length
      const outLen = Array.from(String(ret.myNickname || '')).length
      let normNote = ''
      try {
        const rec = ctx.utilModule
        normNote = '；normalize 对照组 myNickname=' + Array.from(String(rec.normalize(arg0).myNickname)).length + ' 字'
      } catch (e) {
        normNote = '；normalize 对照组取不到（' + safeStr(e) + '）'
      }
      return { outcome: 'graceful', detail: 'pickForm 正常返回、未崩溃；回读 myNickname 长度 ' + outLen + '（入参 ' + inLen + ' 字，未截断）' + normNote }
    }

    default: {
      // 未知用例 id 的机械口径兜底。
      const expect = c.expect
      const anySuccess = returns.some((r) => r && typeof r === 'object' && r.ok === true && r.risky !== true)
      if (expect === 'reject' || expect === 'forbidden') {
        return anySuccess
          ? { outcome: 'accepted-bad-input', detail: 'expect=' + j(expect) + '；返回成功/放行：' + j(returns[0]) + '；db 写入：' + dbWriteSummary() + '；' + secCheckSummary() }
          : { outcome: 'rejected', detail: 'expect=' + j(expect) + '；返回拒绝：' + j(returns[0]) }
      }
      if (expect === 'no-crash') {
        return { outcome: 'graceful', detail: 'expect=no-crash；未崩溃，返回 ' + j(returns[0]) }
      }
      return { outcome: 'graceful', detail: '未知 expect=' + j(expect) + '；未崩溃，返回 ' + j(returns[0]) + '；db 写入：' + dbWriteSummary() }
    }
  }
}

// ---------------- 单例运行 ----------------

async function runOne(c) {
  const noRun = (detail) => ({ caseId: c.id, outcome: 'not-runnable', detail: detail })

  let parsed
  try {
    parsed = typeof c.input === 'string' ? JSON.parse(c.input) : c.input
  } catch (err) {
    return noRun('input 不是合法 JSON，无法构造用例：' + safeStr(err))
  }
  const stubCfg = (parsed && parsed.stub) || {}

  if (!c.kind) return noRun('用例缺 kind 字段（cloud-function / client-util），本地无法模拟')
  const targetFile = targetFileOf(c, parsed)
  if (targetFile && !fs.existsSync(targetFile)) return noRun('目标文件不存在：' + targetFile)

  try {
    stub.__abuseReset(stubCfg)
  } catch (err) {
    return noRun('stub 初始化失败（stub=' + j(stubCfg) + '）：' + safeStr(err))
  }

  const ctx = { returns: null, error: null, timedOut: false, unhandled: null, input: parsed, utilModule: null }
  unhandledCapture = null
  try {
    ctx.returns = await withTimeout(execute(parsed, c, stubCfg, ctx), CASE_TIMEOUT_MS)
  } catch (err) {
    if (err && err.__abuseNotRunnable) return noRun(safeStr(err))
    if (err && err.__abuseTimeout) ctx.timedOut = true
    else ctx.error = err
  }
  if (unhandledCapture) ctx.unhandled = unhandledCapture

  const verdict = evaluate(c, ctx)
  return { caseId: c.id, outcome: verdict.outcome, detail: verdict.detail }
}

// ---------------- CLI ----------------

function writeOut(s) {
  if (!s) return Promise.resolve()
  return new Promise((resolve) => process.stdout.write(s, resolve))
}

function loadCases() {
  let raw
  try {
    raw = fs.readFileSync(CASES_PATH, 'utf8')
  } catch (err) {
    fail('读不到 cases.json（' + CASES_PATH + '）：' + err.message)
  }
  let data
  try {
    data = JSON.parse(raw)
  } catch (err) {
    fail('cases.json 不是合法 JSON：' + err.message)
  }
  if (!data || !Array.isArray(data.cases)) fail('cases.json 缺少 cases 数组，清单格式坏')
  return data.cases
}

async function main() {
  const argv = process.argv.slice(2)

  if (argv[0] === '--case') {
    const id = argv[1]
    if (!id) fail('--case 需要一个用例 id，例如：--case shareBook-bypass-msgseccheck')
    const cases = loadCases()
    const c = cases.find((x) => x && x.id === id)
    if (!c) fail('cases.json 里没有 id 为 ' + JSON.stringify(id) + ' 的用例。可用 id：' + cases.map((x) => x && x.id).join(', '))
    const result = await runOne(c)
    await writeOut(JSON.stringify(result, null, 2) + '\n')
    process.exit(0)
  }

  if (argv[0] === '--all') {
    const cases = loadCases()
    const results = []
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i]
      if (!c || typeof c.id !== 'string') {
        results.push({ caseId: '(index ' + i + ')', outcome: 'not-runnable', detail: '用例对象缺 id 或不是对象' })
        continue
      }
      const result = await runOne(c)
      results.push(result)
      console.error('[abuse-bench] ' + (i + 1) + '/' + cases.length + ' ' + result.caseId + ' → ' + result.outcome)
    }
    try {
      fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2) + '\n', 'utf8')
    } catch (err) {
      fail('写不进 results.json（' + RESULTS_PATH + '）：' + err.message)
    }
    console.error('[abuse-bench] 共 ' + results.length + ' 例，结果已写入 ' + RESULTS_PATH)
    process.exit(0)
  }

  fail('用法：node tests/abuse/run.js --all ｜ node tests/abuse/run.js --case <id>')
}

main().catch((err) => fail('测试台自身故障：' + safeStr(err)))
