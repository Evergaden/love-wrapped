// 把一份答案变成纪念册的每一页。
//
// 固定 6 页：封面、数字、起点、口头禅、故事、结尾。
// 只有填了「距离」或「吵架」才多出页面。
// 问卷的填写顺序和这里的翻页顺序不一样：问卷好填，纪念册按讲述来排。
//
// 不要在这里加消费、底线、原生家庭、分手或双人问答。

const record = require('./record')
const themes = require('./themes')
const brand = require('./brand')
const geo = require('./geo')
const festivals = require('./festivals')

function titleSize(text) {
  const n = record.charCount(text)
  if (n <= 16) return 'xl'
  if (n <= 28) return 'lg'
  if (n <= 42) return 'md'
  return 'sm'
}

function coverSize(nameA, nameB) {
  const n = Math.max(record.charCount(nameA), record.charCount(nameB))
  if (n <= 4) return 'xl'
  if (n <= 6) return 'lg'
  if (n <= 8) return 'md'
  return 'sm'
}

function footerOf(me, them) {
  return me + ' · ' + them
}

function buildSlides(raw, today, themeId) {
  const a = record.normalize(raw || {})
  const now = today || new Date()
  const info = record.togetherInfo(a.togetherDate, now)
  const dateText = record.formatDate(a.togetherDate)
  const me = a.myNickname || '你'
  const them = a.theirNickname || 'TA'
  const footer = footerOf(me, them)
  const theme = themes.resolve(themeId)
  const slides = []
  // 下一个整百天/周年，封面和数字页共用。
  const milestone = info && !info.future ? record.nextMilestone(a.togetherDate, now) : null

  // 1. 封面
  let coverMeta = '选好日期后，天数会出现在这里'
  let coverBody = '还没有开始的日子'
  if (info && info.future) {
    coverBody = dateText + '，还没到'
    coverMeta = '还有 ' + info.days + ' 天'
  } else if (info) {
    coverBody = dateText + '起'
    coverMeta = '在一起的第 ' + info.days + ' 天'
    if (milestone && milestone.days === 0) {
      coverMeta += '，' + milestone.label.replace('就', '今天')
    }
  }
  slides.push({
    id: 'cover',
    mesh: 'mesh-1',
    layout: 'cover',
    theme: theme,
    kicker: brand.APP_NAME,
    nameA: me,
    nameB: them,
    coverOneLine: record.charCount(me) + record.charCount(them) <= 6,
    nameSize: record.charCount(me) + record.charCount(them) <= 4
      ? 'xl'
      : (record.charCount(me) + record.charCount(them) <= 6 ? 'lg' : coverSize(me, them)),
    body: coverBody,
    meta: coverMeta,
    footer: footer
  })

  // 2. 数字。只放天数和饭；称号单独一页，去过的地方单独一页。
  const stats = []
  if (info && info.future) {
    stats.push({ num: String(info.days), unit: '天', label: '之后，就是这一天' })
  } else if (info) {
    stats.push({ num: String(info.days), unit: '天', label: '在一起' })
    // 第二行预告：优先说节气和传统节日——比整百天更有日子感。
    // 今天正好是周年/整百天时，还是先说自己的纪念日。
    if (milestone && milestone.days === 0) {
      stats.push({ num: '今天', unit: '', label: '正好' + milestone.label.replace('就', '') })
    } else {
      const fest = festivals.coupleFestival(a.togetherDate, now)
      if (fest) {
        // 一起过的次数和要来的日子合成一句话：
        //   「1 天后，就是你们的第 4 个立冬」「正好是你们的第 4 个立冬」
        // 第一次赶上的说成「第一个」，不说「过 0 个」。
        const nth = (n) => (n === 1 ? '第一个' : '第 ' + n + ' 个')
        stats.push(fest.days === 0
          ? { num: '今天', unit: '', label: '正好是你们的' + nth(fest.passed) + fest.name }
          : { num: String(fest.days), unit: '天', label: '后，就是你们的' + nth(fest.passed + 1) + fest.name })
      } else if (milestone) {
        stats.push({ num: String(milestone.days), unit: '天', label: '之后，' + milestone.label })
      }
    }
  }
  // 旧数据里只有城市数量：没有去过的地方，就照旧用数字占一行。
  const places = geo.splitPlaces(a.places)
  if (!places.length && a.cityCount !== '') {
    stats.push({ num: a.cityCount, unit: '座', label: '一起去过的城市' })
  }
  const MEAL_PER_DAY = {
    daily: 1,
    often: 5 / 7,
    few: 1 / 7
  }
  if (a.mealMode === 'lost') {
    stats.push({ num: '数不清', unit: '', label: '一起吃过的饭' })
  } else if (a.mealMode && info) {
    const est = Math.max(1, Math.round(info.days * MEAL_PER_DAY[a.mealMode]))
    stats.push({ num: '≈ ' + est, unit: '顿', label: '一起吃过的饭' })
  } else if (a.mealCount !== '') {
    // 旧缓存里直接填过的顿数，照旧显示。
    stats.push({ num: a.mealCount, unit: '顿', label: '一起吃过的饭' })
  }

  const mealEstimated = a.mealMode === 'daily' || a.mealMode === 'often' || a.mealMode === 'few'
  let note = ''
  if (!info) {
    note = '选好在一起的日子后，天数会出现在这里。'
  } else if (a.mealMode === 'lost') {
    note = '饭是数不清的，就让它数不清吧。'
  } else if (mealEstimated) {
    note = '「顿」是按你们在一起的天数估的，差不多就好。'
  } else if (a.mealCount === '' && !a.mealMode) {
    note = '饭还没写，只有日子先站在这里。'
  }
  slides.push({
    id: 'numbers',
    mesh: 'mesh-2',
    layout: 'numbers',
    theme: theme,
    kicker: '数字',
    title: '这些，我们走过',
    titleSize: 'md',
    stats: stats,
    note: note,
    footer: footer
  })

  // 3. 起点。填了地点就是一张「明信片」：日期缩成右上角的邮戳，
  //    没填就还是普通的一页，免得空邮戳很奇怪。
  if (a.firstDatePlace) {
    let stamp = ''
    let stampTop = ''
    let stampBottom = ''
    if (record.isYmd(a.togetherDate)) {
      const seg = a.togetherDate.split('-')
      stamp = seg.join('.')
      stampTop = seg[0]
      stampBottom = seg[1] + '.' + seg[2]
    }
    const homeCity = geo.find(a.homeCity)
    const firstCity = geo.find(a.firstDatePlace)
    let postMeta = ''
    if (homeCity && firstCity) {
      const firstKm = geo.distanceKm(homeCity, firstCity)
      if (firstKm > 50) postMeta = '离家 ≈ ' + firstKm + ' 公里'
    }
    slides.push({
      id: 'start',
      mesh: 'mesh-3',
      layout: 'postcard',
      theme: theme,
      kicker: '起点',
      title: a.firstDatePlace,
      titleSize: titleSize(a.firstDatePlace),
      body: '后来很多天，都是从这里开始的。',
      meta: postMeta,
      stamp: stamp,
      stampTop: stampTop,
      stampBottom: stampBottom,
      stampStyle: stamp
        ? 'color: ' + themes.pick(theme).kicker + '; border-color: ' + themes.tint(theme, 'a', 0.5)
        : '',
      footer: footer
    })
  } else {
    slides.push({
      id: 'start',
      mesh: 'mesh-3',
      layout: 'essay',
      theme: theme,
      kicker: '起点',
      title: '还没写地点',
      titleSize: 'lg',
      body: '第一次约会的地方，记得的话可以补上。',
      meta: dateText,
      footer: footer
    })
  }

  // 去过的地方：单开一页拼图。一块一个城市，
  // 认得出的标上离家多远，最远的那块挂个「最远」。
  const placeNames = geo.splitPlaces(a.places)
  if (placeNames.length) {
    const home = geo.find(a.homeCity)
    const tiles = placeNames.slice(0, 8).map((name, index) => {
      const city = geo.find(name)
      const km = home && city ? geo.distanceKm(home, city) : null
      return {
        name: city ? city.name : name,
        km: km,
        // 家本身就是 0 公里，那就不写数字，写「就在家里」。
        dist: km === null ? '' : (km === 0 ? '就在家里' : '≈ ' + km + ' 公里'),
        far: false,
        bgStyle: 'background: ' + themes.tint(theme, ['a', 'b', 'c', 'd'][index % 4], 0.18)
      }
    })
    let farTile = null
    tiles.forEach((tile) => {
      if (tile.km !== null && tile.km > 50 && (!farTile || tile.km > farTile.km)) farTile = tile
    })
    if (farTile) farTile.far = true
    slides.push({
      id: 'cities',
      mesh: 'mesh-2',
      layout: 'puzzle',
      theme: theme,
      kicker: '去过的地方',
      tiles: tiles,
      meta: farTile
        ? '离家里最远的一块，是' + farTile.name + '。'
        : (home ? '' : '写下现居的城市，这里会标出每块离家里多远。'),
      footer: footer
    })
  }

  // 距离：选填。两座城市都认得出就按直线推算；
  // 推不出来用填的公里兜底；同城把 0 公里说得温柔一点。
  const journeyTint = {
    journeyLine: 'border-color: ' + themes.tint(theme, 'a', 0.5),
    journeyDot: 'background: ' + themes.tint(theme, 'a', 0.9)
  }
  let myCity = null
  let theirCity = null
  let autoKm = null
  if (a.distanceMode === 'ldr') {
    myCity = geo.find(a.myCity)
    theirCity = geo.find(a.theirCity)
    autoKm = myCity && theirCity ? geo.distanceKm(myCity, theirCity) : null
  }
  const journeyNumSize = (num) => {
    const digits = String(num).length
    return digits >= 5 ? 92 : (digits === 4 ? 122 : 150)
  }
  if (a.distanceMode === 'ldr' && autoKm !== null) {
    slides.push(Object.assign({
      id: 'distance',
      mesh: 'mesh-4',
      layout: 'journey',
      theme: theme,
      kicker: '距离',
      journeyNumSize: journeyNumSize(autoKm),
      journeyNum: String(autoKm),
      journeyUnit: '公里',
      journeyLabel: '从' + myCity.name + '到' + theirCity.name + '。',
      // 异地的公里数不必解释怎么算的，恋爱年报里没有人纠结这个。
      meta: autoKm === 0 ? '0 公里，想见就能见到' : '',
      footer: footer
    }, journeyTint))
  } else if (a.distanceMode === 'ldr' && a.distanceKm) {
    slides.push(Object.assign({
      id: 'distance',
      mesh: 'mesh-4',
      layout: 'journey',
      theme: theme,
      kicker: '距离',
      journeyNumSize: journeyNumSize(a.distanceKm),
      journeyNum: a.distanceKm,
      journeyUnit: '公里',
      journeyLabel: '人在两座城。',
      meta: '异地',
      footer: footer
    }, journeyTint))
  } else if (a.distanceMode === 'same' && (a.meetMode || a.meetCount)) {
    // 同城：见面次数谁记得住，按频率估，或者干脆写「数不清」。
    const MEET_PER_DAY = { daily: 1, often: 5 / 7, few: 1 / 7 }
    let meetNum = ''
    let meetUnit = '面'
    let meetLabel = '见过面'
    if (a.meetMode === 'lost') {
      meetNum = '数不清'
      meetUnit = ''
    } else if (a.meetMode && info) {
      meetNum = String(Math.max(1, Math.round(info.days * MEET_PER_DAY[a.meetMode])))
      meetLabel = '见过的面（按天数估）'
    } else {
      meetNum = a.meetCount
      meetUnit = '次'
      meetLabel = '见过这么多次面'
    }
    slides.push(Object.assign({
      id: 'distance',
      mesh: 'mesh-4',
      layout: 'journey',
      theme: theme,
      kicker: '同城',
      journeyNumSize: journeyNumSize(meetNum),
      journeyNum: meetNum,
      journeyUnit: meetUnit,
      journeyLabel: meetLabel,
      meta: '0 公里，想见就能见到',
      footer: footer
    }, journeyTint))
  } else if (a.distanceMode === 'ldr') {
    slides.push({
      id: 'distance',
      mesh: 'mesh-4',
      layout: 'essay',
      theme: theme,
      kicker: '距离',
      title: '人在两座城',
      titleSize: 'xl',
      body: '相隔多远，可以以后再补。',
      meta: '异地',
      footer: footer
    })
  } else if (a.distanceMode === 'same') {
    slides.push({
      id: 'distance',
      mesh: 'mesh-4',
      layout: 'essay',
      theme: theme,
      kicker: '同城',
      title: '同在一座城',
      titleSize: 'xl',
      body: '想见就能见。见面的频率，想起来再补。',
      meta: '0 公里，想见就能见到',
      footer: footer
    })
  }

  // 4. 口头禅。写了就装进一只「气泡」里，像 TA 在耳边说这句话。
  if (a.catchphrase) {
    slides.push({
      id: 'phrase',
      mesh: 'mesh-5',
      layout: 'bubble',
      theme: theme,
      kicker: '口头禅',
      title: a.catchphrase,
      body: '听到的时候，就会想起你。',
      // 正文用墨色压住气泡，引号留给主题色做点缀：一句口语，要像认真写下来的话。
      bubbleStyle: 'background: ' + themes.tint(theme, 'a', 0.16),
      bubbleTextStyle: 'color: ' + themes.pick(theme).ink,
      bubbleMarkStyle: 'color: ' + themes.pick(theme).kicker,
      bubbleTailStyle: 'border-bottom-color: ' + themes.tint(theme, 'a', 0.16),
      meta: '',
      footer: footer
    })
  } else {
    slides.push({
      id: 'phrase',
      mesh: 'mesh-5',
      layout: 'essay',
      theme: theme,
      kicker: '留白',
      title: '还没写',
      titleSize: 'xl',
      body: '那句常说的话，想起来就补上。',
      meta: '',
      footer: footer
    })
  }

  // 吵架：选填。次数或「谁先道歉」写了任意一项才出现。
  // 排版补全：先道歉/平均频率/和好速度做成胶囊，页面不再空。
  if (a.fightCount !== '' || a.whoApologized) {
    const fightN = a.fightCount === '' ? null : Number(a.fightCount)
    const fightDays = info && !info.future ? info.days : null
    const whoText = { me: '我', them: 'TA', both: '我们同时' }[a.whoApologized] || ''
    const chips = []
    if (whoText) chips.push({ text: '先道歉：' + whoText, role: 'a' })
    if (fightN !== null && fightN >= 1 && fightDays && fightDays / fightN >= 2) {
      chips.push({ text: '平均每 ' + Math.round(fightDays / fightN) + ' 天一次', role: 'b' })
    }
    if (fightN === 0) chips.push({ text: '和好速度：瞬间', role: 'c' })
    const fightTitle = fightN === 0 ? '一次都没红过脸' : (fightN !== null ? fightN + ' 次' : '吵过的那些天')
    const useFightLayout = fightN === 0 || chips.length > 0
    chips.forEach((chip, index) => {
      chip.bgStyle = 'background: ' + themes.tint(theme, ['a', 'b', 'c'][index % 3], 0.16)
    })
    slides.push({
      id: 'fight',
      mesh: 'mesh-5',
      layout: useFightLayout ? 'fight' : 'essay',
      theme: theme,
      kicker: '吵架',
      title: fightTitle,
      titleSize: titleSize(fightTitle),
      body: useFightLayout ? '' : '谁先开口，这页先留白。',
      chips: chips,
      meta: '吵完，还是想把好吃的留给你。',
      footer: footer
    })
  }

  // 4.5 爱吃的东西：两张小卡，一人一张。紧跟着吵架页那句「好吃的留给你」。
  const norm = record.normalize(a)
  const myFood = norm.myFave || (norm.faveFoods ? norm.faveFoods.split(/[、，,]/)[0] || '' : '')
  const theirFood = norm.theirFave || (norm.faveFoods ? norm.faveFoods.split(/[、，,]/)[1] || '' : '')
  if (myFood || theirFood) {
    slides.push({
      id: 'fave',
      mesh: 'mesh-4',
      layout: 'fave',
      theme: theme,
      kicker: '口味',
      title: '最爱吃的东西',
      titleSize: 'lg',
      cards: [
        { cap: '我的', text: myFood || '还没写', empty: !myFood, bgStyle: 'background: ' + themes.tint(theme, 'a', 0.16) },
        { cap: 'TA 的', text: theirFood || '还没写', empty: !theirFood, bgStyle: 'background: ' + themes.tint(theme, 'b', 0.16) }
      ],
      meta: '口味这种事，不用一样。',
      footer: footer
    })
  }

  // 5. 一件小事。写了就是一页「手记」：左侧一道色条，正文首行缩进；
  //    短的事照样放大当标题，长的放进正文。
  const letterBar = 'background: ' + themes.tint(theme, 'a', 0.55)
  if (!a.story) {
    slides.push({
      id: 'story',
      mesh: 'mesh-3',
      layout: 'essay',
      theme: theme,
      kicker: '一件小事',
      title: '还空着',
      titleSize: 'xl',
      body: '一件很小的事就够。想起来的时候，回到填写页补上。',
      meta: '',
      footer: footer
    })
  } else if (record.charCount(a.story) <= 18 && a.story.indexOf('\n') === -1) {
    slides.push({
      id: 'story',
      mesh: 'mesh-3',
      layout: 'letter',
      theme: theme,
      kicker: '一件小事',
      title: a.story,
      titleSize: titleSize(a.story),
      body: '后来想起你，常常是从这件事开始。',
      letterBar: letterBar,
      meta: '',
      footer: footer
    })
  } else {
    slides.push({
      id: 'story',
      mesh: 'mesh-3',
      layout: 'letter',
      theme: theme,
      kicker: '一件小事',
      title: '一件想留住的事',
      titleSize: 'lg',
      body: a.story,
      letterBar: letterBar,
      meta: '',
      footer: footer
    })
  }

  // 5.5 倒数第二页：获得的评价。像游戏成就，按 S/A/B 颁发。
  const award = record.awardTitle(a, info)
  slides.push({
    id: 'award',
    mesh: 'mesh-5',
    layout: 'award',
    theme: theme,
    kicker: '获得的评价',
    tierLabel: award.tierLabel,
    tierColor: award.tierColor,
    title: award.title,
    titleSize: 'xl',
    reason: award.reason,
    footer: footer
  })

  // 6. 结尾。写了那句就是「终章」：整页居中，像扉页的题字。
  // 「写于」记的是第一次写完这册的日子，还带上当天的第 N 天。
  let writtenText = now.getFullYear() + '年'
  let writtenDayText = ''
  if (a.writtenAt) {
    writtenText = record.formatDate(a.writtenAt)
    const seg = a.writtenAt.split('-')
    const wDate = new Date(Number(seg[0]), Number(seg[1]) - 1, Number(seg[2]))
    const wInfo = record.togetherInfo(a.togetherDate, wDate)
    if (wInfo && !wInfo.future) writtenDayText = ' · 在一起的第 ' + wInfo.days + ' 天'
  }
  if (a.sentence) {
    slides.push({
      id: 'ending',
      mesh: 'mesh-4',
      layout: 'finale',
      theme: theme,
      kicker: '想对你说',
      title: a.sentence,
      titleSize: titleSize(a.sentence),
      body: me + ' 写给 ' + them,
      meta: '写于 ' + writtenText + writtenDayText,
      footer: footer
    })
  } else {
    slides.push({
      id: 'ending',
      mesh: 'mesh-4',
      layout: 'essay',
      theme: theme,
      kicker: '想对你说',
      title: '还空着',
      titleSize: 'xl',
      body: '想对 ' + them + ' 说的那一句，可以以后再写。',
      meta: me + ' 写给 ' + them,
      footer: footer
    })
  }

  // 弥散底和卡口细线用内联样式：
  // 开发者工具里 swiper 内容对样式表的两级选择器级联不稳定，
  // 内联样式不依赖级联，屏幕和导出图都从 themes.js 取同一份颜色。
  const writtenShort = a.writtenAt ? a.writtenAt.split('-').join('.') : String(now.getFullYear())
  slides.forEach((slide) => {
    slide.meshStyle = themes.meshImage(theme, slide.mesh)
    slide.hairStyle = themes.hairlineImage(theme)
    slide.written = writtenShort
  })

  return slides
}

