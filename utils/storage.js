// 本机缓存。
// 小程序没有后端时，用 wx.setStorageSync 把答案存在这台设备上。
// 清缓存、换设备、删除小程序，这些字就没了。
// 这是本地存储本身的边界，不是故障。

const ANSWERS_KEY = 'loveWrapped.answers.v1'
const THEME_KEY = 'loveWrapped.theme.v1'
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

// 周年提醒的本机记录：问过没有、开没开、针对哪个周年。
// 只存意愿，真正的计划在云端 reminders 集合里。
function loadReminder() {
  try {
    const value = wx.getStorageSync(REMINDER_KEY)
    if (!value || typeof value !== 'object') return null
    return value
  } catch (err) {
    console.warn('读取提醒记录失败', err)
    return null
  }
}

function saveReminder(reminder) {
  try {
    wx.setStorageSync(REMINDER_KEY, reminder)
    return true
  } catch (err) {
    console.warn('保存提醒记录失败', err)
    return false
  }
}

module.exports = {
  loadAnswers,
  saveAnswers,
  clearAnswers,
  loadTheme,
  saveTheme,
  loadReminder,
  saveReminder
}
