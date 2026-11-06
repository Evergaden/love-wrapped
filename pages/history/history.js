// 历史记录页。
// 列出云端保存的册子快照（云开发按 openid 自动隔离，只能看到自己的）。
// 点一册载回填写页继续写；长按或点删除可以清掉云端的这一份。

const cloud = require('../../utils/cloud')
const storage = require('../../utils/storage')
const themes = require('../../utils/themes')
const record = require('../../utils/record')

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function formatDateYmd(ymd) {
  if (!record.isYmd(ymd)) return ''
  const seg = String(ymd).split('-')
  return Number(seg[0]) + '年' + Number(seg[1]) + '月' + Number(seg[2]) + '日'
}

// updatedAt 可能是服务端 Date 对象（ISO 字符串）或时间戳，统一转成本地文案。
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

Page({
  data: {
    themeBg: '',
    state: 'loading', // loading / ok / error
    error: '',
    books: []
  },

  onShow() {
    const theme = themes.resolve(storage.loadTheme())
    this.setData({ theme: theme, themeBg: themes.pick(theme).bg })
    this.refresh()
  },

  refresh(done) {
    this.setData({ state: 'loading', error: '' })
    cloud.listBooks().then((res) => {
      if (res.error) {
        this.setData({ state: 'error', error: res.error, books: [] })
      } else {
        this.setData({
          state: 'ok',
          books: (res.list || []).map((b) => Object.assign({}, b, {
            dateText: formatDateYmd(b.togetherDate),
            timeText: formatTime(b.updatedAt),
            gift: b.source === 'gift'
          }))
        })
      }
      if (typeof done === 'function') done()
    })
  },

  onPullDownRefresh() {
    this.refresh(() => wx.stopPullDownRefresh())
  },

  onLoadOne(e) {
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
        wx.reLaunch({ url: '/pages/index/index' })
      }
    })
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id
    const book = this.data.books.find((b) => b.id === id)
    if (!book) return
    const page = this
    wx.showModal({
      title: '删除这一册',
      content: '删除「' + book.title + '」？删除后找不回来。',
      confirmText: '删除',
      cancelText: '留着',
      confirmColor: '#C04360',
      success(res) {
        if (!res.confirm) return
        cloud.removeBook(id).then((result) => {
          if (result.ok) {
            page.setData({ books: page.data.books.filter((b) => b.id !== id) })
            wx.showToast({ title: '已删除', icon: 'none' })
          } else {
            wx.showToast({ title: result.error || '没能删掉', icon: 'none' })
          }
        })
      }
    })
  },

  goBack() {
    wx.navigateBack({})
  }
})
