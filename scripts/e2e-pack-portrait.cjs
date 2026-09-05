/**
 * 业务包 e2e：portrait（人像设计）—— 项目/角色 CRUD + 提示词模板 + AI 生图（依赖 provider）
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
const IMAGE_MODEL = 'wan2.7-image'

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  assert(page, '未找到应用页面')

  let projectId = null, characterId = null, tplId = null
  try {
    await step('1. portrait:prompt-template:list 模板列表', async () => {
      const r = await page.evaluate(() => window.electronAPI.portrait.promptTemplate.list())
      assert(r.success, JSON.stringify(r.error))
      assert(Array.isArray(r.data || r.templates || r), `模板列表结构异常: ${JSON.stringify(r).slice(0, 200)}`)
    })

    await step('2. prompt-template save/apply/delete', async () => {
      const s = await page.evaluate(() => window.electronAPI.portrait.promptTemplate.save({
        name: 'E2E-测试模板', category: 'face', content: '一张${age}岁的脸', applyTo: ['face']
      }))
      assert(s.success, `save 失败: ${JSON.stringify(s.error || s)}`)
      tplId = (s.data && s.data.id) || (s.template && s.template.id) || s.id
      assert(tplId, `save 未返回 id: ${JSON.stringify(s).slice(0, 200)}`)
      const a = await page.evaluate((id) => window.electronAPI.portrait.promptTemplate.apply(id, { age: 25 }), tplId)
      assert(a.success, `apply 失败: ${JSON.stringify(a.error || a)}`)
      const d = await page.evaluate((id) => window.electronAPI.portrait.promptTemplate.delete(id), tplId)
      assert(d.success, `delete 失败: ${JSON.stringify(d.error || d)}`)
      tplId = null
    })

    await step('3. portrait:create-project 建项目', async () => {
      const r = await page.evaluate(() => window.electronAPI.portrait.createProject({ name: 'E2E-人像项目', description: '插件架构验证' }))
      assert(r.success, JSON.stringify(r.error || r))
      const p = r.data || r.project || r
      assert(p.id, `未返回项目 id: ${JSON.stringify(r).slice(0, 200)}`)
      projectId = p.id
    })

    await step('4. portrait:list-projects/get-project/update-project', async () => {
      const list = await page.evaluate(() => window.electronAPI.portrait.listProjects(1, 50))
      const projects = (list.data && (list.data.projects || list.data.items)) || list.projects || []
      assert(list.success && projects.some(p => p.id === projectId), 'listProjects 未含新项目')
      const get = await page.evaluate((id) => window.electronAPI.portrait.getProject(id), projectId)
      assert(get.success, `getProject 失败: ${JSON.stringify(get.error || get)}`)
      const upd = await page.evaluate((id) => window.electronAPI.portrait.updateProject({ id, description: 'E2E-更新' }), projectId)
      assert(upd.success, `updateProject 失败: ${JSON.stringify(upd.error || upd)}`)
    })

    await step('5. portrait:create-character 建角色', async () => {
      const r = await page.evaluate((pid) => window.electronAPI.portrait.createCharacter({
        projectId: pid, name: 'E2E-测试角色', gender: 'male', age: 25, height: 175, weight: 65,
        race: 'asian', description: '插件架构验证用'
      }), projectId)
      assert(r.success, JSON.stringify(r.error || r))
      const c = r.data || r.character || r
      assert(c.id, `未返回角色 id: ${JSON.stringify(r).slice(0, 200)}`)
      characterId = c.id
    })

    await step('6. portrait:list-characters/get-character/update-character', async () => {
      const list = await page.evaluate((pid) => window.electronAPI.portrait.listCharacters(pid), projectId)
      const chars = list.data || list.characters || []
      assert(list.success && chars.some(c => c.id === characterId), 'listCharacters 未含新角色')
      const get = await page.evaluate((id) => window.electronAPI.portrait.getCharacter(id), characterId)
      assert(get.success, `getCharacter 失败: ${JSON.stringify(get.error || get)}`)
      const upd = await page.evaluate((id) => window.electronAPI.portrait.updateCharacter({ id, description: 'E2E-更新' }), characterId)
      assert(upd.success, `updateCharacter 失败: ${JSON.stringify(upd.error || upd)}`)
    })

    await step('7. portrait:list-variants 变体列表（应为空）', async () => {
      const r = await page.evaluate((cid) => window.electronAPI.portrait.listVariants(cid), characterId)
      assert(r.success, JSON.stringify(r.error || r))
    })

    await step('8. portrait:generate AI 生图（真实 provider）', async () => {
      const r = await page.evaluate(({ cid, pid, mid }) => window.electronAPI.portrait.generate({
        characterId: cid, prompt: '一个普通东亚男性的证件照风格头像，简洁背景',
        providerId: pid, modelId: mid,
        config: { angles: ['front'], backgroundType: 'solid', backgroundColor: '#ffffff', width: 512, height: 512 }
      }), { cid: characterId, pid: PROVIDER_ID, mid: IMAGE_MODEL })
      assert(r.success, `generate 失败: ${JSON.stringify(r.error || r).slice(0, 300)}`)
      const variants = await page.evaluate((cid) => window.electronAPI.portrait.listVariants(cid), characterId)
      const vs = variants.data || variants.variants || []
      assert(vs.length > 0, '生成后仍无变体')
      const dv = await page.evaluate((vid) => window.electronAPI.portrait.deleteVariant(vid), vs[0].id)
      assert(dv.success, `deleteVariant 失败: ${JSON.stringify(dv.error || dv)}`)
    }, true) // AI 生图依赖 provider 额度，失败按环境记

    await step('9. portrait:delete-character + delete-project 清理', async () => {
      const dc = await page.evaluate((id) => window.electronAPI.portrait.deleteCharacter(id), characterId)
      assert(dc.success, `deleteCharacter 失败: ${JSON.stringify(dc.error || dc)}`)
      characterId = null
      const dp = await page.evaluate((id) => window.electronAPI.portrait.deleteProject(id), projectId)
      assert(dp.success, `deleteProject 失败: ${JSON.stringify(dp.error || dp)}`)
      projectId = null
      const list = await page.evaluate(() => window.electronAPI.portrait.listProjects(1, 100))
      const projects = (list.data && (list.data.projects || list.data.items)) || list.projects || []
      assert(!projects.some(p => String(p.name).startsWith('E2E-')), '项目清理不彻底')
    })
  } finally {
    if (tplId) await page.evaluate((id) => window.electronAPI.portrait.promptTemplate.delete(id).catch(() => {}), tplId)
    if (characterId) await page.evaluate((id) => window.electronAPI.portrait.deleteCharacter(id).catch(() => {}), characterId)
    if (projectId) await page.evaluate((id) => window.electronAPI.portrait.deleteProject(id).catch(() => {}), projectId)
    await browser.close()
  }
  console.log(fails.length ? `\n失败 ${fails.length} 项:\n- ${fails.join('\n- ')}` : '\nportrait 包测试全部通过')
  process.exit(fails.length ? 1 : 0)
})().catch(e => { console.error('脚本异常:', e.message); process.exit(1) })
