/**
 * E2E 真实业务测试 #3：长文写作真实流程
 * 建项目 → AI 生成概要(deepseek-v4-flash-0731) → 落库 → AI 生成大纲(一级，仅章) → 落库
 * → 逐章生成正文(前 2 章，targetWords=300) → saveChapter 落库 → 读回验证非空且相关
 * 输出 LONGWRITING_RESULT=...
 */
const { chromium } = require('playwright')

const PC = 'pc_mtee10tz_ijz2yq1ro'
const MODEL = 'deepseek-v4-flash-0731'
const INPUT = '写一篇三幕微型科幻故事：近未来，一位修复旧书的手艺人发现一本能预测读者未来的书，她必须在把书交给收藏家和销毁它之间做选择。'

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  if (!page) throw new Error('未找到应用页面')
  const lw = '(window.electronAPI.longwriting)'
  const call = (expr, ...args) => page.evaluate(
    ({ expr, args }) => {
      const lw = window.electronAPI.longwriting
      const fn = new Function('lw', 'args', `return lw.${expr}(...args)`)
      return fn(lw, args)
    }, { expr, args })

  const fail = (stage, r) => { console.error(`❌ ${stage}:`, JSON.stringify(r.error || r).slice(0, 300)); process.exit(1) }

  // 1. 建项目
  const proj = await page.evaluate((d) => window.electronAPI.longwriting.createProject(d), { name: 'E2E真实-长文', type: 'story' })
  if (!proj.success) fail('建项目', proj)
  const projectId = proj.data.id
  console.log('项目:', projectId)

  // 2. AI 生成概要
  const ev1 = 'e2e-ov-' + Date.now()
  const ov = await page.evaluate(async ({ ev1, projectId, input, pc, model }) => {
    try { return await window.electronAPI.longwriting.generateStoryOverview(ev1, projectId, input, pc, model) }
    catch (e) { return { success: false, error: String(e && e.message || e) } }
  }, { ev1, projectId, input: INPUT, pc: PC, model: MODEL })
  if (!ov.success || !ov.data) fail('生成概要', ov)
  const ovData = ov.data
  console.log('✅ 概要生成: title=', ovData.title, '| 角色数=', (ovData.keyCharacters || []).length, '| estimatedChapters=', ovData.estimatedChapters)

  // 3. 概要落库
  const saved = await page.evaluate(({ projectId, d }) => window.electronAPI.longwriting.updateStoryOverview(projectId, {
    storyType: d.storyType || 'kehuan',
    title: (d.title || '未命名').replace(/[《》]/g, ''),
    coreIdea: (d.summary || '').slice(0, 200),
    summary: d.summary,
    coreConflict: d.coreConflict,
    keyCharacters: d.keyCharacters || [],
    keyLocations: d.keyLocations || [],
    estimatedChapters: Math.min(d.estimatedChapters || 3, 4),
    enabledFeatures: [],
    isSaved: true,
  }), { projectId, d: ovData })
  if (!saved.success) fail('概要落库', saved)
  console.log('✅ 概要落库')

  // 4. AI 生成大纲（一级结构：仅章）
  const ev2 = 'e2e-ol-' + Date.now()
  const ol = await page.evaluate(async ({ ev2, projectId, pc, model }) => {
    try { return await window.electronAPI.longwriting.generateOutlineStory(ev2, projectId, pc, model, 1) }
    catch (e) { return { success: false, error: String(e && e.message || e) } }
  }, { ev2, projectId, pc: PC, model: MODEL })
  if (!ol.success || !Array.isArray(ol.data) || ol.data.length === 0) fail('生成大纲', ol)
  const chapters = ol.data.slice(0, 3) // 成本控制：最多取 3 章
  console.log('✅ 大纲生成:', ol.data.length, '章（取前', chapters.length, '章）:', chapters.map(c => c.name).join(' / '))

  // 5. 大纲落库
  const outlineIds = []
  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i]
    const r = await page.evaluate(({ projectId, c, i }) => window.electronAPI.longwriting.createOutline({
      projectId, name: c.name, level: 1, nodeType: 'chapter',
      summary: c.summary || '', estimatedWords: c.estimatedWords || 300,
      involvedCharacters: [], involvedLocations: [], status: 'pending', orderIndex: i,
    }), { projectId, c, i })
    if (!r.success) fail('大纲落库', r)
    outlineIds.push({ id: r.data.id, name: c.name })
  }
  console.log('✅ 大纲落库:', outlineIds.length, '章')

  // 6. 逐章生成正文 + 落库（只生成前 2 章控成本）
  const genChapters = outlineIds.slice(0, 2)
  const chapterResults = []
  for (const o of genChapters) {
    const ev3 = 'e2e-ch-' + Date.now()
    const r = await page.evaluate(async ({ ev3, projectId, outlineId, pc, model }) => {
      try { return await window.electronAPI.longwriting.generateChapter(ev3, projectId, outlineId, 300, pc, model) }
      catch (e) { return { success: false, error: String(e && e.message || e) } }
    }, { ev3, projectId, outlineId: o.id, pc: PC, model: MODEL })
    if (!r.success || !r.data?.content) fail(`生成正文[${o.name}]`, r)
    const content = r.data.content
    const sr = await page.evaluate(({ outlineId, content }) => window.electronAPI.longwriting.saveChapter(outlineId, content), { outlineId: o.id, content })
    if (!sr.success) fail('正文落库', sr)
    chapterResults.push({ outlineId: o.id, name: o.name, len: content.length, head: content.slice(0, 80) })
    console.log(`✅ 章节[${o.name}] 正文 ${content.length} 字: ${content.slice(0, 60).replace(/\n/g, ' ')}...`)
  }

  // 7. 读回验证
  const overviewBack = await page.evaluate((projectId) => window.electronAPI.longwriting.getStoryOverview(projectId), projectId)
  if (!overviewBack.success || !overviewBack.data?.summary) fail('概要读回', overviewBack)
  let allOk = true
  for (const cr of chapterResults) {
    const back = await page.evaluate((oid) => window.electronAPI.longwriting.getChapter(oid), cr.outlineId)
    const c = back.success && back.data && (back.data.content || '')
    const okNonEmpty = c.length >= 100
    // 相关性粗验：与概要共享角色名或至少包含中文叙述（非错误文本）
    const names = (ovData.keyCharacters || []).map(k => k.name).filter(Boolean)
    const relevant = names.some(n => c.includes(n)) || /[一-龥]{50,}/.test(c)
    console.log(`读回[${cr.name}]: ${c.length} 字, 非空=${okNonEmpty}, 相关=${relevant}`)
    if (!okNonEmpty || !relevant) allOk = false
  }

  console.log(allOk ? '✅ 长文写作真实流程通过' : '❌ 章节验证未过')
  console.log('LONGWRITING_RESULT=' + JSON.stringify({
    projectId, title: ovData.title, overviewLen: (ovData.summary || '').length,
    outlineCount: ol.data.length, chapters: chapterResults, ok: allOk,
  }))
  await browser.close()
  if (!allOk) process.exit(1)
})().catch(e => { console.error('脚本失败:', e.message); process.exit(1) })
