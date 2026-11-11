// 书架页（首页）。
// 有册子就先看书架：上面是本机正在写的这一本，下面是云端收好的那些。
// 第一次来的人，看到的是一句温柔的引导，不是一张空表单。
// 数据层全部沿用「历史记录」页那一套（cloud.listBooks / storage.saveAnswers），
// 删册子的收尾活也留在历史记录页，这里不重复造。

const cloud = require('../../utils/cloud')
const storage = require('../../utils/storage')
const themes = require('../../utils/themes')
const record = require('../../utils/record')
const brand = require('../../utils/brand')

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function formatDateYmd(ymd) {
  if (!record.isYmd(ymd)) return ''
  const seg = String(ymd).split('-')
  return Number(seg[0]) + '年' + Number(seg[1]) + '月' + Number(seg[2]) + '日'
}

// updatedAt 可能是服务端 Date 对象（ISO 字符串）或时间戳，统一转成本地文案。
// 与历史记录页的写法保持一致。
function formatTime(value) {
  if (!value) return ''
  let date = null
  if (value instanceof Date) date = value
  else if (typeof value === 'object' && value.$date) date = new Date(value.$date)
  else if (typeof value === 'string' && value.indexOf('T') >= 0) date = new Date(value)
  else if (typeof value === 'number') date = new Date(value)
  if (!date || isNaN(date.getTime())) return ''
  return date.getFullYear() + '.' + pad(date.getMonth() + 1) + '.' + pad(date.getDate())
    + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

// 本机写了一半也算「正在写的这一本」：有一个字就算数。
// 草稿本身就是本机缓存，回去接着写就好，不用谁批准。
function draftOf() {
  const saved = storage.loadAnswers()
  if (!saved) return null
  const form = record.normalize(saved)
  const touched = Object.keys(record.EMPTY).some((key) => String(form[key] || '').trim() !== '')
  if (!touched) return null
  return {
    title: form.myNickname && form.theirNickname
      ? form.myNickname + ' · ' + form.theirNickname
      : '还没起名字的一本',
    canOpen: record.canGenerate(form),
    dateText: record.formatDate(form.togetherDate)
  }
}

Page({
  data: {
    appName: brand.APP_NAME,
    theme: themes.DEFAULT,
    themeBg: themes.THEMES[themes.DEFAULT].bg,
    state: 'loading', // loading / ok / error
    slow: false,      // 云端迟迟不回音：先放行界面，不让新用户干等
    softError: '',    // 云报错时的软文案，分「有草稿 / 没草稿」两种口径
    books: [],
    shelfItems: [],   // 书架上立着的封面：写了一半的排第一
    hasDraft: false,
    draft: null,
    showGuide: false
  },

  onShow() {
    const theme = themes.resolve(storage.loadTheme())
    this.setData({
      theme: theme,
      themeBg: themes.pick(theme).bg
    })
    this.loadDraft()
    this.refresh()
  },

  onHide() {
    clearTimeout(this._slowTimer)
  },

  onUnload() {
    this.unloaded = true
    clearTimeout(this._slowTimer)
  },

  // 界面上几块的显隐都从状态推出来，这里集中算一次，wxml 里只看结果。
  // 卡片底色在这里组：写了一半的排第一，收好的按收的顺序排，
  // 每张卡一块柔和的 pastel 底，role 色轮换，像参考主页那样一卡一色。
  applyFlags(extra) {
    const d = Object.assign({}, this.data, extra || {})
    const settled = d.state !== 'loading' || d.slow
    const ROLES = ['a', 'b', 'c', 'd']
    const cardBg = (role) => themes.tint(d.theme, role, 0.14)
    const items = []
    if (d.draft) {
      items.push({
        id: 'draft',
        draft: true,
        title: d.draft.title,
        dateText: d.draft.dateText || '',
        tagText: '正在写',
        cardBg: cardBg('a'),
        canOpen: d.draft.canOpen
      })
    }
    ;(d.books || []).forEach((b, i) => {
      items.push({
        id: b.id,
        title: b.title,
        dateText: b.dateText || '',
        tagText: b.gift ? '收下的' : '',
        cardBg: cardBg(ROLES[(i + 1) % ROLES.length]),
        gift: b.gift,
        timeText: b.timeText
      })
    })
    this.setData(Object.assign({}, extra || {}, {
      shelfItems: items,
      showGuide: !d.hasDraft && !(d.books || []).length && settled
    }))
  },

  loadDraft() {
    const draft = draftOf()
    this.applyFlags({ hasDraft: !!draft, draft: draft })
  },

  refresh() {
    this.applyFlags({ state: 'loading', slow: false, softError: '' })
    // 云端慢的时候别让人干等：4 秒还没回音，先把界面放出来，
    // 册子之后回来再补上，谁也不阻塞。
    clearTimeout(this._slowTimer)
    this._slowTimer = setTimeout(() => {
      if (this.data.state === 'loading') this.applyFlags({ slow: true })
    }, 4000)
    cloud.listBooks().then((res) => {
      clearTimeout(this._slowTimer)
      if (this.unloaded) return
      if (res.error) {
        // 不把云端的开发向提示印在书架上，只轻声说一句，按有没有草稿换措辞。
        this.applyFlags({
          state: 'error',
          slow: false,
          softError: this.data.hasDraft
            ? '云端暂时连不上，先看看这台手机上的这一本吧'
            : '云端暂时连不上，先写一本新的吧'
        })
        return
      }
      this.applyFlags({
        state: 'ok',
        slow: false,
        softError: '',
        books: (res.list || []).map((b) => Object.assign({}, b, {
          dateText: formatDateYmd(b.togetherDate),
          timeText: formatTime(b.updatedAt),
          gift: b.source === 'gift'
        }))
      })
    })
  },

  // 封面只有一个点击入口：写了一半的回填写页，收好的凭编号翻开。
  onCoverTap(e) {
    if (e.currentTarget.dataset.draft) {
      this.onContinue()
      return
    }
    this.onOpenBook(e)
  },

  // 正在写的这一本：直接回填写页。草稿就是本机缓存本身，
  // 原样放回，不覆盖谁也不用弹窗确认。
  onContinue() {
    wx.navigateTo({ url: '/pages/index/index' })
  },

  // 翻看收好的某一册：把编号带给纪念册页，凭编号从云端取，
  // 全程不碰本机缓存。
  onOpenBook(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: '/pages/wrapped/wrapped?book=' + encodeURIComponent(id) })
  },

  // 把收好的一册载回填写页继续写。会覆盖本机正在写的内容，所以留一次确认。
  onReloadBook(e) {
    const id = e.currentTarget.dataset.id
    const book = this.data.books.find((b) => b.id === id)
    if (!book || !book.answers) return
    wx.showModal({
      title: '载回填写页',
      content: '「' + book.title + '」会覆盖填写页现在的内容。',
      confirmText: '载入',
      cancelText: '先不了',
      confirmColor: themes.pick(this.data.theme).kicker,
      success(res) {
        if (!res.confirm) return
        storage.saveAnswers(book.answers)
        wx.navigateTo({
          url: '/pages/index/index',
          fail() {
            wx.reLaunch({ url: '/pages/index/index' })
          }
        })
      }
    })
  },

  onStart() {
    wx.navigateTo({ url: '/pages/index/index' })
  },

  onProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' })
  },

  // 主页项：已经在主页，点了就回到书架顶部。
  onHomeTap() {
    wx.pageScrollTo({ scrollTop: 0, duration: 200 })
  },

  onManage() {
    wx.navigateTo({ url: '/pages/history/history' })
  }
})
