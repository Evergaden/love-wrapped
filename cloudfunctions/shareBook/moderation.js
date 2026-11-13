// 生成/分享前的内容安全检测。
// 微信官方 security.msgSecCheck，走云调用，免费、不消耗云开发资源额度。
// config.json 里已声明接口权限，否则会报 604101。
//
// 滥用测试（上线前）坐实的两个口子，都在这里收掉：
//   1. 超长文本原来按 2000 字截断送检，排在窗口外的字句根本没被检过——
//      改成分块送检，每块都过一遍；块数装不下的超长文直接拒；
//   2. 检测接口异常时 fail-open 放行——上线后这是合规硬伤，
//      改成 fail-closed：宁可让用户稍后再试，不放行没检过的内容。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 用户自由填写、且会出现在纪念册/分享卡片上的文本字段。
// 枚举值、日期、数字不参与（无害且省字数）。
// 分享面板里的卡片标题（shareBook 的 event.title）也送检：
// 它是生成之后才输入的，分享时随 answers 一起过来。
const FREE_TEXT_FIELDS = [
  'myNickname', 'theirNickname', 'firstDatePlace', 'homeCity', 'places',
  'myCity', 'theirCity', 'catchphrase', 'story', 'sentence',
  'faveFoods', 'myFave', 'theirFave'
]

// msgSecCheck 单次 content 有长度上限：按 2000 字分块送检，块间重叠 60 字，
// 免得违规句恰好横跨切分点漏检。最多送 10 块（约 2 万字封顶）；
// 正常册子的自由文本加起来不到 500 字，到不了这里。
const CHUNK_CHARS = 2000
const CHUNK_OVERLAP = 60
const MAX_CHUNKS = 10

function collectText(answers, title) {
  const parts = []
  const titleText = String(title || '').trim()
  if (titleText) parts.push(titleText)
  if (answers && typeof answers === 'object') {
    FREE_TEXT_FIELDS.forEach((key) => {
      const v = answers[key]
      if (typeof v === 'string' && v.trim()) parts.push(v.trim())
      else if (Array.isArray(v)) {
        v.forEach((item) => {
          if (item && typeof item === 'string' && item.trim()) parts.push(item.trim())
        })
      }
    })
  }
  return parts.join('\n')
}

// 把全文按「块长 - 重叠」步进切块，任何一段文本都会完整落在某一块里。
// truncated = 装不进 MAX_CHUNKS 块，尾部还有没被覆盖的字句。
function chunkText(text) {
  const chars = Array.from(text)
  if (chars.length <= CHUNK_CHARS) {
    return { chunks: chars.length ? [text] : [], truncated: false }
  }
  const step = CHUNK_CHARS - CHUNK_OVERLAP
  const chunks = []
  let start = 0
  while (start < chars.length && chunks.length < MAX_CHUNKS) {
    chunks.push(chars.slice(start, start + CHUNK_CHARS).join(''))
    start += step
  }
  return { chunks: chunks, truncated: start < chars.length }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const text = collectText(event && event.answers, event && event.title)
  if (!text) return { ok: true, risky: false, skipped: true }

  const cut = chunkText(text)
  if (cut.truncated) {
    // 超出送检能力的长文不是正常用户写得出来的长度，直接拒，不检半截放半截。
    return { ok: true, risky: true, reason: '这些字太多啦，先精简一下再试试' }
  }

  try {
    for (const piece of cut.chunks) {
      const res = await cloud.openapi.security.msgSecCheck({
        version: 2,
        openid: OPENID,
        scene: 1, // 1 资料（昵称、小故事属于用户资料类内容）
        content: piece
      })
      const result = (res && (res.result || res)) || {}
      const suggest = result.suggest || (result.result && result.result.suggest) || 'pass'
      if (suggest === 'risky' || suggest === 'review') {
        return { ok: true, risky: true, reason: '有几句话暂时写不进这册，换个说法再试试吧' }
      }
    }
    return { ok: true, risky: false, checked: true }
  } catch (err) {
    // 接口限频 / 权限未生效 / 网络异常：fail-closed 拦下来，不放行没检过的内容，留日志。
    console.warn('[contentCheck] 检测接口异常，本次拦下', err && (err.errMsg || err))
    return { ok: false, risky: true, reason: '内容检测服务这会儿忙，稍等一下再试试' }
  }
}
