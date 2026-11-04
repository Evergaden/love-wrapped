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

// 一团柔和的色晕。和屏幕上的 radial-gradient 同一个办法：
// 颜色从中间往外化开，没有硬边，也没有被切出的直线。
function softBlob(ctx, cx, cy, rx, ry, color, alpha) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(rx, ry)
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  grad.addColorStop(0, rgba(color, alpha))
  grad.addColorStop(0.29, rgba(color, alpha * 0.45))
  grad.addColorStop(0.48, rgba(color, alpha * 0.14))
  grad.addColorStop(0.62, rgba(color, 0))
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(0, 0, 1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// 每页装饰最多两块色晕，和屏幕上的装饰对应。
function drawShapes(ctx, w, h, slide) {
  const id = slide.id
  if (id === 'cover') {
    softBlob(ctx, 490, 250, 230, 230, '#FF8FAB', 0.20)
    softBlob(ctx, 450, 330, 110, 110, '#FFC2D1', 0.45)
    return
  }
  if (id === 'numbers') {
    softBlob(ctx, 530, 470, 190, 290, '#FF8FAB', 0.15)
    softBlob(ctx, 615, 130, 95, 95, '#FFC2D1', 0.45)
    return
  }
  if (id === 'start') {
    softBlob(ctx, 510, h - 250, 210, 210, '#FFC2D1', 0.36)
    return
  }
  if (id === 'distance') {
    softBlob(ctx, 540, 220, 170, 170, '#FFC2D1', 0.38)
    return
  }
  if (id === 'phrase') {
    softBlob(ctx, 500, h - 260, 220, 220, '#FFFFFF', 0.18)
    return
  }
  if (id === 'fight') {
    softBlob(ctx, 550, 480, 160, 270, '#FFC2D1', 0.30)
    return
  }
  if (id === 'story') {
    softBlob(ctx, 580, 180, 130, 130, '#FFC2D1', 0.32)
    return
  }
  if (id === 'ending') {
    softBlob(ctx, 240, h - 250, 210, 210, '#FFC2D1', 0.34)
    softBlob(ctx, 600, 150, 100, 100, '#FFC2D1', 0.28)
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
