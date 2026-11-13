// 微信云开发数据层。
// 两件事：
//   1. 把写好的册子存一份快照，换手机也能找回（books 集合）。
//   2. 转发的凭据：分享时云端生成随机令牌，接收方凭令牌经云函数取回答案
//      （shares 集合 + shareBook / getSharedBook 两个云函数）。
//
// 身份：云开发天然按 openid 识别用户，集合权限设为「仅创建者可读写」后，
// 每个人只能看到自己存的册子；别人的内容只能凭令牌走云函数拿。
//
// 边界：云环境没开通、没填环境 ID、基础库过低时，一切照旧走本地缓存——
// 云端是「多一份不会丢的备份」，不是必须项。失败静默，不打断写册子。

// 云开发环境 ID。只有一个环境时可以留空（用默认环境）；
// 有多个环境时，填开发者工具「云开发」面板里看到的那个环境 ID。
const CLOUD_ENV = ''

const BOOKS_COLLECTION = 'books'

let initTried = false
let cloudEnabled = false

function init() {
  if (initTried) return cloudEnabled
  initTried = true
  try {
    if (!wx.cloud || typeof wx.cloud.init !== 'function') return false
    // env 传 undefined 时使用账号的默认环境。
    wx.cloud.init(CLOUD_ENV ? { env: CLOUD_ENV, traceUser: true } : { traceUser: true })
    cloudEnabled = true
  } catch (err) {
    console.warn('[cloud] 云开发初始化失败，将只使用本机存储', err)
    cloudEnabled = false
  }
  return cloudEnabled
}

function db() {
  return wx.cloud.database()
}

// 把错误翻译成用户能懂的提示。云开发把所有细节都塞在 errMsg 里。
function explainError(err) {
  const msg = String((err && (err.errMsg || err.message)) || '')
  if (msg.indexOf('collection not exists') >= 0 || msg.indexOf('COLLECTION_NOT_EXIST') >= 0) {
    return '云端还没有 books 集合，在开发者工具的云开发控制台里建一个（权限选「仅创建者可读写」）'
  }
  if (msg.indexOf('env') >= 0 && (msg.indexOf('not found') >= 0 || msg.indexOf('INVALID') >= 0)) {
    return '云开发环境不存在或已删除，检查 utils/cloud.js 里的环境 ID'
  }
  if (msg.indexOf('permission') >= 0 || msg.indexOf('-502005') >= 0) {
    return '集合权限不对，请在云开发控制台把 books 的权限设为「仅创建者可读写」'
  }
  return '云端暂时连不上，册子已保存在这台设备上'
}

// 同一对人的册子只留一份：按「在一起的日子 + 两个昵称」找旧记录，
// 找得到就更新，找不到就新建。重新生成不会把历史记录越堆越多。
function findSameBook(form) {
  return db().collection(BOOKS_COLLECTION)
    .where({
      togetherDate: form.togetherDate,
      myNickname: form.myNickname,
      theirNickname: form.theirNickname
    })
    .limit(1)
    .get()
}

// 保存 / 更新一册快照。返回 Promise<{ ok, error }>，永不 reject。
// options.source：'mine' 自己写的（默认）；'gift' 收下的转发册，历史页据此区分。
function saveBook(form, options) {
  return new Promise((resolve) => {
    if (!init()) {
      resolve({ ok: false, error: null, silent: true })
      return
    }
    const source = options && options.source === 'gift' ? 'gift' : 'mine'
    const payload = {
      // options.shareTitle：分享时起的标题（如「一周年快乐」）——
      // 带着标题分享过，书架上这一册的封皮就跟着改叫这个名字。
      title: (options && options.shareTitle) || (form.myNickname + ' · ' + form.theirNickname),
      // 这一册自己的配色：书架卡片和翻看都用它，不跟全局主题走。
      theme: (options && options.theme) || 'cream',
      togetherDate: form.togetherDate,
      myNickname: form.myNickname,
      theirNickname: form.theirNickname,
      answers: form,
      source: source,
      updatedAt: db().serverDate()
    }
    findSameBook(form).then((res) => {
      const old = res.data && res.data[0]
      if (old && old._id) {
        db().collection(BOOKS_COLLECTION).doc(old._id).update({
          data: payload
        }).then(() => resolve({ ok: true, error: null }))
          .catch((err) => resolve({ ok: false, error: explainError(err) }))
      } else {
        db().collection(BOOKS_COLLECTION).add({
          data: Object.assign({ createdAt: db().serverDate() }, payload)
        }).then(() => resolve({ ok: true, error: null }))
          .catch((err) => resolve({ ok: false, error: explainError(err) }))
      }
    }).catch((err) => resolve({ ok: false, error: explainError(err) }))
  })
}

