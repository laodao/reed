/**
 * 《金瞳》设定补全 + 章节提取管线（用户评审反馈：仅有正文/剧本，设定全缺）
 *
 * 补的链路（全部走应用 IPC，与界面按钮同链路）：
 *   角色 generateCharacters→createCharacter
 *   技能/物品 generateSkillsItems→createSkill/createItem
 *   故事线 generatePlots→batchCreatePlots（人物名→id 映射）
 *   地点 概要 keyLocations→createLocation
 *   背景 updateBackground（程序从概要派生，非 LLM 单独生成——如实标注）
 *   大纲关联 按名字匹配 updateOutline involvedCharacters/involvedLocations
 *   提取 graph:extractChapterGraph + extractChapterStateSummary ×10（图谱/事件/关系/伏笔/状态）
 *   扫描 graph:scanContradictions
 *   验证 chapterContextPreview 第1集应出现「角色」分区
 *
 * 断点续跑：/tmp/lw10-bible-state.json。用法：node scripts/lw10-bible-extract.cjs [bible|extract|all]
 */
const fs = require('fs')
const { chromium } = require('/home/ubuntu/workdir/the-bot/node_modules/playwright')

const CDP = 'http://127.0.0.1:9222'
const STATE = '/tmp/lw10-bible-state.json'
const PID = 'lw_1789144429798_rrhepsyhm'
const PC = 'pc_mtee10tz_ijz2yq1ro'
const MODELS = ['deepseek-v4-flash-0731', 'qwen3.8-max']
const phase = process.argv[2] || 'all'
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {}
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 2))

