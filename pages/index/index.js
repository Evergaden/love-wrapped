// 填写页。
// 做三件事：收集答案、存进本机、打开纪念册。
// 答案放在本地缓存里，不放进网址。网址太短，也带不走这么多字。

const record = require('../../utils/record')
const sample = require('../../utils/sample')
const storage = require('../../utils/storage')
const slides = require('../../utils/slides')
const themes = require('../../utils/themes')
const brand = require('../../utils/brand')
const gift = require('../../utils/gift')
const geo = require('../../utils/geo')
const privacy = require('../../utils/privacy')
const cloud = require('../../utils/cloud')
const reminders = require('../../utils/reminders')

// 拼图页最多放几块。
const PLACE_CAP = 8

const NUMERIC = {
  cityCount: true,
  fightCount: true,
  meetCount: true
}

// 一共十一件事。吵架算一件（次数或谁先道歉，任意一个算），
// 距离算一件（选了异地或同城就算），吃饭频率算一件。
const TOTAL = 11

function countFilled(form) {
  const one = [
    form.myNickname,
    form.theirNickname,
    form.togetherDate,
    form.firstDatePlace,
    form.homeCity || form.places || form.cityCount,
    form.mealMode || form.mealCount,
    form.catchphrase,
    form.story,
    form.sentence
  ].filter(value => String(value || '').trim() !== '').length
  const fight = String(form.fightCount || '').trim() !== '' || String(form.whoApologized || '').trim() !== '' ? 1 : 0
  const distance = String(form.distanceMode || '').trim() !== '' ? 1 : 0
  return one + fight + distance
}

