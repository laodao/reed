/**
 * 业务包 e2e：longwriting（长文写作）—— 项目/概要/背景/角色/地点/势力/情节/大纲/章节/记忆/字典 CRUD
 * 前置：electron . --remote-debugging-port=9333 已启动
 */
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const fails = []
const step = async (name, fn, soft) => {
  try { await fn(); console.log('✅', name) }
  catch (e) {
    if (soft) { console.log('⚠️', name, '[环境/额度]', e.message); return }
    fails.push(`${name}: ${e.message}`); console.error('❌', name, '|', e.message)
  }
}
const PROVIDER_ID = 'pc_mtee10tz_ijz2yq1ro'
const MODEL_ID = 'deepseek-v4-flash-0731'

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  assert(page, '未找到应用页面')

  let pid = null
  try {
    await step('1. createProject 建 E2E 项目', async () => {
      const r = await page.evaluate(() => window.electronAPI.longwriting.createProject({ name: 'E2E-长文项目', type: 'story' }))
      assert(r.success && r.data && r.data.id, JSON.stringify(r.error || r))
      pid = r.data.id
    })

    await step('2. getProjects/getProject/updateProject', async () => {
      const list = await page.evaluate(() => window.electronAPI.longwriting.getProjects())
      assert(list.success && list.data.some(p => p.id === pid), 'getProjects 未含新项目')
      const get = await page.evaluate((id) => window.electronAPI.longwriting.getProject(id), pid)
      assert(get.success && get.data && get.data.name === 'E2E-长文项目', 'getProject 内容不符')
      const upd = await page.evaluate((id) => window.electronAPI.longwriting.updateProject(id, { name: 'E2E-长文项目R' }), pid)
      assert(upd.success, `updateProject 失败: ${JSON.stringify(upd.error || upd)}`)
    })

    await step('3. 故事概要 update/get/lock', async () => {
      const u = await page.evaluate((id) => window.electronAPI.longwriting.updateStoryOverview(id, {
        title: 'E2E 故事', coreIdea: '验证插件架构', summary: '一个测试故事', coreConflict: '测试冲突', estimatedChapters: 3
      }), pid)
      assert(u.success, `updateStoryOverview 失败: ${JSON.stringify(u.error || u)}`)
      const g = await page.evaluate((id) => window.electronAPI.longwriting.getStoryOverview(id), pid)
      assert(g.success, `getStoryOverview 失败: ${JSON.stringify(g.error || g)}`)
      const lock = await page.evaluate((id) => window.electronAPI.longwriting.lockStoryOverview(id, true), pid)
      assert(lock.success, `lock 失败: ${JSON.stringify(lock.error || lock)}`)
      await page.evaluate((id) => window.electronAPI.longwriting.lockStoryOverview(id, false), pid)
    })

    await step('4. 背景设定 update/get', async () => {
      const u = await page.evaluate((id) => window.electronAPI.longwriting.updateBackground(id, { eraDescription: 'E2E 测试时代' }), pid)
      assert(u.success, `updateBackground 失败: ${JSON.stringify(u.error || u)}`)
      const g = await page.evaluate((id) => window.electronAPI.longwriting.getBackground(id), pid)
      assert(g.success, `getBackground 失败: ${JSON.stringify(g.error || g)}`)
    })

    await step('5. 角色 create/get/list/update', async () => {
      const c = await page.evaluate((id) => window.electronAPI.longwriting.createCharacter({
        projectId: id, name: 'E2E-角色', gender: 'male', age: 30, race: 'asian', importance: 'main'
      }), pid)
      assert(c.success && c.data && c.data.id, JSON.stringify(c.error || c))
      const cid = c.data.id
      const list = await page.evaluate((id) => window.electronAPI.longwriting.getCharacters(id), pid)
      assert(list.success && list.data.some(x => x.id === cid), 'getCharacters 未含新角色')
      const u = await page.evaluate((cid) => window.electronAPI.longwriting.updateCharacter(cid, { occupation: 'E2E测试员' }), cid)
      assert(u.success, `updateCharacter 失败: ${JSON.stringify(u.error || u)}`)
    })

    await step('6. 地点/势力/情节 create + list', async () => {
      const loc = await page.evaluate((id) => window.electronAPI.longwriting.createLocation({ projectId: id, name: 'E2E-地点' }), pid)
      assert(loc.success && loc.data && loc.data.id, `createLocation: ${JSON.stringify(loc.error || loc)}`)
      const locs = await page.evaluate((id) => window.electronAPI.longwriting.getLocations(id), pid)
      assert(locs.success && locs.data.some(x => x.name === 'E2E-地点'), 'getLocations 未含新地点')
      const fac = await page.evaluate((id) => window.electronAPI.longwriting.createFaction({ projectId: id, factionType: 'sect', name: 'E2E-门派' }), pid)
      assert(fac.success, `createFaction: ${JSON.stringify(fac.error || fac)}`)
      const facs = await page.evaluate((id) => window.electronAPI.longwriting.getFactions(id), pid)
      assert(facs.success && facs.data.some(x => x.name === 'E2E-门派'), 'getFactions 未含新势力')
      const plot = await page.evaluate((id) => window.electronAPI.longwriting.createPlot({ projectId: id, title: 'E2E-情节', summary: '测试情节' }), pid)
      assert(plot.success, `createPlot: ${JSON.stringify(plot.error || plot)}`)
      const cnt = await page.evaluate((id) => window.electronAPI.longwriting.getPlotCount(id), pid)
      assert(cnt.success, `getPlotCount: ${JSON.stringify(cnt.error || cnt)}`)
    })

    await step('7. 大纲 + 章节 saveChapter/getChapter', async () => {
      const o = await page.evaluate((id) => window.electronAPI.longwriting.createOutline({
        projectId: id, name: 'E2E-第一章', nodeType: 'chapter', summary: '测试章节'
      }), pid)
      assert(o.success && o.data && o.data.id, `createOutline: ${JSON.stringify(o.error || o)}`)
      const oid = o.data.id
      const tree = await page.evaluate((id) => window.electronAPI.longwriting.getOutlineTree(id), pid)
      assert(tree.success, `getOutlineTree: ${JSON.stringify(tree.error || tree)}`)
      const s = await page.evaluate((oid) => window.electronAPI.longwriting.saveChapter(oid, 'E2E 测试章节正文。'), oid)
      assert(s.success, `saveChapter: ${JSON.stringify(s.error || s)}`)
      const g = await page.evaluate((oid) => window.electronAPI.longwriting.getChapter(oid), oid)
      assert(g.success && g.data && String(g.data.content).includes('E2E 测试章节正文'), `getChapter 内容不符: ${JSON.stringify(g.error || g.data).slice(0, 200)}`)
      const vs = await page.evaluate((oid) => {
        return window.electronAPI.longwriting.getChapter(oid).then(ch => {
          const chId = ch.data && ch.data.id
          return chId ? window.electronAPI.longwriting.getChapterVersions(chId) : { success: false, error: '无章节 id' }
        })
      }, oid)
      assert(vs.success, `getChapterVersions: ${JSON.stringify(vs.error || vs)}`)
    })

    await step('8. 记忆 create/list/stats', async () => {
      const m = await page.evaluate((id) => window.electronAPI.longwriting.createMemory({
        projectId: id, memoryType: 'character_event', title: 'E2E-记忆', description: '测试记忆',
        involvedEntities: [], chapterNumber: 1
      }), pid)
      assert(m.success, `createMemory: ${JSON.stringify(m.error || m)}`)
      const list = await page.evaluate((id) => window.electronAPI.longwriting.getMemories(id), pid)
      assert(list.success, `getMemories: ${JSON.stringify(list.error || list)}`)
      const st = await page.evaluate((id) => window.electronAPI.longwriting.getMemoryStats(id), pid)
      assert(st.success, `getMemoryStats: ${JSON.stringify(st.error || st)}`)
    })

    await step('9. 全局设置/字典/向导/向量索引/导出数据 查询', async () => {
      for (const [name, fn] of [
        ['getGlobalSettings', () => window.electronAPI.longwriting.getGlobalSettings()],
        ['getDictionaryCategories', () => window.electronAPI.longwriting.getDictionaryCategories()],
        ['getDictionaryAll', () => window.electronAPI.longwriting.getDictionaryAll()],
      ]) {
        const r = await page.evaluate(fn)
        assert(r.success, `${name}: ${JSON.stringify(r.error || r).slice(0, 200)}`)
      }
      const wz = await page.evaluate((id) => window.electronAPI.longwriting.wizardGetState(id), pid)
      assert(wz.success, `wizardGetState: ${JSON.stringify(wz.error || wz)}`)
      const vi = await page.evaluate((id) => window.electronAPI.vectorIndex.stats(id), pid)
      assert(vi.success, `vectorIndex.stats: ${JSON.stringify(vi.error || vi)}`)
      const ex = await page.evaluate((id) => window.electronAPI.longwriting.getExportData(id), pid)
      assert(ex.success, `getExportData: ${JSON.stringify(ex.error || ex)}`)
    })

    await step('10. AI generateStoryOverview（真实 provider）', async () => {
      const r = await page.evaluate(async ({ pid, pcid, mid }) => {
        return await new Promise((resolve) => {
          const eventId = 'e2e-' + Date.now()
          let last = null
          const off = window.electronAPI.longwriting.onGenerateEvent(eventId, (data) => { last = data })
          const timer = setTimeout(() => finish({ timeout: true, last }), 150000)
          function finish(d) { clearTimeout(timer); off(); resolve(d) }
          // handler 会 await 整个生成后返回最终结果；事件流仅作观察
          window.electronAPI.longwriting.generateStoryOverview(eventId, pid, '一个关于测试的故事', pcid, mid)
            .then(r => finish(r && r.success === false ? { error: r.error } : { done: true, result: r, last }))
            .catch(e => finish({ error: String(e) }))
        })
      }, { pid, pcid: PROVIDER_ID, mid: MODEL_ID })
      assert(!r.error, `generate 返回失败: ${String(r.error).slice(0, 300)}`)
      assert(!r.timeout, `150s 未完成: ${String(JSON.stringify(r.last || null)).slice(0, 200)}`)
      assert(r.done, '未正常结束')
    }, true) // AI 依赖 provider 额度，失败按环境记

    await step('11. deleteProject 级联清理', async () => {
      const r = await page.evaluate((id) => window.electronAPI.longwriting.deleteProject(id), pid)
      assert(r.success, `deleteProject: ${JSON.stringify(r.error || r)}`)
      pid = null
      const list = await page.evaluate(() => window.electronAPI.longwriting.getProjects())
      assert(!list.data.some(p => String(p.name).startsWith('E2E-')), '项目清理不彻底')
    })
  } finally {
    if (pid) await page.evaluate((id) => window.electronAPI.longwriting.deleteProject(id).catch(() => {}), pid)
    await browser.close()
  }
  console.log(fails.length ? `\n失败 ${fails.length} 项:\n- ${fails.join('\n- ')}` : '\nlongwriting 包测试全部通过')
  process.exit(fails.length ? 1 : 0)
})().catch(e => { console.error('脚本异常:', e.message); process.exit(1) })
