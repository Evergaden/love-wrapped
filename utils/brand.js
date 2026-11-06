// 名称与分享文案的唯一出处。
// 想换产品名，只改这里的 APP_NAME，页面标题、封面角标、转发卡片会一起变。
//
// 注意：个人主体上架时，小程序名称（后台注册的那个）里不要出现
// 「恋爱」「情侣」「婚恋」这类词，界面文案保持同一口径更容易过审。

const APP_NAME = 'Wrapped 纪念册'

// 转发给好友的卡片标题。收到的对方点进来是空白填写页，看不到你的答案。
const SHARE_TITLE = APP_NAME + ' · 写一本只印了一份的小册子'

// 分享到朋友圈的标题。
const TIMELINE_TITLE = '我用《' + APP_NAME + '》把重要的日子装订成册'

module.exports = {
  APP_NAME,
  SHARE_TITLE,
  TIMELINE_TITLE
}
