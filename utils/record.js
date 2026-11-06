// 一起去过的地方要按名字数，找 geo 借个拆分器。
const geo = require('./geo')

// 一份「答案」长什么样，以及怎么把脏数据收拾干净。
// 页面和画册都从这里拿同一套字段，避免各写各的。

// myNickname     我的昵称（必填）
// theirNickname  TA 的昵称（必填）
// togetherDate   在一起的日期，形如 2023-05-20（必填）
// firstDatePlace 第一次约会的地方
// homeCity       现在住的城市。用于推算每个去过的地方离家多远
// places         一起去过的地方，内部用顿号连起来，界面上一块一块加
// cityCount      旧版本填的城市数量。保留只为兼容老缓存
// myCity         异地时我所在的城市（可不填）
// theirCity      异地时 TA 所在的城市（可不填）
// mealMode       一起吃饭的频率：daily / often / few / lost。留空 = 不写这一项
// mealCount      旧版本直接填的顿数。保留只为兼容老缓存
// fightCount     吵架次数。留空 = 不写这一页；填 0 = 几乎没吵过
// whoApologized  me / them / both。留空 = 不指定谁先道歉
// catchphrase    口头禅
// story          一件难忘的小事
// distanceMode   ldr 异地 / same 同城。留空 = 不写这一页
// distanceKm     异地时的公里数。两座城市都认得出时自动推算，这里只是兜底
// meetMode       同城时见面的频率：daily / often / few / lost。留空 = 不写
// meetCount      旧版本填的出门次数。保留只为兼容老缓存
// faveFoods      双方最爱吃的东西，一句话
// writtenAt      第一次写完这册的日期（YYYY-MM-DD）。转发时原样带走

const EMPTY = {
  myNickname: '',
  theirNickname: '',
  togetherDate: '',
  firstDatePlace: '',
  homeCity: '',
  places: '',
  cityCount: '',
  myCity: '',
  theirCity: '',
  mealMode: '',
  mealCount: '',
  fightCount: '',
  whoApologized: '',
  catchphrase: '',
  story: '',
  distanceMode: '',
  distanceKm: '',
  meetMode: '',
  meetCount: '',
  sentence: '',
  faveFoods: '',
  writtenAt: ''
}

const WHO = {
  me: true,
  them: true,
  both: true
}

const MEAL = {
  daily: true,
  often: true,
  few: true,
  lost: true
}

// 同城见面的频率和吃饭共用一套取值。
const MEET = MEAL

function charCount(value) {
  return Array.from(String(value || '')).length
}

// 按「几个字」截断，不是按字节。中文一个字算一个。
function clip(value, max) {
  return Array.from(String(value || '').trim()).slice(0, max).join('')
}

function cleanNum(value) {
  const digits = String(value || '').replace(/[^\d]/g, '')
  if (!digits) return ''
  const n = parseInt(digits, 10)
  if (isNaN(n)) return ''
  return String(n)
}

function parseYmd(ymd) {
  const parts = String(ymd).split('-')
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
}

function isYmd(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false
  const date = parseYmd(value)
  const parts = String(value).split('-')
  return date.getFullYear() === Number(parts[0])
    && date.getMonth() + 1 === Number(parts[1])
    && date.getDate() === Number(parts[2])
}

function formatDate(ymd) {
  if (!isYmd(ymd)) return ''
  const parts = String(ymd).split('-')
  return Number(parts[0]) + '年' + Number(parts[1]) + '月' + Number(parts[2]) + '日'
}

// 在一起的天数，开始当天算第 1 天。
// today 一般不传。测试时可以传入一个指定的「今天」。
function togetherInfo(ymd, today) {
  if (!isYmd(ymd)) return null
  const now = today || new Date()
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const start = parseYmd(ymd)
  const diff = Math.round((todayDate.getTime() - start.getTime()) / 86400000)
  if (diff >= 0) {
    return { future: false, days: diff + 1 }
  }
  return { future: true, days: -diff }
}

