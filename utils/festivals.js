// 有「日子感」的日子：二十四节气和传统节日。
//
// 节气按太阳视黄经推算（Meeus 低精度公式，误差在分钟级），
// 换算成东八区的日期；农历节日用内置的 1900-2099 农历数据表换算，
// 全部本地计算，不联网。
//
// 只收有氛围的日子：节气（除清明——这日子另有含义，不放进纪念册）、
// 春节、元宵、端午、七夕、中秋、重阳、腊八、除夕，再加情人节和 520。
// 劳动节、国庆这类假期日本身没有氛围，不收。

// 农历数据表，1900-2099 每年一条。格式沿用经典 calendar.js：
// 低 4 位闰月号，0x10000 起按位表示农历各月大小（30/29 天）。
const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,  //1900-1909
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,  //1910-1919
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,  //1920-1929
  0x06566, 0x0d4a0, 0x0ea50, 0x16a95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,  //1930-1939
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,  //1940-1949
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,  //1950-1959
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,  //1960-1969
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,  //1970-1979
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,  //1980-1989
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0,  //1990-1999
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,  //2000-2009
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,  //2010-2019
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,  //2020-2029
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,  //2030-2039
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,  //2040-2049
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06aa0, 0x1a6c4, 0x0aae0,  //2050-2059
  0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,  //2060-2069
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,  //2070-2079
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,  //2080-2089
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252  //2090-2099
]

// 农历换算的基准日：1900-01-31 是农历 1900 年正月初一。
const LUNAR_BASE = { y: 1900, m: 1, d: 31 }

// 二十四节气的完整顺序（含清明），黄经映射必须用这份，
// 少一个节气后面的就全错位。小寒 285°，往后每 15° 一个，冬至 270°。
const ALL_TERMS = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨',
  '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑',
  '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'
]
// 纪念册里收的节气：清明虽然是节气，也是扫墓的日子，不放进这个册子。
const SOLAR_TERM_NAMES = ALL_TERMS.filter((name) => name !== '清明')

// 第 i 个节气对应的太阳视黄经。
function termLongitude(index) {
  return (285 + 15 * index) % 360
}

// 农历节日：农历几月几日。
const LUNAR_FESTIVALS = [
  { m: 1, d: 1, name: '春节' },
  { m: 1, d: 15, name: '元宵' },
  { m: 5, d: 5, name: '端午' },
  { m: 7, d: 7, name: '七夕' },
  { m: 8, d: 15, name: '中秋' },
  { m: 9, d: 9, name: '重阳' },
  { m: 12, d: 8, name: '腊八' }
]

// 公历固定日期的节日。
const DATE_FESTIVALS = [
  { m: 2, d: 14, name: '情人节' },
  { m: 5, d: 20, name: '520' }
]

// 预告窗口：30 天内才替换「整百天」预告，太远的不急着说。
const WINDOW_DAYS = 30

// ---------- 公历 <-> 儒略日（用于节气） ----------

function dateToJD(y, m, d, hourUTC) {
  const a = Math.floor((14 - m) / 12)
  const yy = y + 4800 - a
  const mm = m + 12 * a - 3
  const jdn = d
    + Math.floor((153 * mm + 2) / 5)
    + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400)
    - 32045
  return jdn - 0.5 + (hourUTC || 0) / 24
}

function jdToDate(jd) {
  const z = Math.floor(jd + 0.5)
  const f = jd + 0.5 - z
  let a = z
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25)
    a = z + 1 + alpha - Math.floor(alpha / 4)
  }
  const b = a + 1524
  const c = Math.floor((b - 122.1) / 365.25)
  const d = Math.floor(365.25 * c)
  const e = Math.floor((b - d) / 30.6001)
  const day = b - d - Math.floor(30.6001 * e) + f
  const month = e < 14 ? e - 1 : e - 13
  const year = month > 2 ? c - 4716 : c - 4715
  return { y: year, m: month, d: Math.floor(day) }
}

// 太阳视黄经（地心，黄道分点坐标），Meeus 低精度公式，误差 ~0.01°。
function solarLongitudeDeg(jd) {
  const T = (jd - 2451545.0) / 36525
  const rad = Math.PI / 180
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T
  const Mr = M * rad
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr)
    + (0.019993 - 0.000101 * T) * Math.sin(2 * Mr)
    + 0.000289 * Math.sin(3 * Mr)
  const trueLong = L0 + C
  const omega = (125.04 - 1934.136 * T) * rad
  return trueLong - 0.00569 - 0.00478 * Math.sin(omega)
}

// 求某年某节气（按黄经）交节的时刻，返回儒略日（UTC）。
function termJDForLongitude(year, longitude) {
  // 1 月 1 日 0 时 UTC 的黄经约 280°，从这里估一个初值。
  const jd0 = dateToJD(year, 1, 1, 0)
  const delta = (((longitude - solarLongitudeDeg(jd0)) % 360) + 360) % 360
  let jd = jd0 + delta / 0.98565
  // 牛顿迭代：黄经每天走 0.95°~1.02°，取 0.98565 平均值收敛很快。
  for (let i = 0; i < 8; i++) {
    const diff = solarLongitudeDeg(jd) - longitude
    // 按短弧方向修正，避免跨 360° 的回绕。
    const step = ((diff % 360) + 540) % 360 - 180
    jd -= step / 0.98565
    if (Math.abs(step) < 0.00001) break
  }
  return jd
}

// 某年某节气交节的东八区日期。name 是 ALL_TERMS 里的名字。
function termDate(year, name) {
  const index = ALL_TERMS.indexOf(name)
  const jdUTC = termJDForLongitude(year, termLongitude(index))
  const jdBeijing = jdUTC + 8 / 24
  const d = jdToDate(jdBeijing)
  return new Date(d.y, d.m - 1, d.d)
}

