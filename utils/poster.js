// 用画布把一页纪念册画成图片。
// 这里的单位是画布像素，不是 rpx。宽度 750，大约等于手机屏幕的宽。
// 颜色要和 app.wxss、pages/wrapped/wrapped.wxss 保持一致：
// 奶油底 #FFF5F7，粉 #FF8FAB / #FFC2D1，深玫瑰 #E85A7A，
// 弥散底多出的蜜桃 #FFB583、薰衣草 #B79CFF 也在这里。
//
// 这个文件不调用 wx。页面负责准备画布，再把 ctx 传进来。

const POSTER_W = 750
const POSTER_H = 1080
const FONT = '"Smiley Sans", sans-serif'

const THEMES = {
  cream: {
    bg: '#FFF5F7',
    ink: '#2D1B24',
    muted: 'rgba(45, 27, 36, 0.72)',
    kicker: '#E85A7A',
    card: 'rgba(255, 255, 255, 0.40)',
    cardEdge: 'rgba(255, 255, 255, 0.72)',
    cardShadow: 'rgba(45, 27, 36, 0.10)'
  }
}

// 弥散底。每一摊是一枚椭圆渐变，中心和 app.wxss 里的 .mesh-* 一一对应。
// 位置和大小都用画布的百分比写，换尺寸也不会切出硬边。
const MESHES = {
  'mesh-1': [
    [0.14, 0.02, 0.62, 0.46, '#FF8FAB', 0.72],
    [0.96, 0.16, 0.56, 0.42, '#B79CFF', 0.64],
    [0.88, 1.02, 0.74, 0.50, '#FFB583', 0.60],
    [0.00, 0.88, 0.52, 0.44, '#FFC2D1', 0.68],
    [0.44, 0.46, 0.72, 0.54, '#FFB583', 0.62]
  ],
  'mesh-2': [
    [0.92, 0.00, 0.58, 0.44, '#FFB583', 0.64],
    [0.06, 0.14, 0.60, 0.46, '#FF8FAB', 0.60],
    [0.96, 0.74, 0.56, 0.42, '#B79CFF', 0.56],
    [0.12, 1.00, 0.64, 0.46, '#FFC2D1', 0.66],
    [0.46, 0.44, 0.70, 0.52, '#B79CFF', 0.56]
  ],
  'mesh-3': [
    [0.50, -0.06, 0.66, 0.48, '#FF8FAB', 0.66],
    [0.02, 0.42, 0.52, 0.40, '#B79CFF', 0.54],
    [0.98, 0.56, 0.52, 0.40, '#FFB583', 0.56],
    [0.50, 1.06, 0.78, 0.46, '#FFC2D1', 0.72],
    [0.48, 0.40, 0.68, 0.50, '#FF8FAB', 0.58]
  ],
  'mesh-4': [
    [0.08, 0.06, 0.60, 0.44, '#B79CFF', 0.62],
    [1.00, 0.30, 0.58, 0.44, '#FF8FAB', 0.58],
    [0.76, 1.04, 0.70, 0.48, '#FFC2D1', 0.70],
    [0.18, 0.74, 0.48, 0.38, '#FFB583', 0.54],
    [0.44, 0.44, 0.72, 0.54, '#FFC2D1', 0.62]
  ],
  'mesh-5': [
    [0.20, 0.08, 0.56, 0.42, '#FFB583', 0.62],
    [0.84, 0.08, 0.62, 0.46, '#FF8FAB', 0.64],
    [0.94, 0.66, 0.54, 0.40, '#B79CFF', 0.54],
    [0.26, 0.98, 0.66, 0.44, '#FFC2D1', 0.70],
    [0.46, 0.42, 0.70, 0.52, '#FFB583', 0.58]
  ]
}

// 卡片的尺寸。和屏幕上 .content-inner / .card 对齐。
const CARD = {
  side: 36,
  padX: 44,
  padTop: 48,
  padBottom: 44,
  radius: 40,
  hairline: 46,
  top: 28,
  bottom: 32
}

