// 转发带来的纪念册。
//
// 分享不再把答案装进链接：转发时云端生成一枚随机令牌（30 天有效），
// 链接里只有令牌；对方点开卡片后，纪念册页凭令牌经云函数取回答案。
// 集合权限是「仅创建者可读写」，令牌也猜不出来——
// 没收到分享的人构造不出能打开的链接，看不到任何人的册子。

// 页面路径里携带令牌的参数名。
const TOKEN_PARAM = 'gift'

// 从页面参数里解出令牌。格式不对（链接被截断、被篡改）返回空串。
function parseGiftToken(query) {
  if (!query || typeof query !== 'object') return ''
  const token = String(query[TOKEN_PARAM] || '').trim()
  return /^[a-f0-9]{24,80}$/.test(token) ? token : ''
}

// 转发链接的页面路径：只有一枚令牌。
function giftPath(token) {
  return '/pages/wrapped/wrapped?' + TOKEN_PARAM + '=' + encodeURIComponent(token)
}

// 转发卡片标题：小熊和阿树 · 恋爱Wrapped
function giftTitle(form) {
  const a = (form && form.myNickname) || '一个人'
  const b = (form && form.theirNickname) || '另一个人'
  return a + '和' + b + ' · ' + require('./brand').APP_NAME
}

module.exports = {
  parseGiftToken,
  giftPath,
  giftTitle
}
