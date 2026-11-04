// 恋爱Wrapped 的入口。
// 没有登录，也没有服务器。答案存在本机。
// 页面只有两个：
//   pages/index     填写
//   pages/wrapped   左右滑动翻看，并用画布导出图片

App({
  onLaunch() {
    // 默认用手机自带字体。想换成「得意黑」，看 README「想用得意黑」，
    // 把下面这一行前面的斜杠删掉，并改掉函数里的字体地址。
    // this.loadSmileySans()
  },

  // 得意黑（Smiley Sans）是开源字体，完整文件有几 MB。
  // 小程序主包大约只能放 2MB，所以项目里不附带字体文件。
  loadSmileySans() {
    wx.loadFontFace({
      global: true,
      family: 'Smiley Sans',
      source: 'url("https://example.com/SmileySans-Oblique.ttf")',
      scopes: ['webview', 'native'],
      success() {
        console.log('得意黑已加载')
      },
      fail(err) {
        console.warn('得意黑没有加载，继续用系统字体', err)
      }
    })
  }
})
