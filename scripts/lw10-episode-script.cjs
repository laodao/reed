/**
 * 长文写作 → 10 集短剧剧本 全链路实跑（49 号验收）
 *
 * 链路：长文项目（概要→10 章大纲→逐章正文）→ EP 项目（outline 关联模式建 10 集）
 *       → 逐集 generateScript（正文→剧本正文+场景 JSON）→ 全部剧本导出 markdown。
 *
 * 设计要点：
 * - 断点续跑：进度落 /tmp/lw10-state.json，任何一步失败重跑脚本即从断点继续。
 * - 前提与节拍从 /tmp/lw10-premise.json 读取（title/premise/beatSheet），与脚本解耦。
 * - 幂等：按项目名查重，已存在则复用；每章/每集生成前查库避免重复烧 token。
 *
 * 用法：node scripts/lw10-episode-script.cjs [--phase lw|ep|export] [--fresh]
 * 前置：应用以 dev:debug 模式运行（CDP 9222）。
 */
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const CDP = 'http://127.0.0.1:9222'
const STATE_FILE = '/tmp/lw10-state.json'
const PREMISE_FILE = '/tmp/lw10-premise.json'
const OUT_DIR = path.resolve(__dirname, '../outputs')
const PC = 'pc_mtee10tz_ijz2yq1ro'
const MODEL = 'deepseek-v4-flash-0731'
const MODEL_ALT = 'qwen3.8-max'
const EPISODES = 10
const CHAPTER_WORDS = 1800

const args = process.argv.slice(2)
const phaseArg = (args.includes('--phase') && args[args.indexOf('--phase') + 1]) || 'all'
const fresh = args.includes('--fresh')

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)) }

const state = fresh ? { steps: {} } : loadJson(STATE_FILE, { steps: {} })
const premise = loadJson(PREMISE_FILE, null)
if (!premise) { console.error('缺少 ' + PREMISE_FILE); process.exit(1) }