// 切主题时给某一页重算烧进字符串的内联样式。
// buildSlides 生成时把主题色写进了 style 字段；切主题只换 theme id、
// 不会重跑 buildSlides，所以这里按新主题把同类字段再算一遍。
// 字段清单必须和 buildSlides 里烧样式的地方保持一致：
//   拼图块 bgStyle（去过的地方）、口头禅气泡四件套。
function restyleSlide(slide, themeId) {
  const next = Object.assign({}, slide, { theme: themeId })
  next.meshStyle = themes.meshImage(themeId, slide.mesh)
  next.hairStyle = themes.hairlineImage(themeId)
  if (slide.layout === 'bubble') {
    next.bubbleStyle = 'background: ' + themes.tint(themeId, 'a', 0.16)
    next.bubbleTextStyle = 'color: ' + themes.pick(themeId).ink
    next.bubbleMarkStyle = 'color: ' + themes.pick(themeId).kicker
    next.bubbleTailStyle = 'border-bottom-color: ' + themes.tint(themeId, 'a', 0.16)
  }
  if (slide.tiles && slide.tiles.length) {
    next.tiles = slide.tiles.map((tile, index) => Object.assign({}, tile, {
      bgStyle: 'background: ' + themes.tint(themeId, ['a', 'b', 'c', 'd'][index % 4], 0.18)
    }))
  }
  return next
}

module.exports = {
  buildSlides,
  restyleSlide
}

