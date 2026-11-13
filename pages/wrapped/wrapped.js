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
const cloud = require('../../utils/cloud')
const font = require('../../utils/font')
const poster = require('../../utils/poster')
const privacy = require('../../utils/privacy')

// 书架翻看：链接里带一册云端快照的编号。格式不对（链接被截断、被篡改）返回空串。
function parseBookId(query) {
  if (!query || typeof query !== 'object') return ''
  const id = String(query.book || '').trim()
  return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : ''
}

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
    viewer: false,
    gift: false,
    giftSaved: false,
    giftState: '',
    giftError: '',
    giftSplashTitle: '',
    giftFrom: '',
    giftDateText: '',
    shareSheetOpen: false,
    shareReady: false,
    shareError: '',
    shareTitleInput: '',
    shareChips: ['生日快乐', '一周年快乐', '纪念日快乐', '年度报告', '有一册想给你'],
    slides: [],
    current: 0,
    pageIn: 0,
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
    // 礼物模式：链接里只有一枚令牌，答案要从云端凭令牌取回（异步）。
    const giftToken = gift.parseGiftToken(options)
    const shareError = !!(options && (options.shareError || (options.gift && !giftToken)))
    // 书架翻看模式：链接里带一册云端快照的编号，凭编号取回这一册。
    const bookId = parseBookId(options)
    // 翻看模式不算「我的册子」：先不按本机草稿排页，免得草稿先闪一版。
    const viewer = !!bookId && !giftToken
    const saved = storage.loadAnswers()
    const mineReady = !!(saved && record.canGenerate(saved))
    // 主题和答案都从本机读：优先这一册自己选过的配色，再退回全局默认。
    const theme = themes.resolve(storage.loadDraftTheme() || themes.DEFAULT)
    const slides = mineReady && !viewer && !giftToken && !shareError ? slidesUtil.buildSlides(saved, null, theme) : []
    this.setData({
      windowHeight: metrics.windowHeight,
      swiperHeight: metrics.swiperHeight,
      pixelRatio: metrics.pixelRatio,
      empty: !mineReady && !giftToken && !viewer && !shareError,
      viewer: viewer,
      slides: slides,
      current: 0,
      currentTheme: theme,
      emptyMeshStyle: themes.meshImage(theme, 'mesh-1'),
      emptyLowerStyle: themes.ambLowerImage(theme)
    })
    this.syncChrome(theme)
    // 朋友圈没有主动拉起的接口，入口只住在右上角胶囊菜单里：
    // 两个菜单都先打开，右上角「···」里才见得到「分享到朋友圈」。
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    if (shareError) {
      this.setData({ gift: true, giftState: 'error', giftError: '这份分享还没准备好，请让 TA 回到纪念册重新分享一次。' })
      return
    }
    if (giftToken) {
      // 礼物模式：先落全屏封面（标题取到后填入），点「立即开启」才演拆信封。
      this.giftToken = giftToken
      this.giftFetching = true
      this.setData({ gift: true, giftState: 'splash', giftSplashTitle: '', giftFrom: '', giftDateText: '', giftFetching: true })
      this.loadGift(giftToken)
      return
    }
    if (viewer) {
      // 翻看模式：取回这一册再落页；本机草稿不预热分享，免得令牌里装错内容。
      this.loadBook(bookId)
      return
    }
    // 分享封面在后台先画好，点「分享给 TA」时不用等。
    if (mineReady) {
      this.prepareShareImage(slides)
      // 提前把分享令牌备好，点分享时直接可用。
      cloud.shareTokenFor(record.normalize(saved), this.data.currentTheme, '').then((res) => {
        if (res.ok) this.shareToken = res.token
      })
    }
  },

  // 凭令牌从云端取回这册的答案，取到后排成页面。
  loadGift(token) {
    const page = this
    cloud.fetchSharedBook(token).then((res) => {
      if (!page.data.gift) return
      if (!res.ok) {
        page.setData({ giftState: 'error', giftError: res.error || '这份分享打不开', giftFetching: false })
        return
      }
      const form = record.pickForm(res.answers)
      if (!record.canGenerate(form)) {
        page.setData({ giftState: 'error', giftError: '这册内容不完整，让 TA 重新分享一次吧' })
        return
      }
      page.giftForm = form
      // 收礼的人固定看作者选好的配色：分享记录里带了 theme 就用它。
      const theme = res.theme ? themes.resolve(res.theme) : page.data.currentTheme
      const slides = slidesUtil.buildSlides(form, null, theme)
      page.pendingGiftOk = { slides: slides, theme: theme }
      page.giftHeadline = res.title || ''
      page.setData({
        giftState: 'splash',
        giftFetching: false,
        giftSplashTitle: (res.title || '').slice(0, 24) || '有一册想给你',
        giftFrom: form.myNickname || 'TA',
        giftDateText: record.formatDate(form.togetherDate),
        slides: slides,
        current: 0,
        pageIn: 0,
        currentTheme: theme,
        shareTitle: gift.giftTitle(form)
      }, () => {
        page.syncChrome(theme)
        page.prepareShareImage(slides)
      })
    })
  },

  // 书架翻看：凭编号从云端取回一册，直接落进翻页视图。
  // 这册不是本机草稿：分享预热也用它自己的内容，本机缓存一个字不碰。
  loadBook(id) {
    const page = this
    cloud.getBook(id).then((res) => {
      if (!page.data.viewer) return
      if (!res.ok || !res.book) {
        page.quitViewer('这一册暂时打不开，晚点再来看看')
        return
      }
      const form = record.pickForm(res.book.answers)
      if (!record.canGenerate(form)) {
        page.quitViewer('这一册内容不全，先回书架歇一歇')
        return
      }
      page.bookForm = form
      // 翻看云书架上的册子：用这一册自己的配色，没有记录过才用本机默认。
      const theme = themes.resolve(res.book.theme || page.data.currentTheme)
      const slides = slidesUtil.buildSlides(form, null, theme)
      page.setData({
        empty: false,
        slides: slides,
        current: 0,
        pageIn: 0,
        currentTheme: theme
      }, () => {
        page.syncChrome(theme)
        page.measureDock()
        page.prepareShareImage(slides)
        // 分享令牌按这一册自己的内容提前备好；拿不到也不拦着翻看。
        cloud.shareTokenFor(form, theme, '').then((r) => {
          if (r.ok && page.data.viewer) page.shareToken = r.token
        })
      })
    })
  },

  // 翻看失败：轻声说一句，退回书架。身后没有书架（复制路径直达）就整个落回去。
  // viewer 标志等导航收尾再翻回来：中途那一下别让 dock 闪现。
  quitViewer(toastText) {
    const page = this
    wx.showToast({ title: toastText, icon: 'none' })
    setTimeout(() => {
      if (getCurrentPages().length > 1) {
        wx.navigateBack({
          complete() { page.setData({ viewer: false }) },
          fail() { wx.reLaunch({ url: '/pages/shelf/shelf' }) }
        })
      } else {
        wx.reLaunch({
          url: '/pages/shelf/shelf',
          complete() { page.setData({ viewer: false }) }
        })
      }
    }, 600)
  },

  onShow() {
    // 首次进页顺带确认一次隐私授权状态。declined 也能看，只是导出前会再拦一次。
    privacy.checkPrivacy()
  },

  // 封面上的「立即开启」：先让拆信封动画演一下，再落进册子。
  onOpenGift() {
    if (this.data.giftState !== 'splash' || !this.pendingGiftOk) return
    const page = this
    const ok = this.pendingGiftOk
    this.setData({ giftState: 'loading' })
    setTimeout(() => {
      page.setData({
        slides: ok.slides,
        current: 0,
        pageIn: 0,
        currentTheme: ok.theme,
        giftState: 'ok'
      }, () => {
        page.syncChrome(ok.theme)
        page.measureDock()
      })
    }, 1000)
  },

  // 分享面板：让分享者给这册起个标题，比如「一周年快乐」。
  onOpenShareSheet() {
    this.setData({ shareSheetOpen: true, shareTitleInput: this.data.shareTitleInput || '' })
    this.warmShareToken()
  },

  onCloseShareSheet() {
    this.setData({ shareSheetOpen: false })
    // 标题可能刚改过：重画分享卡，下次转发就是新标题。
    if (this.data.slides.length) this.prepareShareImage(this.data.slides)
  },

  onShareTitleInput(e) {
    this.setData({ shareTitleInput: e.detail.value })
    this.warmShareToken()
    // 标题要印进卡片图：串行重画（绘制中先记脏标记，画完补最新一版）。
    this.prepareShareImage(this.data.slides)
  },

  onShareChip(e) {
    const title = String((e.currentTarget.dataset && e.currentTarget.dataset.title) || '')
    this.setData({ shareTitleInput: title })
    this.warmShareToken()
  },

  warmShareToken() {
    // 翻看模式下，分享的是正在看的这一册本身，不是本机草稿。
    // 册子还没取回来时不预热：宁可分享时等一下，也不能把本机草稿的令牌发出去。
    if (this.data.viewer && !this.bookForm) return
    const form = this.data.viewer && this.bookForm
      ? record.normalize(this.bookForm)
      : record.normalize(storage.loadAnswers())
    if (!record.canGenerate(form)) return
    const title = String(this.data.shareTitleInput || '').trim()
    const page = this
    const request = this.shareRequest = (this.shareRequest || 0) + 1
    this.setData({ shareReady: false, shareError: '' })
    cloud.shareTokenFor(form, this.data.currentTheme, title).then((res) => {
      if (page.shareRequest !== request) return
      page.setData({ shareReady: !!(res.ok && res.token), shareError: res.ok ? '' : (res.error || '分享暂时没准备好，点这里重试') })
      if (res.ok) page.shareToken = res.token
      // 分享时起的标题也写到书架上那一册的封皮上，主页卡片跟着换名字。
      if (res.ok && title && !page.data.viewer && !page.data.gift) {
        cloud.saveBook(form, { shareTitle: title, theme: page.data.currentTheme })
      }
    })
    // 标题要印进卡片图：防抖重画，发送时图里已经是新标题。
    if (this.redrawTimer) clearTimeout(this.redrawTimer)
    this.redrawTimer = setTimeout(() => {
      if (this.data.slides.length) this.prepareShareImage(this.data.slides)
    }, 600)
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
    const imageUrl = this.data.sharePath || ''
    // 礼物模式：把这册继续原样传给下一个人，用的还是同一枚令牌。
    // 标题行保持品牌句；分享者起的标题印在卡片图里。
    if (this.data.gift && this.giftToken) {
      return {
        title: gift.giftTitle(this.giftForm || {}),
        path: gift.giftPath(this.giftToken),
        imageUrl: imageUrl
      }
    }
    // 自己的纪念册：分享前云端备好令牌，链接里只有令牌。
    // 翻看模式下分享的是正在看的这一册，不是本机草稿。
    if ((this.data.viewer && !this.bookForm) || this.data.gift) {
      // 翻看未就绪或分享错误页没有可用令牌，不能借用本机草稿转发。
      return { title: brand.SHARE_TITLE, path: '/pages/wrapped/wrapped?shareError=1', imageUrl: imageUrl }
    }
    const saved = this.data.viewer && this.bookForm ? this.bookForm : storage.loadAnswers()
    if (saved && record.canGenerate(saved)) {
      const form = record.normalize(saved)
      return gift.shareContent(form, this.data.currentTheme, String(this.data.shareTitleInput || '').trim(), imageUrl)
    }
    return {
      title: this.data.shareTitle || brand.SHARE_TITLE,
      path: '/pages/shelf/shelf',
      imageUrl: imageUrl
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

  // 换主题：整本的每一页都换色（含内联的弥散底、气泡和拼图块），
  // 分享封面也重画一张。礼物模式下只换看的效果，不写对方设备上的任何东西。
  onTapTheme(e) {
    const id = themes.resolve(e.currentTarget.dataset.id)
    if (id === this.data.currentTheme) return
    // 翻看模式下换配色只是看一眼，不写进本机的主题缓存。
    // 自己的册子换配色：改的是这一册自己的颜色（草稿 + 云端记录），不动全局主题。
    if (!this.data.gift && !this.data.viewer) {
      storage.saveDraftTheme(id)
      cloud.saveBook(record.normalize(storage.loadAnswers()), { theme: id })
    }
    const slides = this.data.slides.map((slide) => slidesUtil.restyleSlide(slide, id))
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
    // 绘制串行化：正在画就记一个脏标记，画完补画最新一版。
    if (this._shareDrawing) { this._shareDirty = true; return }
    this._shareDrawing = true
    const finish = () => {
      page._shareDrawing = false
      if (page._shareDirty) {
        page._shareDirty = false
        page.prepareShareImage(page.data.slides)
      }
    }
    const slides = list || this.data.slides
    if (!slides || !slides.length) {
      this._shareDrawing = false
      return
    }
    // 手写字体多半还在后台下载：先用系统字体画一版保底，字体就绪后再重画一次。
    // 不等字体：9MB 的首次下载会让人在空窗期分享出去一张页面截图。
    if (!this._fontWatched) {
      this._fontWatched = true
      font.ensureFont().then((ok) => {
        if (ok && page.data.slides && page.data.slides.length) page.prepareShareImage(page.data.slides)
      })
    }
    const cover = slides[0]
    const phrase = slides.filter(s => s.id === 'phrase')[0] || null
    const ending = slides.filter(s => s.id === 'ending')[0] || null

    // 邮戳印「写这一册的日子」，比如「写于 2026.11.06」。
    const d = new Date()
    const stamp = '写于 ' + d.getFullYear() + '.'
      + String(d.getMonth() + 1).padStart(2, '0') + '.'
      + String(d.getDate()).padStart(2, '0')

    const card = {
      nameA: cover.nameA || '',
      nameB: cover.nameB || '',
      headline: this.data.gift ? String(this.giftHeadline || '') : String(this.data.shareTitleInput || '').trim(),
      title: brand.APP_NAME,
      line: phrase && phrase.title && phrase.title !== '还没写'
        ? phrase.title
        : (ending && ending.title && ending.title !== '还空着' ? ending.title : ''),
      postmark: stamp,
      theme: this.data.currentTheme
    }

    this.createSelectorQuery()
      .select('#share')
      .fields({ node: true, size: true })
      .exec(async (res) => {
        const node = res && res[0] && res[0].node
        if (!node || !node.getContext) {
          // 页面还没渲染好（onLoad 一进来就查会落空）：放行守卫，稍后自动补画。
          finish()
          if ((page._shareRetries || 0) < 5) {
            page._shareRetries = (page._shareRetries || 0) + 1
            setTimeout(() => {
              if (page.data.slides && page.data.slides.length) page.prepareShareImage(page.data.slides)
            }, 400)
          }
          return
        }
        try {
          const ctx = node.getContext('2d')
          const dpr = Math.min(this.data.pixelRatio || 2, 3)
          node.width = poster.SHARE_W * dpr
          node.height = poster.SHARE_H * dpr
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          poster.drawShareCard(ctx, poster.SHARE_W, poster.SHARE_H, card)
          const path = await this.shareCanvasToImage(node, dpr)
          page.setData({ sharePath: path })
          page._shareRetries = 0
        } catch (err) {
          console.warn('分享封面没画出来', err)
        }
        // 绘制结束：清守卫，期间有新请求（标题又改了）就补画最新一版。
        finish()
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
    this.setData({ pageIn: current })
    const slide = this.data.slides[current]
    if (!slide) return
    this.setData({
      current: current,
      currentTheme: this.data.currentTheme
    })
    // 距离页的大数字：从 1 滚到目标值（12345 式计数）。
    if (slide.journeyNum) this.runCountUp(current)
  },

  // 数字滚动：easeOutCubic 从 1 滚到目标，900ms；结束后精确落位。
  runCountUp(slideIndex) {
    const slide = this.data.slides[slideIndex]
    if (!slide || !slide.journeyNum) return
    const target = parseInt(slide.journeyNum, 10)
    if (isNaN(target) || target <= 1) return
    if (this._countTimer) clearInterval(this._countTimer)
    const duration = 900
    const start = Date.now()
    this._countTimer = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const value = Math.max(1, Math.round(target * eased))
      this.setData({ ['slides[' + slideIndex + '].journeyNum']: String(value) })
      if (t >= 1) {
        clearInterval(this._countTimer)
        this._countTimer = null
        this.setData({ ['slides[' + slideIndex + '].journeyNum']: String(target) })
      }
    }, 32)
  },

  // 礼物视角：把 TA 写的这册收进自己的书架（云端），不动本机自己写的那一份。
  // 收下的册子带 gift 标记，书架里和自己的册子区分开。
  onSaveGift() {
    if (!this.giftForm || this.data.giftSaved) return
    const page = this
    wx.showModal({
      title: '收进我的书架',
      content: '会收进你自己的书架，随时翻看；不会动你自己写的那一份。',
      confirmText: '收下',
      cancelText: '先不',
      confirmColor: themes.THEMES[themes.resolve(this.data.currentTheme)].kicker,
      success(res) {
        if (!res.confirm) return
        cloud.saveBook(page.giftForm, { source: 'gift', theme: page.data.currentTheme }).then((r) => {
          if (r.ok) {
            page.setData({ giftSaved: true })
            wx.showToast({ title: '已收进我的书架', icon: 'none' })
          } else {
            wx.showToast({ title: (r.error || '云端暂时连不上') + '，稍后再收一次', icon: 'none' })
          }
        })
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
    wx.redirectTo({ url: '/pages/shelf/shelf' })
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

  // 导出：先选导出这一页还是整本长图。
  onExportChoose() {
    const page = this
    wx.showActionSheet({
      itemList: ['导出此页', '导出整本长图'],
      itemColor: '#2D1B24',
      success(res) {
        if (res.tapIndex === 0) page.onExport()
        if (res.tapIndex === 1) page.onExportAll()
      },
      fail() {
        // 用户取消了，不用做什么。
      }
    })
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
      await font.ensureFont()
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
      await font.ensureFont()
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
    // 模拟器里没有系统相册，这个接口经常静默失败，按钮会显得「没反应」。
    // 与其让人疑惑，不如直接说明：这个按钮要到手机上试。
    try {
      const info = typeof wx.getDeviceInfo === 'function'
        ? wx.getDeviceInfo()
        : wx.getSystemInfoSync()
      if (info && info.platform === 'devtools') {
        wx.showToast({ title: '模拟器没有相册，请用真机预览保存', icon: 'none' })
        return
      }
    } catch (e) { /* 取不到设备信息就照常走原逻辑 */ }
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


