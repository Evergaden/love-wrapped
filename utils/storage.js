// 本机缓存。
// 小程序没有后端时，用 wx.setStorageSync 把答案存在这台设备上。
// 清缓存、换设备、删除小程序，这些字就没了。
// 这是本地存储本身的边界，不是故障。

const ANSWERS_KEY = 'loveWrapped.answers.v1'
const THEME_KEY = 'loveWrapped.theme.v1'
// 正在写的这一本自己选的配色：不写进全局主题（全局的只管主页观感），
// 书架的草稿卡和纪念册跟着这一份走。
const DRAFT_THEME_KEY = 'loveWrapped.draftTheme.v1'
const REMINDER_KEY = 'loveWrapped.reminder.v1'

const record = require('./record')

function loadAnswers() {
  try {
    const value = wx.getStorageSync(ANSWERS_KEY)
    if (!value || typeof value !== 'object') return null
    return value
  } catch (err) {
    console.warn('读取答案失败', err)
    return null
  }
}

function saveAnswers(form) {
  try {
    // 存之前归一化一次：超长截断、非法值清空，保证缓存里的数据永远是干净的。
    wx.setStorageSync(ANSWERS_KEY, record.normalize(form))
    return true
  } catch (err) {
    console.warn('保存答案失败', err)
    return false
  }
}

function clearAnswers() {
  try {
    wx.removeStorageSync(ANSWERS_KEY)
  } catch (err) {
    console.warn('清空答案失败', err)
  }
}

// 正在写的这一本的配色。
function loadDraftTheme() {
  try {
    const value = wx.getStorageSync(DRAFT_THEME_KEY)
    if (!value || typeof value !== 'string') return null
    return value
  } catch (err) {
    console.warn('读取草稿配色失败', err)
    return null
  }
}

function saveDraftTheme(themeId) {
  try {
    wx.setStorageSync(DRAFT_THEME_KEY, String(themeId || ''))
    return true
  } catch (err) {
    console.warn('保存草稿配色失败', err)
    return false
  }
}

function clearDraftTheme() {
  try {
    wx.removeStorageSync(DRAFT_THEME_KEY)
  } catch (err) {
    console.warn('清空草稿配色失败', err)
  }
}

// 主题单独存，换主题不用动答案。
function loadTheme() {
  try {
    const value = wx.getStorageSync(THEME_KEY)
    if (!value || typeof value !== 'string') return null
    return value
  } catch (err) {
    console.warn('读取主题失败', err)
    return null
  }
}

function saveTheme(themeId) {
  try {
    wx.setStorageSync(THEME_KEY, String(themeId || ''))
    return true
  } catch (err) {
    console.warn('保存主题失败', err)
    return false
  }
}

// 纪念日提醒的本机节点（多节点）：每个日子一条 { kind, date, enabled, subscribed,
// declinedFor, askedFor }。只存意愿，真正的计划在云端 reminders 集合里。
// 老版本只有一条周年记录（loveWrapped.reminder.v1），读到这里自动迁成
// together 节点并把旧键清掉。
function loadReminderNodes() {
  try {
    const value = wx.getStorageSync(REMINDERS_KEY)
    if (value && Array.isArray(value.nodes)) return value.nodes
    const old = wx.getStorageSync(REMINDER_KEY)
    if (old && typeof old === 'object' && (old.togetherDate || old.anniversary)) {
      const nodes = [{
        kind: 'together',
        date: old.togetherDate || old.anniversary,
        enabled: !!old.enabled,
        subscribed: !!old.subscribed,
        declinedFor: old.declined ? String(old.anniversary || '') : '',
        askedFor: String(old.anniversary || '')
      }]
      wx.setStorageSync(REMINDERS_KEY, { nodes: nodes })
      wx.removeStorageSync(REMINDER_KEY)
      return nodes
    }
    return null
  } catch (err) {
    console.warn('读取提醒节点失败', err)
    return null
  }
}

function saveReminderNodes(nodes) {
  try {
    wx.setStorageSync(REMINDERS_KEY, { nodes: nodes || [] })
    return true
  } catch (err) {
    console.warn('保存提醒节点失败', err)
    return false
  }
}

module.exports = {
  loadAnswers,
  saveAnswers,
  clearAnswers,
  loadTheme,
  saveTheme,
  loadDraftTheme,
  saveDraftTheme,
  clearDraftTheme,
  loadReminderNodes,
  saveReminderNodes
}

