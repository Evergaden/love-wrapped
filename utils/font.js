// 手写字体：霞鹜文楷 Lite（SIL OFL 1.1，免费商用可嵌入）。
//
// 加载策略：
//   - 启动时异步加载（global: true 全局生效，含 canvas 2d），
//     加载完成前所有文字先用系统字体，加载完成后自动切换（不阻塞使用）。
//   - 字体文件约 9.4MB，微信会在首次加载后缓存。
//   - 更稳的做法：把字体文件上传到自己的云存储，把下面的 URL 换成
//     云存储的下载地址（同源、国内 CDN，速度更快）。
//
// 使用：页面 wxss / poster.js 的 font-family 栈里已前置
//   "LXGW WenKai"——加载成功即全局生效，失败则回退系统字体，不影响功能。

const FONT_FAMILY = 'LXGW WenKai'

// 默认走 jsdelivr（直连国内可用）；接入云开发后建议换成云存储 fileID/下载地址。
const FONT_URL = 'https://cdn.jsdelivr.net/gh/lxgw/LxgwWenKai-Lite@v1.510/fonts/TTF/LXGWWenKaiLite-Regular.ttf'

let loadPromise = null

// 单飞：全局只发起一次加载，后续调用复用同一个 Promise。
function ensureFont() {
  if (loadPromise) return loadPromise
  loadPromise = new Promise((resolve) => {
    if (!wx.loadFontFace) {
      resolve(false)
      return
    }
    wx.loadFontFace({
      global: true,
      family: FONT_FAMILY,
      source: 'url("' + FONT_URL + '")',
      desc: { weight: 400 },
      success() { resolve(true) },
      fail(err) {
        console.warn('[font] 手写字体加载失败，回退系统字体', err && (err.errMsg || err))
        resolve(false)
      }
    })
  })
  return loadPromise
}

module.exports = {
  FONT_FAMILY,
  FONT_URL,
  ensureFont
}