// 落款钉在卡片底部，正文在它上面居中。
const SIGN_H = 42
const SIGN_GAP = 44

function font(size, bold) {
  return (bold ? 'bold ' : '') + size + 'px ' + FONT
}

function fitLine(ctx, text, maxWidth, maxSize, minSize, bold) {
  let size = maxSize
  while (size > minSize) {
    ctx.font = font(size, bold)
    if (ctx.measureText(text || '').width <= maxWidth) return size
    size -= 2
  }
  return minSize
}

function wrapText(ctx, text, maxWidth) {
  const lines = []
  const paragraphs = String(text || '').split('\n')
  paragraphs.forEach((para) => {
    if (!para) {
      lines.push('')
      return
    }
    let line = ''
    Array.from(para).forEach((ch) => {
      const next = line + ch
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line)
        line = ch
      } else {
        line = next
      }
    })
    if (line) lines.push(line)
  })
  return lines
}

function limitLines(lines, max) {
  if (lines.length <= max) return lines
  const cut = lines.slice(0, max)
  const last = cut[max - 1]
  cut[max - 1] = last.length > 1 ? last.slice(0, last.length - 1) + '…' : '…'
  return cut
}

// 把 #RRGGBB 变成带透明度的 rgba(...)。
function rgba(hex, alpha) {
  const clean = String(hex || '').replace('#', '')
  const full = clean.length === 3
    ? clean.split('').map(ch => ch + ch).join('')
    : clean
  const num = parseInt(full, 16)
  if (isNaN(num)) return 'rgba(255, 138, 171, ' + alpha + ')'
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')'
}