Page({
  data: {
    form: record.blankForm(),
    togetherDateText: '',
    canOpen: false,
    slideCount: 6,
    filledCount: 0,
    filledPercent: 0,
    totalCount: TOTAL,
    storyCount: 0,
    sentenceCount: 0,
    hasStored: false,
    errorHint: '',
    placeDraft: '',
    placeList: [],
    statusBarH: 44,
    navInnerH: 44,
    navTotalH: 88,
    heroShift: 0,
    heroScale: 1,
    heroDim: 0,
    heroTitleOpacity: 1,
    heroTitleScale: 1,
    heroSubOpacity: 1,
    heroProgressOpacity: 1,
    navTitleOpacity: 0,
    navProgressOpacity: 0,
    collapsed: false,
    capsulePad: 96,
    heroWrapBg: '#FFF5F7',
    heroContentOpacity: 1,
    heroWrapOpacity: 1,
    appName: brand.APP_NAME,
    theme: themes.DEFAULT,
    themeList: themes.pickerList(),
    accentColor: themes.THEMES[themes.DEFAULT].kicker,
    remindAsk: null
  },

  onLoad() {
    // 导航栏高度对齐胶囊：状态栏 + 胶囊上下留白。
    let statusBarH = 44
    let navInnerH = 44
    try {
      const menu = wx.getMenuButtonBoundingClientRect()
      if (menu && menu.top) {
        statusBarH = menu.top
        navInnerH = menu.height + 14
      }
    } catch (err) {
      console.warn('导航度量失败，用默认值', err)
    }
    this.navTotalH = statusBarH + navInnerH
    // 胶囊在右上角：导航内容右侧留出它的宽度，避免被遮挡。
    let capsulePad = 96
    try {
      const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const menu = wx.getMenuButtonBoundingClientRect()
      if (win && menu && menu.left) capsulePad = win.windowWidth - menu.left + 8
    } catch (err) {
      console.warn('胶囊度量失败，用默认让位', err)
    }
    this.setData({
      statusBarH: statusBarH,
      navInnerH: navInnerH,
      capsulePad: capsulePad,
      heroWrapBg: themes.pick(themes.DEFAULT).bg
    })
    // 订阅额度的真相在云端（下发一次就没了）：进页面就悄悄并回来，
    // 生成时「该问哪个日子」的判断才不会拿着过期额度跳过询问。
    cloud.listReminderPlans().then((res) => {
      if (res && res.list && !res.error) reminders.mergeCloudPlans(res.list)
    })
  },

  onReady() {
    this.measureHero()
  },

  onResize() {
    this.measureHero()
  },

  // 量出头图高度，算出「收起」的滚动位置。
  measureHero() {
    const q = this.createSelectorQuery()
    q.select('.hero-wrap').boundingClientRect()
    q.exec((res) => {
      const rect = res && res[0]
      if (!rect || !rect.height) return
      this.collapseAt = Math.max(80, rect.height - (this.navTotalH || 88))
      this.applyHero(this._lastSt || 0)
    })
  },

  onPageScroll(e) {
    const st = e.scrollTop
    const now = Date.now()
    // 速度采样：松手回弹的方向判断用。
    if (this._lastScrollT) {
      const dt = now - this._lastScrollT
      if (dt > 0 && dt < 220) this._velocity = (st - this._lastSt) / dt
    }
    this._lastSt = st
    this._lastScrollT = now
    // 节流：滚动位置变化小于 2px 不重绘。
    // 节流：滚动位置变化小于 12px 不重绘（避免 setData 风暴）。
    if (Math.abs(st - (this._appliedSt || 0)) < 6 && st >= 0 && st > 0) return
    this._appliedSt = st
    this.applyHero(st)
    if (this._snapTimer) clearTimeout(this._snapTimer)
    this._snapTimer = setTimeout(() => this.snapHero(), 170)
  },

  onTouchStart() {
    this.touching = true
    if (this._snapTimer) clearTimeout(this._snapTimer)
  },

  onTouchEnd() {
    this.touching = false
    this._snapTimer = setTimeout(() => this.snapHero(), 150)
  },

  // 松手后：按速度和位置收到底或弹回展开，不停在半路。
  snapHero() {
    if (this.touching) return
    const st = this._lastSt || 0
    const collapseAt = this.collapseAt || 1
    const p = st / collapseAt
    if (p <= 0.02 || p >= 0.98) return
    const v = this._velocity || 0
    let target
    if (v > 0.45) target = collapseAt
    else if (v < -0.45) target = 0
    else target = p >= 0.5 ? collapseAt : 0
    wx.pageScrollTo({ scrollTop: target, duration: 200 })
  },

  // 头图三件事：0.5 倍视差、慢慢压暗、下拉放大。
  applyHero(st) {
    const collapseAt = this.collapseAt || 1
    const p = Math.max(0, Math.min(1, st / collapseAt))
    const pull = st < 0 ? Math.min(-st, 240) : 0
    this.setData({
      heroShift: Math.round(st * 0.5),
      heroScale: pull ? Number((1 + pull / 900).toFixed(3)) : 1,
      heroDim: Number((p * 0.2).toFixed(2)),
      heroWrapOpacity: Number(Math.max(0, 1 - p * 1.35).toFixed(2)),
      heroTitleOpacity: Number(Math.max(0, 1 - p * 1.15).toFixed(2)),
      heroTitleScale: Number((1 - p * 0.35).toFixed(3)),
      heroSubOpacity: Number(Math.max(0, 1 - p * 1.5).toFixed(2)),
      heroProgressOpacity: Number(Math.max(0, 1 - p * 1.6).toFixed(2)),
      navTitleOpacity: Number(p.toFixed(2)),
      navProgressOpacity: Number(Math.max(0, (p - 0.35) / 0.65).toFixed(2)),
      heroContentOpacity: Number(Math.max(0, 1 - p * 1.6).toFixed(2)),
      collapsed: p > 0.55
    })
  },

  onShow() {
    // 每次回到这一页，都从本机再读一次。改完字再返回，输入框里还是那些字。
    const saved = storage.loadAnswers()
    const form = saved ? record.normalize(saved) : record.blankForm()
    this.applyForm(form, { hasStored: !!saved, errorHint: '' })
    // 主题和答案分开存：换配色不用动写过的字。
    // 草稿自己选过配色就用它（写的是这一本的颜色，不碰主页）；没选过用全局默认。
    this.applyTheme(storage.loadDraftTheme() || themes.DEFAULT, { silent: true })
    wx.showShareMenu({ menus: ['shareAppMessage'] })
    // 填写会把内容写进本机缓存。首次进页问一次隐私授权，用户已同意过则直接通过。
    privacy.checkPrivacy()
  },

  // 分享卡片不放昵称。转发给好友时链接里只有一枚云端令牌，对方点开经云函数取回整册；朋友圈没有答案。
  // 云不可用时退回一张普通卡片（空白填写页）。令牌就绪后走同步返回，
  // 避免 Promise 分享的 3 秒兜底超时。
  onShareAppMessage() {
    const form = record.normalize(this.data.form)
    if (!record.canGenerate(form)) {
      return {
        title: brand.SHARE_TITLE,
        path: '/pages/shelf/shelf'
      }
    }
    // 之前预热时已经拿到过令牌：直接同步返回，不等云端。
    if (this.shareToken) {
      return {
        title: gift.giftTitle(form),
        path: gift.giftPath(this.shareToken)
      }
    }
    return cloud.shareTokenFor(form, this.data.theme).then((res) => {
      if (res.ok) {
        this.shareToken = res.token
        return {
          title: gift.giftTitle(form),
          path: gift.giftPath(res.token)
        }
      }
      console.warn('[share] 令牌没拿到，退回普通卡片。原因：', res.error || '云端不可用')
      return {
        title: brand.SHARE_TITLE,
        path: '/pages/shelf/shelf'
      }
    })
  },

  // 选中主题存进本机，导航栏、页面底色和弥散底跟着换。
  // silent 表示进页时的静默恢复，不重复弹导航栏动画。
  applyTheme(themeId, options) {
    const id = themes.resolve(themeId)
    const t = themes.THEMES[id]
    this.setData({
      theme: id,
      accentColor: t.kicker,
      heroWrapBg: t.bg,
      ambientMesh: themes.meshImage(id, 'mesh-1'),
      ambientLower: themes.ambLowerImage(id),
      ambientFade: themes.ambFade(id)
    })
    if (!(options && options.silent)) {
      storage.saveTheme(id)
    }
    wx.setNavigationBarColor({
      frontColor: '#000000',
      backgroundColor: t.bg,
      fail() {}
    })
    try {
      wx.setBackgroundColor({ backgroundColor: t.bg, fail() {} })
    } catch (err) {
      // 基础库过低没有这个接口时，页面底色保持原样即可。
    }
  },

  onTheme(e) {
    const id = themes.resolve(e.currentTarget.dataset.id)
    // 换的是「正在写的这一本」的颜色，只记在草稿上，不动全局主题（主页不跟着变）。
    this.applyTheme(id, { silent: true })
    storage.saveDraftTheme(id)
  },

  applyForm(form, extra) {
    // 换成一个新对象再 setData。同一个对象改完再塞回去，界面有时不会刷新。
    const copy = record.pickForm(form)
    const normalized = record.normalize(copy)
    this.setData({
      form: copy,
      togetherDateText: record.formatDate(normalized.togetherDate),
      canOpen: record.canGenerate(normalized),
      slideCount: slides.buildSlides(normalized).length,
      filledCount: countFilled(copy),
      filledPercent: Math.round(countFilled(copy) / TOTAL * 100),
      storyCount: copy.story.length,
      sentenceCount: copy.sentence.length,
      placeList: geo.splitPlaces(copy.places),
      hasStored: !!(extra && extra.hasStored),
      errorHint: (extra && extra.errorHint) || ''
    })
  },

  // 打字时不把整份 form 再 setData 回去。
  // 否则输入框会重绘，光标经常跳到末尾。
  remember(form) {
    privacy.requirePrivacy().then(() => {
      if (!this.data || this.unloaded) return
      const ok = storage.saveAnswers(form)
      const normalized = record.normalize(form)
      const filled = countFilled(form)
      this.setData({
        togetherDateText: record.formatDate(normalized.togetherDate),
        canOpen: record.canGenerate(normalized),
        slideCount: slides.buildSlides(normalized).length,
        filledCount: filled,
        filledPercent: Math.round(filled / TOTAL * 100),
        storyCount: String(form.story || '').length,
        sentenceCount: String(form.sentence || '').length,
        placeList: geo.splitPlaces(String(form.places || '')),
        hasStored: true,
        errorHint: ''
      })
      if (!ok) {
        wx.showToast({ title: '没能保存', icon: 'none' })
      }
    })
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key
    let value = e.detail.value
    if (NUMERIC[key]) {
      value = String(value || '').replace(/[^\d]/g, '').slice(0, 5)
    }
    const form = this.data.form
    form[key] = value
    this.remember(form)
  },

  // —— 一起去过的地方：一个一个加，加一块存一次 ——
  onPlaceDraft(e) {
    this.setData({ placeDraft: e.detail.value })
  },

  onAddPlace() {
    // 支持一次粘「杭州、大理」：拆开逐个收，装不下就停在上限。
    const wanted = geo.splitPlaces(this.data.placeDraft)
    if (!wanted.length) {
      wx.showToast({ title: '先写一个城市名', icon: 'none' })
      return
    }
    const list = geo.splitPlaces(this.data.form.places)
    const added = []
    wanted.forEach((name) => {
      if (list.indexOf(name) >= 0 || list.length + added.length >= PLACE_CAP) return
      added.push(name)
      list.push(name)
    })
    if (!added.length) {
      const full = list.length >= PLACE_CAP
      wx.showToast({ title: full ? '一页最多放 ' + PLACE_CAP + ' 块' : '已经放过了', icon: 'none' })
      this.setData({ placeDraft: '' })
      return
    }
    const form = this.data.form
    form.places = list.join('、')
    this.setData({ placeDraft: '' })
    this.remember(form)
    if (added.length < wanted.length) {
      const dropped = wanted.length - added.length
      wx.showToast({ title: '已添加 ' + added.length + ' 个' + (dropped ? '，放不下的 ' + dropped + ' 个没加' : ''), icon: 'none' })
    }
  },

  // 后台「用户隐私保护指引」的查看入口。低版本没有这个接口就不显示交互。
  onOpenPrivacyContract() {
    if (typeof wx.openPrivacyContract !== 'function') {
      wx.showToast({ title: '当前微信版本暂不支持', icon: 'none' })
      return
    }
    wx.openPrivacyContract({
      fail() {
        wx.showToast({ title: '暂时打不开，请稍后再试', icon: 'none' })
      }
    })
  },

  onRemovePlace(e) {
    const name = e.currentTarget.dataset.name
    const list = geo.splitPlaces(this.data.form.places).filter((n) => n !== name)
    const form = this.data.form
    form.places = list.join('、')
    this.remember(form)
  },

  onDate(e) {
    const form = this.data.form
    form.togetherDate = e.detail.value
    const ok = storage.saveAnswers(form)
    this.applyForm(form, { hasStored: true, errorHint: '' })
    if (!ok) wx.showToast({ title: '没能保存', icon: 'none' })
  },

  onWho(e) {
    this.setChoice('whoApologized', e.detail.value)
  },

  onMeal(e) {
    this.setChoice('mealMode', e.detail.value)
  },

  onMeet(e) {
    this.setChoice('meetMode', e.detail.value)
  },

  onDistance(e) {
    this.setChoice('distanceMode', e.detail.value)
  },

  setChoice(key, value) {
    const form = this.data.form
    form[key] = value === 'skip' ? '' : value
    const ok = storage.saveAnswers(form)
    this.applyForm(form, { hasStored: true, errorHint: '' })
    if (!ok) wx.showToast({ title: '没能保存', icon: 'none' })
  },

  onSample() {
    const form = record.normalize(sample.SAMPLE)
    const ok = storage.saveAnswers(form)
    this.applyForm(form, { hasStored: true, errorHint: '' })
    wx.pageScrollTo({ scrollTop: 0, duration: 200 })
    wx.showToast({ title: ok ? '已填入示例' : '没能保存', icon: 'none' })
  },

  onClear() {
    const page = this
    wx.showModal({
      title: '清空答案',
      content: '填写页的内容会被清空，不能恢复。',
      confirmText: '清空',
      cancelText: '取消',
      confirmColor: this.data.accentColor,
      success(res) {
        if (!res.confirm) return
        storage.clearAnswers()
        storage.clearDraftTheme()
        page.applyForm(record.blankForm(), { hasStored: false, errorHint: '' })
        wx.pageScrollTo({ scrollTop: 0, duration: 200 })
      }
    })
  },

  // 回书架：身后就是书架就退回去；从分享卡冷启动直达这一页时
  // 身后没有页，整个落回书架。
  goShelf() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ fail() { wx.reLaunch({ url: '/pages/shelf/shelf' }) } })
      return
    }
    wx.reLaunch({ url: '/pages/shelf/shelf' })
  },

  onGenerate() {
    if (!record.canGenerate(this.data.form)) {
      this.setData({ errorHint: '先写下两个昵称，再选在一起的日子。' })
      wx.showToast({ title: '还差必填项', icon: 'none' })
      return
    }
    if (this.opening) return
    this.opening = true
    const form = this.data.form
    // 内容安全检测：只在点「生成」时调一次，命中违规就停下来让用户改。
    // 通过后分享链路不重复检测（令牌在生成时就备好，分享直接用缓存）。
    wx.showLoading({ title: '报告生成中…', mask: true })
    cloud.checkContent(record.normalize(form)).then((res) => {
      wx.hideLoading()
      if (res && res.risky) {
        this.opening = false
        wx.showModal({
          title: '先放一放',
          content: res.reason || '有几句话暂时写不进这册，换个说法再试试吧。',
          confirmText: '好',
          showCancel: false
        })
        return
      }
      // 检测通过：照常生成。检测服务暂时不可用时云端会返回 risky 拦下来（fail-closed），
      // 弹层文案会提醒稍后再试，不会放行没检过的内容。
      this.finishGenerate(form)
    })
  },

  finishGenerate(form) {
    // 第一次写完的日子记下来，结尾页和长图封底都用它；转发也原样带走。
    if (!form.writtenAt) {
      const t = new Date()
      const pad = (n) => (n < 10 ? '0' + n : '' + n)
      form.writtenAt = t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate())
      this.setData({ form })
    }
    storage.saveAnswers(form)
    // 云端快照：开通云开发时，把这一册存一份到书架（带它自己的配色）。
    // 异步且不阻塞翻册子；没开通云开发时安静跳过。
    cloud.saveBook(form, { theme: this.data.theme }).then((res) => {
      if (res && res.error) {
        console.warn('[cloud] 快照没有存上：' + res.error)
        return
      }
      // 收进书架的轻提示：周年提醒的自制弹层在场时就不打扰了，
      // 省得两条提示顶来顶去；书架反正已经存上。
      if (res && res.ok && !this.data.remindAsk) {
        wx.showToast({ title: '已收进我的书架', icon: 'none' })
      }
    })
    // 分享令牌提前备好：点「分享给 TA」时链接不用等云端。
    cloud.shareTokenFor(record.normalize(form), this.data.theme).then((res) => {
      if (res.ok) this.shareToken = res.token
    })
    // 周年提醒：一年问一次，同一个周年不重复打扰。
    this.maybeAskReminder(form, () => {
      wx.navigateTo({
        url: '/pages/wrapped/wrapped',
        complete: () => {
          this.opening = false
        }
      })
    })
  },

  // 生成纪念册时，轻轻问一句：哪个日子快到了，要不要提前 7 天在微信里提醒？
  // 多节点：挂了几个日子就轮着问，一次只问「最近的还没授权、这一轮也没被
  // 拒绝过」的那一个；授权一次只能发一条（微信订阅消息的规则），
  // 下个年度会再问一次。真正的下发在云函数 reminderSend。
  // 注意：requestSubscribeMessage 必须由用户点击（TAP）同步发起——
  // 原生 showModal 的「好呀」不算页面手势，真机上弹不出授权面板，
  // 所以这里换成自制弹层，让「好呀」是一个真正的 bindtap。
  maybeAskReminder(form, done) {
    const nodes = reminders.ensureTogetherNode(form.togetherDate)
    const tmpl = cloud.reminderTemplateId()
    const pick = reminders.pickAsk(nodes, null, { ignoreAskedFor: !!tmpl })
    if (!pick) { done(); return }
    this.setData({
      remindAsk: {
        title: '纪念日提醒',
        body: '下个「' + reminders.labelOf(pick.node.kind) + '」（' + pick.occ.date.replace(/-/g, '.') + '）前 7 天，想在微信里收到提醒吗？',
        hint: tmpl ? '' : '微信提醒还在准备中，先帮你记下这个日子',
        kind: pick.node.kind,
        date: pick.node.date,
        occurrence: pick.occ.date,
        nicknames: (form.myNickname || '') + ' 和 ' + (form.theirNickname || '')
      }
    })
    this._remindDone = done
  },

  onReminderAgree() {
    // 关键：requestSubscribeMessage 必须在 bindtap 的同步调用栈里直接调，
    // 不能等任何异步回调，真机才会弹「允许通知」的授权面板。
    const ask = this.data.remindAsk
    const done = this._remindDone
    if (!ask) return
    this.setData({ remindAsk: null })
    this._remindDone = null
    const tmpl = cloud.reminderTemplateId()
    if (!tmpl) {
      // 模板还没申请：只记意愿（askedFor）；接入后下次生成会再问一次授权。
      reminders.updateNode(ask.kind, { askedFor: ask.occurrence })
      wx.showToast({ title: '已记下这个日子', icon: 'none' })
      done()
      return
    }
    wx.requestSubscribeMessage({
      tmplIds: [tmpl],
      success(sub) {
        const accepted = sub && sub[tmpl] === 'accept'
        if (accepted) {
          reminders.updateNode(ask.kind, { enabled: true, subscribed: true, declinedFor: '' })
          cloud.saveReminderPlan({ kind: ask.kind, date: ask.date, nicknames: ask.nicknames, enabled: true, subscribed: true })
          wx.showToast({ title: '提醒已开启', icon: 'none' })
        } else {
          wx.showToast({ title: '好的，随时可以再开', icon: 'none' })
        }
        done()
      },
      fail(err) {
        // 面板被系统或「总是保持以上选择」拦截：当次不记拒绝，下次生成再问。
        // 真实原因打进控制台；开发者工具里本来就弹不出授权面板，提示说清楚。
        console.warn('[reminder] 订阅授权面板没弹出来：', err && err.errMsg)
        let inTools = false
        try { inTools = wx.getSystemInfoSync().platform === 'devtools' } catch (e) { inTools = false }
        if (inTools) wx.showToast({ title: '开发者工具里开不了，用手机预览就能开', icon: 'none' })
        done()
      }
    })
  },

  onReminderDecline() {
    const ask = this.data.remindAsk
    const done = this._remindDone
    if (!ask) return
    // 只挡这一轮：下一个周年（明年）会再轻轻问一次。
    reminders.updateNode(ask.kind, { declinedFor: ask.occurrence })
    this.setData({ remindAsk: null })
    this._remindDone = null
    wx.showToast({ title: '好的，明年会再问你', icon: 'none' })
    if (done) done()
  },

  noop() {}
})

