// 用画布把一页纪念册画成图片。
// 这里的单位是画布像素，不是 rpx。宽度 750，大约等于手机屏幕的宽。
// 颜色要和 app.wxss、pages/wrapped/wrapped.wxss 保持一致。
//
// 这个文件不调用 wx。页面负责准备画布，再把 ctx 传进来。

const POSTER_W = 750
const POSTER_H = 1080
const FONT = '"Smiley Sans", sans-serif'

const THEMES = {
  cream: {
    bg: '#FFF5F7',
    ink: '#2D1B24',
    muted: 'rgba(45, 27, 36, 0.66)',
    kicker: '#E85A7A',
    watermark: '#E85A7A'
  },
  rose: {
    bg: '#E85A7A',
    ink: '#FFFFFF',
    muted: 'rgba(255, 255, 255, 0.86)',
    kicker: 'rgba(255, 255, 255, 0.88)',
    watermark: '#FFFFFF'
  }
}

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

function fillCircle(ctx, x, y, r, color, alpha) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function strokeCircle(ctx, x, y, r, color, lineWidth) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function fillRoundRect(ctx, x, y, w, h, r, color, alpha) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// 每页装饰形状最多两个，和屏幕上的几何色块对应。
function drawShapes(ctx, w, h, slide) {
  const id = slide.id
  if (id === 'cover') {
    fillCircle(ctx, w + 20, 20, 230, '#FFC2D1', 1)
    fillRoundRect(ctx, 72, h - 168, 84, 84, 22, '#FF8FAB', 0.55)
    return
  }
  if (id === 'numbers') {
    fillRoundRect(ctx, w - 80, 250, 170, 420, 85, '#FFC2D1', 1)
    fillCircle(ctx, 108, h - 150, 28, '#FF8FAB', 0.75)
    return
  }
  if (id === 'start') {
    fillCircle(ctx, w + 30, h - 10, 190, '#FFC2D1', 1)
    fillRoundRect(ctx, w - 108, 72, 36, 36, 8, '#FF8FAB', 0.85)
    return
  }
  if (id === 'distance') {
    fillCircle(ctx, w + 10, 70, 120, '#FFC2D1', 1)
    return
  }
  if (id === 'phrase') {
    strokeCircle(ctx, w + 20, h - 60, 210, 'rgba(255,255,255,0.45)', 3)
    return
  }
  if (id === 'fight') {
    fillRoundRect(ctx, w - 100, 280, 150, 300, 75, '#FFC2D1', 0.95)
    return
  }
  if (id === 'story') {
    fillRoundRect(ctx, w - 116, 64, 48, 48, 12, '#FF8FAB', 0.75)
    return
  }
  if (id === 'ending') {
    fillCircle(ctx, -30, h - 20, 180, '#FFC2D1', 1)
    fillRoundRect(ctx, w - 120, 72, 40, 40, 10, '#FF8FAB', 0.8)
  }
}

