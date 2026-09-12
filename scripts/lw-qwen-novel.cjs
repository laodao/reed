/**
 * 本地 vLLM（Qwen3.8-27B-FP8）长文写作全链路实跑
 *
 * 链路：添加本地提供商（关思考）→ 清空现有长文项目 → 新建项目
 *       → 概要 → 大纲 → 逐章正文（generateChapterWithContext：上下文装配+章节纪律+字数质量门）
 *       → 圣经落库（角色/技能物品/故事线/地点/背景/大纲关联）→ 逐章图谱提取 → 一致性扫描 → 导出全书。
 *
 * 设计要点：
 * - 全程走应用 IPC（与界面同链路），不直写数据库。
 * - 断点续跑：进度落 /tmp/lwq-state.json，失败重跑即从断点继续。
 * - customParams.chat_template_kwargs.enable_thinking=false 经 OpenAICompatibleProvider
 *   原样透传进请求体（providers/llm/openai-compatible-provider.ts customParams 合并），
 *   避免 Qwen3 思考模式在 JSON 任务上烧穿输出预算。
 *
 * 用法：node scripts/lw-qwen-novel.cjs [--phase provider|clean|lw|bible|export|all]
 * 前置：应用以 dev:debug 模式运行（CDP 9222）；vLLM 服务在 127.0.0.1:8001。
 */
const fs = require('fs')
const path = require('path')
const { chromium } = require('/home/ubuntu/workdir/the-bot/node_modules/playwright')

const CDP = 'http://127.0.0.1:9222'
const STATE_FILE = '/tmp/lwq-state.json'
const PREMISE_FILE = '/tmp/lwq-premise.json'
const OUT_DIR = path.resolve(__dirname, '../outputs')

const BASE_URL = 'http://127.0.0.1:8001/v1'
const API_KEY = 'sk-001a6d9b9e7eb09f17af8ec390d455598f5481b0764d8dec93d4cb933a10fa04'
const MODEL = 'qwen3.8-27b'
const PROVIDER_NAME = '本地vLLM Qwen3.8-27B'
const CHAPTERS = 10
const CHAPTER_WORDS = 2500
const MIN_CHARS = 800

const args = process.argv.slice(2)
const phaseArg = (args.includes('--phase') && args[args.indexOf('--phase') + 1]) || 'all'

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)) }
const state = loadJson(STATE_FILE, { steps: {} })
const premise = loadJson(PREMISE_FILE, null)
if (!premise) { console.error('缺少 ' + PREMISE_FILE); process.exit(1) }

