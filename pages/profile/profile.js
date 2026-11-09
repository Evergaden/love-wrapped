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
    draftTitle: '',
    // 周年提醒：on 已开启 / off 已取消 / none 未开启过
    reminderState: 'none',
    reminderDate: ''
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
    this.refreshReminder()
  },

  // 周年提醒状态：本地记录为准（云端计划跟着它同步）。
  refreshReminder() {
    const rec = storage.loadReminder()
    let state = 'none'
    let dateText = ''
    if (rec && rec.anniversary) {
      state = rec.enabled ? 'on' : 'off'
      dateText = String(rec.anniversary).replace(/-/g, '.')
    }
    this.setData({ reminderState: state, reminderDate: dateText })
  },

  // 取消提醒：本地关闸并标记拒绝（生成时也不再问），云端计划同步 enabled: false。
  // 定时函数只挑 enabled 的计划，自然不会再下发。
  onCancelReminder() {
    const page = this
    const rec = storage.loadReminder() || {}
    wx.showModal({
      title: '取消提醒',
      content: '到了周年前 7 天就不再提醒你了。想开的话，随时回到这里重新开启。',
      confirmText: '取消提醒',
      cancelText: '先不了',
      confirmColor: themes.pick(this.data.theme).kicker,
      success(res) {
        if (!res.confirm) return
        storage.saveReminder(Object.assign({}, rec, {
          enabled: false, declined: true, cancelledAt: Date.now()
        }))
        const saved = storage.loadAnswers() || {}
        cloud.saveReminderPlan({
          anniversary: rec.anniversary,
          years: rec.years,
          togetherDate: rec.togetherDate || saved.togetherDate || '',
          nicknames: rec.nicknames || ((saved.myNickname || '') + ' 和 ' + (saved.theirNickname || '')),
          enabled: false,
          subscribed: !!rec.subscribed
        })
        page.refreshReminder()
        wx.showToast({ title: '已取消', icon: 'none' })
      }
    })
  },

  // 重新开启：和生成时的询问一样，授权必须由这个按钮的点击同步发起。
  onEnableReminder() {
    const page = this
    const rec = storage.loadReminder() || {}
    const tmpl = cloud.reminderTemplateId()
    if (!rec.anniversary) {
      wx.showToast({ title: '还没开过，写好一册生成时会问你', icon: 'none' })
      return
    }
    if (!tmpl) {
      wx.showToast({ title: '提醒功能还在准备中', icon: 'none' })
      return
    }
    wx.requestSubscribeMessage({
      tmplIds: [tmpl],
      success(sub) {
        const accepted = sub && sub[tmpl] === 'accept'
        if (!accepted) {
          wx.showToast({ title: '好的，想开随时再来', icon: 'none' })
          return
        }
        const saved = storage.loadAnswers() || {}
        const payload = {
          anniversary: rec.anniversary,
          years: rec.years,
          togetherDate: rec.togetherDate || saved.togetherDate || '',
          nicknames: rec.nicknames || ((saved.myNickname || '') + ' 和 ' + (saved.theirNickname || '')),
          enabled: true,
          subscribed: true,
          declined: false
        }
        storage.saveReminder(Object.assign({}, rec, payload, { askedAt: Date.now() }))
        cloud.saveReminderPlan(payload)
        page.refreshReminder()
        wx.showToast({ title: '提醒已开启', icon: 'none' })
      },
      fail() {
        wx.showToast({ title: '这次没开成，下次再试', icon: 'none' })
      }
    })
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
