// node tests/share-moderation.js
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')
assert.deepEqual(
  fs.readFileSync(path.join(root, 'cloudfunctions/shareBook/moderation.js')),
  fs.readFileSync(path.join(root, 'cloudfunctions/contentCheck/index.js')),
  'independent deployment packages must use the same moderation implementation'
)
let openid = 'trusted-client-openid', suggest = 'pass', fail = false, writes = 0
const checked = []
const db = {
  command: { gt: value => value }, serverDate: () => new Date(),
  createCollection: async () => ({}),
  collection: () => ({
    where: () => ({ count: async () => ({ total: 0 }) }),
    add: async () => { writes++; return { _id: 'share' } }
  })
}
const sdk = {
  init() {}, DYNAMIC_CURRENT_ENV: 'dynamic', database: () => db,
  getWXContext: () => ({ OPENID: openid }),
  callFunction() { throw new Error('nested cloud call must not be used: loses client OPENID') },
  openapi: { security: { async msgSecCheck(args) {
    checked.push(args)
    assert.equal(args.openid, 'trusted-client-openid')
    if (fail) throw new Error('API unavailable')
    return { result: { suggest } }
  } } }
}
function load(file, overrides = {}) {
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    module, exports: module.exports, console,
    require: name => name === 'wx-server-sdk' ? sdk : name in overrides ? overrides[name] : require(name)
  }, { filename: file })
  return module.exports
}
const moderation = load('cloudfunctions/shareBook/moderation.js')
const share = load('cloudfunctions/shareBook/index.js', { './moderation': moderation })
const record = require('../utils/record')
const answers = record.normalize({ myNickname: '小熊', theirNickname: '阿树', togetherDate: '2023-11-12', story: '一起散步' })
async function main() {
  let res = await share.main({ answers, title: '一周年快乐', openid: 'forged' })
  assert.equal(res.ok, true)
  assert.equal(writes, 1)
  assert.match(checked[0].content, /一周年快乐/)
  assert.match(checked[0].content, /一起散步/)
  suggest = 'risky'
  res = await share.main({ answers, title: '测试标题' })
  assert.equal(res.ok, false); assert.equal(writes, 1)
  suggest = 'pass'; fail = true
  res = await share.main({ answers })
  assert.equal(res.ok, false); assert.equal(writes, 1)
  openid = ''
  const before = checked.length
  res = await share.main({ answers, openid: 'forged' })
  assert.equal(res.ok, false); assert.equal(checked.length, before)
  console.log('PASS share moderation: trusted entry identity, title/body inspected, risky/service failure blocked, forged identity ignored')
}
main().catch(err => { console.error(err); process.exitCode = 1 })
