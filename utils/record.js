// 一份「答案」长什么样，以及怎么把脏数据收拾干净。
// 页面和画册都从这里拿同一套字段，避免各写各的。

// myNickname     我的昵称（必填）
// theirNickname  TA 的昵称（必填）
// togetherDate   在一起的日期，形如 2023-05-20（必填）
// firstDatePlace 第一次约会的地方
// cityCount      一起去过几座城市
// mealCount      一起吃过多少顿饭
// fightCount     吵架次数。留空 = 不写这一页；填 0 = 几乎没吵过
// whoApologized  me / them / both。留空 = 不指定谁先道歉
// catchphrase    口头禅
// story          一件难忘的小事
// distanceMode   ldr 异地 / same 同城。留空 = 不写这一页
// distanceKm     异地时的公里数
// meetCount      同城时一起出门的次数
// sentence       想对 TA 说的一句话

const EMPTY = {
  myNickname: '',
  theirNickname: '',
  togetherDate: '',
  firstDatePlace: '',
  cityCount: '',
  mealCount: '',
  fightCount: '',
  whoApologized: '',
  catchphrase: '',
  story: '',
  distanceMode: '',
  distanceKm: '',
  meetCount: '',
  sentence: ''
}

const WHO = {
  me: true,
  them: true,
  both: true
}

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
  form.cityCount = cleanNum(form.cityCount)
  form.mealCount = cleanNum(form.mealCount)
  form.fightCount = cleanNum(form.fightCount)
  form.whoApologized = WHO[form.whoApologized] ? form.whoApologized : ''
  form.catchphrase = clip(form.catchphrase, 24)
  form.story = clip(form.story, 140)
  form.distanceMode = form.distanceMode === 'ldr' || form.distanceMode === 'same'
    ? form.distanceMode
    : ''
  form.distanceKm = cleanNum(form.distanceKm)
  form.meetCount = cleanNum(form.meetCount)
  form.sentence = clip(form.sentence, 40)
  return form
}

function canGenerate(raw) {
  const form = normalize(raw)
  return !!(form.myNickname && form.theirNickname && form.togetherDate)
}

function blankForm() {
  return pickForm({})
}

module.exports = {
  EMPTY,
  charCount,
  isYmd,
  formatDate,
  togetherInfo,
  pickForm,
  normalize,
  canGenerate,
  blankForm
}
