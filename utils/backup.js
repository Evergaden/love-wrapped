// 把一册备份成一段文字。
// 没有服务器，「长久保存」的唯一办法是把内容交还给用户本人：
// 复制到剪贴板，粘进微信收藏或备忘录，就是一份不会丢的备份。

const record = require('./record')
const geo = require('./geo')
const brand = require('./brand')

const MEAL_TEXT = {
  daily: '几乎每天一起吃',
  often: '一周好几顿',
  few: '想起来才一起吃',
  lost: '顿数数不清'
}

const WHO_TEXT = {
  me: '，我先道歉',
  them: '，TA 先道歉',
  both: '，几乎同时道歉'
}

function buildText(raw) {
  const a = record.normalize(raw)
  const info = record.togetherInfo(a.togetherDate)
  const lines = []

  lines.push('【' + brand.APP_NAME + ' · 备份】')
  lines.push((a.myNickname || '一个人') + ' 和 ' + (a.theirNickname || '另一个人'))
  if (info && !info.future) {
    lines.push('在一起：' + record.formatDate(a.togetherDate) + '（第 ' + info.days + ' 天）')
  } else if (info) {
    lines.push('在一起：' + record.formatDate(a.togetherDate) + '（还没到）')
  }
  if (a.firstDatePlace) lines.push('第一次约会：' + a.firstDatePlace)
  if (a.homeCity) lines.push('现居：' + a.homeCity)
  const places = geo.splitPlaces(a.places)
  if (places.length) lines.push('一起去过：' + places.join('、'))
  if (a.mealMode && MEAL_TEXT[a.mealMode]) {
    lines.push('吃饭：' + MEAL_TEXT[a.mealMode])
  } else if (a.mealCount) {
    lines.push('吃饭：约 ' + a.mealCount + ' 顿')
  }
  if (a.faveFoods) lines.push('最爱吃：' + a.faveFoods)
  if (a.fightCount !== '' || a.whoApologized) {
    lines.push('吵架：' + (a.fightCount !== '' ? a.fightCount + ' 次' : '次数没写') + (WHO_TEXT[a.whoApologized] || ''))
  }
  if (a.catchphrase) lines.push('口头禅：' + a.catchphrase)
  if (a.story) lines.push('一件小事：' + a.story)
  if (a.distanceMode === 'ldr') {
    const my = geo.find(a.myCity)
    const their = geo.find(a.theirCity)
    if (my && their) {
      lines.push('异地：从' + my.name + '到' + their.name + '，直线 ≈ ' + geo.distanceKm(my, their) + ' 公里')
    } else if (a.distanceKm) {
      lines.push('异地：直线 ≈ ' + a.distanceKm + ' 公里')
    } else if (a.myCity || a.theirCity) {
      lines.push('异地：' + [a.myCity, a.theirCity].filter(Boolean).join(' 和 '))
    } else {
      lines.push('异地')
    }
  } else if (a.distanceMode === 'same') {
    lines.push('同城：0 公里，想见就能见到')
  }
  if (a.sentence) lines.push('想对 TA 说：' + a.sentence)
  if (a.writtenAt) lines.push('—— 写于 ' + a.writtenAt.split('-').join('.'))
  return lines.join('\n')
}

module.exports = {
  buildText
}