// 历史列表，新的在前。返回 Promise<{ list, error }>，永不 reject。
function listBooks() {
  return new Promise((resolve) => {
    if (!init()) {
      resolve({ list: [], error: '这台设备的微信版本太低，用不了云同步' })
      return
    }
    db().collection(BOOKS_COLLECTION)
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get()
      .then((res) => {
        const list = (res.data || []).map((row) => ({
          id: row._id,
          title: row.title || '一本小册子',
          myNickname: row.myNickname || '',
          theirNickname: row.theirNickname || '',
          theme: row.theme || 'cream',
          togetherDate: row.togetherDate || '',
          answers: row.answers || {},
          source: row.source === 'gift' ? 'gift' : 'mine',
          updatedAt: row.updatedAt || row.createdAt || ''
        }))
        resolve({ list: list, error: null })
      })
      .catch((err) => resolve({ list: [], error: explainError(err) }))
  })
}

// 按编号取一册。书架点开某一册时用；集合权限「仅创建者可读写」，
// 自己的册子自己取得到，别人的册子取回来是空的。
// 字段口径与 listBooks 保持一致。resolve { ok, book } 或 { ok:false, error }，永不 reject。
function getBook(id) {
  return new Promise((resolve) => {
    if (!init()) {
      resolve({ ok: false, error: '这台设备的微信版本太低，用不了云同步' })
      return
    }
    db().collection(BOOKS_COLLECTION).doc(String(id || ''))
      .get()
      .then((res) => {
        const row = res && res.data
        if (!row || !row._id) {
          resolve({ ok: false, error: '这一册找不到了' })
          return
        }
        resolve({
          ok: true,
          book: {
            id: row._id,
            title: row.title || '一本小册子',
            theme: row.theme || 'cream',
            togetherDate: row.togetherDate || '',
            answers: row.answers || {},
            source: row.source === 'gift' ? 'gift' : 'mine',
            updatedAt: row.updatedAt || row.createdAt || ''
          }
        })
      })
      .catch((err) => resolve({ ok: false, error: explainError(err) }))
  })
}

// 删除一册。返回 Promise<{ ok, error }>，永不 reject。
function removeBook(id) {
  return new Promise((resolve) => {
    if (!init()) {
      resolve({ ok: false, error: '云同步不可用' })
      return
    }
    db().collection(BOOKS_COLLECTION).doc(id).remove()
      .then(() => resolve({ ok: true, error: null }))
      .catch((err) => resolve({ ok: false, error: explainError(err) }))
  })
}

// 探一下云端能不能用，我的页拿它显示同步状态。
function checkConnection() {
  return new Promise((resolve) => {
    if (!init()) {
      resolve({ ok: false, error: '这台设备的微信版本太低，用不了云同步' })
      return
    }
    db().collection(BOOKS_COLLECTION)
      .limit(1)
      .get()
      .then(() => resolve({ ok: true, error: null }))
      .catch((err) => resolve({ ok: false, error: explainError(err) }))
  })
}

// ---------- 分享凭据 ----------
// 链接里只有一枚随机令牌，答案快照存在云端 shares 集合。
// 令牌不可猜测，30 天过期；集合权限「仅创建者可读写」，
// 不凭令牌走云函数，谁也读不到别人的册子。

// 同一份答案只创建一次凭据：按内容签名缓存。
let shareCache = { sig: '', promise: null }

