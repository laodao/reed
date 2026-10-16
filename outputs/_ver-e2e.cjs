/** 版本管理 E2E：save-asset versioned/versionOfAssetId → 版本链 → IPC 列表/取回/回滚 */
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const step = async (name, fn) => { try { const r = await fn(); console.log('✅', name); return r } catch (e) { console.error('❌', name, e.message); throw e } }

const GRAPH = { version: 1, nodes: [
  { id: 'start', type: 'start', name: '开始', position: { x: 40, y: 300 }, config: { inputs: [
    { key: 'content', label: '内容', type: 'textarea', required: true },
    { key: 'base_asset_id', label: '基底资产', type: 'string' },
    { key: 'feedback', label: '说明', type: 'string' },
  ] } },
  { id: 'save1', type: 'save-asset', name: '存版本', position: { x: 300, y: 300 }, config: {
    content: '{{start.content}}', kind: 'text', category: 'text', name: 'E2E-版本链验证', versioned: true,
    versionOfAssetId: '{{start.base_asset_id}}', feedback: '{{start.feedback}}',
  } },
  { id: 'end', type: 'end', name: '结束', position: { x: 560, y: 300 }, config: {} },
], edges: [
  { id: 'e1', sourceNodeId: 'start', targetNodeId: 'save1', kind: 'normal' },
  { id: 'e2', sourceNodeId: 'save1', targetNodeId: 'end', kind: 'normal' },
] }
const NAME = 'E2E-版本链-' + Date.now().toString(36)

async function runOnce(page, appId, inputs) {
  const s = await page.evaluate(async (a) => {
    const c = await window.electronAPI.appSession.create({ appId: a.appId })
    const st = await window.electronAPI.appSession.start({ sessionId: c.data.id, inputs: a.inputs })
    return st.success === false ? { error: st.error } : { sid: c.data.id }
  }, { appId, inputs })
  assert(!s.error, `启动失败 ${s.error}`)
  for (let i = 0; i < 30; i++) {
    const done = await page.evaluate(async (sid) => {
      const sess = await window.electronAPI.appSession.get(sid)
      return sess?.data?.status !== 'running'
    }, s.sid)
    if (done) break
    await sleep(1000)
  }
  return s.sid
}

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('renderer'))
  assert(page, '未找到渲染页')

  const ids = await step('1. 建临时工作流→发布→建应用', async () => {
    const r = await page.evaluate(async (a) => {
      const wf = window.electronAPI.workflow
      const d = await wf.createDefinition({ name: a.name })
      await wf.saveDraft(d.data.id, a.graph)
      await wf.publishDefinition({ id: d.data.id })
      const app = await window.electronAPI.app.createFromWorkflow({ definitionId: d.data.id, name: a.name, channelSession: true, channelShare: false, channelApi: false })
      return app.success ? { defId: d.data.id, appId: app.data.id } : { error: app.error }
    }, { name: NAME, graph: GRAPH })
    assert(r.appId, JSON.stringify(r))
    return r
  })

  const assetId = await step('2. 首运行：versioned → v1', async () => {
    await runOnce(page, ids.appId, { content: '这是初稿内容', base_asset_id: '', feedback: '首次入链' })
    const list = await page.evaluate(async () => (await window.electronAPI.assets.list({ keyword: 'E2E-版本链验证', page: 1, pageSize: 5 })).data)
    assert(list.items.length >= 1, '资产未找到')
    return list.items[0].id
  })

  await step('3. 修订运行：versionOfAssetId → 同资产 v2 + 内容就地更新', async () => {
    await runOnce(page, ids.appId, { content: '这是按意见修订的内容', base_asset_id: assetId, feedback: '按意见修订' })
    const a = await page.evaluate(async (id) => (await window.electronAPI.assets.get(id)).data, assetId)
    assert(a.textContent === '这是按意见修订的内容', `内容未更新: ${a.textContent}`)
  })

  await step('4. 版本链验证：list 新→旧 [2,1]，getVersion 取回全文', async () => {
    const lv = await page.evaluate(async (id) => (await window.electronAPI.assets.listVersions(id)).data, assetId)
    assert(lv.map(x => x.version).join() === '2,1', `版本序异常: ${JSON.stringify(lv)}`)
    const v1 = await page.evaluate(async (a) => (await window.electronAPI.assets.getVersion(a.assetId, 1)).data, { assetId })
    assert(v1.content === '这是初稿内容' && v1.feedback === '首次入链', `v1 内容异常: ${JSON.stringify(v1).slice(0, 120)}`)
  })

  await step('5. 回滚到 v1 → 另存 v3 + 内容还原 + 历史不删', async () => {
    const rb = await page.evaluate(async (id) => (await window.electronAPI.assets.rollbackVersion(id, 1)).data, assetId)
    assert(rb.version === 3, `回滚版本号异常: ${JSON.stringify(rb)}`)
    const a = await page.evaluate(async (id) => (await window.electronAPI.assets.get(id)).data, assetId)
    assert(a.textContent === '这是初稿内容', '回滚后内容未还原')
    const lv = await page.evaluate(async (id) => (await window.electronAPI.assets.listVersions(id)).data, assetId)
    assert(lv.length === 3 && lv[0].feedback.includes('回滚到 v1'), `链异常: ${JSON.stringify(lv)}`)
  })

  await step('6. UI 走查：资产中心预览对话框出现「版本」按钮 + 版本表渲染', async () => {
    await page.goto(page.url().split('#')[0] + '#/assets')
    await page.waitForSelector('.asset-center, .assets-page, main', { timeout: 15000 })
    await page.waitForSelector('text=E2E-版本链验证', { timeout: 15000 })
    await page.locator('.asset-card .preview, .preview').first().click()
    await page.waitForSelector('.preview-toolbar', { timeout: 10000 })
    await page.click('.pt-actions >> text=版本')
    await page.waitForSelector('.el-table__row', { timeout: 10000 })
    const rows = await page.locator('.el-dialog:has-text("版本历史") .el-table__row').count()
    assert(rows === 3, `版本表应 3 行，实际 ${rows}`)
    await page.screenshot({ path: 'outputs/e2e-asset-versions.png', fullPage: true })
  })

  await step('7. 清理', async () => {
    await page.evaluate(async (a) => {
      const s = await window.electronAPI.appSession.list(a.appId)
      for (const it of s.data ?? []) await window.electronAPI.appSession.delete(it.id)
      await window.electronAPI.app.delete(a.appId)
      await window.electronAPI.workflow.deleteDefinition(a.defId)
      await window.electronAPI.assets.delete(a.assetId)
    }, { ...ids, assetId })
  })

  console.log('\n🎉 版本管理 E2E 全部通过：versioned v1 / versionOf 续链 / IPC 列表取回 / 回滚另存 / UI 渲染')
})().catch(e => { console.error('\nE2E 失败：', e.message); process.exit(1) })