// 下一个值得等的日子：整百天或周年，取更近的那个。
// 返回 { days, label }，days 是还差几天；今天正好就 days=0。
// 还没在一起（未来日期）返回 null。
function nextMilestone(ymd, today) {
  if (!isYmd(ymd)) return null
  const now = today || new Date()
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const start = parseYmd(ymd)
  if (todayDate < start) return null
  const diff = Math.round((todayDate.getTime() - start.getTime()) / 86400000)
  // 下一个整百天。今天正好满整百的话，就显示「今天」，不跳过去。
  const nextHundred = Math.max(100, Math.ceil(diff / 100) * 100)
  const daysToHundred = nextHundred - diff
  // 下一个周年。当天就是周年日也算。
  let nextAnniv = null
  for (let y = 1; y <= 80; y++) {
    const date = new Date(start.getFullYear() + y, start.getMonth(), start.getDate())
    if (date >= todayDate) {
      nextAnniv = { years: y, date: date }
      break
    }
  }
  if (!nextAnniv) {
    return { days: daysToHundred, label: '就满 ' + nextHundred + ' 天' }
  }
  const daysToAnniv = Math.round((nextAnniv.date.getTime() - todayDate.getTime()) / 86400000)
  if (daysToAnniv < daysToHundred) {
    return { days: daysToAnniv, label: '就到 ' + nextAnniv.years + ' 周年' }
  }
  return { days: daysToHundred, label: '就满 ' + nextHundred + ' 天' }
}

// 只保留我们知道的字段。缓存里多出来的旧键会被丢掉。
function pickForm(raw) {
  const source = raw || {}
  const form = {}
  Object.keys(EMPTY).forEach((key) => {
    const value = source[key]
    form[key] = value === undefined || value === null ? '' : String(value)
  })
  return form
}

function normalize(raw) {
  const form = pickForm(raw)
  form.myNickname = clip(form.myNickname, 10)
  form.theirNickname = clip(form.theirNickname, 10)
  form.togetherDate = isYmd(form.togetherDate) ? form.togetherDate : ''
  form.firstDatePlace = clip(form.firstDatePlace, 20)
  form.homeCity = clip(form.homeCity, 12)
  form.places = clip(form.places, 140)
  form.cityCount = cleanNum(form.cityCount)
  form.myCity = clip(form.myCity, 12)
  form.theirCity = clip(form.theirCity, 12)
  form.mealMode = MEAL[form.mealMode] ? form.mealMode : ''
  form.mealCount = cleanNum(form.mealCount)
  form.fightCount = cleanNum(form.fightCount)
  form.whoApologized = WHO[form.whoApologized] ? form.whoApologized : ''
  form.catchphrase = clip(form.catchphrase, 24)
  form.story = clip(form.story, 140)
  form.distanceMode = form.distanceMode === 'ldr' || form.distanceMode === 'same'
    ? form.distanceMode
    : ''
  form.distanceKm = cleanNum(form.distanceKm)
  form.meetMode = MEET[form.meetMode] ? form.meetMode : ''
  form.meetCount = cleanNum(form.meetCount)
  form.sentence = clip(form.sentence, 40)
  form.faveFoods = clip(form.faveFoods, 24)
  form.writtenAt = isYmd(form.writtenAt) ? form.writtenAt : ''
  return form
}

function canGenerate(raw) {
  const form = normalize(raw)
  return !!(form.myNickname && form.theirNickname && form.togetherDate)
}

function blankForm() {
  return pickForm({})
}

// 下一个周年纪念日（当天也算）。返回 { date, years, days } 或 null。
function nextAnniversary(ymd, today) {
  if (!isYmd(ymd)) return null
  const now = today || new Date()
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const start = parseYmd(ymd)
  if (todayDate < start) return null
  for (let y = 1; y <= 80; y++) {
    const date = new Date(start.getFullYear() + y, start.getMonth(), start.getDate())
    if (date >= todayDate) {
      const pad = (n) => (n < 10 ? '0' + n : '' + n)
      return {
        date: date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()),
        years: y,
        days: Math.round((date.getTime() - todayDate.getTime()) / 86400000)
      }
    }
  }
  return null
}

