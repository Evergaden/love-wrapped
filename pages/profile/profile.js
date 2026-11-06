// 我的页。
// 云开发开通后，这里管三件事：看云同步状态、进历史记录、清本地数据。
// 云同步的身份是微信自己（openid），页面里没有也不需要「登录」按钮。

const cloud = require('../../utils/cloud')
const storage = require('../../utils/storage')
const themes = require('../../utils/themes')

Page({
  data: {
    themeBg: '',
    theme: 'cream',
    appName: '恋爱Wrapped',
    // 云同步状态：checking / ok / error
    cloudState: 'checking',
    cloudError: '',
    hasDraft: false,
    draftTitle: ''
  },

  onShow() {
    const theme = themes.resolve(storage.loadTheme())
    const t = themes.pick(theme)
    const stored = storage.loadAnswers()
    this.setData({
      theme: theme,
      themeBg: t.bg,
      hasDraft: !!stored,
      draftTitle: stored ? (stored.myNickname + ' · ' + stored.theirNickname) : ''
    })
    this.checkCloud()
  },

  checkCloud() {
    this.setData({ cloudState: 'checking', cloudError: '' })
    cloud.checkConnection().then((res) => {
      this.setData({
        cloudState: res.ok ? 'ok' : 'error',
        cloudError: res.error || ''
      })
    })
  },

  onRetryCloud() {
    this.checkCloud()
  },

  goHistory() {
    wx.navigateTo({ url: '/pages/history/history' })
  },

  onClearDraft() {
    const page = this
    wx.showModal({
      title: '清空草稿',
      content: '填写页的内容会被清掉。已经存到云端的册子不受影响。',
      confirmText: '清空',
      cancelText: '先不了',
      confirmColor: themes.pick(this.data.theme).kicker,
      success(res) {
        if (!res.confirm) return
        storage.clearAnswers()
        page.setData({ hasDraft: false, draftTitle: '' })
        wx.showToast({ title: '已清空', icon: 'none' })
      }
    })
  }
})
