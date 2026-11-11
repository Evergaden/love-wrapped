// 凭令牌取回一份分享的册子。
// 这是唯一读取通道：shares / books 集合权限都是「仅创建者可读写」，
// 客户端直连数据库读不到别人的内容；云函数只按令牌放行，并校验有效期。
//
// 滥用测试（上线前）坐实的口子：令牌本身 192 位猜不中，但有人可以拿
// 生造的 token 反复撞库，每次调用都白耗一次数据库查询配额。
// 这里加一道未命中节流：同一 OPENID 一分钟内落空超过 30 次，
// 后面的直接挡在查询之前。记在函数实例内存里，是一道减速带而非硬上限
// （多实例部署下每个实例各管各的计数，真要硬限得靠数据库计数，先不做）。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const TOKEN_RE = /^[a-f0-9]{24,80}$/

const MISS_WINDOW_MS = 60 * 1000
const MISS_LIMIT = 30
const missLog = new Map() // OPENID -> { windowStart, count }

// 记一次未命中；返回这一分钟内是否已经超限。
function recordMiss(openid, now) {
  const entry = missLog.get(openid)
  if (!entry || now - entry.windowStart > MISS_WINDOW_MS) {
    missLog.set(openid, { windowStart: now, count: 1 })
    return false
  }
  entry.count += 1
  return entry.count > MISS_LIMIT
}

function overMissLimit(openid, now) {
  const entry = missLog.get(openid)
  if (!entry || now - entry.windowStart > MISS_WINDOW_MS) return false
  return entry.count >= MISS_LIMIT
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const token = String((event && event.token) || '')
  if (!TOKEN_RE.test(token)) {
    return { ok: false, error: '分享链接无效' }
  }
  const now = Date.now()
  // 落空太多次的请求挡在查询之前：省下数据库配额，也给撞库的人一个明确的「慢一点」。
  if (overMissLimit(OPENID, now)) {
    return { ok: false, error: '翻得太快啦，喝口水稍后再试' }
  }
  const res = await db.collection('shares')
    .where({ token: token, enabled: true })
    .limit(1)
    .get()
  const doc = res.data && res.data[0]
  if (!doc) {
    const flooded = recordMiss(OPENID, now)
    if (flooded) {
      return { ok: false, error: '翻得太快啦，喝口水稍后再试' }
    }
    return { ok: false, error: '这份分享不存在，或已被分享者取消' }
  }
  if (doc.expireAt && new Date(doc.expireAt).getTime() < Date.now()) {
    return { ok: false, error: '这份分享已过期，让 TA 重新分享一次吧' }
  }
  return { ok: true, answers: doc.answers, theme: doc.theme || '', title: doc.title || '' }
}
