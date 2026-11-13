// 纪念日提醒的节点管理（多节点）。
// 一个用户可以挂好几个日子：在一起的纪念日（跟着答案自动有）、
// 告白纪念日、第一次见面、领证纪念日、TA 的生日、我的生日。
//
// 订阅规则：微信订阅消息一次授权只能发一条，所以每个节点每个年度
// 都要点一次「开启 / 续订」。这里只管本机记录、下一个日子的推算和
// 「该问哪个节点」的挑选；真正的下发在云端 reminderSend——它按
// 节点的起点日期自己算周年，客户端不用替云端记「下一个纪念日」。
//
// 节点字段：
//   kind        节点种类（KINDS 里的 id）
//   date        起点日期 YYYY-MM-DD（生日填出生那天）
//   enabled     开没开（关了但 declinedFor 还在 = 已取消，这一轮不再问）
//   subscribed  授权额度在不在（云端下发一次就用掉，客户端从云端回读真相）
//   declinedFor 用户按过「先不」的那个日子（只挡这一轮，明年会再问）
//   askedFor    已经记过意愿的日子（模板没接时记下，接入后会再问授权）

const storage = require('./storage')

// 节点种类。fixed：跟着答案自动出现，不能删；其余由用户在「我的」页添加。
const KINDS = [
  { id: 'together', label: '在一起的纪念日', fixed: true },
  { id: 'confession', label: '告白纪念日' },
  { id: 'meeting', label: '第一次见面' },
  { id: 'cert', label: '领证纪念日' },
  { id: 'birthday_ta', label: 'TA 的生日' },
  { id: 'birthday_mine', label: '我的生日' }
]

function kindOf(id) {
  return KINDS.find((k) => k.id === id) || null
}

function labelOf(id) {
  const k = kindOf(id)
  return k ? k.label : '纪念日'
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

// 下一个周年。起点日期当天不算（第一次提醒在起点满一年后），
// 和云函数 isOccurrence 同一条规则：2 月 29 日的周年在平年顺延到 2 月 28 日。
// 返回 { date: 'YYYY-MM-DD', days: 距今天数 }，起点无效返回 null。
function nextOccurrence(dateStr, today) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''))
  if (!m) return null
  const oy = Number(m[1])
  const om = Number(m[2])
  const od = Number(m[3])
  const now = today || new Date()
  const occIn = (y) => {
    let d = od
    if (om === 2 && d === 29 && !isLeap(y)) d = 28
    return y + '-' + pad(om) + '-' + pad(d)
  }
  const todayYmd = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
  const startY = Math.max(oy + 1, now.getFullYear())
  let occ = occIn(startY)
  if (occ < todayYmd) occ = occIn(startY + 1)
  const parts = occ.split('-')
  const days = Math.round((new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime()
    - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000)
  return { date: occ, days: days }
}

function loadNodes() {
  return storage.loadReminderNodes() || []
}

function saveNodes(nodes) {
  return storage.saveReminderNodes(nodes)
}

// 在一起的纪念日跟着答案走：有 togetherDate 就保证有这个节点（没有才补）。
// 返回补好之后的节点列表。
function ensureTogetherNode(togetherDate) {
  const nodes = loadNodes()
  const date = String(togetherDate || '')
  if (!YMD_RE.test(date)) return nodes
  const has = nodes.some((n) => n.kind === 'together')
  if (!has) {
    nodes.unshift({ kind: 'together', date: date, enabled: false, subscribed: false, declinedFor: '', askedFor: '' })
    saveNodes(nodes)
  }
  return nodes
}

// 加一个节点。种类重复或起点无效返回 false（「我的」页添加区不会给重复项，双保险）。
function addNode(kind, date) {
  if (!kindOf(kind) || kindOf(kind).fixed) return false
  if (!YMD_RE.test(String(date || ''))) return false
  const nodes = loadNodes()
  if (nodes.some((n) => n.kind === kind)) return false
  nodes.push({ kind: kind, date: String(date), enabled: false, subscribed: false, declinedFor: '', askedFor: '' })
  return saveNodes(nodes)
}

