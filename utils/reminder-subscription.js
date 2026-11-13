// 订阅授权必须在页面点击的同步调用栈内发起；设置里的允许不代替本次授权。
const cloud = require('./cloud')
const reminders = require('./reminders')

function authorizationError(err) {
  const code = Number(err && err.errCode)
  const raw = String((err && err.errMsg) || '').slice(0, 200)
  let reason = '微信订阅请求没有成功，请稍后再试。'
  if (code === 20004) reason = '微信返回订阅消息总开关已关闭，请在小程序设置中检查「接收订阅消息」。'
  else if (code === 20001) reason = '微信没有找到可用的提醒模板，需要检查小程序后台的订阅模板配置。'
  else if (code === 10003) reason = '网络不稳定，订阅请求没有发出去，请重试。'
  else if (/TAP|user gesture/i.test(raw)) reason = '微信没有识别到这次按钮点击，请回到页面重新点「开启提醒」。'
  return { ok: false, error: reason + (raw ? '\n' + raw : ''), code: code || '' }
}

function saveAccepted(node, nicknames) {
  // 额度已获得但云端没存成时保留待同步状态，重试只保存，不再索要一次授权。
  const stored = reminders.updateNode(node.kind, {
    enabled: true, subscribed: true, declinedFor: '', pendingSync: true
  })
  const payload = {
    kind: node.kind, date: node.date, nicknames: nicknames,
    enabled: true, subscribed: true
  }
  return Promise.resolve().then(() => cloud.saveReminderPlan(payload)).catch(() => ({
    ok: false, error: '云端暂时连不上'
  })).then((res) => {
    if (!res || !res.ok) return {
      ok: false, pendingSync: stored,
      error: '微信已允许提醒，但提醒计划还没保存到云端，请重试保存。' +
        (res && res.error ? '\n' + res.error : '')
    }
    reminders.updateNode(node.kind, { pendingSync: false })
    return { ok: true }
  })
}

function enable(node, nicknames) {
  const current = reminders.loadNodes().find((n) => n.kind === node.kind)
  if (current && current.pendingSync && current.subscribed) return saveAccepted(current, nicknames)
  const tmpl = cloud.reminderTemplateId()
  if (!tmpl) return Promise.resolve({ ok: false, error: '提醒模板尚未配置，请稍后再试。' })
  return new Promise((resolve) => {
    if (typeof wx.requestSubscribeMessage !== 'function') {
      resolve({ ok: false, error: '当前微信版本不支持订阅提醒，请更新微信。' })
      return
    }
    try {
      // 不得移入 then / 定时器 / setData 回调，否则会丢失点击手势。
      wx.requestSubscribeMessage({
        tmplIds: [tmpl],
        success(sub) {
          const status = sub && sub[tmpl]
          if (status === 'accept') {
            saveAccepted(node, nicknames).then(resolve)
            return
          }
          const reason = status === 'reject' ? '微信返回这条提醒未获允许，请在小程序设置里检查订阅消息，之后重新点「开启提醒」。'
            : status === 'ban' ? '这条提醒模板暂时被微信停用，需要检查后台模板。'
              : status === 'filter' ? '这条提醒模板被微信过滤，需要检查后台是否有同名模板。'
                : '微信没有返回这条提醒的授权结果，请重试。'
          resolve({ ok: false, error: reason, status: status || 'missing' })
        },
        fail(err) { resolve(authorizationError(err)) }
      })
    } catch (err) { resolve(authorizationError(err)) }
  })
}

function showError(result) {
  console.warn('[reminder] 开启未完成：', result.code || result.status || '', result.error)
  wx.showModal({ title: result.pendingSync ? '提醒还没保存好' : '提醒暂未开启', content: result.error, showCancel: false, confirmText: '知道了' })
}

module.exports = { enable, showError }
