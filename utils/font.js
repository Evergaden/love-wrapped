// 手写字体：霞鹜文楷 Lite 子集版（SIL OFL 1.1，免费商用可嵌入）。
//
// 下载走微信云通道（wx.cloud.downloadFile + fileID），官方规则：云开发调用
// 无需配置 downloadFile 合法域名——真机上不需要加任何白名单。
// 下载到的临时文件复制进 USER_DATA_PATH 做持久缓存，之后冷启动零流量直读本地。
//
// 完整链路（每台手机只下一次，之后全走本地）：
//   1. 本地缓存命中 → 直接本地文件加载，零流量；
//   2. 没有缓存 → 云通道下载一次 → 落盘 → 本地加载；
//   3. 本地路径加载失败（个别基础库不认）→ 记住这台设备，以后直接 CDN
//      兜底（jsdelivr 没备案，真机被域名校验拦，仅开发工具里能看到）。
//   任何一步失败都静默回退系统字体，不影响功能。

const FONT_FAMILY = 'LXGW WenKai'

// 云存储 fileID：子集字体已上传到本项目云环境（fonts/LXGWWenKaiLite-Subset-Regular.ttf，
// 1.74MB）。云没开通 / init 失败时自动落到 CDN 兜底。
const FONT_FILE_ID = 'cloud://cloud1-d9g4gaoh8e7070095.636c-cloud1-d9g4gaoh8e7070095-1307885028/fonts/LXGWWenKaiLite-Subset-Regular.ttf'

// CDN 兜底：真机预览 / 正式版会被 downloadFile 域名校验拦下，仅开发工具可用。
const FONT_URL = 'https://cdn.jsdelivr.net/gh/lxgw/LxgwWenKai-Lite@v1.510/fonts/TTF/LXGWWenKaiLite-Regular.ttf'

// 本地缓存路径（用户文件目录，配额 200MB，字体 1.74MB）。
const USER_DIR = typeof wx !== 'undefined' && wx.env && wx.env.USER_DATA_PATH ? wx.env.USER_DATA_PATH : ''
const LOCAL_PATH = USER_DIR ? USER_DIR + '/lxgw-wenkai-lite.ttf' : ''
// 这台设备本地路径加载不认（个别基础库），记住后以后直接 CDN 兜底。
const BROKEN_KEY = 'loveWrapped.font.localBroken'

let loadPromise = null

function fsMgr() {
  try {
    return wx.getFileSystemManager ? wx.getFileSystemManager() : null
  } catch (err) {
    return null
  }
}

// 经云通道下载字体，成功回调临时文件路径，失败回调 null。
function cloudFetch() {
  if (!FONT_FILE_ID || !wx.cloud || !wx.cloud.downloadFile) return Promise.resolve(null)
  return new Promise((resolve) => {
    wx.cloud.downloadFile({
      fileID: FONT_FILE_ID,
      success(res) { resolve(res && res.tempFilePath ? res.tempFilePath : null) },
      fail() { resolve(null) }
    })
  })
}

// 把临时文件复制进本地缓存。返回是否落盘成功。
function saveLocal(tempPath) {
  const f = fsMgr()
  if (!f || !LOCAL_PATH || !tempPath) return false
  try {
    f.copyFileSync(tempPath, LOCAL_PATH)
    return true
  } catch (err) {
    return false
  }
}

function loadFace(source, done) {
  wx.loadFontFace({
    global: true,
    family: FONT_FAMILY,
    source: 'url("' + source + '")',
    desc: { weight: 400 },
    success() { done(true) },
    fail(err) { done(false, err) }
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
    const failWarn = (err) => {
      console.warn('[font] 手写字体加载失败，回退系统字体', err && (err.errMsg || err))
      resolve(false)
    }
    const loadCdn = () => {
      loadFace(FONT_URL, (ok, err) => { if (!ok) failWarn(err) })
    }
    const f = fsMgr()
    const broken = !!(wx.getStorageSync && wx.getStorageSync(BROKEN_KEY))

    // 1. 本地缓存命中：直接加载；失败就清掉缓存重新走一遍云下载。
    let cached = null
    if (f && LOCAL_PATH && !broken) {
      try {
        f.accessSync(LOCAL_PATH)
        cached = LOCAL_PATH
      } catch (err) { cached = null }
    }
    if (cached) {
      loadFace(cached, (ok) => {
        if (ok) { resolve(true); return }
        try { f.unlinkSync(cached) } catch (err) {}
        loadFresh()
      })
      return
    }

    // 2. 没有缓存：云通道下载 → 落盘 → 本地加载。
    //    BROKEN 设备不认本地路径，不白下载，直接 CDN 兜底。
    function loadFresh() {
      if (broken) { loadCdn(); return }
      cloudFetch().then((temp) => {
        if (!temp) { loadCdn(); return }
        const saved = saveLocal(temp)
        loadFace(saved ? LOCAL_PATH : temp, (ok, err) => {
          if (ok) { resolve(true); return }
          // 新缓存也加载不动：这台设备不认本地路径，记住，以后 CDN 兜底。
          try { wx.setStorageSync(BROKEN_KEY, true) } catch (err2) {}
          loadCdn()
        })
      })
    }
    loadFresh()
  })
  return loadPromise
}

module.exports = {
  FONT_FAMILY,
  FONT_FILE_ID,
  FONT_URL,
  ensureFont
}
