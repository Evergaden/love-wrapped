// 生成纪念册前的内容安全检测（只在「点生成」时调一次）。
// 微信官方 security.msgSecCheck，走云调用，免费、不消耗云开发资源额度。
// config.json 里已声明接口权限，否则会报 604101。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 用户自由填写、且会出现在纪念册/分享卡片上的文本字段。
// 枚举值、日期、数字不参与（无害且省字数）；分享面板里的标题是生成之后
// 才输入的，不在这份清单里，见 README 的说明。
const FREE_TEXT_FIELDS = [
  'myNickname', 'theirNickname', 'firstDatePlace', 'homeCity', 'places',
  'myCity', 'theirCity', 'catchphrase', 'story', 'sentence',
  'faveFoods', 'myFave', 'theirFave'
]

function collectText(answers) {
  if (!answers || typeof answers !== 'object') return ''
  const parts = []
  FREE_TEXT_FIELDS.forEach((key) => {
    const v = answers[key]
    if (typeof v === 'string' && v.trim()) parts.push(v.trim())
    else if (Array.isArray(v)) {
      v.forEach((item) => {
        if (item && typeof item === 'string' && item.trim()) parts.push(item.trim())
      })
    }
  })
  // msgSecCheck 单次 content 有长度上限，超长按上限截断（超长册子取前段）。
  return parts.join('\n').slice(0, 2000)
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const text = collectText(event && event.answers)
  if (!text) return { ok: true, risky: false, skipped: true }

  try {
    const res = await cloud.openapi.security.msgSecCheck({
      version: 2,
      openid: OPENID,
      scene: 1, // 1 资料（昵称、小故事属于用户资料类内容）
      content: text
    })
    const result = (res && (res.result || res)) || {}
    const suggest = result.suggest || (result.result && result.result.suggest) || 'pass'
    if (suggest === 'risky' || suggest === 'review') {
      return { ok: true, risky: true, reason: '有几句话暂时写不进这册，换个说法再试试吧' }
    }
    return { ok: true, risky: false, checked: true }
  } catch (err) {
    // 接口限频 / 权限未生效 / 网络异常：放行，不误伤正常用户，但留日志。
    console.warn('[contentCheck] 检测接口异常，本次放行', err && (err.errMsg || err))
    return { ok: true, risky: false, skipped: true }
  }
}
