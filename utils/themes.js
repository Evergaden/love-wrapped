// 主题。
// 这里是配色的唯一出处：屏幕上的颜色写在各 wxss 的 .theme-* 规则里，
// 导出图片上的同色由 utils/poster.js 从这里取。改颜色时两边一起改。
//
// roles 是弥散底的四支角色色，每个位置的角色在两处用法一致：
//   a 主色（奶油里是粉）  b 次色（奶油里是薰衣草）
//   c 暖色（奶油里是蜜桃）d 软色（奶油里是浅粉）
// hair 是卡口那条渐变细线的三段色。shareBg 是转发卡片纸底的渐变两段。

const THEMES = {
  cream: {
    id: 'cream',
    label: '奶油',
    bg: '#FFF5F7',
    ink: '#2D1B24',
    kicker: '#E85A7A',
    btn: '#FF8FAB',
    btnShadow: 'rgba(255, 138, 171, 0.30)',
    roles: { a: '#FF8FAB', b: '#B79CFF', c: '#FFB583', d: '#FFC2D1' },
    hair: ['#FF8FAB', '#B79CFF', '#FFB583'],
    shareBg: ['#FFF9FB', '#FFF0F4']
  },
  matcha: {
    id: 'matcha',
    label: '抹茶',
    bg: '#F2FAF4',
    ink: '#1E2B23',
    kicker: '#2E8B62',
    btn: '#7FC79B',
    btnShadow: 'rgba(127, 199, 155, 0.30)',
    roles: { a: '#8FD3A8', b: '#8FC7B9', c: '#F2E3A1', d: '#C8E9D2' },
    hair: ['#8FD3A8', '#8FC7B9', '#F2E3A1'],
    shareBg: ['#F8FDF9', '#EFF8F1']
  },
  sky: {
    id: 'sky',
    label: '晴蓝',
    bg: '#F1F6FD',
    ink: '#1C2A3C',
    kicker: '#4A7DBF',
    btn: '#8FB6E8',
    btnShadow: 'rgba(143, 182, 232, 0.30)',
    roles: { a: '#A3C4F1', b: '#B9A9F0', c: '#A9DAEA', d: '#CFE2F8' },
    hair: ['#A3C4F1', '#B9A9F0', '#A9DAEA'],
    shareBg: ['#F7FAFE', '#EDF4FC']
  },
  violet: {
    id: 'violet',
    label: '雾紫',
    bg: '#F7F4FC',
    ink: '#2B2144',
    kicker: '#7B5BC8',
    btn: '#B49AEC',
    btnShadow: 'rgba(180, 154, 236, 0.30)',
    roles: { a: '#C9AFF2', b: '#E2A9E4', c: '#F5B8D0', d: '#E4D4FA' },
    hair: ['#C9AFF2', '#E2A9E4', '#A9DAEA'],
    shareBg: ['#FBF9FE', '#F4EEFA']
  }
}

const DEFAULT = 'cream'

// 弥散底的几何与透明度。每层：
//   [横向半径%, 纵向半径%, 圆心x%, 圆心y%, 角色字母, 屏幕alpha, 导出图alpha]
// 几何只有这一份，屏幕（内联 style）和导出图（poster.js）都从这里取。
// 屏幕和画布的叠色方式略有差异，所以两处 alpha 各自保留原来的调好的值。
const MESH_GEO = {
  'mesh-1': [
    [62, 46, 14, 2, 'a', 0.88, 0.72],
    [56, 42, 96, 16, 'b', 0.78, 0.64],
    [74, 50, 88, 102, 'c', 0.74, 0.60],
    [52, 44, 0, 88, 'd', 0.82, 0.68],
    [72, 54, 44, 46, 'c', 0.62, 0.62]
  ],
  'mesh-2': [
    [58, 44, 92, 0, 'c', 0.80, 0.64],
    [60, 46, 6, 14, 'a', 0.76, 0.60],
    [56, 42, 96, 74, 'b', 0.70, 0.56],
    [64, 46, 12, 100, 'd', 0.82, 0.66],
    [70, 52, 46, 44, 'b', 0.56, 0.56]
  ],
  'mesh-3': [
    [66, 48, 50, -6, 'a', 0.84, 0.66],
    [52, 40, 2, 42, 'b', 0.68, 0.54],
    [52, 40, 98, 56, 'c', 0.70, 0.56],
    [78, 46, 50, 106, 'd', 0.88, 0.72],
    [68, 50, 48, 40, 'a', 0.58, 0.58]
  ],
  'mesh-4': [
    [60, 44, 8, 6, 'b', 0.78, 0.62],
    [58, 44, 100, 30, 'a', 0.74, 0.58],
    [70, 48, 76, 104, 'd', 0.86, 0.70],
    [48, 38, 18, 74, 'c', 0.68, 0.54],
    [72, 54, 44, 44, 'd', 0.62, 0.62]
  ],
  'mesh-5': [
    [56, 42, 20, 8, 'c', 0.78, 0.62],
    [62, 46, 84, 8, 'a', 0.80, 0.64],
    [54, 40, 94, 66, 'b', 0.68, 0.54],
    [66, 44, 26, 98, 'd', 0.86, 0.70],
    [70, 52, 46, 42, 'c', 0.58, 0.58]
  ]
}

