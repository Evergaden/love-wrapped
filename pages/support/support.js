const brand = require('../../utils/brand')

const TITLES = { help: '帮助与反馈', privacy: '隐私与数据管理', about: '关于' }

Page({
  data: { section: 'help', title: TITLES.help, appName: brand.APP_NAME, version: '' },
  onLoad(options) {
    const section = Object.prototype.hasOwnProperty.call(TITLES, options.section) ? options.section : 'help'
    let version = ''
    try {
      const info = wx.getAccountInfoSync().miniProgram
      version = info.version ? '版本 ' + info.version : (info.envVersion === 'trial' ? '体验版' : '开发版')
    } catch (err) {
      // 无版本信息时不展示，避免把猜测的版本号显示给用户。
    }
    const title = section === 'about' ? '关于 ' + brand.APP_NAME : TITLES[section]
    this.setData({ section, title, version })
    wx.setNavigationBarTitle({ title })
  },
  onOpenPrivacy() {
    if (typeof wx.openPrivacyContract !== 'function') {
      wx.showToast({ title: '请更新微信后查看', icon: 'none' })
      return
    }
    wx.openPrivacyContract({
      fail() { wx.showToast({ title: '暂时打不开，请稍后再试', icon: 'none' }) }
    })
  },
  onFeedbackFail() {
    wx.showModal({ title: '反馈入口暂时打不开', content: '请通过右上角「…」中的「反馈与投诉」提交问题。', showCancel: false, confirmText: '知道了' })
  },
  onPrivacy() { wx.navigateTo({ url: '/pages/support/support?section=privacy' }) }
})