function callFunction(name, data) {
  return wx.cloud.callFunction({ name: name, data: data })
    .then((res) => res && res.result ? res.result : { ok: false, error: '云端返回为空' })
    .catch((err) => {
      // 失败必须留下痕迹：开发者工具控制台里搜 [cloud] 就能看到真正的原因。
      console.warn('[cloud] 云函数 ' + name + ' 调用失败：', err && (err.errMsg || err))
      return { ok: false, error: '云端暂时连不上' }
    })
}

// 生成前的内容安全检测：只在「点生成纪念册」时调一次，命中违规就让用户改。
// 云函数内部是 fail-closed：检测接口异常时也返回 risky，宁可让用户稍后再试，
// 不放行没检过的内容。分享时云端 shareBook 还会把答案和卡片标题再复检一次。
function checkContent(form) {
  if (!init()) return Promise.resolve({ ok: false, error: null, silent: true })
  return callFunction('contentCheck', { answers: form })
}

// 取（或创建）一份答案的分享令牌。resolve { ok, token } 或 { ok:false }，永不 reject。
// theme 是作者当前配色，随分享记录存云端，收礼的人固定看这一套。
// 注意：只缓存成功的结果——第一次失败后（云端刚部署、网络慢），
// 后续分享必须真的重试，而不是拿缓存的失败一直退回普通卡片。
function shareTokenFor(form, theme, title) {
  if (!init()) return Promise.resolve({ ok: false, error: '云端暂时连不上' })
  const sig = JSON.stringify(form) + '|' + (theme || '') + '|' + (title || '')
  if (shareCache.sig === sig && shareCache.promise) return shareCache.promise
  const entry = { sig: sig, promise: null, token: '' }
  const promise = new Promise((resolve) => {
    // 卡片标题也一并传给云端：它是生成之后才输入的文本，
    // shareBook 在落库前会把它和答案一起送 contentCheck 复检。
    callFunction('shareBook', { answers: form, theme: theme || '', title: title || '' }).then((r) => {
      if (r.ok && r.token) {
        entry.token = r.token
        resolve({ ok: true, token: r.token })
      } else {
        if (shareCache === entry) shareCache = { sig: '', promise: null }
        resolve({ ok: false, error: r.error || null })
      }
    })
  })
  entry.promise = promise
  shareCache = entry
  return promise
}

// 只使用与当前内容、配色、标题完全对应的已就绪令牌，避免旧请求串册。
function readyShareToken(form, theme, title) {
  const sig = JSON.stringify(form) + '|' + (theme || '') + '|' + (title || '')
  return shareCache.sig === sig ? shareCache.token || '' : ''
}

// 凭令牌取回分享的答案。resolve { ok, answers, theme } 或 { ok:false, error }，永不 reject。
function fetchSharedBook(token) {
  return new Promise((resolve) => {
    if (!init()) {
      resolve({ ok: false, error: '这台设备的微信版本太低，看不了分享的册子' })
      return
    }
    callFunction('getSharedBook', { token: token }).then((r) => {
      if (r.ok && r.answers) {
        resolve({ ok: true, answers: r.answers, theme: r.theme || '', title: r.title || '' })
      } else {
        resolve({ ok: false, error: r.error || '这份分享打不开' })
      }
    })
  })
}

// ---------- 纪念日提醒（多节点） ----------
// 订阅消息模板 ID：在 mp 后台「功能 → 订阅消息」申请后填进来。
// 模板字段：thing1 纪念日名称、time2 日期、thing3 备注（类目信息查询）。
// 留空时，提醒询问只记下意愿，云端计划会标记为未订阅，定时函数不会下发。
const REMINDER_TMPL_ID = 'FKHmUCrt7OZgbsElTatpf17YJp2958IBOYyIbQ7RunI'

const REMINDERS_COLLECTION = 'reminders'

function reminderTemplateId() {
  return REMINDER_TMPL_ID
}

