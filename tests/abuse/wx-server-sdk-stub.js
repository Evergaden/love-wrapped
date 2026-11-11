'use strict'
// wx-server-sdk 本地替身（滥用测试台专用，不联网、不部署云端）。
//
// 只实现本项目四个云函数实际用到的 API 面：
//   cloud.init / cloud.DYNAMIC_CURRENT_ENV / cloud.getWXContext / cloud.database
//   cloud.callFunction                          （shareBook → contentCheck，路由到真实云函数模块）
//   cloud.openapi.security.msgSecCheck          （contentCheck）
//   cloud.openapi.subscribeMessage.send         （reminderSend）
//   db.createCollection / db.serverDate / db.command.neq|eq|gt
//   db.collection(name).add / .where().limit().get() / .where().count()
//     / .where().update()（条件更新，全部命中行） / .doc().update
//
// 忠实度说明：serverDate() 哨兵在写入时解析成真实 Date（与真实数据库一致），
// 这样按时间条件（_.gt）过滤、按 expireAt 判过期的逻辑在本地也是真的。
//
// 记录能力（复核用）：
//   __abuseState.ops.add / .update / .query / .createCollection —— 写了哪个集合、查了哪个集合
//   __abuseState.msgSecCheckCalls                              —— 有没有调 msgSecCheck、送检了什么文本
//   __abuseState.sendCalls                                     —— 订阅消息发送实参
//
// mock 响应由用例 cases.json 的 stub 字段驱动，经 __abuseReset(config) 注入：
//   db:          'ok' | 'empty' | 'due-plan'（due-plan 会预置一条「7 天后到期」的 reminders 计划）
//   msgSecCheck: 'risky'（无条件判违规）| 'risky-on-banned'（仅当送检文本含 BANNED-MARKER 时判违规）| 'error'（直接抛错，模拟限频/故障）
//   send:        '43101'（订阅消息发送抛 43101）| 缺省成功
//   env:         { K: V } 写入 process.env（由 run.js 在 require 云函数前设置）
//
// 所有异步操作都隔一个 setImmediate 再返回：让并发用例（reminderSend 双实例）产生真实交错，
// 而不是被同步 mock 伪装成单线程顺序执行。

const BANNED_MARKER = 'BANNED-MARKER'

const path = require('path')

const state = {
  config: {},
  store: {},   // 集合名 -> 文档数组（内存数据库）
  ops: { createCollection: [], add: [], query: [], update: [] },
  msgSecCheckCalls: [],
  sendCalls: []
}

const TICK = () => new Promise((resolve) => setImmediate(resolve))

// serverDate 哨兵在写入时解析成真实 Date（真实数据库是服务端落库时定的值）。
function resolveServerDate(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if (v.__serverDate) return new Date(Date.now() + (v.offset || 0))
    const out = {}
    for (const k of Object.keys(v)) out[k] = resolveServerDate(v[k])
    return out
  }
  if (Array.isArray(v)) return v.map(resolveServerDate)
  return v
}

function pad(n) { return n < 10 ? '0' + n : '' + n }

