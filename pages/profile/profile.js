// 我的页。
// 云开发开通后，这里管云同步状态、纪念日提醒（多节点）和历史记录。
// 云同步的身份是微信自己（openid），页面里没有也不需要「登录」按钮。

const cloud = require('../../utils/cloud')
const storage = require('../../utils/storage')
const themes = require('../../utils/themes')
const reminders = require('../../utils/reminders')

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function dots(ymd) {
  return String(ymd || '').replace(/-/g, '.')
}

Page({
  data: {
    themeBg: '',
    theme: 'cream',
    appName: '恋爱Wrapped',
    // 云同步状态：checking / ok / error
    cloudState: 'checking',
    cloudError: '',
    // 纪念日提醒节点列表（渲染态，详见 renderNodes）
    nodes: [],
    onCount: 0,
    // 添加一个纪念日：展开种类 chips → 选中后用 picker 选起点
    adding: false,
    addable: [],
    pendingKind: '',
    pendingLabel: '',
    today: ''
  },

  onShow() {
    // 全局主题已退休：页面观感固定默认配色，书的颜色各管各的。
    const theme = themes.DEFAULT
    this.setData({
      theme: theme,
      themeBg: themes.pick(theme).bg,
      today: this.todayYmd()
    })
    this.checkCloud()
    this.refreshNodes()
  },

  todayYmd() {
    const t = new Date()
    return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate())
  },

  // 节点列表：本地记录先渲染，再把云端额度的真相并回来（下发一次额度就没了，
  // 只有云端知道），有变化就重画一次。
  refreshNodes() {
    this.renderNodes()
    cloud.listReminderPlans().then((res) => {
      if (res && res.list && !res.error && reminders.mergeCloudPlans(res.list)) {
        this.renderNodes()
      }
    })
  },

  // 把节点整理成渲染态：胶囊文字、依据句、该出现的按钮。
  renderNodes() {
    const answers = storage.loadAnswers() || {}
    const nodes = reminders.ensureTogetherNode(answers.togetherDate)
    this._nodes = nodes
    const rows = nodes.map((node) => {
      const occ = reminders.nextOccurrence(node.date)
      const row = {
        kind: node.kind,
        label: reminders.labelOf(node.kind),
        nextText: occ ? dots(occ.date) : '',
        body: '',
        chip: '未开启',
        chipCls: '',
        canOn: false,
        btnText: '开启提醒',
        canCancel: false,
        canDelete: !reminders.kindOf(node.kind).fixed
      }
      if (node.enabled && node.subscribed) {
        row.chip = '已开启'
        row.chipCls = 'ok'
        row.body = occ ? '下一个：' + dots(occ.date) + '，前 7 天会提醒你。' : '日子还没定下来。'
        row.canCancel = true
      } else if (node.enabled && !node.subscribed) {
        // 开过、额度用掉了（提醒发过一次）：微信的订阅消息一次授权只能发一条。
        row.chip = '待续订'
        row.chipCls = 'due'
        row.body = occ ? '今年的提醒已经送到。点「续订明年」，' + dots(occ.date) + ' 前还会提醒你。' : '微信的提醒一次一发，续订一次管一年。'
        row.canOn = true
        row.btnText = '续订明年'
        row.canCancel = true
      } else if (!node.enabled && node.declinedFor) {
        row.chip = '已取消'
        row.body = '这个日子不会再提醒。'
        row.canOn = true
        row.btnText = '重新开启'
      } else {
        row.body = occ ? '开启后，' + dots(occ.date) + ' 前 7 天会提醒你。' : '还没定下日子。'
      }
      return row
    })
    const addable = reminders.addableKinds().map((k) => ({ id: k.id, label: k.label }))
    const onCount = rows.filter((r) => r.chipCls === 'ok').length
    this.setData({
      nodes: rows,
      onCount: onCount,
      addable: addable,
      pendingLabel: this.data.pendingKind ? reminders.labelOf(this.data.pendingKind) : ''
    })
  },

  // ---------- 每个节点的开启 / 续订 ----------
  // 和生成时的询问一样：授权必须由这个按钮的点击同步发起，
  // 等任何异步回调再调 requestSubscribeMessage，真机就弹不出面板了。
  onNodeEnable(e) {
    const page = this
    const idx = Number(e.currentTarget.dataset.idx)
    const node = (this._nodes || [])[idx]
    if (!node) return
    const tmpl = cloud.reminderTemplateId()
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
        reminders.updateNode(node.kind, { enabled: true, subscribed: true, declinedFor: '' })
        cloud.saveReminderPlan({
          kind: node.kind,
          date: node.date,
          nicknames: reminders.nicknamesText(),
          enabled: true,
          subscribed: true
        })
        page.renderNodes()
        wx.showToast({ title: '提醒已开启', icon: 'none' })
      },
      fail(err) {
        // 真实原因打进控制台，好排查；开发者工具里本来就弹不出授权面板，提示说清楚。
        console.warn('[reminder] 订阅授权面板没弹出来：', err && err.errMsg)
        let inTools = false
        try { inTools = wx.getSystemInfoSync().platform === 'devtools' } catch (e2) { inTools = false }
        wx.showToast({ title: inTools ? '开发者工具里开不了，用手机预览就能开' : '这次没开成，下次再试', icon: 'none' })
      }
    })
  },

  // 取消一个节点：本地关闸并标记这一轮不再问，云端计划同步 enabled: false。
  onNodeCancel(e) {
    const page = this
    const idx = Number(e.currentTarget.dataset.idx)
    const node = (this._nodes || [])[idx]
    if (!node) return
    const label = reminders.labelOf(node.kind)
    wx.showModal({
      title: '取消提醒',
      content: '「' + label + '」到日子前 7 天就不再提醒你了。想开的话，随时回到这里重新开启。',
      confirmText: '取消提醒',
      cancelText: '先不了',
      confirmColor: themes.pick(this.data.theme).kicker,
      success(res) {
        if (!res.confirm) return
        const occ = reminders.nextOccurrence(node.date)
        reminders.updateNode(node.kind, { enabled: false, declinedFor: occ ? occ.date : '' })
        cloud.saveReminderPlan({
          kind: node.kind,
          date: node.date,
          nicknames: reminders.nicknamesText(),
          enabled: false,
          subscribed: !!node.subscribed
        })
        page.renderNodes()
        wx.showToast({ title: '已取消', icon: 'none' })
      }
    })
  },

  // 删除一个自定义日子（在一起的纪念日跟着答案走，删不了）。
  onNodeDelete(e) {
    const page = this
    const idx = Number(e.currentTarget.dataset.idx)
    const node = (this._nodes || [])[idx]
    if (!node || reminders.kindOf(node.kind).fixed) return
    const label = reminders.labelOf(node.kind)
    wx.showModal({
      title: '删掉这个日子',
      content: '「' + label + '」会从提醒列表里拿掉。以后想加回来，随时可以。',
      confirmText: '删掉',
      cancelText: '先留着',
      confirmColor: themes.pick(this.data.theme).kicker,
      success(res) {
        if (!res.confirm) return
        reminders.removeNode(node.kind)
        cloud.removeReminderPlan(node.kind)
        page.renderNodes()
        wx.showToast({ title: '已删掉', icon: 'none' })
      }
    })
  },

  // ---------- 添加一个纪念日 ----------
  onAddToggle() {
    this.setData({ adding: !this.data.adding, pendingKind: '' })
  },

  onPickKind(e) {
    const kind = String(e.currentTarget.dataset.kind || '')
    if (!kind) return
    this.setData({ pendingKind: kind, pendingLabel: reminders.labelOf(kind) })
  },

  // picker 的确认不算页面手势，弹不了订阅授权——所以先记下日子，
  // 节点落进列表里保持「未开启」，再点一下「开启提醒」才是真 TAP。
  onAddDate(e) {
    const kind = this.data.pendingKind
    const date = String((e && e.detail && e.detail.value) || '')
    if (!kind) return
    if (!reminders.addNode(kind, date)) {
      wx.showToast({ title: '这个日子没记上，再试一次', icon: 'none' })
      return
    }
    this.setData({ adding: false, pendingKind: '', pendingLabel: '' })
    this.renderNodes()
    wx.showToast({ title: '记下了，点「开启提醒」就好', icon: 'none' })
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
  }
})
