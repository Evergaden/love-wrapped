// 本机缓存。
// 小程序没有后端时，用 wx.setStorageSync 把答案存在这台设备上。
// 清缓存、换设备、删除小程序，这些字就没了。
// 这是本地存储本身的边界，不是故障。

const ANSWERS_KEY = 'loveWrapped.answers.v1'

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
    wx.setStorageSync(ANSWERS_KEY, form)
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

module.exports = {
  loadAnswers,
  saveAnswers,
  clearAnswers
}