// 与 reminderSend/index.js 的 target 口径一致：今天 + 7 天（本地时区）。
function ymdPlus7() {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function seedDuePlan() {
  state.store.reminders = [{
    _id: 'abuse-plan-1',
    _openid: 'abuse-openid-0001',
    anniversary: ymdPlus7(),
    years: 4,
    togetherDate: '2023-05-20',
    nicknames: '小熊 和 阿树',
    enabled: true,
    subscribed: true,
    lastNotifiedFor: ''
  }]
}

function reset(config) {
  state.config = config || {}
  state.store = {}
  state.ops = { createCollection: [], add: [], query: [], update: [] }
  state.msgSecCheckCalls = []
  state.sendCalls = []
  if (state.config.db === 'due-plan') seedDuePlan()
}

// ---------------- 数据库 ----------------

function matchCond(actual, cond) {
  if (cond && typeof cond === 'object' && cond.__cmd) {
    if (cond.__cmd === 'neq') return actual !== cond.value
    if (cond.__cmd === 'eq') return actual === cond.value
    if (cond.__cmd === 'gt') {
      const a = actual instanceof Date ? actual.getTime() : actual
      const b = cond.value instanceof Date ? cond.value.getTime() : cond.value
      return a > b
    }
    throw new Error('abuse stub: 未实现的 db.command 算子 ' + cond.__cmd)
  }
  return actual === cond
}

function collection(name) {
  if (!state.store[name]) state.store[name] = []
  const docs = state.store[name]
  return {
    async add(opts) {
      await TICK()
      const doc = Object.assign({ _id: 'abuse-id-' + (docs.length + 1) }, resolveServerDate((opts && opts.data) || {}))
      docs.push(doc)
      state.ops.add.push({ collection: name, doc: doc })
      return { _id: doc._id }
    },
    where(cond) {
      // 与真实 SDK 一致：条件过滤对 _id 也生效（reminderSend 的占坑更新靠它）。
      function matchedDocs() {
        const keys = Object.keys((cond && typeof cond === 'object') ? cond : {})
        return docs.filter((d) => keys.every((k) => matchCond(d[k], cond[k])))
      }
      const q = {
        _limit: 100,
        limit(n) { this._limit = n; return this },
        async get() {
          await TICK()
          const matched = matchedDocs().slice(0, this._limit)
          state.ops.query.push({ collection: name, where: cond, limit: this._limit, matched: matched.length })
          return { data: matched.map((d) => Object.assign({}, d)) }
        },
        async count() {
          await TICK()
          const matched = matchedDocs()
          state.ops.query.push({ collection: name, where: cond, op: 'count', matched: matched.length })
          return { total: matched.length }
        },
        async update(opts) {
          await TICK()
          const data = resolveServerDate((opts && opts.data) || {})
          const matched = matchedDocs()
          matched.forEach((d) => Object.assign(d, data))
          state.ops.update.push({ collection: name, where: cond, data: data, updated: matched.length })
          return { stats: { updated: matched.length } }
        }
      }
      return q
    },
    doc(id) {
      return {
        async update(opts) {
          await TICK()
          const doc = docs.find((d) => d._id === id)
          const data = resolveServerDate((opts && opts.data) || {})
          state.ops.update.push({ collection: name, docId: id, data: data, found: !!doc })
          if (doc) Object.assign(doc, data)
          return { stats: { updated: doc ? 1 : 0 } }
        }
      }
    }
  }
}

const db = {
  command: {
    neq: (v) => ({ __cmd: 'neq', value: v }),
    eq: (v) => ({ __cmd: 'eq', value: v }),
    gt: (v) => ({ __cmd: 'gt', value: v })
  },
  serverDate(opts) { return { __serverDate: true, offset: (opts && opts.offset) || 0 } },
  async createCollection(name) {
    await TICK()
    if (!state.store[name]) state.store[name] = []
    state.ops.createCollection.push(name)
    return {}
  },
  collection: collection
}

// ---------------- openapi ----------------

async function msgSecCheck(payload) {
  await TICK()
  state.msgSecCheckCalls.push({
    content: payload && payload.content,
    openid: payload && payload.openid,
    scene: payload && payload.scene,
    version: payload && payload.version
  })
  const mode = state.config.msgSecCheck
  if (mode === 'error') {
    const err = new Error('openapi.security.msgSecCheck:fail exceed rate limit')
    err.errCode = 429
    err.errMsg = err.message
    throw err
  }
  const content = String((payload && payload.content) || '')
  const risky = mode === 'risky' || (mode === 'risky-on-banned' && content.indexOf(BANNED_MARKER) >= 0)
  if (risky) return { errCode: 0, errMsg: 'openapi.security.msgSecCheck:ok', result: { suggest: 'risky', label: 20001 } }
  return { errCode: 0, errMsg: 'openapi.security.msgSecCheck:ok', result: { suggest: 'pass' } }
}

async function subscribeMessageSend(payload) {
  await TICK()
  state.sendCalls.push({
    touser: payload && payload.touser,
    templateId: payload && payload.templateId,
    page: payload && payload.page,
    data: payload && payload.data
  })
  if (state.config.send === '43101') {
    const err = new Error('openapi.subscribeMessage.send:fail 43101 user refused to subscribe')
    err.errCode = 43101
    err.errMsg = err.message
    throw err
  }
  return { errCode: 0, errMsg: 'openapi.subscribeMessage.send:ok' }
}

// ---------------- 出口 ----------------

// 云函数互调：路由到仓库里真实的云函数模块（shareBook → contentCheck），
// 检测计数、送检文本都会如实记进 __abuseState，和真实环境一条链路。
async function callFunction(opts) {
  await TICK()
  const name = String((opts && opts.name) || '')
  const target = path.join(__dirname, '..', '..', 'cloudfunctions', name, 'index.js')
  const mod = require(target)
  if (!mod || typeof mod.main !== 'function') {
    throw new Error('abuse stub: 云函数 ' + name + ' 没有导出 main')
  }
  const result = await mod.main((opts && opts.data) || {})
  return { result: result }
}

const cloud = {
  DYNAMIC_CURRENT_ENV: Symbol.for('DYNAMIC_CURRENT_ENV'),
  init(opts) { state.initArgs = opts },
  getWXContext() { return { OPENID: 'abuse-openid-0001', APPID: 'abuse-appid', UNIONID: '', SOURCE: 'abuse-bench' } },
  database() { return db },
  callFunction: callFunction,
  openapi: {
    security: { msgSecCheck: msgSecCheck },
    subscribeMessage: { send: subscribeMessageSend }
  },
  // 测试台专用钩子
  __abuseReset: reset,
  __abuseState: state
}

module.exports = cloud