// 弥散底的第二层（.amb-lower），坐标往下压。
const AMB_LOWER_GEO = [
  [58, 40, 90, 34, 'c', 0.80],
  [62, 44, 8, 62, 'a', 0.72],
  [54, 38, 74, 96, 'd', 0.80]
]

function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '')
  const full = clean.length === 3
    ? clean.split('').map((ch) => ch + ch).join('')
    : clean
  const num = parseInt(full, 16)
  if (isNaN(num)) return '255, 138, 171'
  return ((num >> 16) & 255) + ', ' + ((num >> 8) & 255) + ', ' + (num & 255)
}

// 一套弥散底的 background-image 值（给内联 style 用）。
function meshImage(themeId, name) {
  const t = THEMES[resolve(themeId)]
  const geo = MESH_GEO[name] || MESH_GEO['mesh-1']
  return geo.map((g) => {
    const rgb = hexToRgb(t.roles[g[4]])
    return 'radial-gradient(' + g[0] + '% ' + g[1] + '% at ' + g[2] + '% ' + g[3] + '%, rgba(' + rgb + ', ' + g[5] + '), rgba(' + rgb + ', 0) 76%)'
  }).join(', ')
}

// 第二层弥散底（.amb-lower）的 background-image 值。
function ambLowerImage(themeId) {
  const t = THEMES[resolve(themeId)]
  return AMB_LOWER_GEO.map((g) => {
    const rgb = hexToRgb(t.roles[g[4]])
    return 'radial-gradient(' + g[0] + '% ' + g[1] + '% at ' + g[2] + '% ' + g[3] + '%, rgba(' + rgb + ', ' + g[5] + '), rgba(' + rgb + ', 0) 78%)'
  }).join(', ')
}

// 卡口渐变细线的 background 值。
function hairlineImage(themeId) {
  const t = THEMES[resolve(themeId)]
  const a = hexToRgb(t.hair[0])
  const b = hexToRgb(t.hair[1])
  const c = hexToRgb(t.hair[2])
  return 'linear-gradient(90deg, rgba(' + a + ', 0) 0%, rgba(' + a + ', 0.9) 26%, rgba(' + b + ', 0.9) 58%, rgba(' + c + ', 0) 100%)'
}

// 弥散底往奶油底（现在是主题底色）化开的那段渐变。
function ambFade(themeId) {
  const t = THEMES[resolve(themeId)]
  const rgb = hexToRgb(t.bg)
  return 'linear-gradient(180deg, rgba(' + rgb + ', 0) 0%, rgba(' + rgb + ', 0.92) 72%, ' + t.bg + ' 100%)'
}

// 取主题里某支色的半透明 rgba 字符串。role 可以是角色字母 a/b/c/d，也可以直接给 hex。
// 主要给内联 style 用（气泡底、邮戳圈、旅程虚线这类跟着主题走的装饰）。
function tint(themeId, role, alpha) {
  const t = THEMES[resolve(themeId)]
  const hex = t.roles[role] || (String(role || '').charAt(0) === '#' ? role : t.roles.a)
  return 'rgba(' + hexToRgb(hex) + ', ' + alpha + ')'
}

// 主题里直接的取值。
function pick(themeId) {
  return THEMES[resolve(themeId)]
}

function isTheme(id) {
  return !!THEMES[id]
}

// 非法的主题一律回到默认，缓存里的脏数据不会让页面崩掉。
function resolve(id) {
  return isTheme(id) ? id : DEFAULT
}

// 主题选择器要用的精简列表。
function pickerList() {
  return Object.keys(THEMES).map((id) => {
    const t = THEMES[id]
    return {
      id: id,
      label: t.label,
      bg: t.bg,
      accent: t.roles.a,
      kicker: t.kicker
    }
  })
}

module.exports = {
  THEMES,
  DEFAULT,
  MESH_GEO,
  AMB_LOWER_GEO,
  hexToRgb,
  tint,
  pick,
  meshImage,
  ambLowerImage,
  hairlineImage,
  ambFade,
  isTheme,
  resolve,
  pickerList
}

