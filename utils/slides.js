// 把一份答案变成纪念册的每一页。
//
// 固定 6 页：封面、数字、起点、口头禅、故事、结尾。
// 只有填了「距离」或「吵架」才多出页面。
// 问卷的填写顺序和这里的翻页顺序不一样：问卷好填，纪念册按讲述来排。
//
// 不要在这里加消费、底线、原生家庭、分手或双人问答。

const record = require('./record')

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

function buildSlides(raw, today) {
  const a = record.normalize(raw || {})
  const now = today || new Date()
  const info = record.togetherInfo(a.togetherDate, now)
  const dateText = record.formatDate(a.togetherDate)
  const me = a.myNickname || '你'
  const them = a.theirNickname || 'TA'
  const footer = footerOf(me, them)
  const slides = []

  // 1. 封面
  let coverMeta = '选好日期后，天数会出现在这里'
  let coverBody = '还没有开始的日子'
  if (info && info.future) {
    coverBody = dateText + '，还没到'
    coverMeta = '还有 ' + info.days + ' 天'
  } else if (info) {
    coverBody = dateText + '起'
    coverMeta = '在一起的第 ' + info.days + ' 天'
  }
  slides.push({
    id: 'cover',
    mesh: 'mesh-1',
    layout: 'cover',
    theme: 'cream',
    kicker: '恋爱Wrapped',
    nameA: me,
    nameB: them,
    nameSize: coverSize(me, them),
    body: coverBody,
    meta: coverMeta,
    footer: footer
  })

  // 2. 数字。只展示真正填过的数，不拿 0 占位。
  const stats = []
  if (info && info.future) {
    stats.push({ num: String(info.days), unit: '天', label: '之后，就是这一天' })
  } else if (info) {
    stats.push({ num: String(info.days), unit: '天', label: '在一起' })
  }
  if (a.cityCount !== '') {
    stats.push({ num: a.cityCount, unit: '座', label: '一起去过的城市' })
  }
  if (a.mealCount !== '') {
    stats.push({ num: a.mealCount, unit: '顿', label: '一起吃过的饭' })
  }
  let note = ''
  if (!info) {
    note = '选好在一起的日子后，天数会出现在这里。'
  } else if (a.cityCount === '' && a.mealCount === '') {
    note = '城市和饭还没写，只有日子先站在这里。'
  }
  slides.push({
    id: 'numbers',
    mesh: 'mesh-2',
    layout: 'numbers',
    theme: 'cream',
    kicker: '数字',
    title: '这些，我们走过',
    titleSize: 'md',
    stats: stats,
    note: note,
    footer: footer
  })

  // 3. 起点
  if (a.firstDatePlace) {
    slides.push({
      id: 'start',
      mesh: 'mesh-3',
      layout: 'essay',
      theme: 'cream',
      kicker: '起点',
      title: a.firstDatePlace,
      titleSize: titleSize(a.firstDatePlace),
      body: '后来很多天，都是从这里开始的。',
      meta: dateText,
      footer: footer
    })
  } else {
    slides.push({
      id: 'start',
      mesh: 'mesh-3',
      layout: 'essay',
      theme: 'cream',
      kicker: '起点',
      title: '还没写地点',
      titleSize: 'lg',
      body: '第一次约会的地方，记得的话可以补上。',
      meta: dateText,
      footer: footer
    })
  }

  // 距离：选填。完全没选「异地 / 同城」就不出这一页。
  if (a.distanceMode === 'ldr') {
    slides.push({
      id: 'distance',
      mesh: 'mesh-4',
      layout: 'essay',
      theme: 'cream',
      kicker: '距离',
      title: a.distanceKm ? a.distanceKm + ' 公里' : '人在两座城',
      titleSize: 'xl',
      body: a.distanceKm ? '人在两座城。' : '相隔多远，可以以后再补。',
      meta: '异地',
      footer: footer
    })
  } else if (a.distanceMode === 'same') {
    slides.push({
      id: 'distance',
      mesh: 'mesh-4',
      layout: 'essay',
      theme: 'cream',
      kicker: '同城',
      title: a.meetCount ? a.meetCount + ' 次' : '同在一座城',
      titleSize: 'xl',
      body: a.meetCount ? '一起出过这么多次门。' : '出门的次数，留到下次再写。',
      meta: a.meetCount ? '同一座城市' : '',
      footer: footer
    })
  }

  // 4. 口头禅。和其他页一样是奶油底，不再单独换色。
  if (a.catchphrase) {
    slides.push({
      id: 'phrase',
      mesh: 'mesh-5',
      layout: 'essay',
      theme: 'cream',
      kicker: '口头禅',
      title: a.catchphrase,
      titleSize: titleSize(a.catchphrase),
      body: '听到的时候，就会想起你。',
      meta: '',
      footer: footer
    })
  } else {
    slides.push({
      id: 'phrase',
      mesh: 'mesh-5',
      layout: 'essay',
      theme: 'cream',
      kicker: '留白',
      title: '还没写',
      titleSize: 'xl',
      body: '那句常说的话，想起来就补上。',
      meta: '',
      footer: footer
    })
  }

  // 吵架：选填。次数或「谁先道歉」写了任意一项才出现。
  if (a.fightCount !== '' || a.whoApologized) {
    const whoLine = {
      me: '先道歉的是我。',
      them: '先道歉的是 TA。',
      both: '几乎是一起道歉的。'
    }[a.whoApologized] || ''
    let fightTitle = '吵过的那些天'
    if (a.fightCount === '0') fightTitle = '几乎没吵过'
    else if (a.fightCount !== '') fightTitle = a.fightCount + ' 次'
    let fightBody = whoLine
    if (!fightBody) {
      fightBody = a.fightCount === '0' ? '能这样，也很好。' : '谁先开口，这页先留白。'
    }
    slides.push({
      id: 'fight',
      mesh: 'mesh-5',
      layout: 'essay',
      theme: 'cream',
      kicker: '吵架',
      title: fightTitle,
      titleSize: titleSize(fightTitle),
      body: fightBody,
      meta: '吵完，还是想把好吃的留给你。',
      footer: footer
    })
  }

  // 5. 一件小事。短的就放大当标题，长的放进正文。
  if (!a.story) {
    slides.push({
      id: 'story',
      mesh: 'mesh-3',
      layout: 'essay',
      theme: 'cream',
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
      layout: 'essay',
      theme: 'cream',
      kicker: '一件小事',
      title: a.story,
      titleSize: titleSize(a.story),
      body: '后来想起你，常常是从这件事开始。',
      meta: '',
      footer: footer
    })
  } else {
    slides.push({
      id: 'story',
      mesh: 'mesh-3',
      layout: 'essay',
      theme: 'cream',
      kicker: '一件小事',
      title: '一件想留住的事',
      titleSize: 'lg',
      body: a.story,
      meta: '',
      footer: footer
    })
  }

  // 6. 结尾。永远是最后一页。
  if (a.sentence) {
    slides.push({
      id: 'ending',
      mesh: 'mesh-4',
      layout: 'essay',
      theme: 'cream',
      kicker: '想对你说',
      title: a.sentence,
      titleSize: titleSize(a.sentence),
      body: me + ' 写给 ' + them,
      meta: '写于 ' + now.getFullYear(),
      footer: footer
    })
  } else {
    slides.push({
      id: 'ending',
      mesh: 'mesh-4',
      layout: 'essay',
      theme: 'cream',
      kicker: '想对你说',
      title: '还空着',
      titleSize: 'xl',
      body: '想对 ' + them + ' 说的那一句，可以以后再写。',
      meta: me + ' 写给 ' + them,
      footer: footer
    })
  }

  return slides
}

module.exports = {
  buildSlides
}
