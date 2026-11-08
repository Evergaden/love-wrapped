// 手写字体：霞鹜文楷 Lite（SIL OFL 1.1，免费商用可嵌入）。
//
// 加载策略（每台手机只下一次，之后全走本地）：
//   1. 本地已有缓存（USER_DATA_PATH）→ 直接用本地文件加载，零流量；
//   2. 没有缓存 → 经 wx.downloadFile 下载一次、存进本地，再用本地文件加载；
//   3. 本地路径加载失败（个别基础库不认）→ 退回远程直载，并记住这台设备
//      不再尝试缓存，之后直接远程直载。
//   远程地址：填了 FONT_FILE_ID 就经云存储换下载链接（腾讯域名已备案，
//   能加进 downloadFile 合法域名）；没填或换链失败退回 jsdelivr
//   （没备案，真机预览/正式版会被域名校验拦下，仅开发工具可用）。
//   任何一步失败都静默回退系统字体，不影响功能。
//
// 注意：webview 渲染下 loadFontFace 没有可靠缓存（每次冷启动都会重新
// 下载远程字体），所以必须自己落盘缓存——云存储按下行流量计费，
// 9MB × 每次启动和 9MB × 每台手机是两个量级。

const FONT_FAMILY = 'LXGW WenKai'

// 云存储 fileID：上传【子集版】字体到云开发控制台 → 存储，复制 fileID 填到这里。
// 子集版只有 1.8MB（原版 11.7MB），由 fontTools 子集化生成——字符清单 =
// 项目全部固定文案 + GB2312 一级字 + ASCII + 中英标点，缺的生僻字自动落回
// 系统字体。生成脚本与本机产物见仓库外的 font-tools/ 目录。
const FONT_FILE_ID = 'cloud://cloud1-d9g4gaoh8e7070095.636c-cloud1-d9g4gaoh8e7070095-1307885028/fonts/LXGWWenKaiLite-Subset-Regular.ttf'

const FONT_URL = 'https://cdn.jsdelivr.net/gh/lxgw/LxgwWenKai-Lite@v1.510/fonts/TTF/LXGWWenKaiLite-Regular.ttf'

// 本地缓存路径（用户文件目录，配额 200MB，字体 9MB）。
const USER_DIR = typeof wx !== 'undefined' && wx.env && wx.env.USER_DATA_PATH ? wx.env.USER_DATA_PATH : ''
const LOCAL_PATH = USER_DIR ? USER_DIR + '/lxgw-wenkai-lite.ttf' : ''
// 这台设备本地路径加载不认（个别基础库），记住后以后直接远程直载。
const BROKEN_KEY = 'loveWrapped.font.localBroken'

let loadPromise = null

function fsMgr() {
  try {
    return wx.getFileSystemManager ? wx.getFileSystemManager() : null
  } catch (err) {
    return null
  }
}

// 算出远程下载地址：填了 fileID 先换临时链接，失败或没填退回 CDN。
function resolveRemote() {
  const fallback = FONT_URL
  if (!FONT_FILE_ID || !wx.cloud || !wx.cloud.getTempFileURL) return Promise.resolve(fallback)
  return new Promise((resolve) => {
    wx.cloud.getTempFileURL({
      fileList: [FONT_FILE_ID],
      success(res) {
        const f = res && res.fileList && res.fileList[0]
        resolve(f && f.tempFileURL ? f.tempFileURL : fallback)
      },
      fail() { resolve(fallback) }
    })
  })
}

// 下载一次并落盘缓存。done(ok) 在下载结束时回调（不阻塞主加载流程）。
function downloadToLocal(remoteUrl, done) {
  const f = fsMgr()
  if (!f || !LOCAL_PATH || !wx.downloadFile) {
    done(false)
    return
  }
  wx.downloadFile({
    url: remoteUrl,
    success(res) {
      let saved = false
      if (res && res.statusCode === 200 && res.tempFilePath) {
        try {
          f.copyFileSync(res.tempFilePath, LOCAL_PATH)
          saved = true
        } catch (err) { saved = false }
      }
      done(saved)
    },
    fail() { done(false) }
  })
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
    const finishFail = (err) => {
      console.warn('[font] 手写字体加载失败，回退系统字体', err && (err.errMsg || err))
      resolve(false)
    }
    // 1. 本地缓存命中：直接加载。失败（文件坏或运行时不认本地路径）
    //    就清掉缓存、删掉标记里的信任，走一次远程再决定要不要继续缓存。
    const f = fsMgr()
    let cached = null
    if (f && LOCAL_PATH) {
      try {
        f.accessSync(LOCAL_PATH)
        cached = LOCAL_PATH
      } catch (err) { cached = null }
    }
    if (cached && !(wx.getStorageSync && wx.getStorageSync(BROKEN_KEY))) {
      loadFace(cached, (ok, err) => {
        if (ok) { resolve(true); return }
        try { f.unlinkSync(cached) } catch (err2) {}
        resolveRemote().then((remote) => {
          downloadToLocal(remote, (saved) => {
            if (saved) {
              loadFace(LOCAL_PATH, (ok2) => {
                if (ok2) { resolve(true); return }
                // 新缓存的文件也加载不动：这台设备不认本地路径，记住。
                try { wx.setStorageSync(BROKEN_KEY, true) } catch (err3) {}
                loadFace(remote, (ok3, err3) => { if (!ok3) finishFail(err3) })
              })
            } else {
              loadFace(remote, (ok2, err2) => { if (!ok2) finishFail(err2) })
            }
          })
        })
      })
      return
    }
    // 2. 没有缓存：先下载落盘一次，用本地文件加载——首启只耗一次流量。
    //    下载失败（域名没配、网络不通）才远程直载，本次不产生缓存。
    //    这台设备已知不认本地路径（BROKEN_KEY）：直接远程直载，不再白下载。
    resolveRemote().then((remote) => {
      const broken = !!(wx.getStorageSync && wx.getStorageSync(BROKEN_KEY))
      if (broken) {
        loadFace(remote, (ok, err) => { if (!ok) finishFail(err) })
        return
      }
      downloadToLocal(remote, (saved) => {
        if (saved) {
          loadFace(LOCAL_PATH, (ok) => {
            if (ok) { resolve(true); return }
            // 新缓存也加载不动：这台设备不认本地路径，记住，之后远程直载。
            try { wx.setStorageSync(BROKEN_KEY, true) } catch (err) {}
            loadFace(remote, (ok2, err2) => { if (!ok2) finishFail(err2) })
          })
        } else {
          loadFace(remote, (ok, err) => { if (!ok) finishFail(err) })
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
