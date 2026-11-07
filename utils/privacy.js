// 隐私合规。
// 在后台「设置 → 服务内容声明 → 用户隐私保护指引」里声明过之后，
// 微信会在需要时自动弹出授权框。这里做两件事：
//   1. 进页时用 wx.getPrivacySetting 查一下要不要弹（needAuthorization）
//   2. 保存 / 导出这类动作前用 wx.requirePrivacyAuthorize 再兜一次
// 基础库低于 2.32.3 没有这两个接口，按「无需授权」处理，不影响老机型。

function hasPrivacyApi() {
  return typeof wx !== 'undefined'
    && typeof wx.getPrivacySetting === 'function'
    && typeof wx.requirePrivacyAuthorize === 'function'
}

// 进页时调用。返回 true 表示还需要用户点同意；
// 拿到 privacyContractName 可以显示按钮「查看《xxx》」。
function checkPrivacy(onResult) {
  if (!hasPrivacyApi()) {
    if (typeof onResult === 'function') onResult({ needAuthorization: false })
    return
  }
  wx.getPrivacySetting({
    success(res) {
      const result = res || {}
      if (typeof onResult === 'function') {
        onResult({
          needAuthorization: !!result.needAuthorization,
          privacyContractName: result.privacyContractName || ''
        })
      }
    },
    fail() {
      if (typeof onResult === 'function') onResult({ needAuthorization: false })
    }
  })
}

// 真正要写缓存、要存相册之前调用。
// 已经同意 -> resolve；没同意 -> 微信会替我们弹一次授权框，
// 用户动过之后 resolve / reject。调用方据此决定要不要继续写。
//
// 注意：这个接口本身失败（例如基础库太低）不应当拦死功能，
// 所以 error 一律按 granted 处理，由调用方继续走原逻辑。
function requirePrivacy() {
  return new Promise((resolveBool) => {
    if (!hasPrivacyApi()) {
      resolveBool(true)
      return
    }
    wx.requirePrivacyAuthorize({
      success() {
        resolveBool(true)
      },
      fail() {
        resolveBool(true)
      },
      complete() {}
    })
  })
}

module.exports = {
  hasPrivacyApi,
  checkPrivacy,
  requirePrivacy
}

