// 用画布把一页纪念册画成图片。
// 这里的单位是画布像素，不是 rpx。宽度 750，大约等于手机屏幕的宽。
// 颜色全部从 utils/themes.js 取，屏幕和图片用同一份定义，不会各改各的。
//
// 这个文件不调用 wx。页面负责准备画布，再把 ctx 传进来。

const POSTER_W = 750
const POSTER_H = 1080
const FONT = '"Smiley Sans", sans-serif'

const themes = require('./themes')
const brand = require('./brand')

// 从主题定义里取一份画图用的调色板。
// muted 和 cardShadow 从字色推出来，和屏幕上的观感保持一致。
function posterTheme(id) {
  const t = themes.THEMES[themes.resolve(id)]
  return {
    id: t.id,
    bg: t.bg,
    ink: t.ink,
    kicker: t.kicker,
    btn: t.btn,
    roles: t.roles,
    hair: t.hair,
    shareBg: t.shareBg,
    muted: rgba(t.ink, 0.72),
    card: 'rgba(255, 255, 255, 0.40)',
    cardEdge: 'rgba(255, 255, 255, 0.72)',
    cardShadow: rgba(t.ink, 0.10)
  }
}

// 弥散底的几何在 utils/themes.js 的 MESH_GEO 里，屏幕和图片共用一份。
// 每层 [横向半径%, 纵向半径%, 圆心x%, 圆心y%, 角色字母, 屏幕alpha, 导出图alpha]，
// 这里用最后一列的画布 alpha。位置和大小都按画布百分比换算，不会切出硬边。

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
function drawMesh(ctx, w, h, name, theme) {
  const layers = themes.MESH_GEO[name] || themes.MESH_GEO['mesh-1']
  layers.forEach((g) => {
    blob(
      ctx,
      g[2] / 100 * w,
      g[3] / 100 * h,
      g[0] / 100 * w,
      g[1] / 100 * h,
      theme.roles[g[4]] || theme.roles.a,
      g[6],
      0.76
    )
  })
}

