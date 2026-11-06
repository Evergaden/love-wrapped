// 纪念册页。
// 从本机读出答案，排成可以左右滑的几页。
// 「导出」用画布把当前页或整本画成图片。
// 导出不依赖任何「解锁」：写得出来，就能存下来。

const record = require('../../utils/record')
const sample = require('../../utils/sample')
const storage = require('../../utils/storage')
const slidesUtil = require('../../utils/slides')
const themes = require('../../utils/themes')
const brand = require('../../utils/brand')
const gift = require('../../utils/gift')
const poster = require('../../utils/poster')
const privacy = require('../../utils/privacy')

function readWindow() {
  let info = { windowWidth: 375, windowHeight: 667, screenHeight: 667, pixelRatio: 2 }
  try {
    // 新基础库拆成了几个接口，老基础库仍然只有 getSystemInfoSync。
    if (typeof wx.getWindowInfo === 'function') {
      const w = wx.getWindowInfo() || {}
      info = {
        windowWidth: w.windowWidth,
        windowHeight: w.windowHeight,
        screenHeight: w.screenHeight,
        pixelRatio: w.pixelRatio,
        safeArea: w.safeArea
      }
    } else {
      info = wx.getSystemInfoSync() || info
    }
  } catch (err) {
    console.warn(err)
  }
  const width = info.windowWidth || 375
  const height = info.windowHeight || 667
  const safe = info.safeArea && info.screenHeight
    ? Math.max(0, info.screenHeight - info.safeArea.bottom)
    : 0
  // 底部操作区大约 330rpx（含主题切换行），再加一点安全区。真正高度会在 onReady 里量一次。
  const dock = 330 * (width / 750) + safe
  return {
    windowHeight: height,
    swiperHeight: Math.max(240, height - dock),
    pixelRatio: info.pixelRatio || 2
  }
}