// 一摊化开的颜色。和屏幕上的 radial-gradient 是同一件事：
// 颜色从中间往外化开，没有硬边。
function blob(ctx, cx, cy, rx, ry, color, alpha, fade) {
  const end = fade || 0.72
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(rx, ry)
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  grad.addColorStop(0, rgba(color, alpha))
  grad.addColorStop(end, rgba(color, 0))
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(0, 0, 1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// 铺满一页的弥散底。
function drawMesh(ctx, w, h, name) {
  const layers = MESHES[name] || MESHES['mesh-1']
  layers.forEach((layer) => {
    blob(
      ctx,
      layer[0] * w,
      layer[1] * h,
      layer[2] * w,
      layer[3] * h,
      layer[4],
      layer[5],
      0.76
    )
  })
}

// 标题后面那团光。
function drawTitleGlow(ctx, x, y, w, h) {
  ctx.save()
  ctx.translate(x + w * 0.26, y + h / 2)
  ctx.scale(w * 0.72, h * 1.10)
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  grad.addColorStop(0, 'rgba(255, 138, 171, 0.34)')
  grad.addColorStop(0.42, 'rgba(255, 138, 171, 0.10)')
  grad.addColorStop(0.7, 'rgba(255, 138, 171, 0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(0, 0, 1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
}

// 把一行字一个一个画出去，字之间留一点间距。
function drawSpaced(ctx, text, x, y, color, spacing) {
  ctx.save()
  ctx.fillStyle = color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = font(26, false)
  let cursor = x
  Array.from(String(text || '')).forEach((ch) => {
    ctx.fillText(ch, cursor, y)
    cursor += ctx.measureText(ch).width + spacing
  })
  ctx.restore()
  return y + 52
}

function drawLines(ctx, lines, x, y, size, color, bold, lineHeight) {
  ctx.fillStyle = color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = font(size, bold)
  let cursor = y
  lines.forEach((line) => {
    ctx.fillText(line, x, cursor)
    cursor += lineHeight
  })
  return cursor
}

// 每一页的内容先排成几个块。卡片撑满整页，
// 正文在落款上方居中，短的一页不会吊在中间、上下空一大片。
function buildParts(ctx, slide, theme, maxWidth) {
  const parts = []

  if (slide.layout === 'cover') {
    const sizeA = fitLine(ctx, slide.nameA, maxWidth, 84, 40, true)
    const sizeB = fitLine(ctx, slide.nameB, maxWidth - 90, 84, 40, true)
    const size = Math.min(sizeA, sizeB)
    parts.push({
      type: 'kicker',
      text: slide.kicker,
      color: theme.kicker,
      h: 34,
      gap: 0
    })
    parts.push({
      type: 'names',
      nameA: slide.nameA,
      nameB: slide.nameB,
      size: size,
      color: theme.ink,
      h: Math.round(size * 1.16) + Math.round(size * 1.35),
      gap: 30
    })
    parts.push({
      type: 'pill',
      text: slide.body,
      h: 54,
      gap: 38
    })
    parts.push({
      type: 'meta',
      text: slide.meta,
      size: 40,
      bold: true,
      color: '#2D1B24',
      h: 54,
      gap: 24
    })
    parts.push({ type: 'sign', text: slide.footer, h: 42, gap: 44 })
    return parts
  }

  if (slide.layout === 'numbers') {
    const titleSize = 48
    const titleLines = limitLines(wrapText(ctx, slide.title, maxWidth), 2)
    parts.push({ type: 'kicker', text: slide.kicker, color: theme.kicker, h: 34, gap: 0 })
    parts.push({
      type: 'title',
      lines: titleLines,
      size: titleSize,
      color: theme.ink,
      h: Math.round(titleLines.length * titleSize * 1.28),
      gap: 26
    })
    const stats = slide.stats || []
    parts.push({
      type: 'stats',
      stats: stats,
      h: stats.length ? stats.length * 116 - 16 : 0,
      gap: 40
    })
    if (slide.note) {
      const noteLines = limitLines(wrapText(ctx, slide.note, maxWidth), 3)
      parts.push({
        type: 'paragraph',
        lines: noteLines,
        size: 28,
        color: theme.muted,
        h: Math.round(noteLines.length * 28 * 1.6),
        gap: 36
      })
    }
    parts.push({ type: 'sign', text: slide.footer, h: 42, gap: 44 })
    return parts
  }

  const maxSize = slide.id === 'phrase' ? 84 : 68
  const titleSize = fitLine(ctx, slide.title, maxWidth, maxSize, 36, true)
  const titleLines = limitLines(wrapText(ctx, slide.title, maxWidth), 4)
  parts.push({ type: 'kicker', text: slide.kicker, color: theme.kicker, h: 34, gap: 0 })
  parts.push({
    type: 'title',
    lines: titleLines,
    size: titleSize,
    color: theme.ink,
    h: Math.round(titleLines.length * titleSize * 1.28),
    gap: 26
  })
  if (slide.body) {
    const bodyLines = limitLines(wrapText(ctx, slide.body, maxWidth), 9)
    parts.push({
      type: 'paragraph',
      lines: bodyLines,
      size: 32,
      color: theme.muted,
      h: Math.round(bodyLines.length * 32 * 1.8),
      gap: 34
    })
  }
  if (slide.meta) {
    const metaLines = limitLines(wrapText(ctx, slide.meta, maxWidth), 2)
    parts.push({
      type: 'paragraph',
      lines: metaLines,
      size: 28,
      color: theme.muted,
      h: Math.round(metaLines.length * 28 * 1.6),
      gap: 22
    })
  }
  parts.push({ type: 'sign', text: slide.footer, h: 42, gap: 44 })
  return parts
}

function partsHeight(parts) {
  let total = 0
  parts.forEach((part) => {
    total += (part.gap || 0) + part.h
  })
  return total
}

// 落款单独画，因为它要钉在卡片最下面。
function drawSign(ctx, text, x, y, maxWidth) {
  const lineW = Math.round(maxWidth * 0.5)
  const grad = ctx.createLinearGradient(x, 0, x + lineW, 0)
  grad.addColorStop(0, 'rgba(45, 27, 36, 0.16)')
  grad.addColorStop(1, 'rgba(45, 27, 36, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(x, y, lineW, 2)
  ctx.fillStyle = 'rgba(45, 27, 36, 0.42)'
  ctx.font = font(24, false)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(text || '', x, y + 16)
}

function drawParts(ctx, parts, x, y, theme, maxWidth) {
  let cursor = y
  parts.forEach((part) => {
    cursor += part.gap || 0
    if (part.type === 'kicker') {
      drawSpaced(ctx, part.text, x, cursor, part.color, 5)
      cursor += part.h
      return
    }
    if (part.type === 'names') {
      const size = part.size
      drawTitleGlow(ctx, x - 12, cursor - 20, maxWidth, Math.round(size * 1.16) + 40)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillStyle = part.color
      ctx.font = font(size, true)
      ctx.fillText(part.nameA, x, cursor)
      cursor += Math.round(size * 1.16)
      const andSize = Math.max(28, Math.round(size * 0.38))
      ctx.font = font(andSize, false)
      ctx.fillStyle = '#FF8FAB'
      ctx.fillText('和', x, cursor + Math.round((size - andSize) * 0.82))
      const andW = ctx.measureText('和').width
      ctx.font = font(size, true)
      ctx.fillStyle = part.color
      ctx.fillText(part.nameB, x + andW + 16, cursor)
      cursor += Math.round(size * 1.35)
      return
    }
    if (part.type === 'title') {
      const lineHeight = Math.round(part.size * 1.28)
      drawTitleGlow(ctx, x - 12, cursor - 20, maxWidth, part.h + 30)
      drawLines(ctx, part.lines, x, cursor, part.size, part.color, true, lineHeight)
      cursor += part.h
      return
    }
    if (part.type === 'paragraph') {
      drawLines(ctx, part.lines, x, cursor, part.size, part.color, false, Math.round(part.size * 1.6))
      cursor += part.h
      return
    }
    if (part.type === 'pill') {
      ctx.font = font(27, false)
      const textW = ctx.measureText(part.text || '').width
      const boxW = textW + 56
      ctx.fillStyle = 'rgba(255, 138, 171, 0.16)'
      roundRectPath(ctx, x, cursor, boxW, part.h, part.h / 2)
      ctx.fill()
      ctx.fillStyle = '#E85A7A'
      ctx.font = font(27, false)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(part.text || '', x + 28, cursor + part.h / 2)
      cursor += part.h
      return
    }
    if (part.type === 'meta') {
      ctx.fillStyle = part.color
      ctx.font = font(part.size, part.bold)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(part.text || '', x, cursor)
      cursor += part.h
      return
    }
    if (part.type === 'stats') {
      part.stats.forEach((stat, index) => {
        const by = cursor + index * 116
        ctx.fillStyle = 'rgba(255, 255, 255, 0.46)'
        roundRectPath(ctx, x, by, maxWidth, 100, 28)
        ctx.fill()
        ctx.fillStyle = theme.ink
        ctx.font = font(68, true)
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(String(stat.num), x + 30, by + 18)
        const numW = ctx.measureText(String(stat.num)).width
        ctx.font = font(26, false)
        ctx.fillText(stat.unit, x + 30 + numW + 8, by + 42)
        ctx.fillStyle = theme.muted
        ctx.font = font(27, false)
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText(stat.label || '', x + maxWidth - 30, by + 50)
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
      })
      cursor += part.h
      return
    }
    if (part.type === 'sign') {
      drawSign(ctx, part.text, x, cursor, maxWidth)
      cursor += part.h
      return
    }
    cursor += part.h
  })
  return cursor
}

function drawFooter(ctx, w, h, slide, options, theme) {
  const page = options.pageLabel || ''
  if (page) {
    ctx.textAlign = 'right'
    ctx.textBaseline = 'top'
    ctx.font = font(22, false)
    ctx.fillStyle = theme.muted
    ctx.fillText(page, w - 48, h - 60)
  }
}

function drawSlide(ctx, w, h, slide, options) {
  const theme = THEMES[slide.theme] || THEMES.cream
  const opts = options || {}
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, w, h)
  ctx.clip()
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, w, h)

  drawMesh(ctx, w, h, slide.mesh)

  const card = CARD
  const maxWidth = w - card.side * 2 - card.padX * 2
  const parts = buildParts(ctx, slide, theme, maxWidth)
  const signPart = parts.filter(part => part.type === 'sign')[0] || null
  const mainParts = parts.filter(part => part.type !== 'sign')

  const cardX = card.side
  const cardW = w - card.side * 2
  let cardY = 0
  let cardH = 0
  let contentTop = 0
  let mainY = 0
  let signY = 0
  // 卡片撑满整页，外圈只留一圈窄边给弥散底。
  cardY = card.top
  cardH = h - card.top - card.bottom
  contentTop = cardY + card.hairline + card.padTop
  // 正文在落款上方居中，落款钉在最下面。
  const contentBottom = cardY + cardH - card.padBottom
  signY = contentBottom - SIGN_H
  const mainAreaH = Math.max(0, signY - SIGN_GAP - contentTop)
  const mainH = partsHeight(mainParts)
  mainY = contentTop + Math.max(0, Math.round((mainAreaH - mainH) / 2))

  ctx.save()
  ctx.shadowColor = theme.cardShadow
  ctx.shadowBlur = 40
  ctx.shadowOffsetY = 16
  ctx.fillStyle = theme.card
  roundRectPath(ctx, cardX, cardY, cardW, cardH, card.radius)
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = theme.cardEdge
  ctx.lineWidth = 2
  roundRectPath(ctx, cardX + 1, cardY + 1, cardW - 2, cardH - 2, card.radius - 1)
  ctx.stroke()
  ctx.restore()

  // 卡口那道渐变细线。
  const line = ctx.createLinearGradient(cardX, 0, cardX + cardW, 0)
  line.addColorStop(0, 'rgba(255, 138, 171, 0)')
  line.addColorStop(0.26, 'rgba(255, 138, 171, 0.9)')
  line.addColorStop(0.58, 'rgba(183, 156, 255, 0.9)')
  line.addColorStop(1, 'rgba(255, 181, 131, 0)')
  ctx.fillStyle = line
  ctx.fillRect(cardX + card.padX, cardY, cardW - card.padX * 2, 6)

  drawParts(ctx, mainParts, cardX + card.padX, mainY, theme, maxWidth)
  if (signPart) drawSign(ctx, signPart.text, cardX + card.padX, signY, maxWidth)

  drawFooter(ctx, w, h, slide, opts, theme)
  ctx.restore()
}

function drawBook(ctx, w, slideH, slides, options) {
  const opts = options || {}
  slides.forEach((slide, index) => {
    ctx.save()
    ctx.translate(0, index * slideH)
    drawSlide(ctx, w, slideH, slide, {
      pageLabel: (index + 1) + ' / ' + slides.length
    })
    ctx.restore()
  })
}

// ---------- 分享卡片 ----------
// 转发到聊天里的封面图。5:4，750 x 600。
const SHARE_W = 750
const SHARE_H = 600

// 信纸上的一枚邮戳：两圈细线、中间一行日期。
function drawPostmark(ctx, cx, cy, radius, text) {
  ctx.save()
  ctx.strokeStyle = 'rgba(232, 90, 122, 0.36)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, radius - 9, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = 'rgba(232, 90, 122, 0.62)'
  ctx.font = font(19, true)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(text || ''), cx, cy)
  ctx.restore()
}

// 5:4 的分享封面。一封信的正面：
//   左上——很淡的小心心
//   中上——两个名字，横排，「和」是粉色的
//   中下——一句正文
//   右下——邮戳
// card: { nameA, nameB, title, line, meta, postmark, mark }
function drawShareCard(ctx, w, h, card) {
  const data = card || {}
  const nameA = String(data.nameA || '')
  const nameB = String(data.nameB || '')
  const line = String(data.line || '')
  const meta = String(data.meta || '')
  const mark = String(data.postmark || '')
  const kicker = String(data.title || '恋爱Wrapped')

  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  // 纸底
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#FFF9FB')
  bg.addColorStop(1, '#FFF0F4')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)
  drawMesh(ctx, w, h, 'mesh-1')
  ctx.restore()

  // 信纸
  const x = 46
  const y = 46
  const cw = w - 92
  const ch = h - 92
  ctx.save()
  ctx.shadowColor = 'rgba(45, 27, 36, 0.13)'
  ctx.shadowBlur = 34
  ctx.shadowOffsetY = 12
  ctx.fillStyle = 'rgba(255, 255, 255, 0.66)'
  roundRectPath(ctx, x, y, cw, ch, 34)
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.80)'
  ctx.lineWidth = 2
  roundRectPath(ctx, x + 1, y + 1, cw - 2, ch - 2, 33)
  ctx.stroke()
  ctx.restore()

  // 封口那道渐变细线
  const edge = ctx.createLinearGradient(x, 0, x + cw, 0)
  edge.addColorStop(0, 'rgba(255, 143, 171, 0)')
  edge.addColorStop(0.30, 'rgba(255, 143, 171, 0.90)')
  edge.addColorStop(0.62, 'rgba(183, 156, 255, 0.90)')
  edge.addColorStop(1, 'rgba(255, 181, 131, 0)')
  ctx.fillStyle = edge
  ctx.fillRect(x + 84, y, cw - 168, 5)

  // 左上角一枚很淡的心
  ctx.save()
  ctx.fillStyle = 'rgba(232, 90, 122, 0.10)'
  ctx.beginPath()
  ctx.arc(x + 76, y + 78, 24, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#E85A7A'
  ctx.font = font(21, true)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('♡', x + 76, y + 77)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.restore()

  // 两个名字。「和」字号更小，颜色是粉的。
  const textX = x + 66
  const maxTextW = cw - 132
  const nameY = y + 96
  const andGap = 26

  let size = 72
  let nameAW = 0
  let nameBW = 0
  let andW = 0
  while (size > 32) {
    ctx.font = font(size, true)
    nameAW = ctx.measureText(nameA).width
    nameBW = ctx.measureText(nameB).width
    ctx.font = font(Math.round(size * 0.54), false)
    andW = ctx.measureText('和').width
    if (nameAW + nameBW + andW + andGap * 2 <= maxTextW) break
    size -= 2
  }

  ctx.fillStyle = '#2D1B24'
  ctx.font = font(size, true)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(nameA, textX, nameY)

  const andSize = Math.round(size * 0.54)
  const andX = textX + nameAW + andGap
  const andY = nameY + Math.round(size * 1.16) - andSize
  ctx.fillStyle = '#FF8FAB'
  ctx.font = font(andSize, false)
  ctx.fillText('和', andX, andY)

  ctx.fillStyle = '#2D1B24'
  ctx.font = font(size, true)
  ctx.fillText(nameB, andX + andW + andGap, nameY)

  // 中间那句
  if (line) {
    ctx.font = font(30, false)
    const bodyLines = limitLines(wrapText(ctx, line, maxTextW), 2)
    drawLines(
      ctx,
      bodyLines,
      textX,
      nameY + Math.round(size * 1.30) + 18,
      30,
      'rgba(45, 27, 36, 0.68)',
      false,
      Math.round(30 * 1.62)
    )
  }

  // 右下角邮戳
  if (mark) {
    drawPostmark(ctx, x + cw - 108, y + ch - 96, 46, mark)
  }

  ctx.restore()
  return { w: w, h: h }
}

module.exports = {
  POSTER_W: POSTER_W,
  POSTER_H: POSTER_H,
  SHARE_W: SHARE_W,
  SHARE_H: SHARE_H,
  drawSlide: drawSlide,
  drawBook: drawBook,
  drawShareCard: drawShareCard
}
