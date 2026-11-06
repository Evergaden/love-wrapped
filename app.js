// 恋爱Wrapped 的入口。
// 写下的内容存在这台设备的本地缓存里；开通云开发后，写好的册子
// 会额外存一份快照到云端，换手机也能从「历史记录」找回。
// 页面：
//   pages/index     填写
//   pages/wrapped   左右滑动翻看，并用画布导出图片
//   pages/profile   我的：云同步状态与入口
//   pages/history   历史记录：云端册子，载入或删除
//
// 字体用手机自带（苹方、黑体、微软雅黑）。除了云开发自身通道，
// 不向任何外部域名发起请求。

const cloud = require('./utils/cloud')

App({
  onLaunch() {
    // 尽早初始化云开发。环境没开通时 init 会安静地失败，
    // 页面照常工作，只是没有云端备份。
    cloud.init()
  },

  onShow() {},

  onHide() {}
})
