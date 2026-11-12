// 纪念日提醒（多节点）：每天上午 9 点跑一次，把「7 天后到期」的节点
// 用订阅消息发给对应的用户。
//
// 数据：reminders 集合（客户端写入，_openid 微信自动带上）。一节点一文档：
//   { _openid, kind: 'together'|'confession'|'meeting'|'cert'|'birthday_ta'|'birthday_mine',
//     originDate: '2023-05-20', nicknames: '小熊 和 阿树',
//     enabled: true, subscribed: true, lastNotifiedFor: '' }
//
// 与 v1 的差别：客户端不再存「下一个周年」，这里按 originDate 的月日自己算
// 周年（2 月 29 日的周年在平年顺延到 2 月 28 日；第一次提醒在起点满一年后），
// 客户端多久没打开都不影响。老结构（没有 kind，只有 anniversary/togetherDate）
// 就地归一化兼容：togetherDate 是起点；连 togetherDate 都没有的，anniversary
// 的月日一样能对上，年数从 doc.years 兜底。
//
// 订阅额度：微信订阅消息一次授权只能发一条。下发成功后把 subscribed 写回
// false（额度已用，客户端读到后会显示「待续订」）；43101（没订阅/额度没了）
// 同样只关 subscribed 不关 enabled——用户点一下「续订明年」就能接上，
// 不像 v1 直接 disable 掉整个计划。
//
// 模板：「纪念日提醒」（mp 后台已申请，类目信息查询），字段
//   thing1 纪念日名称（按 kind + 年数派生）/ time2 日期 / thing3 提醒文案。
// 注意：time2 是 time 型字段，官方要求「日期 + 时刻」，这里按产品要求只发日期，
// 真机若报 47003 的回退办法写在 timeFor 的注释里。
// 模板 ID 放在本函数的环境变量 REMINDER_TEMPLATE_ID 里
// （云开发控制台 → 函数配置 → 环境变量），不写死在代码里。
//
// 触发器：config.json 里的 timer，每天 09:00:00。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const TEMPLATE_ID = process.env.REMINDER_TEMPLATE_ID || ''
const PAGE = 'pages/wrapped/wrapped'

function ymd(date) {
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
}

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

// 节点的起点日期：新结构 originDate；老结构 togetherDate；
// 再老的只有 anniversary（它存的是「下一个周年」，月日相同，直接用）。
function originOf(doc) {
  const pick = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : '')
  return pick(doc.originDate) || pick(doc.togetherDate) || pick(doc.anniversary)
}

// 有没有「真的起点」（originDate/togetherDate）。最老结构只有 anniversary：
// 它本身就是一个真实发生过的周年，年份比较要放宽成 ≥（否则当年会被误杀）。
function hasRealOrigin(doc) {
  const pick = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : '')
  return !!(pick(doc.originDate) || pick(doc.togetherDate))
}

// 目标日是不是该节点的周年：月日对上、且在起点年份之后（起点当天不算，
// 第一次提醒在满一年后；只有 anniversary 兜底的老数据按 ≥）。
// 2 月 29 日的周年在平年顺延到 2 月 28 日，
// 与客户端 utils/reminders.js 的 nextOccurrence 同一条规则。
function isOccurrence(doc, targetYmd) {
  const origin = originOf(doc)
  if (!origin) return false
  const om = Number(origin.slice(5, 7))
  const od = Number(origin.slice(8, 10))
  let od2 = od
  if (om === 2 && od2 === 29 && !isLeap(Number(targetYmd.slice(0, 4)))) od2 = 28
  const ty = Number(targetYmd.slice(0, 4))
  const oy = Number(origin.slice(0, 4))
  const yearOk = ty > oy || (!hasRealOrigin(doc) && ty >= oy)
  return Number(targetYmd.slice(5, 7)) === om
    && Number(targetYmd.slice(8, 10)) === od2
    && yearOk
}

// 第几年 = 目标年 - 起点年。老数据没有起点时退回 doc.years（v1 存过）。
// 返回 null 表示算不出，调用处退回不带数字的说法。
function yearsOf(doc, targetYmd) {
  const origin = originOf(doc)
  if (origin) {
    const diff = Number(targetYmd.slice(0, 4)) - Number(origin.slice(0, 4))
    if (diff > 0) return diff
  }
  const n = Number(doc.years)
  return Number.isInteger(n) && n > 0 ? n : null
}

