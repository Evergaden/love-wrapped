// 转发带来的纪念册。
//
// 这个小程序没有服务器，答案装不进云端，那就装进链接里：
// 发起转发时，把整份答案压缩成一小段查询串挂在页面路径后面；
// 对方点开卡片时从路径里解出来，原样排成一册。
// 数据只从一部手机到另一部手机，中间只经过微信自己的转发通道，
// 不经过、也不落在任何服务器上。

// 短键名。分享路径里每个字节都要省着用。
// a/b/c… 只在这个文件里用，外面看到的永远是 record.js 里的完整字段名。
const KEYS = {
  a: 'myNickname',
  b: 'theirNickname',
  c: 'togetherDate',
  d: 'firstDatePlace',
  e: 'cityCount',
  f: 'mealMode',
  g: 'mealCount',
  h: 'fightCount',
  i: 'whoApologized',
  j: 'catchphrase',
  k: 'story',
  l: 'distanceMode',
  m: 'distanceKm',
  n: 'meetCount',
  o: 'sentence',
  p: 'homeCity',
  q: 'places',
  r: 'myCity',
  s: 'theirCity',
  t: 'meetMode',
  u: 'faveFoods',
  v: 'writtenAt',
  z: 'theme'
}

// 把一份答案压成查询串。空字段一个都不带。
function packGift(form, themeId) {
  const parts = []
  Object.keys(KEYS).forEach((short) => {
    const long = KEYS[short]
    const value = short === 'z'
      ? themeId
      : (form ? form[long] : '')
    const text = String(value === undefined || value === null ? '' : value)
    if (text === '') return
    parts.push(short + '=' + encodeURIComponent(text))
  })
  return parts.join('&')
}

// 从页面参数里把答案解出来。解不出、或一个键都没有时返回 null。
// 走不通（链接被截断、字段不齐）时，调用方会把人领回填写页。
function unpackGift(query) {
  if (!query || typeof query !== 'object') return null
  const raw = {}
  let found = 0
  Object.keys(KEYS).forEach((short) => {
    const value = query[short]
    if (value === undefined || value === null || value === '') return
    let text = String(value)
    try {
      text = decodeURIComponent(value)
    } catch (err) {
      // 有的微信版本已经解过一次码，这里的值就是原文，直接用。
    }
    raw[KEYS[short]] = text
    found++
  })
  if (!found) return null
  return raw
}

// 转发链接里那册纪念册的完整页面路径。
function giftPath(form, themeId) {
  return '/pages/wrapped/wrapped?' + packGift(form, themeId)
}

// 转发卡片标题：小熊和阿树 · Wrapped 纪念册
function giftTitle(form) {
  const a = (form && form.myNickname) || '一个人'
  const b = (form && form.theirNickname) || '另一个人'
  return a + '和' + b + ' · ' + require('./brand').APP_NAME
}

module.exports = {
  packGift,
  unpackGift,
  giftPath,
  giftTitle
}
