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

// 云存储优先：把字体文件上传到云开发存储后，把 fileID 填到 FONT_FILE_ID。
// 运行时经 wx.cloud.getTempFileURL 换成下载地址——腾讯的 tcb 域名已备案，
// 能加进 mp 后台的 downloadFile 合法域名；jsdelivr 没备案加不进去，
// 真机预览/正式版都会被域名校验拦下，所以真机想看到手写字体必须走这条。
// 没填 fileID 或云不可用时，退回下面的 CDN 地址（仅开发工具里可用）。
const FONT_FILE_ID = ''
const FONT_URL = 'https://cdn.jsdelivr.net/gh/lxgw/LxgwWenKai-Lite@v1.510/fonts/TTF/LXGWWenKaiLite-Regular.ttf'

let loadPromise = null

// 算出字体的下载地址：填了 fileID 就先换临时链接，失败或没填退回 CDN。
function resolveSource() {
  const fallback = 'url("' + FONT_URL + '")'
  if (!FONT_FILE_ID || !wx.cloud || !wx.cloud.getTempFileURL) return Promise.resolve(fallback)
  return new Promise((resolve) => {
    wx.cloud.getTempFileURL({
      fileList: [FONT_FILE_ID],
      success(res) {
        const f = res && res.fileList && res.fileList[0]
        resolve(f && f.tempFileURL ? 'url("' + f.tempFileURL + '")' : fallback)
      },
      fail() { resolve(fallback) }
    })
  })
}

// 单飞：全局只发起一次加载，后续调用复用同一个 Promise。
function ensureFont() {
  if (loadPromise) return loadPromise
  loadPromise = new Promise((resolve) => {
    if (!wx.loadFontFace) {
      resolve(false)
      return
    }
    resolveSource().then((source) => {
      wx.loadFontFace({
        global: true,
        family: FONT_FAMILY,
        source: source,
        desc: { weight: 400 },
        success() { resolve(true) },
        fail(err) {
          console.warn('[font] 手写字体加载失败，回退系统字体', err && (err.errMsg || err))
          resolve(false)
        }
      })
    })
  })
  return loadPromise
}

module.exports = {
  FONT_FAMILY,
  FONT_FILE_ID,
  FONT_URL,
  ensureFont
}
