// 创建一次分享：生成一枚随机令牌，把答案快照存进 shares 集合。
// 链接里只放令牌，不放任何答案；接收方凭令牌经 getSharedBook 取回。
// 调用方身份由微信注入（OPENID），不信任客户端传值。
//
// 滥用测试（上线前）坐实的口子，在这里收掉：
//   - 答案原样落库：没有 normalize、没有长度上限、来者不拒——
//     服务器按客户端 utils/record.js 的同一套口径自己验一遍，
//     缺字段 / 超长 / 枚举值不对 / 日期不存在，一律拒；
//   - 内容不经检测直接进 shares：分享时把答案 + 卡片标题送 contentCheck 复检；
//   - 没有配额：同一 OPENID 可以无限刷 token——一天最多 20 条。
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 分享有效期 30 天，过期自动打不开。
const TTL_MS = 30 * 24 * 60 * 60 * 1000

// 一个微信号一天最多开这么多条分享链接：正常使用远远够，堵住无限刷的口子。
const DAILY_SHARE_LIMIT = 20

// 与客户端 utils/record.js 的 EMPTY 同一套字段清单。缺一个键就拒：
// 合法客户端发的永远是 pickForm/normalize 的完整输出（24 个键，空值是空串），
// 直连云函数的裸调用拼不出这份形状。
const CANONICAL_KEYS = [
  'myNickname', 'theirNickname', 'togetherDate', 'firstDatePlace', 'homeCity',
  'places', 'cityCount', 'myCity', 'theirCity', 'mealMode', 'mealCount',
  'fightCount', 'whoApologized', 'catchphrase', 'story', 'distanceMode',
  'distanceKm', 'meetMode', 'meetCount', 'sentence', 'myFave', 'theirFave',
  'faveFoods', 'writtenAt'
]

// 文本字段的字数上限，与 record.js normalize 一致（按字数不按字节）。
const TEXT_LIMITS = {
  myNickname: 10, theirNickname: 10, firstDatePlace: 20, homeCity: 12,
  places: 140, myCity: 12, theirCity: 12, catchphrase: 24, story: 140,
  sentence: 40, faveFoods: 24, myFave: 12, theirFave: 12
}

// 枚举字段的可取值，与 record.js 一致。
const ENUMS = {
  mealMode: ['daily', 'often', 'few', 'lost'],
  whoApologized: ['me', 'them', 'both'],
  distanceMode: ['ldr', 'same'],
  meetMode: ['daily', 'often', 'few', 'lost']
}

// 数字字段只认纯数字串（record.js cleanNum 的口径），日期字段只认真实存在的日子。
const NUMERIC_FIELDS = ['cityCount', 'mealCount', 'fightCount', 'distanceKm', 'meetCount']
const YMD_FIELDS = ['togetherDate', 'writtenAt']
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

function charCount(v) {
  return Array.from(String(v || '')).length
}

function isYmd(v) {
  const s = String(v || '')
  if (!YMD_RE.test(s)) return false
  const p = s.split('-')
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
  return d.getFullYear() === Number(p[0]) && d.getMonth() + 1 === Number(p[1]) && d.getDate() === Number(p[2])
}

// 按客户端同一套口径验一遍答案，返回清理后的副本；形状不对返回 null（拒）。
// 已知字段之外的一律丢弃（pickForm 的口径）；已知字段超限 / 枚举不对 / 日期不存在一律拒。
function validateAnswers(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const clean = {}
  for (const key of CANONICAL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) return null
    const v = raw[key]
    if (typeof v !== 'string' && typeof v !== 'number') return null
    const s = String(v)
    if (TEXT_LIMITS[key] !== undefined) {
      if (charCount(s) > TEXT_LIMITS[key]) return null
    } else if (ENUMS[key] !== undefined) {
      if (s !== '' && ENUMS[key].indexOf(s) < 0) return null
    } else if (NUMERIC_FIELDS.indexOf(key) >= 0) {
      if (s !== '' && !/^\d+$/.test(s)) return null
    } else if (YMD_FIELDS.indexOf(key) >= 0) {
      if (s !== '' && !isYmd(s)) return null
    }
    clean[key] = s
  }
  // 必填三项与 canGenerate 同口径：两个昵称 + 在一起的日子（真实存在的日期）。
  if (!clean.myNickname.trim() || !clean.theirNickname.trim() || !isYmd(clean.togetherDate)) return null
  return clean
}

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
  const answers = validateAnswers(event && event.answers)
  if (!answers) {
    return { ok: false, error: '内容不完整，先去填写页补齐昵称和日子' }
  }
  // 配色跟着这册走：收下的人看到的就是作者选的那套。
  const THEME_RE = /^(cream|matcha|sky|violet)$/
  const theme = THEME_RE.test(event && event.theme) ? event.theme : 'cream'
  // 拆封页的大标题：分享者可以自己起，比如「一周年快乐」。
  const title = Array.from(String((event && event.title) || '').trim()).slice(0, 24).join('')

  // 配额：一个微信号一天最多 20 条，堵住无限刷 token 的口子。
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const used = await db.collection('shares')
    .where({ ownerOpenid: OPENID, createdAt: _.gt(since) })
    .count()
  if (((used && used.total) || 0) >= DAILY_SHARE_LIMIT) {
    return { ok: false, error: '今天的分享链接开得太多啦，明天再来吧' }
  }

  // 内容安全复检：答案 + 卡片标题一起送 contentCheck。
  // 生成时已经检过一次答案，这里主要是补上「生成之后才输入」的标题，
  // 也防着绕开小程序直调云函数的口子。检测服务不可用时拦下（fail-closed）。
  let verdict = { ok: false, risky: true, reason: '内容检测服务这会儿忙，稍等一下再试试' }
  try {
    const check = await cloud.callFunction({ name: 'contentCheck', data: { answers: answers, title: title } })
    verdict = (check && check.result) || verdict
  } catch (err) {
    console.warn('[shareBook] 内容检测没跑成，先拦下来', err && (err.errMsg || err))
  }
  if (!verdict.ok || verdict.risky) {
    return { ok: false, error: verdict.reason || '这几句话暂时发不出去，换个说法再试试吧' }
  }

  await ensureSharesCollection()
  const token = crypto.randomBytes(24).toString('hex')
  await db.collection('shares').add({
    data: {
      token: token,
      ownerOpenid: OPENID,
      answers: answers,
      theme: theme,
      title: title,
      createdAt: db.serverDate(),
      expireAt: db.serverDate({ offset: TTL_MS }),
      enabled: true
    }
  })
  return { ok: true, token: token }
}
