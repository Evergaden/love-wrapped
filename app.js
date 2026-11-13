// 恋爱Wrapped 的入口。
// 写下的内容存在这台设备的本地缓存里；开通云开发后，写好的册子
// 会额外存一份快照到云端，换手机也能从主页书架找回。
// 页面：
//   pages/index     填写
//   pages/wrapped   左右滑动翻看，并用画布导出图片
//   pages/profile   我的：云同步状态与入口
//   pages/support   帮助反馈、隐私与数据说明、关于
//
// 字体：启动时异步加载手写体「霞鹜文楷」（免费商用），加载完成前
// 用系统字体，完成后全局切换（含导出的图片）；失败则一直用系统字体。
// 字体经 CDN 加载（一次约 9MB，微信会缓存）；除了字体 CDN 和云开发
// 自身通道，不向任何外部域名发起请求。

const cloud = require('./utils/cloud')
const font = require('./utils/font')

App({
  onLaunch() {
    // 尽早初始化云开发。环境没开通时 init 会安静地失败，
    // 页面照常工作，只是没有云端备份。
    cloud.init()
    // 异步加载手写字体，不阻塞启动；失败静默回退系统字体。
    font.ensureFont()
  },

  onShow() {},

  onHide() {}
})