function drawKicker(ctx, text, x, y, color) {
  ctx.save()
  ctx.fillStyle = color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = font(26, false)
  let cursor = x
  Array.from(String(text || '')).forEach((ch) => {
    ctx.fillText(ch, cursor, y)
    cursor += ctx.measureText(ch).width + 2
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

function drawParagraph(ctx, text, x, y, maxWidth, size, color, maxLines) {
  if (!text) return y
  ctx.font = font(size, false)
  const lines = limitLines(wrapText(ctx, text, maxWidth), maxLines)
  return drawLines(ctx, lines, x, y, size, color, false, Math.round(size * 1.55))
}

function drawTitle(ctx, text, x, y, maxWidth, maxSize, color, maxLines) {
  if (!text) return y
  const size = fitLine(ctx, text, maxWidth, maxSize, 36, true)
  ctx.font = font(size, true)
  if (ctx.measureText(text).width <= maxWidth) {
    return drawLines(ctx, [text], x, y, size, color, true, Math.round(size * 1.28))
  }
  const lines = limitLines(wrapText(ctx, text, maxWidth), maxLines || 4)
  return drawLines(ctx, lines, x, y, size, color, true, Math.round(size * 1.28))
}

function drawWatermark(ctx, w, h, theme) {
  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.rotate(-0.45)
  ctx.globalAlpha = 0.16
  ctx.fillStyle = theme.watermark
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = font(28, false)
  let row
  for (row = -7; row <= 7; row += 1) {
    ctx.fillText('演示水印    恋爱Wrapped', 0, row * 96)
  }
  ctx.restore()
}

function drawFooter(ctx, w, h, slide, options, theme) {
  const left = slide.footer || ''
  const page = options.pageLabel || ''
  let size = 24
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = font(size, false)
  while (size > 16 && ctx.measureText(left).width > w - 240) {
    size -= 1
    ctx.font = font(size, false)
  }
  ctx.fillStyle = theme.muted
  ctx.fillText(left, 72, h - 92)
  if (page) {
    ctx.textAlign = 'right'
    ctx.font = font(22, false)
    ctx.fillText(page, w - 72, h - 90)
  }
  if (options.watermark) {
    ctx.textAlign = 'left'
    ctx.font = font(22, false)
    ctx.fillStyle = theme.kicker
    ctx.fillText('演示水印', 72, h - 52)
  }
}

function drawCover(ctx, w, h, slide, theme) {
  const x = 72
  const maxWidth = w - 144
  let y = 120
  y = drawKicker(ctx, slide.kicker, x, y, theme.kicker)
  y += 28
  const sizeA = fitLine(ctx, slide.nameA, maxWidth, 84, 40, true)
  const sizeB = fitLine(ctx, slide.nameB, maxWidth - 90, 84, 40, true)
  const size = Math.min(sizeA, sizeB)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = theme.ink
  ctx.font = font(size, true)
  ctx.fillText(slide.nameA, x, y)
  y += Math.round(size * 1.16)
  const andSize = Math.max(28, Math.round(size * 0.38))
  ctx.font = font(andSize, false)
  ctx.fillStyle = '#FF8FAB'
  ctx.fillText('和', x, y + Math.round((size - andSize) * 0.82))
  const andW = ctx.measureText('和').width
  ctx.font = font(size, true)
  ctx.fillStyle = theme.ink
  ctx.fillText(slide.nameB, x + andW + 16, y)
  y += Math.round(size * 1.35)
  y = drawParagraph(ctx, slide.body, x, y, maxWidth, 30, theme.muted, 2)
  y += 8
  drawParagraph(ctx, slide.meta, x, y, maxWidth, 36, theme.ink, 2)
}

function drawNumbers(ctx, w, slide, theme) {
  const x = 72
  const maxWidth = w - 200
  let y = 110
  y = drawKicker(ctx, slide.kicker, x, y, theme.kicker)
  y += 8
  y = drawTitle(ctx, slide.title, x, y, maxWidth, 52, theme.ink, 2)
  y += 28
  ;(slide.stats || []).forEach((stat) => {
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = theme.ink
    ctx.font = font(84, true)
    ctx.fillText(stat.num, x, y)
    const numW = ctx.measureText(stat.num).width
    ctx.font = font(30, false)
    ctx.fillText(stat.unit, x + numW + 12, y + 44)
    y += 96
    ctx.font = font(28, false)
    ctx.fillStyle = theme.muted
    ctx.fillText(stat.label, x, y)
    y += 72
  })
  if (slide.note) {
    drawParagraph(ctx, slide.note, x, y + 8, maxWidth, 28, theme.muted, 3)
  }
}

function drawEssay(ctx, w, h, slide, theme) {
  const x = 72
  const maxWidth = w - 144
  let y = 120
  y = drawKicker(ctx, slide.kicker, x, y, theme.kicker)
  y += 16
  const maxSize = slide.id === 'phrase' ? 84 : 68
  y = drawTitle(ctx, slide.title, x, y, maxWidth, maxSize, theme.ink, 4)
  y += 16
  const room = h - 150 - y
  const bodySize = 32
  const bodyLines = Math.max(1, Math.min(9, Math.floor(room / (bodySize * 1.55))))
  if (slide.body) {
    y = drawParagraph(ctx, slide.body, x, y, maxWidth, bodySize, theme.muted, bodyLines)
    y += 12
  }
  if (slide.meta && y < h - 150) {
    drawParagraph(ctx, slide.meta, x, y, maxWidth, 28, theme.muted, 2)
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
  drawShapes(ctx, w, h, slide)
  if (opts.watermark) drawWatermark(ctx, w, h, theme)
  if (slide.layout === 'cover') drawCover(ctx, w, h, slide, theme)
  else if (slide.layout === 'numbers') drawNumbers(ctx, w, slide, theme)
  else drawEssay(ctx, w, h, slide, theme)
  drawFooter(ctx, w, h, slide, opts, theme)
  ctx.restore()
}

function drawBook(ctx, w, slideH, slides, options) {
  const opts = options || {}
  slides.forEach((slide, index) => {
    ctx.save()
    ctx.translate(0, index * slideH)
    drawSlide(ctx, w, slideH, slide, {
      watermark: !!opts.watermark,
      pageLabel: (index + 1) + ' / ' + slides.length
    })
    ctx.restore()
  })
}

module.exports = {
  POSTER_W,
  POSTER_H,
  drawSlide,
  drawBook
}