// 一个节点一条计划，同一个 kind 只留一份，重复开启走更新。
// 老版本的结构没有 kind（只有 anniversary/togetherDate 的单周年记录），
// 一起认出来，免得存出两条「在一起纪念日」。
// plan: { kind, date(起点), nicknames, enabled, subscribed }
function findPlanDoc(plan) {
  return db().collection(REMINDERS_COLLECTION).limit(50).get().then((res) => {
    return (res.data || []).find((row) => {
      if (row.kind) return row.kind === plan.kind
      return plan.kind === 'together' && (row.togetherDate === plan.date || row.anniversary)
    }) || null
  })
}

function saveReminderPlan(plan) {
  return new Promise((resolve) => {
    if (!init()) {
      resolve({ ok: false, error: null, silent: true })
      return
    }
    const payload = {
      kind: plan.kind,
      originDate: plan.date,
      nicknames: String(plan.nicknames || '').slice(0, 40),
      enabled: !!plan.enabled,
      subscribed: !!plan.subscribed,
      updatedAt: db().serverDate()
    }
    findPlanDoc(plan).then((old) => {
      if (old && old._id) {
        db().collection(REMINDERS_COLLECTION).doc(old._id).update({
          data: payload
        }).then(() => resolve({ ok: true, error: null }))
          .catch((err) => resolve({ ok: false, error: explainError(err) }))
      } else {
        db().collection(REMINDERS_COLLECTION).add({
          data: Object.assign({ createdAt: db().serverDate() }, payload)
        }).then(() => resolve({ ok: true, error: null }))
          .catch((err) => resolve({ ok: false, error: explainError(err) }))
      }
    }).catch((err) => resolve({ ok: false, error: explainError(err) }))
  })
}

// 云端计划列表：我的页把订阅额度的真相并回本机（下发一次额度就没了，
// 只有云端知道）。顺手把老结构补上 kind / originDate，之后按 kind 查就准了。
// resolve { list: [{ kind, originDate, enabled, subscribed }], error }，永不 reject。
function listReminderPlans() {
  return new Promise((resolve) => {
    if (!init()) {
      resolve({ list: [], error: null, silent: true })
      return
    }
    db().collection(REMINDERS_COLLECTION).limit(50).get()
      .then((res) => {
        const list = []
        const fixes = []
        ;(res.data || []).forEach((row) => {
          const kind = row.kind || 'together'
          const originDate = row.originDate || row.togetherDate || row.anniversary || ''
          if (!row.kind || !row.originDate) {
            fixes.push({ id: row._id, kind: kind, originDate: originDate })
          }
          list.push({
            kind: kind,
            originDate: originDate,
            enabled: !!row.enabled,
            subscribed: !!row.subscribed
          })
        })
        // 老结构就地补齐字段（失败不打扰，下次再补）。
        fixes.forEach((fix) => {
          db().collection(REMINDERS_COLLECTION).doc(fix.id).update({
            data: { kind: fix.kind, originDate: fix.originDate }
          }).catch(() => {})
        })
        resolve({ list: list, error: null })
      })
      .catch((err) => resolve({ list: [], error: explainError(err) }))
  })
}

// 删掉一个节点的云端计划（「我的」页删除自定义日子时用）。
// resolve { ok, error }，永不 reject。
function removeReminderPlan(kind) {
  return new Promise((resolve) => {
    if (!init()) {
      resolve({ ok: false, error: null, silent: true })
      return
    }
    findPlanDoc({ kind: kind }).then((old) => {
      if (!old || !old._id) {
        resolve({ ok: true, error: null })
        return
      }
      db().collection(REMINDERS_COLLECTION).doc(old._id).remove()
        .then(() => resolve({ ok: true, error: null }))
        .catch((err) => resolve({ ok: false, error: explainError(err) }))
    }).catch((err) => resolve({ ok: false, error: explainError(err) }))
  })
}

module.exports = {
  init,
  saveBook,
  listBooks,
  getBook,
  removeBook,
  checkConnection,
  checkContent,
  shareTokenFor,
  readyShareToken,
  fetchSharedBook,
  reminderTemplateId,
  saveReminderPlan,
  listReminderPlans,
  removeReminderPlan
}

