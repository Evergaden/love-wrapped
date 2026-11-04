// 填写页。
// 做三件事：收集答案、存进本机、打开纪念册。
// 答案放在本地缓存里，不放进网址。网址太短，也带不走这么多字。

const record = require('../../utils/record')
const sample = require('../../utils/sample')
const storage = require('../../utils/storage')
const slides = require('../../utils/slides')

const NUMERIC = {
  cityCount: true,
  mealCount: true,
  fightCount: true,
  distanceKm: true,
  meetCount: true
}

Page({
  data: {
    form: record.blankForm(),
    togetherDateText: '',
    canOpen: false,
    slideCount: 6,
    storyCount: 0,
    sentenceCount: 0,
    hasStored: false,
    errorHint: ''
  },

  onShow() {
    // 每次回到这一页，都从本机再读一次。改完字再返回，输入框里还是那些字。
    const saved = storage.loadAnswers()
    const form = saved ? record.normalize(saved) : record.blankForm()
    this.applyForm(form, { hasStored: !!saved, errorHint: '' })
    wx.showShareMenu({ menus: ['shareAppMessage'] })
  },

  // 分享卡片不放昵称。对方点开会看到空白填写页，答案仍在你的设备上。
  onShareAppMessage() {
    return {
      title: '恋爱Wrapped · 只属于我们的纪念册',
      path: '/pages/index/index'
    }
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
      storyCount: copy.story.length,
      sentenceCount: copy.sentence.length,
      hasStored: !!(extra && extra.hasStored),
      errorHint: (extra && extra.errorHint) || ''
    })
  },

  // 打字时不把整份 form 再 setData 回去。
  // 否则输入框会重绘，光标经常跳到末尾。
  remember(form) {
    const ok = storage.saveAnswers(form)
    const normalized = record.normalize(form)
    this.setData({
      togetherDateText: record.formatDate(normalized.togetherDate),
      canOpen: record.canGenerate(normalized),
      slideCount: slides.buildSlides(normalized).length,
      storyCount: String(form.story || '').length,
      sentenceCount: String(form.sentence || '').length,
      hasStored: true,
      errorHint: ''
    })
    if (!ok) {
      wx.showToast({ title: '没能保存', icon: 'none' })
    }
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
      content: '只会删除这台设备上的填写内容，不能恢复。',
      confirmText: '清空',
      cancelText: '取消',
      confirmColor: '#E85A7A',
      success(res) {
        if (!res.confirm) return
        storage.clearAnswers()
        page.applyForm(record.blankForm(), { hasStored: false, errorHint: '' })
        wx.pageScrollTo({ scrollTop: 0, duration: 200 })
      }
    })
  },

  onGenerate() {
    if (!record.canGenerate(this.data.form)) {
      this.setData({ errorHint: '先写下两个昵称，再选在一起的日子。' })
      wx.showToast({ title: '还差必填项', icon: 'none' })
      return
    }
    if (this.opening) return
    this.opening = true
    storage.saveAnswers(this.data.form)
    wx.navigateTo({
      url: '/pages/wrapped/wrapped',
      complete: () => {
        this.opening = false
      }
    })
  }
})
