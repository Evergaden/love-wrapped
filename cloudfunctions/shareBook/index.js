// 创建一次分享：生成一枚随机令牌，把答案快照存进 shares 集合。
// 链接里只放令牌，不放任何答案；接收方凭令牌经 getSharedBook 取回。
// 调用方身份由微信注入（OPENID），不信任客户端传值。
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 分享有效期 30 天，过期自动打不开。
const TTL_MS = 30 * 24 * 60 * 60 * 1000

// shares 集合第一次用时会自动创建，之后忽略报错。
async function ensureSharesCollection() {
  try {
    await db.createCollection('shares')
  } catch (err) {
    // 已存在或其他环境问题交给后续 add 报错。
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const a = event && event.answers
  if (!a || !a.myNickname || !a.theirNickname || !a.togetherDate) {
    return { ok: false, error: '内容不完整，先去填写页补齐昵称和日子' }
  }
  // 配色跟着这册走：收下的人看到的就是作者选的那套。
  const THEME_RE = /^(cream|matcha|sky|violet)$/
  const theme = THEME_RE.test(event && event.theme) ? event.theme : 'cream'
  await ensureSharesCollection()
  const token = crypto.randomBytes(24).toString('hex')
  await db.collection('shares').add({
    data: {
      token: token,
      ownerOpenid: OPENID,
      answers: a,
      theme: theme,
      createdAt: db.serverDate(),
      expireAt: db.serverDate({ offset: TTL_MS }),
      enabled: true
    }
  })
  return { ok: true, token: token }
}