Page({
  data: {
    empty: false,
    gift: false,
    slides: [],
    current: 0,
    currentTheme: themes.DEFAULT,
    themeList: themes.pickerList(),
    windowHeight: 667,
    swiperHeight: 500,
    pixelRatio: 2,
    exporting: false,
    sheet: null,
    canvasW: 10,
    canvasH: 10,
    sharePath: '',
    canShareImage: typeof wx.showShareImageMenu === 'function',
    shareTitle: brand.SHARE_TITLE,
    appName: brand.APP_NAME
  },

  onLoad(options) {
    const metrics = readWindow()
    // 礼物模式：这册是转发带来的，答案就装在链接里，不读本机的答案。
    const giftRaw = gift.unpackGift(options)
    const giftForm = giftRaw ? record.pickForm(giftRaw) : null
    const isGift = !!(giftForm && record.canGenerate(giftForm))
    const saved = storage.loadAnswers()
    const mineReady = !!(saved && record.canGenerate(saved))
    const ready = isGift || mineReady
    // 主题和答案一样都从本机读。缓存里没有或值不合法时，回到默认配色。
    const theme = themes.resolve(isGift ? giftRaw.theme : storage.loadTheme())
    const source = isGift ? giftForm : saved
    const slides = ready ? slidesUtil.buildSlides(source, null, theme) : []
    if (isGift) {
      this.giftForm = giftForm
      this.setData({
        gift: true,
        shareTitle: gift.giftTitle(giftForm)
      })
    }
    this.setData({
      windowHeight: metrics.windowHeight,
      swiperHeight: metrics.swiperHeight,
      pixelRatio: metrics.pixelRatio,
      empty: !ready,
      slides: slides,
      current: 0,
      currentTheme: theme,
      emptyMeshStyle: themes.meshImage(theme, 'mesh-1'),
      emptyLowerStyle: themes.ambLowerImage(theme)
    })
    this.syncChrome(theme)
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
    // 礼物模式：把这册继续原样传给下一个人，链接里带的还是同一份答案。
    if (this.data.gift && this.giftForm) {
      const id = this.data.currentTheme
      return {
        title: this.data.shareTitle,
        path: gift.giftPath(this.giftForm, id),
        imageUrl: this.data.sharePath || ''
      }
    }
    // 自己的纪念册：把答案装进链接，对方点开就能看到整册。
    const saved = storage.loadAnswers()
    if (saved && record.canGenerate(saved)) {
      return {
        title: gift.giftTitle(saved),
        path: gift.giftPath(saved, this.data.currentTheme),
        imageUrl: this.data.sharePath || ''
      }
    }
    return {
      title: this.data.shareTitle || brand.SHARE_TITLE,
      path: '/pages/index/index',
      imageUrl: this.data.sharePath || ''
    }
  },

  // 朋友圈没有专门接口，标题由 onShareTimeline 返回。
  onShareTimeline() {
    return {
      title: brand.TIMELINE_TITLE,
      query: '',
      imageUrl: this.data.sharePath || ''
    }
  },

  // 换主题：整本的每一页都换色（含内联的弥散底），分享封面也重画一张。
  // 礼物模式下只换看的效果，不写对方设备上的任何东西。
  onTapTheme(e) {
    const id = themes.resolve(e.currentTarget.dataset.id)
    if (id === this.data.currentTheme) return
    if (!this.data.gift) storage.saveTheme(id)
    const slides = this.data.slides.map((slide) => {
      const next = Object.assign({}, slide, { theme: id })
      next.meshStyle = themes.meshImage(id, slide.mesh)
      next.hairStyle = themes.hairlineImage(id)
      return next
    })
    this.setData({
      currentTheme: id,
      slides: slides,
      emptyMeshStyle: themes.meshImage(id, 'mesh-1'),
      emptyLowerStyle: themes.ambLowerImage(id)
    }, () => {
      this.syncChrome(id)
      if (!this.data.empty) this.prepareShareImage(slides)
    })
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
      title: brand.APP_NAME,
      line: phrase && phrase.title && phrase.title !== '还没写'
        ? phrase.title
        : (ending && ending.title && ending.title !== '还空着' ? ending.title : ''),
      postmark: cover.meta || '',
      theme: this.data.currentTheme
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

  // 导航栏底色跟主题走。
  syncChrome(themeId) {
    const t = themes.THEMES[themes.resolve(themeId)]
    wx.setNavigationBarColor({
      frontColor: '#000000',
      backgroundColor: t.bg,
      animation: { duration: 180, timingFunc: 'easeIn' },
      fail() {}
    })
  },

  onSwipe(e) {
    const current = e.detail.current
    const slide = this.data.slides[current]
    if (!slide) return
    this.setData({
      current: current,
      currentTheme: this.data.currentTheme
    })
  },

  // 礼物模式：把转发来的这册存进自己手机（会覆盖自己写的那份，先确认）。
  onSaveGift() {
    if (!this.giftForm) return
    const page = this
    wx.showModal({
      title: '把这册留下来',
      content: '会把这册内容存进你手机上的纪念册，覆盖你自己写的那一份。',
      confirmText: '收下',
      cancelText: '先不',
      confirmColor: themes.THEMES[themes.resolve(this.data.currentTheme)].kicker,
      success(res) {
        if (!res.confirm) return
        storage.saveAnswers(page.giftForm)
        page.setData({ gift: false })
        wx.showToast({ title: '已收下，现在是你手机里的了', icon: 'none' })
      }
    })
  },

  // 导出的图片直接发进聊天，不用先存相册再去找图。
  onShareImage() {
    const sheet = this.data.sheet
    if (!sheet || !sheet.path) return
    wx.showShareImageMenu({
      path: sheet.path,
      fail() {
        // 用户取消或者版本不支持，静默即可。
      }
    })
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
    const slides = slidesUtil.buildSlides(form, null, this.data.currentTheme)
    this.setData({
      empty: false,
      slides: slides,
      current: 0
    }, () => {
      this.syncChrome(this.data.currentTheme)
      this.measureDock()
      this.prepareShareImage(slides)
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
    this.exportBook(this.data.slides)
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
      const dpr = this.posterScaleForHeight(height)
      const drawn = await this.prepareCanvas(width, height, dpr)
      // 先确认隐私授权。没做过授权的设备，这里会弹一次微信自带的说明。
      await privacy.requirePrivacy()
      if (list.length === 1) {
        poster.drawSlide(drawn.ctx, width, poster.POSTER_H, list[0], {
          pageLabel: pageLabel
        })
      } else {
        const plan = poster.planBook(drawn.ctx, width, list)
        poster.drawBookPlanned(drawn.ctx, width, plan, {})
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
        content: '再试一次通常就好了；还是不行的话，把微信更新到最新版。',
        showCancel: false,
        confirmText: '知道了',
        confirmColor: themes.THEMES[this.data.currentTheme].kicker
      })
    }
  },

  // 整本导出成一张连贯的长图。分两步：
  //   1) 先用一块临时画布把每一节排出来、量出整条要多高
  //   2) 再按量出的高度建正式画布，从头画到尾
  async exportBook(list) {
    if (this.data.exporting) return
    if (!list || !list.length) return
    this.setData({ exporting: true })
    wx.showLoading({ title: '正在绘制', mask: true })
    try {
      const width = poster.POSTER_W
      // 先量：画布大小随便，只借它量字。
      const probe = await this.prepareCanvas(width, poster.POSTER_H, 1)
      const plan = poster.planBook(probe.ctx, width, list)
      // 再画：按量出的总高度建正式画布。
      const dpr = this.posterScaleForHeight(plan.totalH)
      const drawn = await this.prepareCanvas(width, plan.totalH, dpr)
      await privacy.requirePrivacy()
      poster.drawBookPlanned(drawn.ctx, width, plan, {})
      const path = await this.canvasToImage(drawn.node, width, plan.totalH, drawn.destW, drawn.destH)
      wx.hideLoading()
      this.setData({
        exporting: false,
        sheet: {
          path: path,
          title: '整本'
        }
      })
    } catch (err) {
      console.warn(err)
      wx.hideLoading()
      this.setData({ exporting: false })
      wx.showModal({
        title: '没能生成图片',
        content: '再试一次通常就好了；还是不行的话，把微信更新到最新版。',
        showCancel: false,
        confirmText: '知道了',
        confirmColor: themes.THEMES[this.data.currentTheme].kicker
      })
    }
  },

  // 单页按屏幕清晰度画；长图要落在画布边长限制里，自动缩小。
  posterScaleForHeight(height) {
    const maxSide = 4096
    let dpr = Math.min(this.data.pixelRatio || 2, 2)
    const limit = Math.min(maxSide / (height || 1), maxSide / poster.POSTER_W)
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
            content: '在设置里允许「保存到相册」后就能写入。你也可以先查看大图，长按保存。',
            confirmText: '去设置',
            cancelText: '知道了',
            confirmColor: themes.THEMES[this.data.currentTheme].kicker,
            success(res) {
              if (res.confirm) wx.openSetting({})
            }
          })
          return
        }
        wx.showModal({
          title: '没能写入相册',
          content: '图片已经生成好了，可以先查看大图，长按保存。',
          showCancel: false,
          confirmText: '知道了',
          confirmColor: themes.THEMES[this.data.currentTheme].kicker
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
