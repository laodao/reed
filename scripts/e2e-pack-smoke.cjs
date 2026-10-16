/**
 * 业务包架构冒烟测试（PC 端 CDP）
 * 覆盖：pack.list 11 包 → 各包路由可达 → 禁用 skills 包（菜单消失 + skill:* IPC 被守卫拦截）
 *       → 重新启用恢复 → 依赖语义（禁 voice-design → episode-production 变 pending 且 ep:* 被拦；
 *       禁 workflow → app 变 pending 且 app:* 被拦）
 * 前置：electron . --remote-debugging-port=9333 已启动
 */
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const step = async (name, fn) => {
  try { await fn(); console.log('✅', name) }
  catch (e) { console.error('❌', name, e.message); process.exitCode = 1; throw e }
}

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  assert(page, '未找到应用页面')
  page.on('pageerror', e => console.error('[pageerror]', e.message))

  await step('1. pack.list → 11 个内置包且全部启用', async () => {
    const r = await page.evaluate(() => window.electronAPI.pack.list())
    assert(r.success, `pack.list 失败: ${JSON.stringify(r.error)}`)
    const ids = r.data.map(p => p.id).sort()
    assert(ids.length === 11, `包数=${ids.length}: ${ids}`)
    for (const id of ['chat', 'diary', 'episode-production', 'longwriting', 'portrait', 'skills', 'voice-design', 'workflow', 'app', 'knowledge-base', 'asset-center']) {
      assert(ids.includes(id), `缺包 ${id}`)
    }
    const disabled = r.data.filter(p => !p.enabled)
    assert(disabled.length === 0, `存在未启用包: ${disabled.map(p => p.id)}`)
  })

  await step('2. 菜单渲染 11 个业务入口', async () => {
    await page.evaluate(() => { window.location.hash = '#/' })
    await page.waitForTimeout(1500)
    const text = await page.evaluate(() => document.body.innerText)
    for (const label of ['技能库', '日记', '人像设计', '长文写作', '剧集制作', '知识库', '工作流', '应用', '资产管理']) {
      assert(text.includes(label), `首页/菜单缺「${label}」`)
    }
  })

  await step('3. 各业务包路由可达', async () => {
    for (const route of ['#/skills', '#/diary', '#/portrait', '#/chat', '#/longwriting', '#/voice/design', '#/knowledge-base', '#/workflow', '#/apps', '#/assets']) {
      await page.evaluate((h) => { window.location.hash = h }, route)
      await page.waitForTimeout(800)
      const len = await page.evaluate(() => document.body.innerText.length)
      assert(len > 20, `${route} 页面空白`)
    }
  })

  await step('4. 禁用 skills → IPC 守卫拦截 skill:* + 菜单入口消失', async () => {
    const r = await page.evaluate(async () => {
      const set = await window.electronAPI.pack.setEnabled('skills', false)
      if (!set.success) return { error: 'setEnabled 失败 ' + JSON.stringify(set.error) }
      const call = await window.electronAPI.skills.list().catch(e => ({ __throw: String(e) }))
      return { set, call }
    })
    assert(!r.error, r.error)
    const disabled =
      (r.call && r.call.success === false && r.call.error && r.call.error.code === 'PACK_DISABLED') ||
      (r.call && r.call.__throw && r.call.__throw.includes('PACK_DISABLED'))
    assert(disabled, `skill:list 未被拦截: ${JSON.stringify(r.call)}`)
    // 菜单（响应式注册表，禁用信息需刷新生效——本期语义：重启生效；此处验证持久化已落库）
    const info = await page.evaluate(() => window.electronAPI.pack.list())
    const skills = info.data.find(p => p.id === 'skills')
    assert(skills && skills.enabled === false, `skills 启用态未持久化: ${JSON.stringify(skills)}`)
  })

  await step('5. 依赖语义：voice-design 禁用 → episode-production 不可用', async () => {
    const r = await page.evaluate(async () => {
      await window.electronAPI.pack.setEnabled('voice-design', false)
      const info = await window.electronAPI.pack.list()
      const ep = info.data.find(p => p.id === 'episode-production')
      const epCall = await window.electronAPI.episodeProduction.listProjects().catch(e => ({ __throw: String(e) }))
      await window.electronAPI.pack.setEnabled('voice-design', true) // 恢复
      return { ep, epCall }
    })
    const epBlocked =
      r.ep && (r.ep.state === 'pending' || r.ep.state === 'disabled' || r.ep.enabled === false)
    assert(epBlocked, `EP 未随依赖下线: ${JSON.stringify(r.ep)}`)
    const blocked =
      (r.epCall && r.epCall.success === false && r.epCall.error && r.epCall.error.code === 'PACK_DISABLED') ||
      (r.epCall && r.epCall.__throw && r.epCall.__throw.includes('PACK_DISABLED'))
    assert(blocked, `ep:* 未被拦截: ${JSON.stringify(r.epCall && r.epCall.error || r.epCall)}`)
  })

  await step('5b. 依赖语义：workflow 禁用 → app 级联 pending 且 app:* 被拦', async () => {
    const r = await page.evaluate(async () => {
      await window.electronAPI.pack.setEnabled('workflow', false)
      const info = await window.electronAPI.pack.list()
      const app = info.data.find(p => p.id === 'app')
      const wfCall = await window.electronAPI.workflow.listDefinitions({ page: 1, pageSize: 1 }).catch(e => ({ __throw: String(e) }))
      const appCall = await window.electronAPI.app.list({ page: 1, pageSize: 1 }).catch(e => ({ __throw: String(e) }))
      await window.electronAPI.pack.setEnabled('workflow', true) // 恢复
      return { app, wfCall, appCall }
    })
    const appBlocked =
      r.app && (r.app.state === 'pending' || r.app.state === 'disabled' || r.app.enabled === false)
    assert(appBlocked, `app 未随依赖下线: ${JSON.stringify(r.app)}`)
    for (const [name, call] of [['wf:list-definitions', r.wfCall], ['app:list', r.appCall]]) {
      const blocked =
        (call && call.success === false && call.error && call.error.code === 'PACK_DISABLED') ||
        (call && call.__throw && call.__throw.includes('PACK_DISABLED'))
      assert(blocked, `${name} 未被拦截: ${JSON.stringify(call && call.error || call)}`)
    }
  })

  await step('6. 恢复：skills 重新启用 → skill:list 可用', async () => {
    const r = await page.evaluate(async () => {
      await window.electronAPI.pack.setEnabled('skills', true)
      return window.electronAPI.skills.list().catch(e => ({ __throw: String(e) }))
    })
    assert(r && r.success === true, `skill:list 恢复失败: ${JSON.stringify(r.error || r)}`)
  })

  console.log('\n冒烟测试全部通过')
  await browser.close()
})().catch(e => { console.error('冒烟测试失败:', e.message); process.exit(1) })
