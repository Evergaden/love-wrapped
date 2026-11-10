// 周年提醒：每天上午 9 点跑一次，把「7 天后到期」的周年计划
// 用订阅消息发给对应的用户。
//
// 数据：reminders 集合（客户端写入，_openid 微信自动带上）。
//   { _openid, anniversary: '2027-05-20', years: 4, togetherDate: '2023-05-20',
//     nicknames: '小熊 和 阿树', enabled: true, subscribed: true, lastNotifiedFor: '' }
//
// 模板：「纪念日提醒」（mp 后台已申请，类目信息查询），字段
//   thing1 纪念日名称（从 years 派生的标题）/ time2 日期 / thing3 备注（提醒文案）。
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

// 纪念日没有让用户起名，标题从 years 派生（派生规则）：
//   years 存的是「马上要迎来的第几年」，thing1 固定写成「第 N 个纪念日」，
//   例：years = 4 → 「第 4 个纪念日」。
//   老计划万一没存 years，就用 togetherDate → anniversary 补算：
//   anniversary 比 togetherDate 晚几个整年，就是第几年。两条路都不通返回 null，
//   调用处退回不带数字的说法，别把「第 undefined 个纪念日」发出去。
function yearsOf(doc) {
  const n = Number(doc.years)
  if (Number.isInteger(n) && n > 0) return n
  const from = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(doc.togetherDate || ''))
  const to = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(doc.anniversary || ''))
  if (from && to) {
    const md = (m) => Number(m[2]) * 100 + Number(m[3])
    const y = Number(to[1]) - Number(from[1]) - (md(to) < md(from) ? 1 : 0)
    if (y > 0) return y
  }
  return null
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

  // 提前 7 天：今天 + 7 天后过周年的计划，今天就要发。
  const target = ymd(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
  const res = await db.collection('reminders')
    .where({ enabled: true, subscribed: true, anniversary: target, lastNotifiedFor: _.neq(target) })
    .limit(100)
    .get()

  let sent = 0
  let failed = 0
  for (const doc of res.data || []) {
    if (!doc._openid) {
      failed++
      continue
    }
    try {
      // thing1 标题：有年数就是「第 N 个纪念日」，没有就退回「你们的纪念日」。
      // thing3 文案：「还有一周就是你们的第N年，备好惊喜吧」（N = years）。
      //   thing 字段上限 20 字：按用户原话「…为TA准备个惊喜吧」是 22 字会被截断，
      //   所以收成「备好惊喜吧」——N 两位数时全句也刚好 19 字，不再触发 clip。
      const n = yearsOf(doc)
      const title = n ? '第 ' + n + ' 个纪念日' : '你们的纪念日'
      const remark = n
        ? '还有一周就是你们的第' + n + '年，备好惊喜吧'
        : '还有一周就是你们的纪念日，备好惊喜吧'
      await cloud.openapi.subscribeMessage.send({
        touser: doc._openid,
        templateId: TEMPLATE_ID,
        page: PAGE,
        data: {
          thing1: { value: clip(title, 20) },
          time2: { value: timeFor(doc.anniversary) },
          thing3: { value: clip(remark, 20) }
        }
      })
      sent++
      await db.collection('reminders').doc(doc._id).update({
        data: { lastNotifiedFor: doc.anniversary, lastSentAt: db.serverDate() }
      })
    } catch (err) {
      failed++
      const msg = String((err && (err.errMsg || err.message)) || '')
      // 43101 = 用户没订阅或订阅额度用完：关掉这条计划，别每天撞墙。
      if (msg.indexOf('43101') >= 0) {
        await db.collection('reminders').doc(doc._id).update({
          data: { enabled: false, disabledReason: '用户未订阅或额度用完' }
        })
      }
      // 其他错误（限频、网络）留到下次触发再试。
    }
  }

  return { ok: true, target: target, found: (res.data || []).length, sent: sent, failed: failed }
}