// 称号：像游戏成就，按等级颁发。返回 { title, tierLabel, tierColor, reason }。
// 口径：sweet 八项 = 约会地点/现居/去过的地方/最爱吃/口头禅/小事/那句话/吃饭频率；
// fightNum 是填了数字的吵架次数；days 是在一起的天数（日子没到时为 null）。
const TIER = {
  S: { label: 'S级 · 稀有称号', color: '#E85A7A' },
  A: { label: 'A级 · 优秀称号', color: '#D9A441' },
  B: { label: 'B级 · 真实可爱', color: '#8A97AD' }
}

function awardTitle(a, info) {
  const norm = normalize(a)
  const sweet = [
    norm.firstDatePlace, norm.homeCity, norm.places, norm.faveFoods,
    norm.catchphrase, norm.story, norm.sentence, norm.mealMode
  ]
  const sweetCount = sweet.filter((v) => String(v || '').trim() !== '').length
  const sweetRatio = Math.round((sweetCount / sweet.length) * 100)
  const places = geo.splitPlaces(norm.places).length
  const fightNum = norm.fightCount === '' ? null : Number(norm.fightCount)
  const days = info && !info.future ? info.days : null
  const year1 = days !== null && days >= 365
  const year2 = days !== null && days >= 730
  const fightSweet = fightNum !== null && fightNum <= 2
  const fightLow = fightNum !== null && fightNum < 3
  const fightFew = fightNum !== null && fightNum <= 4
  const has = (v) => String(v || '').trim() !== ''
  const award = (title, tier, reason) => ({ title: title, tier: tier, tierLabel: TIER[tier].label, tierColor: TIER[tier].color, reason: reason })

  // S 级：稀有，值得炫耀
  if (sweetCount >= 7 && (fightNum === null || fightSweet) && year1) {
    return award('天作之合', 'S', '每一条都很甜，没有雷点')
  }
  if (has(norm.story) && charCount(norm.story) >= 30 && places >= 3 && has(norm.faveFoods) && has(norm.catchphrase)) {
    return award('灵魂伴侣', 'S', '连爱吃的东西都长在了一起')
  }
  if (year2 && fightFew) {
    return award('恋爱天花板', 'S', days + ' 天了，还是舍不得重话')
  }
  if (year1 && fightLow) {
    return award('神仙情侣', 'S', days + ' 天里只吵了 ' + fightNum + ' 次')
  }
  // A 级：优秀
  if (sweetRatio >= 80) {
    return award('甜蜜超标', 'A', '甜度 ' + sweetRatio + '%，超标了')
  }
  if (norm.mealMode === 'daily' && (norm.meetMode === 'daily' || norm.distanceMode === 'same')) {
    return award('黏黏糊糊', 'A', '天天都黏在一起')
  }
  if (sweetCount >= 5) {
    return award('仪式感达人', 'A', '把日子过得很有仪式感')
  }
  if (fightFew && has(norm.sentence)) {
    return award('模范情侣', 'A', '重要的话，都写在了心上')
  }
  // B 级：真实可爱的搭子们
  if (norm.distanceMode === 'ldr') {
    return award('双城搭子', 'B', '隔着公里数，隔不开心事')
  }
  if (places >= 3) {
    return award('旅行搭子', 'B', '一起去过 ' + places + ' 个地方')
  }
  if (norm.mealMode === 'daily' || norm.mealMode === 'often') {
    return award('饭搭子', 'B', '口味都对得上')
  }
  if (norm.meetMode === 'daily') {
    return award('形影搭子', 'B', '走到哪儿都一起')
  }
  if (fightNum === 0) {
    return award('和平搭子', 'B', '一次都没红过脸')
  }
  if (norm.mealMode === 'often' && norm.meetMode === 'often') {
    return award('合拍搭子', 'B', '节奏刚刚好')
  }
  return award('默契搭子', 'B', '有些话不用说出口')
}

module.exports = {
  EMPTY,
  charCount,
  isYmd,
  formatDate,
  togetherInfo,
  nextMilestone,
  nextAnniversary,
  awardTitle,
  pickForm,
  normalize,
  canGenerate,
  blankForm
}