// 标题后面那团光。
function drawTitleGlow(ctx, x, y, w, h, theme) {
  ctx.save()
  ctx.translate(x + w * 0.26, y + h / 2)
  ctx.scale(w * 0.72, h * 1.10)
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  grad.addColorStop(0, rgba(theme.roles.a, 0.34))
  grad.addColorStop(0.42, rgba(theme.roles.a, 0.10))
  grad.addColorStop(0.7, rgba(theme.roles.a, 0))
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(0, 0, 1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// 连贯长图专用的弥散底：几摊颜色顺着长条流下去。
// 位置和大小都按整条长图的百分比写，图长图短都是一层连续的光。
const MESH_FLOW = [
  [0.08, 0.05, 0.72, 0.14, 'a', 0.58],
  [0.96, 0.20, 0.64, 0.13, 'b', 0.50],
  [0.12, 0.42, 0.66, 0.13, 'c', 0.46],
  [0.90, 0.62, 0.70, 0.14, 'd', 0.52],
  [0.48, 0.80, 0.78, 0.15, 'a', 0.50],
  [0.50, 0.34, 0.58, 0.09, 'd', 0.34]
]

function drawMeshFlow(ctx, w, h, theme) {
  MESH_FLOW.forEach((g) => {
    blob(ctx, g[0] * w, g[1] * h, g[2] * w, g[3] * h, theme.roles[g[4]], g[5], 0.78)
  })
}

// 两节之间那道居中的渐变短线。
function drawDivider(ctx, w, y, theme) {
  const lineW = Math.round(w * 0.24)
  const x0 = Math.round((w - lineW) / 2)
  const grad = ctx.createLinearGradient(x0, 0, x0 + lineW, 0)
  grad.addColorStop(0, rgba(theme.hair[0], 0))
  grad.addColorStop(0.5, rgba(theme.hair[1], 0.6))
  grad.addColorStop(1, rgba(theme.hair[2], 0))
  ctx.fillStyle = grad
  ctx.fillRect(x0, y, lineW, 3)
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

// 同上，但整行在 maxWidth 里居中。给终章这类居中排版用。
function drawSpacedCenter(ctx, text, x, y, maxWidth, color, spacing) {
  ctx.save()
  ctx.fillStyle = color
  ctx.font = font(26, false)
  const chars = Array.from(String(text || ''))
  let total = 0
  chars.forEach((ch) => {
    total += ctx.measureText(ch).width + spacing
  })
  total -= spacing
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  let cursor = x + Math.max(0, (maxWidth - total) / 2)
  chars.forEach((ch) => {
    ctx.fillText(ch, cursor, y)
    cursor += ctx.measureText(ch).width + spacing
  })
  ctx.restore()
  return y + 52
}

function drawLines(ctx, lines, x, y, size, color, bold, lineHeight, align) {
  ctx.fillStyle = color
  ctx.textAlign = align || 'left'
  ctx.textBaseline = 'top'
  ctx.font = font(size, bold)
  let cursor = y
  lines.forEach((line) => {
    ctx.fillText(line, x, cursor)
    cursor += lineHeight
  })
  return cursor
}

// 首行缩进的换行。给手记页用：第一行让出两个字宽。
function wrapIndented(ctx, text, maxWidth, indent) {
  const out = []
  String(text || '').split('\n').forEach((para) => {
    let line = ''
    let isFirst = true
    Array.from(para).forEach((ch) => {
      const limit = isFirst ? maxWidth - indent : maxWidth
      const next = line + ch
      if (line && ctx.measureText(next).width > limit) {
        out.push(line)
        line = ch
        isFirst = false
      } else {
        line = next
      }
    })
    if (line) out.push(line)
  })
  return out
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
      color: theme.ink,
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

  // 明信片：标题缩进给右上角的邮戳让位（邮戳由 drawSlide 单独画）。
  if (slide.layout === 'postcard') {
    const maxSize = 68
    const titleW = slide.stamp ? maxWidth - 170 : maxWidth
    const titleSize = fitLine(ctx, slide.title, titleW, maxSize, 36, true)
    const titleLines = limitLines(wrapText(ctx, slide.title, titleW), 3)
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

  // 旅程图：大数字 + 一条虚线两个点。
  if (slide.layout === 'journey') {
    parts.push({ type: 'kicker', text: slide.kicker, color: theme.kicker, h: 34, gap: 0, center: true })
    parts.push({
      type: 'journey',
      num: String(slide.journeyNum || ''),
      unit: String(slide.journeyUnit || ''),
      label: String(slide.journeyLabel || ''),
      h: 214,
      gap: 46
    })
    if (slide.meta) {
      parts.push({
        type: 'paragraph',
        lines: [slide.meta],
        size: 28,
        color: theme.muted,
        h: 44,
        gap: 6,
        center: true
      })
    }
    parts.push({ type: 'sign', text: slide.footer, h: 42, gap: 44 })
    return parts
  }

  // 气泡：口头禅装进一只圆角气泡，下面跟着那句小字。
  if (slide.layout === 'bubble') {
    const inner = maxWidth - 110
    const bubbleLines = limitLines(wrapText(ctx, slide.title, inner), 4)
    const bubbleLh = 72
    const bubbleH = bubbleLines.length * bubbleLh + 52
    parts.push({ type: 'kicker', text: slide.kicker, color: theme.kicker, h: 34, gap: 0, center: true })
    parts.push({
      type: 'bubble',
      lines: bubbleLines,
      lh: bubbleLh,
      bh: bubbleH,
      h: bubbleH + 30,
      gap: 40
    })
    if (slide.body) {
      const bodyLines = limitLines(wrapText(ctx, slide.body, maxWidth), 3)
      parts.push({
        type: 'paragraph',
        lines: bodyLines,
        size: 28,
        color: theme.muted,
        h: Math.round(bodyLines.length * 28 * 1.6),
        gap: 26,
        center: true
      })
    }
    parts.push({ type: 'sign', text: slide.footer, h: 42, gap: 44 })
    return parts
  }

  // 拼图：去过的地方一块一块拼起来，两列排开，左右各歪一点。
  if (slide.layout === 'puzzle') {
    const tiles = slide.tiles || []
    const cols = 2
    const gapX = 26
    const gapY = 22
    const tileW = (maxWidth - gapX) / 2
    const tileH = 112
    const rows = Math.ceil(tiles.length / cols)
    parts.push({ type: 'kicker', text: slide.kicker, color: theme.kicker, h: 34, gap: 0 })
    parts.push({
      type: 'tiles',
      tiles: tiles,
      tileW: tileW,
      tileH: tileH,
      gapX: gapX,
      gapY: gapY,
      h: rows * tileH + (rows - 1) * gapY,
      gap: 30
    })
    if (slide.meta) {
      parts.push({
        type: 'paragraph',
        lines: [slide.meta],
        size: 28,
        color: theme.muted,
        h: 44,
        gap: 20,
        center: true
      })
    }
    parts.push({ type: 'sign', text: slide.footer, h: 42, gap: 44 })
    return parts
  }

  // 手记：正文带左侧色条，首行缩进两个字。
  if (slide.layout === 'letter') {
    const maxSize = 68
    const titleSize = fitLine(ctx, slide.title, maxWidth, maxSize, 36, true)
    const titleLines = limitLines(wrapText(ctx, slide.title, maxWidth), 4)
    const bodyLines = wrapIndented(ctx, slide.body, maxWidth, 64)
    parts.push({ type: 'kicker', text: slide.kicker, color: theme.kicker, h: 34, gap: 0 })
    parts.push({
      type: 'title',
      lines: titleLines,
      size: titleSize,
      color: theme.ink,
      h: Math.round(titleLines.length * titleSize * 1.28),
      gap: 26
    })
    parts.push({
      type: 'letterBody',
      lines: bodyLines,
      h: Math.round(bodyLines.length * 32 * 1.8),
      gap: 34
    })
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

  // 终章：整页居中，像扉页的题字。
  if (slide.layout === 'finale') {
    const maxSize = 72
    const titleSize = fitLine(ctx, slide.title, maxWidth, maxSize, 36, true)
    const titleLines = limitLines(wrapText(ctx, slide.title, maxWidth), 4)
    parts.push({ type: 'kicker', text: slide.kicker, color: theme.kicker, h: 34, gap: 0, center: true })
    parts.push({
      type: 'title',
      lines: titleLines,
      size: titleSize,
      color: theme.ink,
      h: Math.round(titleLines.length * titleSize * 1.28),
      gap: 30,
      center: true
    })
    if (slide.body) {
      const bodyLines = limitLines(wrapText(ctx, slide.body, maxWidth), 3)
      parts.push({
        type: 'paragraph',
        lines: bodyLines,
        size: 30,
        color: theme.muted,
        h: Math.round(bodyLines.length * 30 * 1.7),
        gap: 30,
        center: true
      })
    }
    if (slide.meta) {
      parts.push({
        type: 'paragraph',
        lines: [slide.meta],
        size: 26,
        color: theme.muted,
        h: 40,
        gap: 14,
        center: true
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
function drawSign(ctx, text, x, y, maxWidth, theme) {
  const lineW = Math.round(maxWidth * 0.5)
  const grad = ctx.createLinearGradient(x, 0, x + lineW, 0)
  grad.addColorStop(0, rgba(theme.ink, 0.16))
  grad.addColorStop(1, rgba(theme.ink, 0))
  ctx.fillStyle = grad
  ctx.fillRect(x, y, lineW, 2)
  ctx.fillStyle = rgba(theme.ink, 0.42)
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
      if (part.center) {
        drawSpacedCenter(ctx, part.text, x, cursor, maxWidth, part.color, 5)
      } else {
        drawSpaced(ctx, part.text, x, cursor, part.color, 5)
      }
      cursor += part.h
      return
    }
    if (part.type === 'names') {
      const size = part.size
      drawTitleGlow(ctx, x - 12, cursor - 20, maxWidth, Math.round(size * 1.16) + 40, theme)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillStyle = part.color
      ctx.font = font(size, true)
      ctx.fillText(part.nameA, x, cursor)
      cursor += Math.round(size * 1.16)
      const andSize = Math.max(28, Math.round(size * 0.38))
      ctx.font = font(andSize, false)
      ctx.fillStyle = theme.roles.a
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
      if (part.center) {
        drawTitleGlow(ctx, x + maxWidth * 0.24, cursor - 20, maxWidth, part.h + 30, theme)
        drawLines(ctx, part.lines, x + maxWidth / 2, cursor, part.size, part.color, true, lineHeight, 'center')
      } else {
        drawTitleGlow(ctx, x - 12, cursor - 20, maxWidth, part.h + 30, theme)
        drawLines(ctx, part.lines, x, cursor, part.size, part.color, true, lineHeight)
      }
      cursor += part.h
      return
    }
    if (part.type === 'paragraph') {
      drawLines(ctx, part.lines, part.center ? x + maxWidth / 2 : x, cursor, part.size, part.color, false, Math.round(part.size * 1.6), part.center ? 'center' : 'left')
      cursor += part.h
      return
    }
    if (part.type === 'journey') {
      const centerX = x + maxWidth / 2
      const numSize = 100
      const unitSize = 30
      ctx.font = font(numSize, true)
      const numW = ctx.measureText(part.num).width
      ctx.font = font(unitSize, false)
      const unitW = ctx.measureText(part.unit).width
      const startX = centerX - (numW + 14 + unitW) / 2
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = theme.ink
      ctx.font = font(numSize, true)
      ctx.fillText(part.num, startX, cursor + numSize)
      ctx.fillStyle = theme.muted
      ctx.font = font(unitSize, false)
      ctx.fillText(part.unit, startX + numW + 14, cursor + numSize - 10)
      const lineY = cursor + numSize + 52
      const lineX0 = x + maxWidth * 0.12
      const lineX1 = x + maxWidth * 0.88
      ctx.strokeStyle = rgba(theme.roles.a, 0.5)
      ctx.lineWidth = 3.5
      ctx.setLineDash([10, 12])
      ctx.beginPath()
      ctx.moveTo(lineX0, lineY)
      ctx.lineTo(lineX1, lineY)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = rgba(theme.roles.a, 0.9)
      ;[lineX0, lineX1].forEach((px) => {
        ctx.beginPath()
        ctx.arc(px, lineY, 9, 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.fillStyle = theme.muted
      ctx.font = font(30, false)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(part.label, centerX, lineY + 30)
      cursor += part.h
      return
    }
    if (part.type === 'bubble') {
      const bw = maxWidth - 40
      const bx = x + 20
      const bh = part.bh
      ctx.fillStyle = rgba(theme.roles.a, 0.16)
      roundRectPath(ctx, bx, cursor, bw, bh, 30)
      ctx.fill()
      ctx.fillStyle = rgba(theme.kicker, 0.55)
      ctx.font = font(42, true)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText('「', bx + 26, cursor + 14)
      ctx.fillText('」', bx + bw - 64, cursor + bh - 52)
      // 正文用墨色压住气泡：口语也要一眼看到，主题色只留给引号。
      ctx.fillStyle = theme.ink
      ctx.font = font(50, true)
      ctx.textAlign = 'center'
      let ty = cursor + 26
      part.lines.forEach((line) => {
        ctx.fillText(line, bx + bw / 2, ty)
        ty += part.lh
      })
      ctx.beginPath()
      ctx.moveTo(bx + bw / 2 - 12, cursor + bh)
      ctx.lineTo(bx + bw / 2 + 12, cursor + bh)
      ctx.lineTo(bx + bw / 2, cursor + bh + 16)
      ctx.closePath()
      ctx.fill()
      cursor += part.h
      return
    }
    if (part.type === 'letterBody') {
      const size = 32
      const lh = Math.round(size * 1.8)
      const indent = 64
      ctx.fillStyle = rgba(theme.roles.a, 0.55)
      roundRectPath(ctx, x - 20, cursor + 8, 6, Math.max(24, part.h - 16), 3)
      ctx.fill()
      ctx.fillStyle = theme.muted
      ctx.font = font(size, false)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      let ly = cursor
      part.lines.forEach((line, index) => {
        ctx.fillText(line, x + (index === 0 ? indent : 0), ly)
        ly += lh
      })
      cursor += part.h
      return
    }
    if (part.type === 'tiles') {
      const colors = [theme.roles.a, theme.roles.b, theme.roles.c, theme.roles.d]
      part.tiles.forEach((tile, index) => {
        const col = index % 2
        const row = Math.floor(index / 2)
        const x0 = x + col * (part.tileW + part.gapX)
        const y0 = cursor + row * (part.tileH + part.gapY)
        ctx.save()
        // 左右两列各自歪一点，像随手拼上去的。
        ctx.translate(x0 + part.tileW / 2, y0 + part.tileH / 2)
        ctx.rotate((col === 0 ? -1 : 1) * 0.02)
        const hw = part.tileW / 2
        const hh = part.tileH / 2
        ctx.fillStyle = rgba(colors[index % 4], 0.18)
        roundRectPath(ctx, -hw, -hh, part.tileW, part.tileH, 26)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
        ctx.lineWidth = 2
        roundRectPath(ctx, -hw + 1, -hh + 1, part.tileW - 2, part.tileH - 2, 25)
        ctx.stroke()
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillStyle = theme.ink
        // 没收录的长地名也可能塞进来，塞不下就缩字号。
        const nameSize = fitLine(ctx, tile.name, part.tileW - 48, 34, 20, true)
        ctx.font = font(nameSize, true)
        ctx.fillText(tile.name, -hw + 26, -hh + 20)
        if (tile.dist) {
          ctx.fillStyle = theme.muted
          ctx.font = font(22, false)
          ctx.fillText(tile.dist, -hw + 26, -hh + 64)
        }
        if (tile.far) {
          const label = '最远'
          ctx.font = font(20, false)
          const badgeW = ctx.measureText(label).width + 28
          ctx.fillStyle = rgba(theme.kicker, 0.92)
          roundRectPath(ctx, hw - badgeW - 14, -hh - 12, badgeW, 38, 19)
          ctx.fill()
          ctx.fillStyle = '#FFFFFF'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(label, hw - badgeW / 2 - 14, -hh - 12 + 19)
        }
        ctx.restore()
      })
      cursor += part.h
      return
    }
    if (part.type === 'pill') {
      ctx.font = font(27, false)
      const textW = ctx.measureText(part.text || '').width
      const boxW = textW + 56
      ctx.fillStyle = rgba(theme.roles.a, 0.16)
      roundRectPath(ctx, x, cursor, boxW, part.h, part.h / 2)
      ctx.fill()
      ctx.fillStyle = theme.kicker
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
      ctx.textAlign = part.center ? 'center' : 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(part.text || '', part.center ? x + maxWidth / 2 : x, cursor)
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

// 明信片右上角的邮票式邮戳：外圈实线、内圈虚线，年份在上、月日在下。
// 和屏幕上的 .stamp 一样歪 6 度。
function drawStamp(ctx, cx, cy, r, stamp, color) {
  const seg = String(stamp || '').split('.')
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(-0.105)
  cx = 0
  cy = 0
  ctx.strokeStyle = rgba(color, 0.5)
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 1.5
  ctx.setLineDash([3, 5])
  ctx.beginPath()
  ctx.arc(cx, cy, r - 8, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = rgba(color, 0.85)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (seg.length >= 3) {
    ctx.font = font(20, false)
    ctx.fillText(seg[0], cx, cy - 15)
    ctx.font = font(26, true)
    ctx.fillText(seg[1] + '.' + seg[2], cx, cy + 14)
  } else {
    ctx.font = font(22, true)
    ctx.fillText(String(stamp || ''), cx, cy)
  }
  ctx.restore()
}

function drawSlide(ctx, w, h, slide, options) {
  const theme = posterTheme(slide.theme)
  const opts = options || {}
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, w, h)
  ctx.clip()
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, w, h)

  drawMesh(ctx, w, h, slide.mesh, theme)

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
  line.addColorStop(0, rgba(theme.roles.a, 0))
  line.addColorStop(0.26, rgba(theme.roles.a, 0.9))
  line.addColorStop(0.58, rgba(theme.roles.b, 0.9))
  line.addColorStop(1, rgba(theme.roles.c, 0))
  ctx.fillStyle = line
  ctx.fillRect(cardX + card.padX, cardY, cardW - card.padX * 2, 6)

  drawParts(ctx, mainParts, cardX + card.padX, mainY, theme, maxWidth)
  if (signPart) drawSign(ctx, signPart.text, cardX + card.padX, signY, maxWidth, theme)

  // 明信片的邮戳钉在卡片右上角。
  if (slide.layout === 'postcard' && slide.stamp) {
    drawStamp(ctx, cardX + cardW - card.padX - 52, cardY + card.hairline + 66, 58, slide.stamp, theme.kicker)
  }

  drawFooter(ctx, w, h, slide, opts, theme)
  ctx.restore()
}

// ---------- 连贯长图 ----------
// 整本导出不再是一页接一页地拼，而是一整条：
//   一张卡从顶贯到底，弥散光顺着长条流下去，
//   每一节保留自己专属的排版（邮戳、旅程、气泡、色条），
//   节与节之间一道居中的渐变短线，落款只在最末尾出现一次。

// 两节之间留出的呼吸。
const BOOK_SECTION_GAP = 96

// 封底多留一行的空间：落款下面还要带一句小程序引导。
const BOOK_END_EXTRA = 40

// 第一步：先量。每一节用 buildParts 排出来、量出高度，
// 汇总成整条长图的总高度。画布要按这个高度来建。
function planBook(ctx, w, slides) {
  const first = slides[0] || {}
  const theme = posterTheme(first.theme)
  const card = CARD
  const maxWidth = w - card.side * 2 - card.padX * 2
  const sections = []
  slides.forEach((slide) => {
    const all = buildParts(ctx, slide, theme, maxWidth)
    const parts = all.filter((part) => part.type !== 'sign')
    sections.push({
      slide: slide,
      parts: parts,
      h: partsHeight(parts)
    })
  })
  let contentH = 0
  sections.forEach((sec, index) => {
    contentH += sec.h + (index > 0 ? BOOK_SECTION_GAP : 0)
  })
  const totalH = Math.round(
    card.top + card.hairline + card.padTop
    + contentH
    // 封底不再画昵称落款，只在末尾留一段呼吸和两行小字。
    + SIGN_GAP + card.padBottom + card.bottom + BOOK_END_EXTRA
  )
  return {
    theme: theme,
    sections: sections,
    totalH: totalH,
    maxWidth: maxWidth
  }
}

// 第二步：按量好的高度画。传入 planBook 的结果。
function drawBookPlanned(ctx, w, plan, options) {
  const opts = options || {}
  const theme = plan.theme
  const card = CARD
  const h = plan.totalH
  const cardX = card.side
  const cardW = w - card.side * 2

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, w, h)
  ctx.clip()
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, w, h)
  drawMeshFlow(ctx, w, h, theme)

  // 一整张卡，从顶贯到底。
  ctx.save()
  ctx.shadowColor = theme.cardShadow
  ctx.shadowBlur = 40
  ctx.shadowOffsetY = 16
  ctx.fillStyle = theme.card
  roundRectPath(ctx, cardX, card.top, cardW, h - card.top - card.bottom, card.radius)
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = theme.cardEdge
  ctx.lineWidth = 2
  roundRectPath(ctx, cardX + 1, card.top + 1, cardW - 2, h - card.top - card.bottom - 2, card.radius - 1)
  ctx.stroke()
  ctx.restore()

  const line = ctx.createLinearGradient(cardX, 0, cardX + cardW, 0)
  line.addColorStop(0, rgba(theme.roles.a, 0))
  line.addColorStop(0.26, rgba(theme.roles.a, 0.9))
  line.addColorStop(0.58, rgba(theme.roles.b, 0.9))
  line.addColorStop(1, rgba(theme.roles.c, 0))
  ctx.fillStyle = line
  ctx.fillRect(cardX + card.padX, card.top, cardW - card.padX * 2, 6)

  let cursor = card.top + card.hairline + card.padTop
  plan.sections.forEach((sec, index) => {
    if (index > 0) {
      cursor += BOOK_SECTION_GAP / 2
      drawDivider(ctx, w, cursor, theme)
      cursor += BOOK_SECTION_GAP / 2
    }
    // 明信片节的邮戳钉在节的右上角。
    if (sec.slide.layout === 'postcard' && sec.slide.stamp) {
      drawStamp(ctx, cardX + cardW - card.padX - 52, cursor + 66, 58, sec.slide.stamp, theme.kicker)
    }
    drawParts(ctx, sec.parts, cardX + card.padX, cursor, theme, plan.maxWidth)
    cursor += sec.h
  })

  // 封底：像一本书的最后一句，居中、很轻；下面再带一句小程序引导。
  // 长图不再画昵称落款——封面已经并肩写过两个名字，这里不再重复。
  const endY = h - card.bottom - 26 - BOOK_END_EXTRA
  ctx.fillStyle = rgba(theme.ink, 0.34)
  ctx.font = font(20, false)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(brand.APP_NAME + ' · ' + new Date().getFullYear() + ' · 只印了这一份', w / 2, endY)
  ctx.fillStyle = rgba(theme.kicker, 0.62)
  ctx.fillText('微信搜索「恋爱Wrapped」小程序，也能写一本你自己的', w / 2, endY + 30)

  ctx.restore()
}

// ---------- 分享卡片 ----------
// 转发到聊天里的封面图。5:4，750 x 600。
const SHARE_W = 750
const SHARE_H = 600

// 信纸右下的一枚日期戳：两道圆角细线，框住「写于 yyyy.mm.dd」。
// 宽度按文字自适应，任何日期都正好嵌在框里。
function drawPostmark(ctx, right, bottom, text, color) {
  const t = String(text || '')
  if (!t) return
  ctx.save()
  ctx.font = font(26, true)
  const tw = ctx.measureText(t).width
  const padX = 30
  const bh = 64
  const bw = Math.round(tw + padX * 2)
  const x0 = right - bw
  const y0 = bottom - bh
  ctx.strokeStyle = rgba(color, 0.36)
  ctx.lineWidth = 2
  roundRectPath(ctx, x0, y0, bw, bh, bh / 2)
  ctx.stroke()
  ctx.strokeStyle = rgba(color, 0.20)
  roundRectPath(ctx, x0 + 5, y0 + 5, bw - 10, bh - 10, (bh - 10) / 2)
  ctx.stroke()
  ctx.fillStyle = rgba(color, 0.66)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(t, x0 + bw / 2, y0 + bh / 2 + 1)
  ctx.restore()
}

// 5:4 的分享封面。一封信的正面：
//   左上——很淡的小心心
//   中上——两个名字，横排，「和」用主题主色
//   中下——一句正文
//   右下——写册日期的戳
// card: { nameA, nameB, title, line, meta, postmark, theme }
function drawShareCard(ctx, w, h, card) {
  const data = card || {}
  const nameA = String(data.nameA || '')
  const nameB = String(data.nameB || '')
  const line = String(data.line || '')
  const meta = String(data.meta || '')
  const mark = String(data.postmark || '')
  const theme = posterTheme(data.theme)
  const kicker = String(data.title || brand.APP_NAME)

  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  // 纸底
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, theme.shareBg[0])
  bg.addColorStop(1, theme.shareBg[1])
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)
  drawMesh(ctx, w, h, 'mesh-1', theme)
  ctx.restore()

  // 信纸
  const x = 46
  const y = 46
  const cw = w - 92
  const ch = h - 92
  ctx.save()
  ctx.shadowColor = rgba(theme.ink, 0.13)
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
  edge.addColorStop(0, rgba(theme.roles.a, 0))
  edge.addColorStop(0.30, rgba(theme.roles.a, 0.90))
  edge.addColorStop(0.62, rgba(theme.roles.b, 0.90))
  edge.addColorStop(1, rgba(theme.roles.c, 0))
  ctx.fillStyle = edge
  ctx.fillRect(x + 84, y, cw - 168, 5)

  // 左上角一枚很淡的心
  ctx.save()
  ctx.fillStyle = rgba(theme.kicker, 0.10)
  ctx.beginPath()
  ctx.arc(x + 76, y + 78, 24, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = theme.kicker
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

  ctx.fillStyle = theme.ink
  ctx.font = font(size, true)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(nameA, textX, nameY)

  const andSize = Math.round(size * 0.54)
  const andX = textX + nameAW + andGap
  const andY = nameY + Math.round(size * 1.16) - andSize
  ctx.fillStyle = theme.roles.a
  ctx.font = font(andSize, false)
  ctx.fillText('和', andX, andY)

  ctx.fillStyle = theme.ink
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
      rgba(theme.ink, 0.68),
      false,
      Math.round(30 * 1.62)
    )
  }

  // 右下角日期戳：写这一册的日子
  if (mark) {
    drawPostmark(ctx, x + cw - 26, y + ch - 26, mark, theme.kicker)
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
  planBook: planBook,
  drawBookPlanned: drawBookPlanned,
  drawShareCard: drawShareCard
}