async function main() {
  const browser = await chromium.connectOverCDP(CDP)
  const page = browser.contexts()[0].pages().find((p) => p.url().includes('localhost:5173'))
    || browser.contexts()[0].pages()[0]
  if (!page) throw new Error('未找到应用页面')
  const call = (expr, ...args) => page.evaluate(({ expr, args }) => {
    const fn = new Function('api', 'args', `return api.${expr}(...args)`)
    const api = window.electronAPI
    return fn(api, args)
  }, { expr, args })
  const lwCall = (expr, ...args) => call(`longwriting.${expr}`, ...args)
  const epCall = (expr, ...args) => call(`episodeProduction.${expr}`, ...args)

  const must = (label, r) => {
    if (!r || r.success === false) throw new Error(`${label} 失败: ${JSON.stringify(r && (r.error || r)).slice(0, 300)}`)
    return r
  }
  const retry = async (label, fn, tries = 3) => {
    for (let i = 1; i <= tries; i++) {
      try { return await fn() } catch (e) {
        console.warn(`  [retry ${i}/${tries}] ${label}: ${String(e && e.message || e).slice(0, 160)}`)
        if (i === tries) throw e
        await page.waitForTimeout(4000)
      }
    }
  }
  const norm = (s) => String(s || '').replace(/\s/g, '')

  // ============ Phase 1：本地提供商（幂等） ============
  async function ensureProvider() {
    if (state.pcId) return state.pcId
    const list = must('列提供商', await call('providerConfig.list'))
    const found = (list.data || []).find((c) => c.baseUrl === BASE_URL)
    if (found) {
      state.pcId = found.id
      console.log('提供商已存在，复用', found.id)
    } else {
      const r = must('建提供商', await call('providerConfig.create', {
        templateId: 'custom-model',
        name: PROVIDER_NAME,
        apiKey: API_KEY,
        baseUrl: BASE_URL,
        customParams: { chat_template_kwargs: { enable_thinking: false } },
        models: [{
          id: MODEL, name: 'Qwen3.8-27B-FP8', type: 'chat',
          contextWindow: 262144, maxOutputTokens: 16384, features: ['chat'],
          supportsThinking: true, supportsTools: true,
        }],
        defaultModelId: MODEL,
        isEnabled: true,
        isDefault: true,
      }))
      state.pcId = r.config.id
      console.log('✅ 提供商已创建', state.pcId)
    }
    saveState(state)
    const t = await call('providerConfig.test', { configId: state.pcId })
    if (!t.success) throw new Error('提供商连通测试失败: ' + JSON.stringify(t).slice(0, 300))
    console.log('✅ 连通测试通过', JSON.stringify(t.models || []).slice(0, 120))
    await call('providerConfig.setDefault', state.pcId)
    return state.pcId
  }

  // ============ Phase 2：清空现有长文项目（含派生 EP 项目） ============
  async function cleanAll() {
    const lwList = await lwCall('getProjects')
    const items = (lwList && lwList.data) || []
    const deletedIds = new Set()
    for (const p of items) {
      deletedIds.add(p.id)
      await lwCall('deleteProject', p.id).catch((e) => console.warn(`  删除 ${p.name} 失败: ${e.message}`))
      console.log('🗑 长文项目:', p.name || p.id)
    }
    const epList = await epCall('listProjects')
    for (const ep of (epList && epList.data) || []) {
      if (!deletedIds.has(ep.longWritingProjectId)) continue
      await epCall('deleteProject', ep.id).catch((e) => console.warn(`  删除EP ${ep.id} 失败: ${e.message}`))
      console.log('🗑 EP项目:', ep.name || ep.title || ep.id)
    }
    // 清空后重置流程状态，保持本项目状态文件干净
    delete state.lwProjectId
    delete state.steps; state.steps = {}
    delete state.outlineIds
    delete state.chapters
    delete state.characterIds
    delete state.plotsDone; delete state.siDone; delete state.locDone; delete state.linked
    delete state.extract
    saveState(state)
    if (items.length === 0) console.log('（无现有长文项目）')
  }

  // ============ Phase 3：长文主链路 ============
  async function ensureProject() {
    if (state.lwProjectId) return state.lwProjectId
    const created = must('建项目', await lwCall('createProject', { name: premise.title, type: 'story' }))
    state.lwProjectId = created.data.id
    saveState(state)
    console.log('✅ 项目已建:', premise.title, state.lwProjectId)
    return state.lwProjectId
  }

  async function ensureOverview(pid) {
    if (state.steps.overview) return
    const ov = must('生成概要', await retry('生成概要', () =>
      lwCall('generateStoryOverview', 'lwq-ov-' + Date.now(), pid, premise.premise, state.pcId, MODEL)))
    const d = ov.data
    must('概要落库', await lwCall('updateStoryOverview', pid, {
      storyType: d.storyType || 'gujin',
      title: (d.title || premise.title).replace(/[《》]/g, ''),
      coreIdea: (d.summary || '').slice(0, 200),
      summary: d.summary,
      coreConflict: d.coreConflict,
      keyCharacters: d.keyCharacters || [],
      keyLocations: d.keyLocations || [],
      estimatedChapters: CHAPTERS,
      enabledFeatures: [],
      isSaved: true,
    }))
    state.overview = { title: d.title, summaryLen: (d.summary || '').length, keyCharacters: d.keyCharacters }
    state.steps.overview = true
    saveState(state)
    console.log('✅ 概要:', d.title, '|', (d.summary || '').length, '字 | 角色:', (d.keyCharacters || []).length)
  }

  async function ensureOutline(pid) {
    if (Array.isArray(state.outlineIds) && state.outlineIds.length > 0) return
    const existing = await lwCall('getOutlineTree', pid)
    let chapters = existing.success && Array.isArray(existing.data)
      ? existing.data.filter((n) => n.nodeType === 'chapter').sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
      : []
    if (chapters.length === 0) {
      console.log('… 生成大纲（novel 一级结构）')
      const ol = must('生成大纲', await retry('生成大纲', () =>
        lwCall('generateOutlineStory', 'lwq-ol-' + Date.now(), pid, state.pcId, MODEL, 1)))
      const arr = Array.isArray(ol.data) ? ol.data : []
      if (arr.length < 5) throw new Error(`大纲仅 ${arr.length} 章（<5）`)
      const take = arr.slice(0, CHAPTERS)
      state.outlineIds = []
      for (let i = 0; i < take.length; i++) {
        const c = take[i]
        const r = must(`建大纲第${i + 1}章`, await lwCall('createOutline', {
          projectId: pid, name: c.name || `第${i + 1}章`, level: 1, nodeType: 'chapter',
          summary: String(c.summary || ''), estimatedWords: CHAPTER_WORDS,
          involvedCharacters: [], involvedLocations: [], status: 'pending', orderIndex: i,
        }))
        state.outlineIds.push(r.data.id)
        saveState(state)
      }
      chapters = take
    } else {
      state.outlineIds = chapters.map((c) => c.id)
      saveState(state)
    }
    console.log(`✅ 大纲就绪: ${state.outlineIds.length} 章`)
    for (let i = 0; i < chapters.length; i++) console.log(`   第${i + 1}章 ${chapters[i].name}`)
  }

  async function ensureChapters(pid) {
    state.chapters = state.chapters || {}
    for (let i = 0; i < state.outlineIds.length; i++) {
      const oid = state.outlineIds[i]
      if (state.chapters[oid]) continue
      const back = await lwCall('getChapter', oid)
      const existing = back.success && back.data && (back.data.content || '')
      if (existing && existing.length >= MIN_CHARS) {
        state.chapters[oid] = { len: existing.length }
        saveState(state)
        console.log(`  第${i + 1}章正文已有（${existing.length} 字），跳过`)
        continue
      }
      console.log(`… 生成第${i + 1}章正文（目标 ${CHAPTER_WORDS} 字，上下文装配+纪律+质量门）`)
      const t0 = Date.now()
      const r = must(`生成正文第${i + 1}章`, await retry(`生成正文第${i + 1}章`, () =>
        lwCall('generateChapterWithContext', 'lwq-ch-' + Date.now(), pid, oid,
          { targetWords: CHAPTER_WORDS, providerConfigId: state.pcId, modelId: MODEL })))
      const content = r.data.content
      const gate = r.data.qualityGate
      if (!content || content.trim().length < MIN_CHARS) throw new Error(`第${i + 1}章正文仅 ${content ? content.length : 0} 字（<${MIN_CHARS} 判定失败）`)
      must(`落库第${i + 1}章`, await lwCall('saveChapter', oid, content))
      state.chapters[oid] = { len: content.length, expanded: !!(gate && gate.expanded) }
      saveState(state)
      const gateTxt = gate ? ` | 质量门:${gate.verdict}${gate.expanded ? `（初稿${gate.initialWords}→${gate.finalWords}字）` : ''}` : ''
      console.log(`✅ 第${i + 1}章正文 ${content.length} 字（${Math.round((Date.now() - t0) / 1000)}s）${gateTxt}`)
    }
  }

  // ============ Phase 4：圣经落库 + 图谱提取 + 一致性扫描 ============
  async function ensureCharacters(pid) {
    if (state.characterIds) return
    const r = must('生成角色', await retry('生成角色', () =>
      lwCall('generateCharacters', 'lwq-cch-' + Date.now(), pid, state.pcId, MODEL, premise.characterReq)))
    const list = Array.isArray(r.data) ? r.data : []
    if (list.length === 0) throw new Error('角色建议为空')
    state.characterIds = {}
    for (const c of list) {
      const payload = {
        projectId: pid,
        name: String(c.name || '未名').slice(0, 30),
        gender: c.gender === 'female' || /女|她/.test(String(c.gender || '')) ? 'female' : 'male',
        age: Number(c.age) || 28,
        occupation: String(c.occupation || ''),
        position: String(c.position || ''),
        appearance: String(c.appearance || ''),
        background: String(c.background || ''),
        personality: String(c.personality || ''),
        abilities: String(c.abilities || ''),
        rolePosition: c.rolePosition === 'protagonist' || /主角/.test(String(c.rolePosition || '')) ? 'protagonist'
          : c.rolePosition === 'antagonist' || /反派/.test(String(c.rolePosition || '')) ? 'antagonist' : 'supporting',
        majorEvents: String(c.majorEvents || ''),
      }
      const saved = must(`建角色[${payload.name}]`, await lwCall('createCharacter', payload))
      state.characterIds[payload.name] = saved.data.id
      console.log(`✅ 角色 ${payload.name}（${payload.rolePosition}）`)
      saveState(state)
    }
  }

  async function ensureSkillsItems(pid) {
    if (state.siDone) return
    const r = must('生成技能物品', await retry('生成技能物品', () =>
      lwCall('generateSkillsItems', 'lwq-si-' + Date.now(), pid, state.pcId, MODEL)))
    const d = r.data || {}
    for (const s of (d.skills || []).slice(0, 5)) {
      must('建技能', await lwCall('createSkill', {
        projectId: pid, name: String(s.name || '').slice(0, 40), type: String(s.type || 'other'),
        level: String(s.level || 'intermediate'), system: String(s.system || ''), description: String(s.description || ''), characterIds: [],
      }))
      console.log('✅ 技能', s.name)
    }
    for (const it of (d.items || []).slice(0, 6)) {
      const itemPayload = {
        projectId: pid, name: String(it.name || '').slice(0, 40), type: String(it.type || 'other'),
        level: String(it.level || 'rare'), description: String(it.description || ''),
      }
      if (it.ownerId) itemPayload.ownerId = String(it.ownerId)
      must('建物品', await lwCall('createItem', itemPayload))
      console.log('✅ 物品', it.name)
    }
    state.siDone = true
    saveState(state)
  }

  async function ensurePlots(pid) {
    if (state.plotsDone) return
    const r = must('生成故事线', await retry('生成故事线', () =>
      lwCall('generatePlots', 'lwq-pl-' + Date.now(), pid, state.pcId, MODEL)))
    const list = Array.isArray(r.data) ? r.data : []
    const chars = state.characterIds || {}
    const mapped = list.map((p) => ({
      title: String(p.title || '').slice(0, 40),
      summary: String(p.summary || ''),
      involvedCharacters: (p.involvedCharacters || []).map((n) => chars[norm(n)]).filter(Boolean),
    })).filter((p) => p.title)
    must('批量建故事线', await lwCall('batchCreatePlots', pid, mapped))
    console.log(`✅ 故事线 ${mapped.length} 条`)
    state.plotsDone = true
    saveState(state)
  }

  async function ensureLocationsAndBackground(pid, overview) {
    if (state.locDone) return
    const kls = Array.isArray(overview?.keyLocations) ? overview.keyLocations : []
    for (const l of kls.slice(0, 6)) {
      const name = typeof l === 'string' ? l : String(l?.name || '')
      if (!name) continue
      must('建地点', await lwCall('createLocation', {
        projectId: pid, name: name.slice(0, 30),
        type: typeof l === 'object' && l.type ? String(l.type) : '建筑',
        importance: typeof l === 'object' && l.importance === 'main' ? 'main' : 'secondary',
        description: typeof l === 'object' && l.brief ? String(l.brief) : '',
      }))
      console.log('✅ 地点', name)
    }
    const bg = await lwCall('updateBackground', pid, premise.background)
    if (!bg.success) console.warn('  updateBackground 警告:', String(bg.error).slice(0, 120))
    else console.log('✅ 背景已写入')
    state.locDone = true
    saveState(state)
  }

  async function linkOutlines(pid) {
    if (state.linked) return
    const tree = must('取大纲', await lwCall('getOutlineTree', pid))
    const chapters = (Array.isArray(tree.data) ? tree.data : []).filter((n) => n.nodeType === 'chapter')
    const chars = state.characterIds || {}
    const locs = (must('取地点', await lwCall('getLocations', pid)).data || [])
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i]
      const text = norm(ch.name) + norm(ch.summary)
      const ic = Object.keys(chars).filter((n) => text.includes(norm(n))).map((n) => chars[n])
      const il = locs.filter((l) => text.includes(norm(l.name))).map((l) => l.id)
      must(`关联第${i + 1}章`, await retry(`关联第${i + 1}章`, async () => {
        const r = await lwCall('updateOutline', ch.id, { involvedCharacters: ic, involvedLocations: il })
        if (!r.success) throw new Error(r.error || 'updateOutline 失败')
        return r
      }))
    }
    console.log(`✅ 大纲关联完成（${chapters.length} 章）`)
    state.linked = true
    saveState(state)
  }

  async function ensureExtract(pid) {
    state.extract = state.extract || {}
    const tree = must('取大纲', await lwCall('getOutlineTree', pid))
    const chapters = (Array.isArray(tree.data) ? tree.data : []).filter((n) => n.nodeType === 'chapter')
    let foreshadows = 0, events = 0
    for (let i = 0; i < chapters.length; i++) {
      const oid = chapters[i].id
      if (state.extract[oid]) continue
      const ch = await lwCall('getChapter', oid)
      const content = (ch.success && ch.data && ch.data.content) || ''
      if (!content) throw new Error(`第${i + 1}章无正文`)
      const no = i + 1
      const g = await retry(`第${no}章图谱提取`, () =>
        lwCall('graphExtractChapter', pid, oid, content, no, state.pcId, MODEL), 2)
      const gd = g.data || {}
      foreshadows += (gd.foreshadows || []).length
      events += (gd.events || gd.plotEvents || []).length
      await retry(`第${no}章状态摘要`, () =>
        lwCall('extractChapterStateSummary', pid, oid, no, content, state.pcId, MODEL), 2)
      state.extract[oid] = true
      saveState(state)
      console.log(`✅ 第${no}章 提取完成（伏笔累计 ${foreshadows}）`)
    }
  }

  async function scanAndVerify(pid) {
    const conflicts = await lwCall('graphScanContradictions', pid)
    state.scanConflicts = conflicts.data || []
    saveState(state)
    console.log(`一致性扫描: ${state.scanConflicts.length} 条`)
    for (const c of state.scanConflicts.slice(0, 8)) console.log(`   [${c.rule}/${c.severity}] ${(c.message || '').slice(0, 90)}`)
    const tree = must('取大纲', await lwCall('getOutlineTree', pid))
    const first = (Array.isArray(tree.data) ? tree.data : []).find((n) => n.nodeType === 'chapter')
    const ctx = must('上下文预览', await lwCall('chapterContextPreview', pid, first.id, { targetWords: CHAPTER_WORDS }))
    const titles = (ctx.data.items || []).map((i) => `${i.title}(${i.tokens}t)`)
    console.log('第1章上下文项:', titles.join(' | '))
    const hasChar = (ctx.data.items || []).some((i) => i.sectionKey === 'character')
    console.log(hasChar ? '✅ 角色已进上下文' : '❌ 角色未进上下文')
  }

  // ============ Phase 5：导出全书 ============
  async function exportNovel() {
    const pid = state.lwProjectId
    const ov = await lwCall('getStoryOverview', pid)
    const ovd = (ov.success && ov.data) || {}
    const lines = [`# ${ovd.title || premise.title}`, '']
    if (ovd.summary) lines.push(`> ${String(ovd.summary).slice(0, 160)}`, '')
    const tree = must('取大纲', await lwCall('getOutlineTree', pid))
    const chapters = (Array.isArray(tree.data) ? tree.data : [])
      .filter((n) => n.nodeType === 'chapter').sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
    let total = 0
    for (let i = 0; i < chapters.length; i++) {
      const ch = await lwCall('getChapter', chapters[i].id)
      const content = (ch.success && ch.data && ch.data.content) || ''
      total += content.length
      lines.push(`\n---\n\n## 第${i + 1}章 ${chapters[i].name}\n`)
      lines.push(content)
    }
    fs.mkdirSync(OUT_DIR, { recursive: true })
    const out = path.join(OUT_DIR, `${premise.title}.md`)
    fs.writeFileSync(out, lines.join('\n'))
    console.log(`✅ 导出: ${out}（正文共 ${total} 字）`)
    return out
  }

  // ============ 编排 ============
  if (phaseArg === 'all' || phaseArg === 'provider') await ensureProvider()
  if (phaseArg === 'all' || phaseArg === 'clean') await cleanAll()
  if (phaseArg === 'all' || phaseArg === 'lw') {
    const pid = await ensureProject()
    await ensureOverview(pid)
    await ensureOutline(pid)
    await ensureChapters(pid)
  }
  if (phaseArg === 'all' || phaseArg === 'bible') {
    const pid = state.lwProjectId
    await ensureCharacters(pid)
    await ensureSkillsItems(pid)
    await ensurePlots(pid)
    const ov = await lwCall('getStoryOverview', pid)
    await ensureLocationsAndBackground(pid, ov.data)
    await linkOutlines(pid)
    await ensureExtract(pid)
    await scanAndVerify(pid)
  }
  if (phaseArg === 'all' || phaseArg === 'export') await exportNovel()
  console.log('DONE ' + JSON.stringify({ lwProjectId: state.lwProjectId, pcId: state.pcId }))
  process.exit(0)
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
