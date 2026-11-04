// 纪念册页。
// 从本机读出答案，排成可以左右滑的几页。
// 「导出」用画布把当前页或整本画成图片。
// 导出不依赖任何「解锁」：写得出来，就能存下来。

const record = require('../../utils/record')
const sample = require('../../utils/sample')
const storage = require('../../utils/storage')
const slidesUtil = require('../../utils/slides')
const poster = require('../../utils/poster')
const privacy = require('../../utils/privacy')

function readWindow() {
  let info = { windowWidth: 375, windowHeight: 667, screenHeight: 667, pixelRatio: 2 }
  try {
    info = wx.getSystemInfoSync() || info
  } catch (err) {
    console.warn(err)
  }
  const width = info.windowWidth || 375
  const height = info.windowHeight || 667
  const safe = info.safeArea && info.screenHeight
    ? Math.max(0, info.screenHeight - info.safeArea.bottom)
    : 0
  // 底部操作区大约 250rpx，再加一点安全区。真正高度会在 onReady 里量一次。
  const dock = 250 * (width / 750) + safe
  return {
    windowHeight: height,
    swiperHeight: Math.max(240, height - dock),
    pixelRatio: info.pixelRatio || 2
  }
}

Page({
  data: {
    empty: false,
    slides: [],
    current: 0,
    currentTheme: 'cream',
    windowHeight: 667,
    swiperHeight: 500,
    pixelRatio: 2,
    exporting: false,
    sheet: null,
    canvasW: 10,
    canvasH: 10,
    sharePath: '',
    shareTitle: '恋爱Wrapped · 只属于我们的纪念册'
  },

  onLoad() {
    const metrics = readWindow()
    const saved = storage.loadAnswers()
    const ready = !!(saved && record.canGenerate(saved))
    const slides = ready ? slidesUtil.buildSlides(saved) : []
    this.setData({
      windowHeight: metrics.windowHeight,
      swiperHeight: metrics.swiperHeight,
      pixelRatio: metrics.pixelRatio,
      empty: !ready,
      slides: slides,
      current: 0,
      currentTheme: slides.length ? slides[0].theme : 'cream'
    })
    this.syncChrome(slides[0])
    wx.showShareMenu({ menus: ['shareAppMessage'] })
    // 分享封面在后台先画好，点「分享给 TA」时不用等。
    if (ready) this.prepareShareImage(slides)
  },

  onShow() {
    // 首次进页顺带确认一次隐私授权状态。declined 也能看，只是导出前会再拦一次。
    privacy.checkPrivacy()
  },

  onReady() {
    this.measureDock()
  },

  onResize() {
    const metrics = readWindow()
    this.setData({
      windowHeight: metrics.windowHeight,
      swiperHeight: metrics.swiperHeight,
      pixelRatio: metrics.pixelRatio
    }, () => {
      this.measureDock()
    })
  },

  onShareAppMessage() {
    const title = this.data.shareTitle || '恋爱Wrapped · 只属于我们的纪念册'
    const imageUrl = this.data.sharePath || ''
    return {
      title: title,
      path: '/pages/index/index',
      imageUrl: imageUrl
    }
  },

  // 朋友圈没有专门接口，标题由 onShareTimeline 返回。
  onShareTimeline() {
    return {
      title: '我也写了一本《恋爱Wrapped》，只印了一份',
      query: '',
      imageUrl: this.data.sharePath || ''
    }
  },

  // 把分享封面画成图片，存在 data.sharePath 里。
  // 失败不打断用户：没有图就退回默认封面，卡片还是能发出去。
  prepareShareImage(list) {
    const page = this
    const slides = list || this.data.slides
    if (!slides || !slides.length) return
    const cover = slides[0]
    const phrase = slides.filter(s => s.id === 'phrase')[0] || null
    const ending = slides.filter(s => s.id === 'ending')[0] || null

    const card = {
      nameA: cover.nameA || '',
      nameB: cover.nameB || '',
      title: '恋爱Wrapped',
      line: phrase && phrase.title && phrase.title !== '还没写'
        ? phrase.title
        : (ending && ending.title && ending.title !== '还空着' ? ending.title : ''),
      postmark: cover.meta || ''
    }

    this.createSelectorQuery()
      .select('#share')
      .fields({ node: true, size: true })
      .exec(async (res) => {
        const node = res && res[0] && res[0].node
        if (!node || !node.getContext) return
        try {
          const ctx = node.getContext('2d')
          const dpr = Math.min(this.data.pixelRatio || 2, 3)
          node.width = poster.SHARE_W * dpr
          node.height = poster.SHARE_H * dpr
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          poster.drawShareCard(ctx, poster.SHARE_W, poster.SHARE_H, card)
          const path = await this.shareCanvasToImage(node, dpr)
          page.setData({ sharePath: path })
        } catch (err) {
          console.warn('分享封面没画出来', err)
        }
      })
  },

  shareCanvasToImage(canvas, dpr) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        wx.canvasToTempFilePath({
          canvas: canvas,
          x: 0,
          y: 0,
          width: poster.SHARE_W,
          height: poster.SHARE_H,
          destWidth: Math.round(poster.SHARE_W * dpr),
          destHeight: Math.round(poster.SHARE_H * dpr),
          fileType: 'png',
          success(res) {
            if (res && res.tempFilePath) resolve(res.tempFilePath)
            else reject(new Error('分享封面是空的'))
          },
          fail(err) {
            reject(err || new Error('分享封面导出失败'))
          }
        })
      }, 60)
    })
  },

  measureDock() {
    if (this.data.empty) return
    this.createSelectorQuery()
      .select('.dock')
      .boundingClientRect((rect) => {
        if (!rect || !rect.height) return
        const next = this.data.windowHeight - rect.height
        if (next > 200) this.setData({ swiperHeight: next })
      })
      .exec()
  },

  // 每一页都是奶油底，导航栏不用再跟着换色。
  syncChrome() {
    wx.setNavigationBarColor({
      frontColor: '#000000',
      backgroundColor: '#FFF5F7',
      animation: { duration: 180, timingFunc: 'easeIn' }
    })
  },

  onSwipe(e) {
    const current = e.detail.current
    const slide = this.data.slides[current]
    if (!slide) return
    this.setData({
      current: current,
      currentTheme: slide.theme
    })
    this.syncChrome(slide)
  },

  onGoFill() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
      return
    }
    wx.redirectTo({ url: '/pages/index/index' })
  },

  onUseSample() {
    const form = record.normalize(sample.SAMPLE)
    storage.saveAnswers(form)
    const slides = slidesUtil.buildSlides(form)
    this.setData({
      empty: false,
      slides: slides,
      current: 0,
      currentTheme: slides[0].theme
    }, () => {
      this.syncChrome(slides[0])
      this.measureDock()
    })
    wx.showToast({ title: '已放上示例', icon: 'none' })
  },

  onExport() {
    const slide = this.data.slides[this.data.current]
    if (!slide) return
    const label = (this.data.current + 1) + ' / ' + this.data.slides.length
    this.exportSlides([slide], '这一页', label)
  },

  onExportAll() {
    this.exportSlides(this.data.slides, '整本', '')
  },

  // async 表示这个函数会停下来等画布画完，再继续。
  async exportSlides(list, title, pageLabel) {
    if (this.data.exporting) return
    if (!list || !list.length) return
    this.setData({ exporting: true })
    wx.showLoading({ title: '正在绘制', mask: true })
    try {
      const width = poster.POSTER_W
      const height = poster.POSTER_H * list.length
      const dpr = this.posterScale(list.length)
      const drawn = await this.prepareCanvas(width, height, dpr)
      // 先确认隐私授权。没做过授权的设备，这里会弹一次微信自带的说明。
      await privacy.requirePrivacy()
      if (list.length === 1) {
        poster.drawSlide(drawn.ctx, width, poster.POSTER_H, list[0], {
          pageLabel: pageLabel
        })
      } else {
        poster.drawBook(drawn.ctx, width, poster.POSTER_H, list, {})
      }
      const path = await this.canvasToImage(drawn.node, width, height, drawn.destW, drawn.destH)
      wx.hideLoading()
      this.setData({
        exporting: false,
        sheet: {
          path: path,
          title: title
        }
      })
    } catch (err) {
      console.warn(err)
      wx.hideLoading()
      this.setData({ exporting: false })
      wx.showModal({
        title: '没能生成图片',
        content: '请打开右上角「详情 → 本地设置」，把调试基础库调到 3.0 以上，然后再导出一次。',
        showCancel: false,
        confirmText: '知道了',
        confirmColor: '#E85A7A'
      })
    }
  },

  // 单页可以画得清楚。整本长图要落在画布边长限制里，所以会自动缩小。
  posterScale(pageCount) {
    const cap = pageCount >= 6 ? 1 : (pageCount >= 4 ? 1.5 : 2)
    let dpr = Math.min(this.data.pixelRatio || 2, cap)
    const maxSide = 4096
    const heightLimit = maxSide / (poster.POSTER_H * pageCount)
    const widthLimit = maxSide / poster.POSTER_W
    const limit = Math.min(heightLimit, widthLimit)
    if (dpr > limit) dpr = limit
    return dpr > 0 ? dpr : 1
  },

  prepareCanvas(width, height, dpr) {
    const page = this
    return new Promise((resolve, reject) => {
      page.setData({ canvasW: width, canvasH: height }, () => {
        setTimeout(() => {
          page.createSelectorQuery()
            .select('#poster')
            .fields({ node: true, size: true })
            .exec((res) => {
              const node = res && res[0] && res[0].node
              if (!node || !node.getContext) {
                reject(new Error('找不到画布'))
                return
              }
              const ctx = node.getContext('2d')
              const destW = Math.max(1, Math.round(width * dpr))
              const destH = Math.max(1, Math.round(height * dpr))
              node.width = destW
              node.height = destH
              ctx.setTransform(destW / width, 0, 0, destH / height, 0, 0)
              resolve({ node: node, ctx: ctx, dpr: dpr, destW: destW, destH: destH })
            })
        }, 80)
      })
    })
  },

  canvasToImage(canvas, width, height, destW, destH) {
    const page = this
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        wx.canvasToTempFilePath({
          canvas: canvas,
          x: 0,
          y: 0,
          width: width,
          height: height,
          destWidth: destW,
          destHeight: destH,
          fileType: 'png',
          success(res) {
            if (!res.tempFilePath) {
              reject(new Error('图片是空的'))
              return
            }
            resolve(res.tempFilePath)
          },
          fail(err) {
            reject(err || new Error('导出失败'))
          }
        }, page)
      }, 80)
    })
  },

  onPreviewImage() {
    const sheet = this.data.sheet
    if (!sheet || !sheet.path) return
    wx.previewImage({
      current: sheet.path,
      urls: [sheet.path]
    })
  },

  onSaveAlbum() {
    const sheet = this.data.sheet
    if (!sheet || !sheet.path) return
    wx.saveImageToPhotosAlbum({
      filePath: sheet.path,
      success() {
        wx.showToast({ title: '已保存到相册', icon: 'none' })
      },
      fail(err) {
        const msg = (err && err.errMsg) || ''
        if (msg.indexOf('auth') >= 0 || msg.indexOf('deny') >= 0 || msg.indexOf('authorize') >= 0) {
          wx.showModal({
            title: '需要相册权限',
            content: '允许保存到相册后才能写入。开发者工具里经常存不了，用手机预览更可靠。你也可以先查看大图。',
            confirmText: '去设置',
            cancelText: '知道了',
            confirmColor: '#E85A7A',
            success(res) {
              if (res.confirm) wx.openSetting({})
            }
          })
          return
        }
        wx.showModal({
          title: '没能写入相册',
          content: '模拟器里这很常见。请用开发者工具上方的「预览」，用手机微信扫码后再保存。图片本身已经画好了，可以先查看大图。',
          showCancel: false,
          confirmText: '知道了',
          confirmColor: '#E85A7A'
        })
      }
    })
  },

  onCloseSheet() {
    this.setData({
      sheet: null,
      canvasW: 10,
      canvasH: 10
    })
  },

  noop() {}
})
