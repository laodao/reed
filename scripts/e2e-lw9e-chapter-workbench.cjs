/**
 * LW-9e 章节工作台真机 E2E（38 号验收；真模型 deepseek-v4-flash）
 * 前置：electron . --remote-debugging-port=9333 已启动（新 build）
 * 流程：找/建「星际快递员与机器狗」→ 概要 → 背景 → 角色 → 地点 → 情节 → 大纲(章) →
 *       chapterContextPreview（面板契约断言）→ 勾选子集 → generateChapterWithContext
 *       → 正文落库断言。
 * 输出 LW9E_RESULT=...
 * 成本纪律：targetWords=300、单章、一次跑通不反复。
 */
const { chromium } = require('playwright')

const PC = process.env.LW9E_PC || 'pc_mtee10tz_ijz2yq1ro'
const MODEL = process.env.LW9E_MODEL || 'deepseek-v4-flash-0731'
const PROJECT_NAME = '星际快递员与机器狗'
const INPUT = '写一个温暖的科幻短篇：近未来，星际快递员小艾与一只会说话的机器狗搭档送件，某天收到一个寄往已毁灭殖民地的包裹。'

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  if (!page) throw new Error('未找到应用页面')
  const withTimeout = (p, ms, label) => Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} 超时 ${ms / 1000}s`)), ms)),
  ])
  const call = (expr, ...args) => withTimeout(page.evaluate(
    ({ expr, args }) => {
      const lw = window.electronAPI.longwriting
      const fn = new Function('lw', 'args', `return lw.${expr}(...args)`)
      return fn(lw, args)
    }, { expr, args }), 30_000, expr)
  const callAsync = (expr, ...args) => withTimeout(page.evaluate(async ({ expr, args }) => {
    const lw = window.electronAPI.longwriting
    const fn = new Function('lw', 'args', `return lw.${expr}(...args)`)
    try { return await fn(lw, args) } catch (e) { return { success: false, error: String(e && e.message || e) } }
  }, { expr, args }), 240_000, expr)
  const fail = (stage, r) => { console.error(`❌ ${stage}:`, JSON.stringify(r && r.error || r).slice(0, 300)); process.exit(1) }
  const assert = (cond, label) => { console.log(`${cond ? '✅' : '❌'} ${label}`); if (!cond) process.exitCode = 1 }
  const ev = (tag) => `lw9e-${tag}-${Date.now()}`

  // 1. 找/建项目
  let projectId
  const lp = await call('getProjects')
  const existed = Array.isArray(lp) ? lp.find(p => p.name === PROJECT_NAME) : (lp.data || []).find(p => p.name === PROJECT_NAME)
  if (existed) {
    projectId = existed.id
    console.log('复用项目:', projectId, existed.name)
  } else {
    const proj = await call('createProject', { name: PROJECT_NAME, type: 'story' })
    if (!proj.success && !proj.id) fail('建项目', proj)
    projectId = proj.data ? proj.data.id : proj.id
    console.log('新建项目:', projectId)
  }

  // 2. 概要（已有则跳过——上轮 LW-9e 建过）
  let ov = await call('getStoryOverview', projectId)
  const hasOverview = ov && (ov.data ? ov.data.isSaved : ov.isSaved)
  if (!hasOverview) {
    console.log('… 生成概要（真模型，最长 4 分钟）');
    const g = await callAsync('generateStoryOverview', ev('ov'), projectId, INPUT, PC, MODEL)
    if (!g.success || !g.data) fail('生成概要', g)
    const d = g.data
    const saved = await call('updateStoryOverview', projectId, {
      storyType: d.storyType || 'kehuan', title: (d.title || PROJECT_NAME).replace(/[《》]/g, ''),
      coreIdea: (d.summary || '').slice(0, 200), summary: d.summary, coreConflict: d.coreConflict,
      keyCharacters: d.keyCharacters || [], keyLocations: d.keyLocations || [],
      estimatedChapters: Math.min(d.estimatedChapters || 3, 4), enabledFeatures: [], isSaved: true,
    })
    if (!saved.success) fail('概要落库', saved)
    console.log('✅ 概要生成+落库:', (d.title || '').slice(0, 20))
  } else {
    console.log('✅ 概要已存在（复用）')
  }

  // 3. 背景（无则落夹具文本——背景无 renderer 生成入口，agent 动作路径 p7 已冒烟）
  const bg = await call('getBackground', projectId)
  const bgData = bg && bg.data ? bg.data : bg
  if (!bgData || !(bgData.content || bgData.background)) {
    const text = '近未来 2187 年，星际航运网络「蚁路」连接三十余个人类殖民地。三十年前的「萤火事变」让边缘殖民地天狼座-4 失联并宣告毁灭，但那里仍有未知信号残留。机器狗「阿黄」是上一代陪伴型仿生犬，说话带着老电影腔调。'
    const saved = await call('updateBackground', projectId, { content: text })
    if (!saved.success) fail('背景落库', saved)
    console.log('✅ 背景（夹具）落库')
  } else {
    console.log('✅ 背景已存在（复用）')
  }

  // 4. 角色 / 地点（各一次真模型；生成物落库）
  const chars = await call('getCharacters', projectId)
  const charList = (chars && chars.data) || chars || []
  if (!Array.isArray(charList) || charList.length === 0) {
    console.log('… 生成角色（真模型，最长 4 分钟）');
    const g = await callAsync('generateCharacters', ev('ch'), projectId, PC, MODEL)
    const list = g && g.data ? (Array.isArray(g.data) ? g.data : g.data.characters || []) : []
    if (!list.length) fail('生成角色', g)
    for (const c of list.slice(0, 4)) {
      const r = await call('createCharacter', { projectId, name: c.name || '未命名', role: c.role || '配角', personality: c.personality || c.description || '', background: c.background || c.profile || '' })
      if (!r.success) fail('角色落库', r)
    }
    console.log('✅ 角色生成+落库:', Math.min(list.length, 4), '个')
  } else {
    console.log('✅ 角色已存在（复用', charList.length, '个）')
  }

  const locs = await call('getLocations', projectId)
  const locList = (locs && locs.data) || locs || []
  if (!Array.isArray(locList) || locList.length === 0) {
    console.log('… 生成地点（真模型，最长 4 分钟）');
    const g = await callAsync('generateLocations', ev('lo'), projectId, PC, MODEL)
    const list = g && g.data ? (Array.isArray(g.data) ? g.data : g.data.locations || []) : []
    if (!list.length) fail('生成地点', g)
    for (const l of list.slice(0, 3)) {
      const r = await call('createLocation', { projectId, name: l.name || '未命名地', description: l.description || l.background || '' })
      if (!r.success) fail('地点落库', r)
    }
    console.log('✅ 地点生成+落库:', Math.min(list.length, 3), '个')
  } else {
    console.log('✅ 地点已存在（复用', locList.length, '个）')
  }

  // 5. 情节
  const plots = await call('getPlots', projectId)
  const plotList = (plots && plots.data) || plots || []
  if (!Array.isArray(plotList) || plotList.length === 0) {
    console.log('… 生成情节（真模型，最长 4 分钟）');
    const g = await callAsync('generatePlots', ev('pl'), projectId, PC, MODEL)
    const list = g && g.data ? (Array.isArray(g.data) ? g.data : g.data.plots || []) : []
    if (!list.length) fail('生成情节', g)
    for (const p of list.slice(0, 3)) {
      const r = await call('createPlot', { projectId, title: p.title || '未命名情节', summary: p.summary || p.description || '', involvedCharacters: [], involvedLocations: [], notes: '' })
      if (!r.success) fail('情节落库', r)
    }
    console.log('✅ 情节生成+落库:', Math.min(list.length, 3), '条')
  } else {
    console.log('✅ 情节已存在（复用', plotList.length, '条）')
  }

  // 6. 大纲（一级章；复用已有）
  let outlineIds = []
  const tree = await callAsync('getOutlineTree', projectId)
  const existing = Array.isArray(tree && tree.data) ? tree.data : []
  const flatChapters = existing.filter(n => (n.nodeType || n.type) === 'chapter' || n.level === 1)
  if (flatChapters.length > 0) {
    outlineIds = flatChapters.map(n => ({ id: n.id, name: n.name }))
    console.log('✅ 大纲已存在（复用', outlineIds.length, '章）')
  } else {
    console.log('… 生成大纲（真模型，最长 4 分钟）');
    const g = await callAsync('generateOutlineStory', ev('ol'), projectId, PC, MODEL, 1)
    if (!g.success || !Array.isArray(g.data) || !g.data.length) fail('生成大纲', g)
    const chapters = g.data.slice(0, 3)
    for (let i = 0; i < chapters.length; i++) {
      const c = chapters[i]
      const r = await call('createOutline', {
        projectId, name: c.name, level: 1, nodeType: 'chapter', summary: c.summary || '',
        estimatedWords: c.estimatedWords || 300, involvedCharacters: [], involvedLocations: [],
        status: 'pending', orderIndex: i,
      })
      if (!r.success) fail('大纲落库', r)
      outlineIds.push({ id: r.data.id, name: c.name })
    }
    console.log('✅ 大纲生成+落库:', outlineIds.length, '章:', outlineIds.map(o => o.name).join(' / '))
  }
  assert(outlineIds.length > 0, '大纲就绪（面板前置条件：有章节点）')

  // 7. 38号 面板契约：chapterContextPreview
  const target = outlineIds[0]
  // 涉及角色/地点（38号 面板按大纲涉及关系拉实体分区）：把现有角色/地点挂上目标章
  const invChars = charList.slice(0, 2).map(c => c.id)
  const invLocs = locList.slice(0, 1).map(l => l.id)
  if (invChars.length || invLocs.length) {
    await call('updateOutline', target.id, { involvedCharacters: invChars, involvedLocations: invLocs })
    console.log(`涉及关系：角色 ${invChars.length} + 地点 ${invLocs.length} 已挂到「${target.name}」`)
  }
  const ctx = await callAsync('chapterContextPreview', projectId, target.id, { targetWords: 300 })
  if (!ctx.success && !ctx.items) fail('上下文清单', ctx)
  const items = ctx.items || (ctx.data && ctx.data.items) || []
  const sections = [...new Set(items.map(i => i.sectionKey))]
  const totalTokens = items.reduce((s, i) => s + (i.tokens || 0), 0)
  const defaultChecked = items.filter(i => i.defaultChecked !== false)
  console.log(`面板契约：${sections.length} 分区 [${sections.join(',')}]，${items.length} 项，估算 ${totalTokens} tok，默认勾选 ${defaultChecked.length}`)
  assert(items.length > 0, '上下文清单非空（概要/角色/大纲等分区就位）')
  assert(sections.includes('overview'), '含概要分区')
  assert(items.every(i => typeof i.id === 'string' && i.id.length > 0), `条目 id 稳定（单件分区=裸节名，实体项=section:id；实际 [${items.map(i => i.id).join(',')}]）`)

  // 7.5 42号 负控：停用 overview+background 后 promptText 必须出现占位文案
  //（死开关回归——曾因背景内嵌概要文本，停用 background 无任何效果且断言测不出）
  const negIds = items.map(i => i.id).filter(id => id !== 'background' && id !== 'overview')
  const negCtx = await callAsync('chapterContextPreview', projectId, target.id,
    { targetWords: 300, enabledItemIds: negIds })
  const negText = (negCtx.data && negCtx.data.promptText) || negCtx.promptText || ''
  assert(negText.includes('世界观设定已由用户禁用'), '负控：停用 background → prompt 出现占位文案（勾选真实生效）')
  assert(negText.includes('故事宏观背景已由用户禁用'), '负控：停用 overview → prompt 出现占位文案')

  // 8. 勾选重组：去掉 1-2 项再生成，验证 enabledItemIds 生效（正文不空）
  const disabled = defaultChecked.slice(0, Math.min(2, defaultChecked.length - 1)).map(i => i.id)
  const enabledItemIds = defaultChecked.map(i => i.id).filter(id => !disabled.includes(id))
  console.log(`勾选重组：停用 [${disabled.join(',')}]，启用 ${enabledItemIds.length} 项`)
  console.log('… 按勾选生成章节（真模型，最长 4 分钟）');
    const gen = await callAsync('generateChapterWithContext', ev('gen'), projectId, target.id,
    { targetWords: 300, enabledItemIds, providerConfigId: PC, modelId: MODEL })
  const content = gen && (gen.data ? (gen.data.content || gen.data) : gen)
  const text = typeof content === 'string' ? content : (content && content.content) || ''
  assert(gen.success !== false && text.length > 100, `按勾选生成正文成功（${text.length} 字）`)
  console.log('正文开头:', String(text).slice(0, 60).replace(/\n/g, ' '))
  const sv = await call('saveChapter', target.id, String(text))
  if (!sv.success) fail('章节落库', sv)

  // 9. 落库读回
  const ch = await callAsync('getChapter', target.id)
  const savedContent = ch && ch.data ? (ch.data.content || '') : ''
  assert(savedContent.length > 0, '章节正文已落库可读回')

  console.log(`LW9E_RESULT=${process.exitCode === 1 ? 'FAIL' : 'PASS'} project=${projectId} outline=${target.id} items=${items.length} sections=${sections.length} tokens=${totalTokens} disabled=${disabled.length} chapterChars=${text.length}`)
})().catch(e => { console.error('E2E 异常:', e); process.exit(1) })