// 各节点的 thing1 标题 / thing3 文案。thing 字段上限 20 字：
// 「…备好惊喜吧」系列收短过，两位数年数也不会超。
const KIND_META = {
  together: {
    title: (y) => (y ? '第 ' + y + ' 个纪念日' : '你们的纪念日'),
    remark: (y) => (y ? '还有一周就是你们的第' + y + '年，备好惊喜吧' : '还有一周就是你们的纪念日，备好惊喜吧')
  },
  confession: {
    title: (y) => (y ? '第 ' + y + ' 个告白纪念日' : '告白纪念日'),
    remark: (y) => (y ? '还有一周就是告白的第' + y + '年，备好惊喜吧' : '还有一周就是告白纪念日，备好惊喜吧')
  },
  meeting: {
    title: (y) => (y ? '初见满 ' + y + ' 年' : '初次见面的日子'),
    remark: (y) => (y ? '还有一周就是初见满' + y + '年，备好惊喜吧' : '还有一周就是初见的日子，备好惊喜吧')
  },
  cert: {
    title: (y) => (y ? '领证 ' + y + ' 周年' : '领证的纪念日'),
    remark: (y) => (y ? '还有一周就是领证满' + y + '年，备好惊喜吧' : '还有一周就是领证纪念日，备好惊喜吧')
  },
  birthday_ta: {
    title: () => 'TA 的生日',
    remark: () => '还有一周就是TA的生日，备好惊喜吧'
  },
  birthday_mine: {
    title: () => '你的生日',
    remark: () => '还有一周就是你的生日，备好惊喜吧'
  }
}

function metaFor(kind) {
  return KIND_META[kind] || KIND_META.together
}

// time2 按产品要求只发日期（例：2027年5月20日），不带时刻。
// 注意：time 型字段官方要求「日期 + 时刻」（例：2027年5月20日 09:00），
// 日期-only 真机下发可能报 47003（时间格式不合法）。
// 回退办法：若真机报 47003，把下面的「return cn」改回「return cn + ' 09:00'」，
// 恢复成「日期 + 09:00」的完整格式即可。
function timeFor(ymdStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymdStr || ''))
  if (!m) return String(ymdStr || '')
  const cn = Number(m[1]) + '年' + Number(m[2]) + '月' + Number(m[3]) + '日'
  return cn
}

// reminders 集合第一次用时会自动创建，之后忽略报错。
async function ensureRemindersCollection() {
  try {
    await db.createCollection('reminders')
  } catch (err) {
    // 已存在或已由客户端首写创建。
  }
}

function clip(text, max) {
  const chars = Array.from(String(text || ''))
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : chars.join('')
}

exports.main = async () => {
  if (!TEMPLATE_ID) {
    return { ok: false, error: 'REMINDER_TEMPLATE_ID 未配置：在云函数环境变量里填订阅消息模板 ID' }
  }
  await ensureRemindersCollection()

  // 提前 7 天：今天 + 7 天后是某个节点的周年，今天就要发。
  const target = ymd(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
  // 开着且有额度的计划全捞出来（客户端多久没来都算数），到没到周年在这里判。
  // 单集合千条内够用；节点多了再把「月日」冗余成字段用 where 过滤。
  const res = await db.collection('reminders')
    .where({ enabled: true, subscribed: true })
    .limit(1000)
    .get()

  const docs = (res.data || []).filter((doc) => {
    return isOccurrence(doc, target) && doc.lastNotifiedFor !== target
  })

  let sent = 0
  let failed = 0
  for (const doc of docs) {
    if (!doc._openid) {
      failed++
      continue
    }
    try {
      const meta = metaFor(doc.kind)
      const y = yearsOf(doc, target)
      const n = y && y >= 1 ? y : null
      await cloud.openapi.subscribeMessage.send({
        touser: doc._openid,
        templateId: TEMPLATE_ID,
        page: PAGE,
        data: {
          thing1: { value: clip(meta.title(n), 20) },
          time2: { value: timeFor(target) },
          thing3: { value: clip(meta.remark(n), 20) }
        }
      })
      sent++
      // 发出后：记防重发，并把额度归零（一次授权只能发一条，
      // 客户端读到 subscribed: false 会亮「待续订」）。
      await db.collection('reminders').doc(doc._id).update({
        data: { lastNotifiedFor: target, lastSentAt: db.serverDate(), subscribed: false }
      })
    } catch (err) {
      failed++
      const msg = String((err && (err.errMsg || err.message)) || '')
      // 43101 = 用户没订阅或订阅额度用完：额度归零就好，计划留着
      // （客户端会亮「待续订」，点一下续订就能接上），别每天撞墙。
      if (msg.indexOf('43101') >= 0) {
        await db.collection('reminders').doc(doc._id).update({
          data: { subscribed: false, lastError: '未订阅或额度用完' }
        })
      }
      // 其他错误（限频、网络）留到下次触发再试。
    }
  }

  return { ok: true, target: target, found: docs.length, sent: sent, failed: failed }
}

// 专项验证用的内部函数（reminder-send-check.js 直接调，不走 main）。
exports.__test = { originOf, isOccurrence, yearsOf, metaFor, timeFor }