function removeNode(kind) {
  const nodes = loadNodes()
  const next = nodes.filter((n) => n.kind !== kind)
  if (next.length === nodes.length) return false
  return saveNodes(next)
}

// 更新一个节点的字段（没有就当不存在，返回 false）。
function updateNode(kind, patch) {
  const nodes = loadNodes()
  const node = nodes.find((n) => n.kind === kind)
  if (!node) return false
  Object.assign(node, patch || {})
  return saveNodes(nodes)
}

// 生成时该问哪个节点：还没授权、这一轮也没被拒绝过的，挑下一个日子
// 离今天最近的那个。都不缺额度返回 null。
// opts.ignoreAskedFor：模板已接入时传 true——「记过意愿」只该在模板还没接
// 的时候挡问（免得每次生成都念一遍），模板有了，额度真相就归 subscribed 管，
// 云端把额度用掉后要能重新问到（续订）。
function pickAsk(nodes, today, opts) {
  const ignoreAskedFor = !!(opts && opts.ignoreAskedFor)
  const candidates = []
  ;(nodes || loadNodes()).forEach((node) => {
    const occ = nextOccurrence(node.date, today)
    if (!occ) return
    if (node.subscribed) return
    if (node.declinedFor === occ.date) return
    if (!ignoreAskedFor && node.askedFor === occ.date) return
    candidates.push({ node: node, occ: occ })
  })
  if (candidates.length === 0) return null
  candidates.sort((a, b) => (a.occ.date < b.occ.date ? -1 : 1))
  return candidates[0]
}

// 「我的」页还能添加哪些种类：已存在的不再给。
function addableKinds() {
  const nodes = loadNodes()
  return KINDS.filter((k) => !nodes.some((n) => n.kind === k.id))
}

// 云端计划并回本机：订阅额度用没用，只有云端知道（下发一次就没了）。
// 只同步 enabled / subscribed 这两个真相字段，日子的本机记录不动。
// 云端有、本机没有的节点（清过缓存的设备）补回来。返回有没有变化。
function mergeCloudPlans(plans) {
  const list = Array.isArray(plans) ? plans : []
  const nodes = loadNodes()
  let changed = false
  list.forEach((plan) => {
    if (!plan || !plan.kind || !plan.originDate) return
    const node = nodes.find((n) => n.kind === plan.kind)
    if (node) {
      // 本机刚取得额度、云端尚未保存成功时，旧计划不能把它覆盖回未开启。
      if (node.pendingSync) return
      if (node.enabled !== !!plan.enabled || node.subscribed !== !!plan.subscribed) {
        node.enabled = !!plan.enabled
        node.subscribed = !!plan.subscribed
        changed = true
      }
    } else {
      nodes.push({
        kind: plan.kind, date: plan.originDate,
        enabled: !!plan.enabled, subscribed: !!plan.subscribed,
        declinedFor: '', askedFor: ''
      })
      changed = true
    }
  })
  if (changed) saveNodes(nodes)
  return changed
}

// 云端计划里的昵称们，保存计划时带上（云端暂不用，留着以后派生文案）。
function nicknamesText() {
  const answers = storage.loadAnswers() || {}
  const mine = String(answers.myNickname || '').trim()
  const theirs = String(answers.theirNickname || '').trim()
  if (!mine && !theirs) return ''
  return (mine + ' 和 ' + theirs).trim()
}

module.exports = {
  KINDS,
  kindOf,
  labelOf,
  nextOccurrence,
  loadNodes,
  ensureTogetherNode,
  addNode,
  removeNode,
  updateNode,
  pickAsk,
  addableKinds,
  mergeCloudPlans,
  nicknamesText
}
