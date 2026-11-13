// node tests/reminder-subscription.js — actual helpers/pages, mocked WeChat callbacks.
const assert = require('node:assert/strict')
const calls = { auth: 0, saved: 0, modals: [], toasts: [] }
const memory = {}
let authorize, save
global.wx = {
  getStorageSync: key => memory[key] ? JSON.parse(JSON.stringify(memory[key])) : '',
  setStorageSync: (key, value) => { memory[key] = JSON.parse(JSON.stringify(value)) },
  removeStorageSync: key => { delete memory[key] },
  requestSubscribeMessage(options) { calls.auth++; authorize(options) },
  showModal: options => calls.modals.push(options),
  showToast: options => calls.toasts.push(options)
}
const cloud = require('../utils/cloud')
const storage = require('../utils/storage')
const reminders = require('../utils/reminders')
cloud.reminderTemplateId = () => 'test-template'
cloud.saveReminderPlan = payload => { calls.saved++; return save(payload) }
const subscription = require('../utils/reminder-subscription')
const node = { kind: 'together', date: '2024-01-01', enabled: false, subscribed: false }
const flush = () => new Promise(resolve => setImmediate(resolve))
function reset() {
  storage.saveReminderNodes([{ ...node }])
  calls.auth = calls.saved = 0; calls.modals = []; calls.toasts = []
  save = () => Promise.resolve({ ok: true })
}
function page(file) {
  let spec
  global.Page = config => { spec = config }
  require(file)
  return Object.assign({}, spec, {
    data: JSON.parse(JSON.stringify(spec.data)),
    setData(patch) { Object.assign(this.data, patch) }
  })
}
async function main() {
  reset()
  let inTap = true
  authorize = options => {
    assert.equal(inTap, true, 'authorization must be synchronous with tap')
    options.fail({ errCode: 20001, errMsg: 'No template data return' })
  }
  const failed = subscription.enable(node, '名字')
  inTap = false
  assert.match((await failed).error, /模板/)
  assert.equal(calls.saved, 0)
  for (const status of ['reject', 'ban', 'filter', undefined]) {
    authorize = options => options.success({ 'test-template': status })
    const res = await subscription.enable(node, '')
    assert.equal(res.ok, false)
    assert.ok(res.error)
    assert.equal(calls.saved, 0)
  }

  reset()
  authorize = options => options.success({ 'test-template': 'accept' })
  let completeSave
  save = () => new Promise(resolve => { completeSave = resolve })
  let finished = false
  const result = subscription.enable(node, '名字').then(res => { finished = true; return res })
  await flush()
  assert.equal(finished, false, 'must await cloud persistence')
  assert.equal(reminders.loadNodes()[0].pendingSync, true)
  reminders.mergeCloudPlans([{ kind: node.kind, originDate: node.date, enabled: false, subscribed: false }])
  assert.equal(reminders.loadNodes()[0].subscribed, true, 'old cloud plan cannot erase unsaved authorization')
  completeSave({ ok: false, error: 'network' })
  assert.equal((await result).pendingSync, true)
  save = () => Promise.resolve({ ok: true })
  assert.equal((await subscription.enable(node, '名字')).ok, true)
  assert.equal(calls.auth, 1, 'retry persistence must not request another subscription')
  assert.equal(reminders.loadNodes()[0].pendingSync, false)

  reset()
  authorize = options => options.success({ 'test-template': 'accept' })
  save = () => Promise.reject(new Error('offline'))
  assert.equal((await subscription.enable(node, '')).ok, false)

  reset()
  const index = page('../pages/index/index')
  let navigated = 0
  index._remindDone = () => { navigated++ }
  index.data.remindAsk = { kind: node.kind, date: node.date, nicknames: '名字' }
  authorize = options => options.fail({ errCode: 20004, errMsg: 'The main switch is switched off' })
  index.onReminderAgree()
  await flush()
  assert.equal(navigated, 0, 'failure must not navigate away')
  assert.ok(index.data.remindAsk, 'keep retry entry')
  assert.equal(index.data.reminderBusy, false)
  assert.match(calls.modals[0].content, /总开关/)
  authorize = options => options.success({ 'test-template': 'accept' })
  index.onReminderAgree(); await flush()
  assert.equal(navigated, 1)
  assert.equal(index.data.remindAsk, null)
  assert.equal(calls.toasts.at(-1).title, '提醒已开启')

  reset()
  storage.saveAnswers({ myNickname: '我', theirNickname: 'TA', togetherDate: node.date })
  const profile = page('../pages/profile/profile')
  profile.renderNodes()
  assert.equal(profile.data.nodes[0].canOn, true, 'never-enabled nodes need an enable button')
  reminders.updateNode(node.kind, { enabled: true, subscribed: true, pendingSync: true })
  profile.renderNodes()
  assert.equal(profile.data.onCount, 0)
  assert.equal(profile.data.nodes[0].btnText, '重试保存')
  save = () => Promise.resolve({ ok: true })
  const authBeforeRetry = calls.auth
  profile.onNodeEnable({ currentTarget: { dataset: { idx: 0 } } })
  await flush()
  assert.equal(profile.data.nodes[0].chip, '已开启')
  assert.equal(calls.auth, authBeforeRetry)
  console.log('PASS reminder subscription: synchronous tap, API errors, reject/ban/filter, cloud save, pending retry, stale merge, page navigation, profile enable')
}
main().catch(err => { console.error(err); process.exitCode = 1 })