async function main() {
  const browser = await chromium.connectOverCDP(CDP)
  const page = browser.contexts()[0].pages().find((p) => p.url().includes('localhost:5173')) || browser.contexts()[0].pages()[0]
  const lw = (expr, ...args) => page.evaluate(({ expr, args }) => {
    const fn = new Function('api', 'args', `return api.${expr}(...args)`)
    return fn(window.electronAPI.longwriting, args)
  }, { expr, args })
  const must = (label, r) => {
    if (!r || r.success === false) throw new Error(`${label}: ${JSON.stringify(r && (r.error || r)).slice(0, 240)}`)
    return r
  }
  const retry = async (label, fn, tries = 3) => {
    for (let i = 1; i <= tries; i++) {
      try { return await fn(MODELS[Math.min(i - 1, MODELS.length - 1)]) } catch (e) {
        console.warn(`  [retry ${i}/${tries}] ${label}: ${String(e && e.message || e).slice(0, 140)}`)
        if (i === tries) throw e
        await page.waitForTimeout(4000)
      }
    }
  }
  const norm = (s) => String(s || '').replace(/\s/g, '')

  // ---------- bible ----------
  async function ensureCharacters() {
    if (state.characterIds) return
    const req = '基于当前故事概要生成主要角色（主角沈砚、女主苏晚、反派赵秉山、何瑞、孔老等），务必覆盖概要中点名的所有人物。'
    const r = must('生成角色', await retry('生成角色', (m) => lw('generateCharacters', 'bl-ch-' + Date.now(), PID, PC, m, req)))
    const list = Array.isArray(r.data) ? r.data : []
    if (list.length === 0) throw new Error('角色建议为空')
    state.characterIds = {}
    for (const c of list) {
      const payload = {
        projectId: PID,
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
      const saved = must(`建角色[${payload.name}]`, await lw('createCharacter', payload))
      state.characterIds[payload.name] = saved.data.id
      console.log(`✅ 角色 ${payload.name}（${payload.rolePosition}）`)
      save()
    }
  }

  async function ensureSkillsItems() {
    if (state.siDone) return
    const r = must('生成技能物品', await retry('生成技能物品', (m) => lw('generateSkillsItems', 'bl-si-' + Date.now(), PID, PC, m)))
    const d = r.data || {}
    for (const s of (d.skills || []).slice(0, 5)) {
      must('建技能', await lw('createSkill', {
        projectId: PID, name: String(s.name || '').slice(0, 40), type: String(s.type || 'other'),
        level: String(s.level || 'intermediate'), system: String(s.system || ''), description: String(s.description || ''), characterIds: [],
      }))
      console.log('✅ 技能', s.name)
    }
    for (const it of (d.items || []).slice(0, 6)) {
      const itemPayload = {
        projectId: PID, name: String(it.name || '').slice(0, 40), type: String(it.type || 'other'),
        level: String(it.level || 'rare'), description: String(it.description || ''),
      }
      if (it.ownerId) itemPayload.ownerId = String(it.ownerId)
      must('建物品', await lw('createItem', itemPayload))
      console.log('✅ 物品', it.name)
    }
    state.siDone = true
    save()
  }

  async function ensurePlots() {
    if (state.plotsDone) return
    const r = must('生成故事线', await retry('生成故事线', (m) => lw('generatePlots', 'bl-pl-' + Date.now(), PID, PC, m)))
    const list = Array.isArray(r.data) ? r.data : []
    const chars = state.characterIds || {}
    const mapped = list.map((p) => ({
      title: String(p.title || '').slice(0, 40),
      summary: String(p.summary || ''),
      involvedCharacters: (p.involvedCharacters || []).map((n) => chars[norm(n)]).filter(Boolean),
    })).filter((p) => p.title)
    must('批量建故事线', await lw('batchCreatePlots', PID, mapped))
    console.log(`✅ 故事线 ${mapped.length} 条`)
    state.plotsDone = true
    save()
  }

  async function ensureLocationsAndBackground(overview) {
    if (state.locDone) return
    const kls = Array.isArray(overview?.keyLocations) ? overview.keyLocations : []
    for (const l of kls.slice(0, 6)) {
      const name = typeof l === 'string' ? l : String(l?.name || '')
      if (!name) continue
      must('建地点', await lw('createLocation', {
        projectId: PID, name: name.slice(0, 30),
        type: typeof l === 'object' && l.type ? String(l.type) : '建筑',
        importance: typeof l === 'object' && l.importance === 'main' ? 'main' : 'secondary',
        description: typeof l === 'object' && l.brief ? String(l.brief) : '',
      }))
      console.log('✅ 地点', name)
    }
    const summary = String(overview?.summary || '')
    const bg = await lw('updateBackground', PID, {
      eraDescription: '当代中国（江城），传统典当行与现代拍卖行并存的古玩行当生态；地下黑市与正规拍卖会双轨流通。',
      factionDistribution: '宝岛拍卖行（赵秉山，行业龙头，暗行调包）；守镜人一脉（沈砚师父一系，十年前遭打压）；地下黑市（中立场域，三关考核）；警方文物稽查（终局收网力量）。以上源自概要与故事线，供 AI 生成引用。',
      geographicOrientation: '江城老城区（师父的典当行所在，拆迁危机核心）；新区商务区（宝岛拍卖行总部与发布会场地）；城郊地下黑市（当票线索指向）。以上源自概要，供 AI 生成引用。',
    })
    if (!bg.success) console.warn('  updateBackground 警告:', String(bg.error).slice(0, 120))
    else console.log('✅ 背景已写入（程序从概要派生）')
    state.locDone = true
    save()
  }

  async function linkOutlines() {
    if (state.linked) return
    const tree = must('取大纲', await lw('getOutlineTree', PID))
    const chapters = (Array.isArray(tree.data) ? tree.data : []).filter((n) => n.nodeType === 'chapter')
    const chars = state.characterIds || {}
    const locs = (must('取地点', await lw('getLocations', PID)).data || [])
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i]
      const text = norm(ch.name) + norm(ch.summary)
      const ic = Object.keys(chars).filter((n) => text.includes(norm(n))).map((n) => chars[n])
      const il = locs.filter((l) => text.includes(norm(l.name))).map((l) => l.id)
      must(`关联第${i + 1}集`, await retry(`关联第${i + 1}集`, async () => {
        const r = await lw('updateOutline', ch.id, { involvedCharacters: ic, involvedLocations: il })
        if (!r.success) throw new Error(r.error || 'updateOutline 失败')
        return r
      }, 3))
      console.log(`✅ 第${i + 1}集 关联角色[${ic.map((id) => Object.keys(chars).find((k) => chars[k] === id)).join('/') || '无'}] 地点${il.length}个`)
    }
    state.linked = true
    save()
  }

  // ---------- extract ----------
  async function ensureExtract() {
    state.extract = state.extract || {}
    const tree = must('取大纲', await lw('getOutlineTree', PID))
    const chapters = (Array.isArray(tree.data) ? tree.data : []).filter((n) => n.nodeType === 'chapter')
    for (let i = 0; i < chapters.length; i++) {
      const oid = chapters[i].id
      if (state.extract[oid]) continue
      const ch = await lw('getChapter', oid)
      const content = (ch.success && ch.data && ch.data.content) || ''
      if (!content) throw new Error(`第${i + 1}集无正文`)
      const no = i + 1
      await retry(`第${no}集图谱提取`, (m) => lw('graphExtractChapter', PID, oid, content, no, PC, m), 2)
      await retry(`第${no}集状态摘要`, (m) => lw('extractChapterStateSummary', PID, oid, no, content, PC, m), 2)
      state.extract[oid] = true
      save()
      console.log(`✅ 第${no}集 提取完成`)
    }
  }

  async function scanAndVerify() {
    const conflicts = await lw('graphScanContradictions', PID)
    console.log('一致性扫描:', JSON.stringify(conflicts.data || []).slice(0, 300))
    const tree = must('取大纲', await lw('getOutlineTree', PID))
    const first = (Array.isArray(tree.data) ? tree.data : []).find((n) => n.nodeType === 'chapter')
    const ctx = must('上下文预览', await lw('chapterContextPreview', PID, first.id, { targetWords: 1800 }))
    const titles = (ctx.data.items || []).map((i) => `${i.title}(${i.tokens}t)`)
    console.log('第1集上下文项:', titles.join(' | '))
    const hasChar = (ctx.data.items || []).some((i) => i.sectionKey === 'character')
    console.log(hasChar ? '✅ 角色已进上下文' : '❌ 角色未进上下文')
  }

  const ov = must('取概要', await lw('getStoryOverview', PID)).data
  if (phase === 'all' || phase === 'bible') {
    await ensureCharacters()
    await ensureSkillsItems()
    await ensurePlots()
    await ensureLocationsAndBackground(ov)
    await linkOutlines()
  }
  if (phase === 'all' || phase === 'extract') {
    await ensureExtract()
    await scanAndVerify()
  }
  console.log('DONE')
  process.exit(0)
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
