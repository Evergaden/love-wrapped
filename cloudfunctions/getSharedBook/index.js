// 凭令牌取回一份分享的册子。
// 这是唯一读取通道：shares / books 集合权限都是「仅创建者可读写」，
// 客户端直连数据库读不到别人的内容；云函数只按令牌放行，并校验有效期。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const TOKEN_RE = /^[a-f0-9]{24,80}$/

exports.main = async (event) => {
  const token = String((event && event.token) || '')
  if (!TOKEN_RE.test(token)) {
    return { ok: false, error: '分享链接无效' }
  }
  const res = await db.collection('shares')
    .where({ token: token, enabled: true })
    .limit(1)
    .get()
  const doc = res.data && res.data[0]
  if (!doc) {
    return { ok: false, error: '这份分享不存在，或已被分享者取消' }
  }
  if (doc.expireAt && new Date(doc.expireAt).getTime() < Date.now()) {
    return { ok: false, error: '这份分享已过期，让 TA 重新分享一次吧' }
  }
  return { ok: true, answers: doc.answers, theme: doc.theme || '', title: doc.title || '' }
}