async function main() {
  const browser = await chromium.connectOverCDP(CDP)
  const page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html') || p.url().includes('localhost:5173'))
    || browser.contexts()[0].pages()[0]
  if (!page) throw new Error('未找到应用页面')
  const call = (expr, ...args) => page.evaluate(({ expr, args }) => {
    const fn = new Function('api', 'args', `return api.${expr}(...args)`)
    const api = window.electronAPI
    return fn(api, args)
  }, { expr, args })
  const lwCall = (expr, ...args) => call(`longwriting.${expr}`, ...args)
  const epCall = (expr, ...args) => call(`episodeProduction.${expr}`, ...args)

  // retry：第 2 次尝试自动换备选模型（deepseek 混合推理会烧光预算出 0 内容，qwen 兜底）
  const models = [MODEL, MODEL_ALT]
  const retry = async (label, fn, tries = 2, prefer = 0) => {
    for (let i = 1; i <= tries; i++) {
      try { return await fn(models[Math.min(prefer + i - 1, models.length - 1)]) } catch (e) {
        console.warn(`  [retry ${i}/${tries}] ${label}: ${String(e && e.message || e).slice(0, 160)}`)
        if (i === tries) throw e
        await page.waitForTimeout(4000)
      }
    }
  }
  const must = (label, r) => {
    if (!r || r.success === false) throw new Error(`${label} 失败: ${JSON.stringify(r && (r.error || r)).slice(0, 300)}`)
    return r
  }

  // ============ Phase A：长文项目（概要→大纲→10 章正文） ============
  async function ensureProject() {
    if (state.lwProjectId) return state.lwProjectId
    const created = must('建项目', await lwCall('createProject', { name: premise.title, type: 'story' }))
    state.lwProjectId = created.data.id
    saveState(state)
    return created.data.id
  }

  async function ensureOverview(pid) {
    if (state.steps.overview) return
    const ov = must('生成概要', await retry('生成概要', (m) => lwCall('generateStoryOverview', 'lw10-ov-' + Date.now(), pid, premise.premise, PC, m)))
    const d = ov.data
    must('概要落库', await lwCall('updateStoryOverview', pid, {
      storyType: d.storyType || 'dushi',
      title: (d.title || premise.title).replace(/[《》]/g, ''),
      coreIdea: (d.summary || '').slice(0, 200),
      summary: d.summary,
      coreConflict: d.coreConflict,
      keyCharacters: d.keyCharacters || [],
      keyLocations: d.keyLocations || [],
      estimatedChapters: EPISODES,
      enabledFeatures: [],
      isSaved: true,
    }))
    state.overview = d
    state.steps.overview = true
    saveState(state)
    console.log('✅ 概要:', d.title, '|', (d.summary || '').length, '字')
  }

  async function ensureOutline(pid) {
    if (Array.isArray(state.outlineIds) && state.outlineIds.length === EPISODES) return
    const existing = await lwCall('getOutlineTree', pid)
    let chapters = existing.success && Array.isArray(existing.data)
      ? existing.data.filter((n) => n.nodeType === 'chapter').sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
      : []
    if (chapters.length < EPISODES) {
      if (chapters.length > 0) throw new Error(`已有 ${chapters.length} 章不足 ${EPISODES} 集，且未实现补齐（请 --fresh 或手动处理）`)
      console.log('… 生成大纲（script 分集模式，qwen3.8-max 优先）')
      const ol = must('生成大纲', await retry('生成大纲', (m) =>
        lwCall('generateOutlineStory', 'lw10-ol-' + Date.now(), pid, PC, m, 1, { contentTarget: 'script', episodeCount: EPISODES }), 2, 1))
      const arr = Array.isArray(ol.data) ? ol.data : (ol.data?.chapters || [])
      const take = arr.slice(0, EPISODES)
      if (take.length < EPISODES) throw new Error(`大纲只生成 ${take.length} 章，需要 ${EPISODES}`)
      state.outlineIds = []
      for (let i = 0; i < EPISODES; i++) {
        const c = take[i]
        const beat = premise.beatSheet && premise.beatSheet[i] ? `\n【本集节拍】${premise.beatSheet[i]}` : ''
        const r = must(`建大纲第${i + 1}章`, await lwCall('createOutline', {
          projectId: pid, name: c.name || `第${i + 1}集`, level: 1, nodeType: 'chapter',
          summary: `${c.summary || ''}${beat}`, estimatedWords: CHAPTER_WORDS,
          involvedCharacters: [], involvedLocations: [], status: 'pending', orderIndex: i,
        }))
        state.outlineIds.push(r.data.id)
        saveState(state)
      }
    } else {
      state.outlineIds = chapters.slice(0, EPISODES).map((c) => c.id)
      saveState(state)
    }
    console.log('✅ 大纲就绪:', state.outlineIds.length, '集')
  }

  async function ensureChapters(pid) {
    state.chapters = state.chapters || {}
    for (let i = 0; i < state.outlineIds.length; i++) {
      const oid = state.outlineIds[i]
      if (state.chapters[oid]) continue
      const back = await lwCall('getChapter', oid)
      const existing = back.success && back.data && (back.data.content || '')
      if (existing && existing.length >= 600) {
        state.chapters[oid] = { len: existing.length }
        saveState(state)
        console.log(`  第${i + 1}集正文已有（${existing.length} 字），跳过`)
        continue
      }
      console.log(`… 生成第${i + 1}集正文（目标 ${CHAPTER_WORDS} 字）`)
      const r = must(`生成正文第${i + 1}集`, await retry(`生成正文第${i + 1}集`, (m) =>
        lwCall('generateChapter', 'lw10-ch-' + Date.now(), pid, oid, CHAPTER_WORDS, PC, m), 3))
      const content = r.data.content
      // 最小字数守卫：不足视为失败，触发换模型重试（实跑教训：deepseek 思维链烧光预算可出 0-N 十字）
      if (!content || content.trim().length < 600) throw new Error(`第${i + 1}集正文仅 ${content ? content.length : 0} 字（<600 判定失败）`)
      must(`落库第${i + 1}集`, await lwCall('saveChapter', oid, content))
      state.chapters[oid] = { len: content.length }
      saveState(state)
      console.log(`✅ 第${i + 1}集正文 ${content.length} 字`)
    }
  }

  // ============ Phase B：EP 项目 + 逐集剧本 ============
  async function ensureEpProject(pid) {
    if (state.epProjectId) return state.epProjectId
    const created = must('建EP项目', await epCall('createProject', premise.title + '（剧集）', pid, { styleAnchors: [premise.genre || '都市'] }))
    state.epProjectId = created.data.id
    saveState(state)
    return state.epProjectId
  }

  async function ensureEpisodes(epPid) {
    state.episodeIds = state.episodeIds || {}
    for (let i = 0; i < state.outlineIds.length; i++) {
      const oid = state.outlineIds[i]
      if (state.episodeIds[oid]) continue
      const r = must(`建集第${i + 1}集`, await epCall('createEpisode', epPid, {
        sourceType: 'outline', outlineId: oid, episodeNumber: i + 1,
        title: `第${i + 1}集`, storyEra: premise.era || '', storyRegion: premise.region || '',
      }))
      state.episodeIds[oid] = r.data.id
      saveState(state)
    }
    console.log('✅ 分集就绪:', Object.keys(state.episodeIds).length, '集')
  }

  async function ensureScripts() {
    state.scripts = state.scripts || {}
    const entries = Object.entries(state.episodeIds)
    for (const [oid, epid] of entries) {
      if (state.scripts[epid]) continue
      console.log(`… 生成剧本（大纲节点 ${oid.slice(0, 8)}）`)
      const r = must('生成剧本', await retry('生成剧本', (m) => epCall('generateScript', epid, PC, m), 3))
      const sc = r.data?.script || r.data
      state.scripts[epid] = { scriptId: sc?.id || sc?.scriptId, synopsis: (sc?.synopsis || '').slice(0, 200) }
      saveState(state)
      console.log(`✅ 剧本完成: ${state.scripts[epid].scriptId}`)
    }
  }

  // ============ Phase C：导出 ============
  async function exportScript() {
    const epPid = state.epProjectId
    const eps = await must('列分集', await epCall('listEpisodes', epPid))
    const lines = [`# ${premise.title}`, '', `> 类型：${premise.genre} ｜ 生成：长文写作管线（10 集）`, '']
    const byNumber = (eps.data || []).sort((a, b) => (a.episodeNumber || 0) - (b.episodeNumber || 0))
    for (const ep of byNumber) {
      if (!ep.scriptId) continue
      const sc = await epCall('getScript', ep.scriptId)
      if (!sc.success) continue
      lines.push(`\n---\n\n## ${ep.title || '第' + ep.episodeNumber + '集'}\n`)
      lines.push(String(sc.data.scriptContent || ''))
    }
    fs.mkdirSync(OUT_DIR, { recursive: true })
    const out = path.join(OUT_DIR, `${premise.title}.md`)
    fs.writeFileSync(out, lines.join('\n'))
    console.log('✅ 导出:', out, `(${lines.join('\n').length} 字)`)
    return out
  }

  // ============ 编排 ============
  if (fresh && state.lwProjectId) {
    console.log('… --fresh：清理旧项目')
    if (state.epProjectId) await epCall('deleteProject', state.epProjectId).catch(() => undefined)
    await lwCall('deleteProject', state.lwProjectId).catch(() => undefined)
    state.lwProjectId = undefined; state.epProjectId = undefined
    state.steps = {}; state.outlineIds = undefined; state.chapters = {}; state.episodeIds = {}; state.scripts = {}
    saveState(state)
  }
  if (phaseArg === 'all' || phaseArg === 'lw') {
    const pid = await ensureProject()
    await ensureOverview(pid)
    await ensureOutline(pid)
    await ensureChapters(pid)
  }
  if (phaseArg === 'all' || phaseArg === 'ep') {
    const pid = state.lwProjectId
    const epPid = await ensureEpProject(pid)
    await ensureEpisodes(epPid)
    await ensureScripts()
  }
  if (phaseArg === 'all' || phaseArg === 'export') {
    await exportScript()
  }
  console.log('DONE ' + JSON.stringify({ lwProjectId: state.lwProjectId, epProjectId: state.epProjectId }))
  process.exit(0)
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