// ---------- 农历换算 ----------

function leapMonth(y) {
  return LUNAR_INFO[y - 1900] & 0xf
}

function leapDays(y) {
  return leapMonth(y) ? ((LUNAR_INFO[y - 1900] & 0x10000) ? 30 : 29) : 0
}

function monthDays(y, m) {
  return (LUNAR_INFO[y - 1900] & (0x10000 >> m)) ? 30 : 29
}

function lunarYearDays(y) {
  let sum = 348
  for (let i = 0x8000; i > 0x8; i >>= 1) {
    sum += (LUNAR_INFO[y - 1900] & i) ? 1 : 0
  }
  return sum + leapDays(y)
}

// 农历某年的月份序列：闰月排在本月之后。[{ m, leap, days }, ...]
function monthsOfYear(y) {
  const leap = leapMonth(y)
  const list = []
  for (let m = 1; m <= 12; m++) {
    list.push({ m: m, leap: false, days: monthDays(y, m) })
    if (leap === m) list.push({ m: m, leap: true, days: leapDays(y) })
  }
  return list
}

function daysBetween(from, to) {
  return Math.round((to.getTime() - from.getTime()) / 86400000)
}

function addDays(date, n) {
  const t = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  t.setDate(t.getDate() + n)
  return t
}

function baseDate() {
  return new Date(LUNAR_BASE.y, LUNAR_BASE.m - 1, LUNAR_BASE.d)
}

// 公历日期 → 农历 { y, m, leap, d }
function solar2lunar(date) {
  let offset = daysBetween(baseDate(), date)
  let y = LUNAR_BASE.y
  for (; y < LUNAR_BASE.y + LUNAR_INFO.length; y++) {
    const d = lunarYearDays(y)
    if (offset < d) break
    offset -= d
  }
  const months = monthsOfYear(y)
  let i = 0
  for (; i < months.length; i++) {
    if (offset < months[i].days) break
    offset -= months[i].days
  }
  return { y: y, m: months[i].m, leap: months[i].leap, d: offset + 1 }
}

// 农历某年某月某日 → 公历日期。找不到（比如当年闰月不存在）返回 null。
function lunar2solar(y, m, d, isLeap) {
  const months = monthsOfYear(y)
  let idx = -1
  for (let i = 0; i < months.length; i++) {
    if (months[i].m === m && months[i].leap === !!isLeap) {
      idx = i
      break
    }
  }
  // 没有对应闰月时退回平月，保证除夕这类推算不落空。
  if (idx < 0 && isLeap) {
    for (let i = 0; i < months.length; i++) {
      if (months[i].m === m && !months[i].leap) {
        idx = i
        break
      }
    }
  }
  if (idx < 0) return null
  let offset = 0
  for (let i = 0; i < idx; i++) offset += months[i].days
  offset += d - 1
  for (let yy = LUNAR_BASE.y; yy < y; yy++) offset += lunarYearDays(yy)
  return addDays(baseDate(), offset)
}

// ---------- 节日清单 ----------

// 某一年全部候选日子：节气 + 农历节日 + 除夕 + 公历节日。
function occurrencesOfYear(year) {
  const list = []
  SOLAR_TERM_NAMES.forEach((name) => {
    list.push({ name: name, date: termDate(year, name) })
  })
  LUNAR_FESTIVALS.forEach((f) => {
    const date = lunar2solar(year, f.m, f.d, false)
    if (date) list.push({ name: f.name, date: date })
  })
  // 除夕：春节的前一天，农历年是腊月廿九还是三十都自动对。
  const newYear = lunar2solar(year, 1, 1, false)
  if (newYear) list.push({ name: '除夕', date: addDays(newYear, -1) })
  DATE_FESTIVALS.forEach((f) => {
    list.push({ name: f.name, date: new Date(year, f.m - 1, f.d) })
  })
  return list
}

// 今天的下一个候选日子（含今天），超出窗口返回 null。
function nextFestival(today) {
  const year = today.getFullYear()
  const all = occurrencesOfYear(year).concat(occurrencesOfYear(year + 1))
  let best = null
  all.forEach((occ) => {
    const days = daysBetween(today, occ.date)
    if (days >= 0 && days <= WINDOW_DAYS && (!best || occ.date < best.date)) {
      best = occ
    }
  })
  return best
}

// 从在一起那天到今天，一起度过了几个 name。
function countPassed(name, startDate, today) {
  const startY = startDate.getFullYear()
  const endY = today.getFullYear()
  let count = 0
  for (let year = startY; year <= endY; year++) {
    occurrencesOfYear(year).forEach((occ) => {
      if (occ.name === name && occ.date >= startDate && occ.date <= today) count++
    })
  }
  return count
}

// 给数字页用：在一起以来，最近的节气/节日。
// 返回 { name, days, passed } 或 null。days=0 表示今天就是。
function coupleFestival(togetherYmd, today) {
  const fest = nextFestival(today)
  if (!fest) return null
  const passed = countPassed(fest.name, startDateOf(togetherYmd, today), today)
  return { name: fest.name, days: daysBetween(today, fest.date), passed: passed }
}

function startDateOf(togetherYmd, today) {
  const parts = String(togetherYmd || '').split('-')
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  if (isNaN(date.getTime()) || date > today) return today
  return date
}

module.exports = {
  coupleFestival,
  nextFestival,
  countPassed,
  solar2lunar,
  lunar2solar,
  termDate,
  occurrencesOfYear
}

