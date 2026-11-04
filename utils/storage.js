// 本机缓存。
// 小程序没有后端时，用 wx.setStorageSync 把答案存在这台设备上。
// 清缓存、换设备，这些字就没了。这是演示版的正常限制，不是故障。

const ANSWERS_KEY = 'loveWrapped.answers.v1'
const UNLOCK_KEY = 'loveWrapped.unlockMock.v1'

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

// 这个开关只表示「演示里假装看完了激励视频」。
// 它不是会员，也不会连到任何广告。
function loadUnlocked() {
  try {
    return wx.getStorageSync(UNLOCK_KEY) === true
  } catch (err) {
    return false
  }
}

function saveUnlocked(on) {
  try {
    wx.setStorageSync(UNLOCK_KEY, !!on)
    return true
  } catch (err) {
    console.warn('保存解锁标记失败', err)
    return false
  }
}

module.exports = {
  loadAnswers,
  saveAnswers,
  clearAnswers,
  loadUnlocked,
  saveUnlocked
}
