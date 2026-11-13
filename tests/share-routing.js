// Run: node tests/share-routing.js
// Exercise actual share handlers and cloud cache, with deferred cloud responses.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')
const pending = []
const wx = {
  cloud: { init() {}, callFunction(args) {
    return new Promise((resolve, reject) => pending.push({ ...args, resolve: result => resolve({ result }), reject }))
  } },
  showShareMenu() {}, getWindowInfo: () => ({ windowWidth: 375, windowHeight: 667 })
}
function load(file, deps = {}, extra = {}) {
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    module, exports: module.exports, wx, console, setTimeout, clearTimeout,
    require(name) { return name in deps ? deps[name] : require(path.resolve(path.dirname(path.join(root, file)), name)) },
    ...extra
  }, { filename: file })
  return module.exports
}
const cloud = load('utils/cloud.js')
const gift = load('utils/gift.js', { './cloud': cloud })
const record = require('../utils/record')
const form = record.normalize({ myNickname: '作者', theirNickname: '收件人', togetherDate: '2024-01-01' })
const tokenA = 'a'.repeat(48), tokenB = 'b'.repeat(48)
const flush = () => new Promise(resolve => setImmediate(resolve))
function page(file) {
  let spec
  load(file, {
    '../../utils/cloud': cloud, '../../utils/gift': gift,
    '../../utils/storage': { loadAnswers: () => form, loadDraftTheme: () => 'cream' },
    '../../utils/themes': { DEFAULT: 'cream', THEMES: { cream: { kicker: '#000' } }, pickerList: () => [], resolve: t => t, meshImage: () => '', ambLowerImage: () => '' },
    '../../utils/slides': { buildSlides: f => [{ author: f.myNickname }] },
    '../../utils/font': {}, '../../utils/poster': {}, '../../utils/privacy': {}
  }, { Page: p => { spec = p } })
  return Object.assign({}, spec, {
    data: JSON.parse(JSON.stringify(spec.data)),
    setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback() },
    syncChrome() {}, prepareShareImage() {}, measureDock() {}
  })
}
async function main() {
  assert.ok(record.canGenerate(form))
  const wrapped = page('pages/wrapped/wrapped.js')
  wrapped.data.currentTheme = 'cream'
  const initial = wrapped.onShareAppMessage()
  assert.equal(typeof initial.then, 'undefined')
  assert.ok(initial.promise)
  assert.equal(initial.path, '/pages/wrapped/wrapped?shareError=1')
  pending.shift().resolve({ ok: true, token: tokenA })
  const sent = await initial.promise
  assert.equal(sent.path, gift.giftPath(tokenA))
  assert.equal(wrapped.onShareAppMessage().path, sent.path)

  // Changing title must not use an old preheated token.
  wrapped.shareToken = tokenA
  wrapped.data.shareTitleInput = '新标题'
  const changed = wrapped.onShareAppMessage()
  assert.ok(changed.promise)
  assert.equal(pending[0].data.title, '新标题')
  pending.shift().resolve({ ok: false, error: 'quota' })
  assert.equal((await changed.promise).path, initial.path)
  const retry = wrapped.onShareAppMessage()
  assert.ok(retry.promise)
  pending.shift().resolve({ ok: true, token: tokenB })
  assert.equal((await retry.promise).path, gift.giftPath(tokenB))

  // The panel stays disabled on failure; late old requests cannot enable it.
  const originalSave = cloud.saveBook
  cloud.saveBook = () => Promise.resolve({ ok: true })
  wrapped.data.shareTitleInput = '慢请求'
  wrapped.warmShareToken()
  const late = pending.shift()
  wrapped.data.shareTitleInput = '最新请求'
  wrapped.warmShareToken()
  pending.shift().resolve({ ok: false, error: '请稍后重试' }); await flush()
  late.resolve({ ok: true, token: tokenA }); await flush()
  assert.equal(wrapped.data.shareReady, false)
  assert.equal(wrapped.data.shareError, '请稍后重试')
  wrapped.warmShareToken()
  pending.shift().resolve({ ok: true, token: tokenB }); await flush()
  assert.equal(wrapped.data.shareReady, true)
  cloud.saveBook = originalSave

  // Crossed responses cannot clear the newer cache entry.
  const old = cloud.shareTokenFor(form, 'cream', 'old')
  const newer = cloud.shareTokenFor(form, 'cream', 'new')
  const oldCall = pending.shift(), newCall = pending.shift()
  newCall.resolve({ ok: true, token: tokenB }); await newer
  oldCall.resolve({ ok: false }); await old
  assert.equal(cloud.readyShareToken(form, 'cream', 'new'), tokenB)

  // An in-flight response has a safe default even if WeChat times out.
  const slow = gift.shareContent(form, 'sky', '', '')
  assert.equal(slow.path, initial.path)
  pending.shift().reject(new Error('offline'))
  assert.equal((await slow.promise).path, initial.path)

  const index = page('pages/index/index.js')
  index.data.form = form; index.data.theme = 'cream'; index.shareToken = tokenB
  const indexShare = index.onShareAppMessage()
  assert.ok(indexShare.promise)
  pending.shift().resolve({ ok: true, token: tokenA })
  assert.equal((await indexShare.promise).path, gift.giftPath(tokenA))

  // Shelf viewer shares its loaded book, never the local draft.
  wrapped.data.viewer = true
  wrapped.bookForm = { ...form, myNickname: '书架作者' }
  const viewerShare = wrapped.onShareAppMessage()
  assert.equal(pending[0].data.answers.myNickname, '书架作者')
  pending.shift().resolve({ ok: true, token: tokenB }); await viewerShare.promise
  wrapped.bookForm = null
  assert.equal(wrapped.onShareAppMessage().path, initial.path)

  // Recipient startup loads the gift rather than their own cached form.
  const recipient = page('pages/wrapped/wrapped.js')
  recipient.onLoad({ gift: tokenA })
  assert.equal(recipient.data.gift, true)
  assert.equal(recipient.data.slides.length, 0)
  assert.equal(pending[0].name, 'getSharedBook')
  pending.shift().resolve({ ok: true, answers: form, theme: 'cream', title: '年度报告' })
  await flush()
  assert.equal(recipient.data.giftSplashTitle, '年度报告')
  assert.equal(recipient.data.slides[0].author, '作者')
  recipient.data.gift = true; recipient.giftToken = tokenA
  assert.equal(recipient.onShareAppMessage().path, gift.giftPath(tokenA))
  const failed = page('pages/wrapped/wrapped.js')
  failed.onLoad({ shareError: '1' })
  assert.equal(failed.data.giftState, 'error')
  assert.equal(failed.data.slides.length, 0)
  assert.equal(failed.data.empty, false)
  assert.equal(failed.onShareAppMessage().path, initial.path)
  console.log('PASS share routing: ready / pending / failure / retry / stale token / crossed responses / viewer / recipient / gift title / forwarding / timeout fallback')
}
main().catch(err => { console.error(err); process.exitCode = 1 })
