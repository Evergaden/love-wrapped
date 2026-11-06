// 微信云开发数据层。
// 云端只做一件事：把写好的册子存一份快照，换手机也能找回。
//
// 身份：云开发天然按 openid 识别用户，集合权限设为「仅创建者可读写」后，
// 每个人只能看到自己存的册子，不需要任何登录界面。
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
function saveBook(form) {
  return new Promise((resolve) => {
    if (!init()) {
      resolve({ ok: false, error: null, silent: true })
      return
    }
    const payload = {
      title: form.myNickname + ' · ' + form.theirNickname,
      togetherDate: form.togetherDate,
      myNickname: form.myNickname,
      theirNickname: form.theirNickname,
      answers: form,
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
          togetherDate: row.togetherDate || '',
          answers: row.answers || {},
          updatedAt: row.updatedAt || row.createdAt || ''
        }))
        resolve({ list: list, error: null })
      })
      .catch((err) => resolve({ list: [], error: explainError(err) }))
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

module.exports = {
  init,
  saveBook,
  listBooks,
  removeBook,
  checkConnection
}
