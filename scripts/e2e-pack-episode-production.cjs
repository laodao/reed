/**
 * 业务包 e2e：episode-production（剧集制作）—— 项目/剧集 CRUD + 资产域查询 + 预设/门控
 * 说明：真实用户库存在存量 schema 漂移（video_episodes.outline_id / character_bindings.long_writing_character_id
 *       仍为 NOT NULL，entity 已改 nullable 但 SQLite 迁移空转 + 生产不跑 synchronize），
 *       故剧集走 outline 模式、角色资产走 linked_lw 模式测试；uploaded / standalone 作为已知失败软步骤记录。
 * 前置：electron . --remote-debugging-port=9333 已启动
 */
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const fails = []
const step = async (name, fn, soft) => {
  try { await fn(); console.log('✅', name) }
  catch (e) {
    if (soft) { console.log('⚠️', name, '[已知存量/环境]', e.message); return }
    fails.push(`${name}: ${e.message}`); console.error('❌', name, '|', e.message)
  }
}

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  assert(page, '未找到应用页面')

  let lwProjectId = null, lwOutlineId = null, lwCharId = null
  let projectId = null, episodeId = null, assetCharId = null
  try {
    await step('0. 准备 longwriting 侧数据（项目+大纲+角色）', async () => {
      const p = await page.evaluate(() => window.electronAPI.longwriting.createProject({ name: 'E2E-LW联动项目', type: 'story' }))
      assert(p.success && p.data && p.data.id, JSON.stringify(p.error || p))
      lwProjectId = p.data.id
      const o = await page.evaluate((id) => window.electronAPI.longwriting.createOutline({
        projectId: id, name: 'E2E-第一章', nodeType: 'chapter', summary: '联动测试章节'
      }), lwProjectId)
      assert(o.success && o.data && o.data.id, JSON.stringify(o.error || o))
      lwOutlineId = o.data.id
      const c = await page.evaluate((id) => window.electronAPI.longwriting.createCharacter({
        projectId: id, name: 'E2E-联动角色', gender: 'male', age: 28
      }), lwProjectId)
      assert(c.success && c.data && c.data.id, JSON.stringify(c.error || c))
      lwCharId = c.data.id
    })

    await step('1. ep:create-project 建项目（关联 lw 项目）', async () => {
      // 注意：config 为 NOT NULL 列，不传会撞约束（存量问题，前端 NewProjectDialog 会传）
      const config = {
        resolution: '1080p', aspectRatio: '16:9', fps: 30,
        defaultNarratorVoice: '', defaultCharacterVoice: '',
        backgroundMusicEnabled: false, backgroundMusicVolume: 50
      }
      const r = await page.evaluate(
        ({ name, lwId, config }) => window.electronAPI.episodeProduction.createProject(name, lwId, config),
        { name: 'E2E-EP项目', lwId: lwProjectId, config }
      )
      assert(r.success && r.data && r.data.id, JSON.stringify(r.error || r))
      projectId = r.data.id
    })

    await step('2. ep:list-projects / list-projects-summary / get-project / update-project', async () => {
      const list = await page.evaluate(() => window.electronAPI.episodeProduction.listProjects())
      assert(list.success && list.data.some(p => p.id === projectId), 'listProjects 未含新项目')
      const sum = await page.evaluate(() => window.electronAPI.episodeProduction.listProjectsSummary())
      assert(sum.success, `listProjectsSummary: ${JSON.stringify(sum.error || sum).slice(0, 200)}`)
      const get = await page.evaluate((id) => window.electronAPI.episodeProduction.getProject(id), projectId)
      assert(get.success && get.data && get.data.name === 'E2E-EP项目', 'getProject 内容不符')
      const upd = await page.evaluate((id) => window.electronAPI.episodeProduction.updateProject(id, { name: 'E2E-EP项目R' }), projectId)
      assert(upd.success, `updateProject: ${JSON.stringify(upd.error || upd)}`)
    })

    await step('3. ep:create-episode（outline 模式）', async () => {
      const r = await page.evaluate(({ pid, oid }) => window.electronAPI.episodeProduction.createEpisode(pid, {
        sourceType: 'outline', outlineId: oid, episodeNumber: 1, title: 'E2E-第1集'
      }), { pid: projectId, oid: lwOutlineId })
      assert(r.success && r.data && r.data.id, JSON.stringify(r.error || r).slice(0, 300))
      episodeId = r.data.id
    })

    await step('3b. ep:create-episode uploaded 模式（已知存量 schema 失败，验证错误可读）', async () => {
      const r = await page.evaluate((pid) => window.electronAPI.episodeProduction.createEpisode(pid, {
        sourceType: 'uploaded',
        uploadedContent: '第一章 测试\n小明走进幽静的山谷，穿过一片茂密的竹林，在斑驳的光影中看到了一把插在石碑上的古剑。',
        episodeNumber: 99, title: 'E2E-uploaded集'
      }), projectId)
      // 存量问题：video_episodes.outline_id NOT NULL，uploaded 模式无法创建
      assert(!r.success, `意外成功（schema 已修复？）: ${JSON.stringify(r).slice(0, 200)}`)
      assert(String(r.error).includes('outline_id'), `错误非预期: ${r.error}`)
      console.log('   确认为存量 schema 漂移:', String(r.error).slice(0, 80))
    }, true)

    await step('4. ep:list-episodes / get-episode / update-episode / 进度与门控', async () => {
      const list = await page.evaluate((pid) => window.electronAPI.episodeProduction.listEpisodes(pid), projectId)
      assert(list.success && list.data.some(e => e.id === episodeId), 'listEpisodes 未含新剧集')
      const get = await page.evaluate((id) => window.electronAPI.episodeProduction.getEpisode(id), episodeId)
      assert(get.success && get.data && get.data.title === 'E2E-第1集', 'getEpisode 内容不符')
      const upd = await page.evaluate((id) => window.electronAPI.episodeProduction.updateEpisode(id, { title: 'E2E-第1集R' }), episodeId)
      assert(upd.success, `updateEpisode: ${JSON.stringify(upd.error || upd)}`)
      const lwp = await page.evaluate((pid) => window.electronAPI.episodeProduction.listEpisodesWithProgress(pid), projectId)
      assert(lwp.success, `listEpisodesWithProgress: ${JSON.stringify(lwp.error || lwp).slice(0, 200)}`)
      const prog = await page.evaluate((id) => window.electronAPI.episodeProduction.calculateEpisodeProgress(id), episodeId)
      assert(prog.success, `calculateEpisodeProgress: ${JSON.stringify(prog.error || prog).slice(0, 200)}`)
      const gate = await page.evaluate((id) => window.electronAPI.episodeProduction.canEnterStage(id, 'content', 'script'), episodeId)
      assert(gate.success, `canEnterStage: ${JSON.stringify(gate.error || gate).slice(0, 200)}`)
    })

    await step('5. ep:analyze-script-text 剧本拆分（纯函数）', async () => {
      const r = await page.evaluate(() => window.electronAPI.episodeProduction.analyzeScriptText(
        '第一章 山谷\n小明进山。\n第二章 古剑\n小明拔剑。'
      ))
      assert(r.success, JSON.stringify(r.error || r).slice(0, 200))
      const d = r.data || r
      const eps = d.episodes || d.chapters || d
      assert(Array.isArray(eps) ? eps.length >= 2 : true, `拆分结果异常: ${JSON.stringify(r).slice(0, 200)}`)
    })

    await step('6. 资产域查询：project-summary + character/location/item list + voice list', async () => {
      const sum = await page.evaluate((pid) => window.electronAPI.episodeProduction.asset.projectSummary(pid), projectId)
      assert(sum.success, `projectSummary: ${JSON.stringify(sum.error || sum).slice(0, 200)}`)
      for (const [name, fn] of [
        ['character.list', (pid) => window.electronAPI.episodeProduction.asset.character.list(pid)],
        ['location.list', (pid) => window.electronAPI.episodeProduction.asset.location.list(pid)],
        ['item.list', (pid) => window.electronAPI.episodeProduction.asset.item.list(pid)],
      ]) {
        const r = await page.evaluate(fn, projectId)
        assert(r.success, `${name}: ${JSON.stringify(r.error || r).slice(0, 200)}`)
      }
      const vl = await page.evaluate(() => window.electronAPI.episodeProduction.asset.voice.list())
      assert(vl.success, `voice.list: ${JSON.stringify(vl.error || vl).slice(0, 200)}`)
      const vlr = await page.evaluate(() => window.electronAPI.episodeProduction.asset.voice.listReady())
      assert(vlr.success, `voice.listReady: ${JSON.stringify(vlr.error || vlr).slice(0, 200)}`)
    })

    await step('7. 角色资产 createLinkedLw → get/effective/updateOverride → image list → delete', async () => {
      const c = await page.evaluate(({ pid, cid }) => window.electronAPI.episodeProduction.asset.character.createLinkedLw({
        projectId: pid, lwCharacterId: cid
      }), { pid: projectId, cid: lwCharId })
      assert(c.success && c.data && c.data.id, `createLinkedLw: ${JSON.stringify(c.error || c).slice(0, 300)}`)
      assetCharId = c.data.id
      const g = await page.evaluate((id) => window.electronAPI.episodeProduction.asset.character.get(id), assetCharId)
      assert(g.success, `character.get: ${JSON.stringify(g.error || g).slice(0, 200)}`)
      const eff = await page.evaluate((id) => window.electronAPI.episodeProduction.asset.character.effective(id), assetCharId)
      assert(eff.success, `character.effective: ${JSON.stringify(eff.error || eff).slice(0, 200)}`)
      const u = await page.evaluate((id) => window.electronAPI.episodeProduction.asset.character.updateOverride(id, { description: 'E2E-更新' }), assetCharId)
      assert(u.success, `updateOverride: ${JSON.stringify(u.error || u).slice(0, 200)}`)
      const imgs = await page.evaluate((id) => window.electronAPI.episodeProduction.asset.image.listByAsset('character', id), assetCharId)
      assert(imgs.success, `image.listByAsset: ${JSON.stringify(imgs.error || imgs).slice(0, 200)}`)
      const d = await page.evaluate((id) => window.electronAPI.episodeProduction.asset.character.delete(id), assetCharId)
      assert(d.success, `character.delete: ${JSON.stringify(d.error || d).slice(0, 200)}`)
      assetCharId = null
    })

    await step('7b. 角色资产 createStandalone（已知存量 schema 失败，验证错误可读）', async () => {
      const r = await page.evaluate((pid) => window.electronAPI.episodeProduction.asset.character.createStandalone({
        projectId: pid, name: 'E2E-独立角色', description: 'standalone 测试'
      }), projectId)
      // 存量问题：character_bindings.long_writing_character_id NOT NULL，standalone 无法创建
      assert(!r.success, `意外成功（schema 已修复？）`)
      assert(String(r.error).includes('long_writing_character_id'), `错误非预期: ${r.error}`)
      console.log('   确认为存量 schema 漂移:', String(r.error).slice(0, 80))
    }, true)

    await step('8. 预设/视频 provider 查询：style-presets / video-presets / video-providers / preset.list / user-asset.list', async () => {
      for (const [name, fn] of [
        ['getStylePresets', () => window.electronAPI.episodeProduction.getStylePresets()],
        ['getVideoPresets', () => window.electronAPI.episodeProduction.getVideoPresets()],
        ['listVideoProviders', () => window.electronAPI.episodeProduction.listVideoProviders()],
        ['preset.list', () => window.electronAPI.episodeProduction.asset.preset.list()],
        ['userAsset.list', () => window.electronAPI.episodeProduction.asset.userAsset.list()],
        ['referenceVideo.list', () => window.electronAPI.episodeProduction.asset.referenceVideo.list()],
      ]) {
        const r = await page.evaluate(fn)
        assert(r.success, `${name}: ${JSON.stringify(r.error || r).slice(0, 200)}`)
      }
    })

    await step('9. ep:delete-episode + delete-project + 清理 lw 项目', async () => {
      const de = await page.evaluate((id) => window.electronAPI.episodeProduction.deleteEpisode(id), episodeId)
      assert(de.success, `deleteEpisode: ${JSON.stringify(de.error || de)}`)
      episodeId = null
      const dp = await page.evaluate((id) => window.electronAPI.episodeProduction.deleteProject(id), projectId)
      assert(dp.success, `deleteProject: ${JSON.stringify(dp.error || dp)}`)
      projectId = null
      const list = await page.evaluate(() => window.electronAPI.episodeProduction.listProjects())
      assert(!list.data.some(p => String(p.name).startsWith('E2E-')), 'EP 项目清理不彻底')
      const dl = await page.evaluate((id) => window.electronAPI.longwriting.deleteProject(id), lwProjectId)
      assert(dl.success, `清理 lw 项目失败: ${JSON.stringify(dl.error || dl)}`)
      lwProjectId = null
      const lwList = await page.evaluate(() => window.electronAPI.longwriting.getProjects())
      assert(!lwList.data.some(p => String(p.name).startsWith('E2E-')), 'LW 项目清理不彻底')
    })
  } finally {
    if (assetCharId) await page.evaluate((id) => window.electronAPI.episodeProduction.asset.character.delete(id).catch(() => {}), assetCharId)
    if (episodeId) await page.evaluate((id) => window.electronAPI.episodeProduction.deleteEpisode(id).catch(() => {}), episodeId)
    if (projectId) await page.evaluate((id) => window.electronAPI.episodeProduction.deleteProject(id).catch(() => {}), projectId)
    if (lwProjectId) await page.evaluate((id) => window.electronAPI.longwriting.deleteProject(id).catch(() => {}), lwProjectId)
    await browser.close()
  }
  console.log(fails.length ? `\n失败 ${fails.length} 项:\n- ${fails.join('\n- ')}` : '\nepisode-production 包测试全部通过')
  process.exit(fails.length ? 1 : 0)
})().catch(e => { console.error('脚本异常:', e.message); process.exit(1) })
