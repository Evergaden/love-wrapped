// 周年提醒：每天上午 9 点跑一次，把「7 天后到期」的周年计划
// 用订阅消息发给对应的用户。
//
// 数据：reminders 集合（客户端写入，_openid 微信自动带上）。
//   { _openid, anniversary: '2027-05-20', nicknames: '小熊 和 阿树',
//     enabled: true, subscribed: true, lastNotifiedFor: '' }
//
// 模板：「纪念日提醒」（mp 后台已申请，类目信息查询），字段
//   thing1 纪念日名称（发昵称们）/ time2 日期（时间型）/ thing3 备注（寄语）。
// 注意：日期是 time 型字段，要求「日期 + 时刻」格式，只发 YYYY-MM-DD 会报 47003。
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

// 订阅消息的 time 型字段要「日期 + 时刻」：把纪念日展开成当天上午 9 点。
function timeFor(ymdStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymdStr || ''))
  if (!m) return String(ymdStr || '')
  return Number(m[1]) + '年' + Number(m[2]) + '月' + Number(m[3]) + '日 09:00'
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
      await cloud.openapi.subscribeMessage.send({
        touser: doc._openid,
        templateId: TEMPLATE_ID,
        page: PAGE,
        data: {
          thing1: { value: clip(doc.nicknames, 20) },
          time2: { value: timeFor(doc.anniversary) },
          thing3: { value: '还有 7 天，回来翻翻这一册吧' }
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
