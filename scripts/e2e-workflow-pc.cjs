/**
 * PC 端工作流 E2E —— 场景：每日早间新闻
 * start(主题) → web-search(政经新闻) → llm-chat(汇总早报 markdown) → report(落盘) → end
 * 建图走 electronAPI（IPC+服务+DB 真链路），编辑器渲染/发布/运行/详情走真实 UI。
 * 前置：electron-vite dev --remote-debugging-port=9222
 */
const { chromium } = require('playwright')

const results = []
const step = async (name, fn) => {
  try { await fn(); results.push(`✅ ${name}`); console.log(`✅ ${name}`) }
  catch (e) { results.push(`❌ ${name}: ${e.message}`); console.error(`❌ ${name}:`, e.message); if (!process.argv.includes('--keep')) throw e }
}
const assert = (c, m) => { if (!c) throw new Error(m) }
const WF_NAME = `E2E-每日早间新闻-${Date.now().toString(36)}`

const GRAPH = {
  version: 1,
  nodes: [
    { id: 'start', type: 'start', name: '开始', position: { x: 60, y: 300 }, config: { inputs: [{ key: 'topic', label: '新闻主题', type: 'string', required: true, defaultValue: '时政与财经' }] } },
    { id: 'search', type: 'web-search', name: '政经新闻搜索', position: { x: 320, y: 300 }, config: { query: '{{start.topic}} 最新新闻 今日', maxResults: 8 } },
    { id: 'digest', type: 'llm-chat', name: '汇总早报', position: { x: 580, y: 300 }, config: { systemPrompt: '你是新闻编辑。把搜索结果整理成一份每日早间新闻简报（markdown）：按重要性排序，每条一行摘要，最后给一段主编点评。不得编造搜索结果之外的信息。', prompt: '主题：{{start.topic}}\n\n搜索结果：\n{{search.result}}', temperature: 0.3 } },
    { id: 'report', type: 'report', name: '早报输出', position: { x: 840, y: 300 }, config: { title: '每日早间新闻', template: '# 每日早间新闻\n\n{{digest.content}}' } },
    { id: 'end', type: 'end', name: '结束', position: { x: 1100, y: 300 }, config: {} },
  ],
  edges: [
    { id: 'e1', sourceNodeId: 'start', targetNodeId: 'search', kind: 'normal' },
    { id: 'e2', sourceNodeId: 'search', targetNodeId: 'digest', kind: 'normal' },
    { id: 'e3', sourceNodeId: 'digest', targetNodeId: 'report', kind: 'normal' },
    { id: 'e4', sourceNodeId: 'report', targetNodeId: 'end', kind: 'normal' },
  ],
}

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')
  const gotoHash = async h => { await page.evaluate(x => { location.hash = x }, h); await page.waitForTimeout(900) }
  const closeOverlays = async () => {
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250) }
  }

  let defId = null, runId = null

  await step('1. 列表页加载', async () => {
    await gotoHash('#/workflow'); await closeOverlays()
    await page.waitForTimeout(600)
    assert((await page.textContent('body')).includes('工作流'), '页面未渲染')
  })

  await step('2. 创建定义+保存图（electronAPI 真链路）', async () => {
    const r = await page.evaluate(async (args) => {
      const wf = window.electronAPI.workflow
      const created = await wf.createDefinition({ name: args.name, description: 'E2E 场景工作流' })
      if (!created.success) return { error: created.error }
      const saved = await wf.saveDraft(created.data.id, args.graph)
      if (!saved.success) return { error: saved.error, id: created.data.id }
      return { id: created.data.id }
    }, { name: WF_NAME, graph: GRAPH })
    assert(r.id, `建图失败: ${r.error}`)
    defId = r.id
  })

  await step('3. 编辑器渲染 5 节点图', async () => {
    await gotoHash(`#/workflow/editor/${defId}`)
    await page.waitForTimeout(1800)
    await closeOverlays()
    const nodes = await page.$$('.vue-flow__node')
    assert(nodes.length >= 5, `画布节点数 ${nodes.length} < 5`)
    const body = await page.textContent('body')
    assert(body.includes('政经新闻搜索') || body.includes('汇总早报'), '节点名称未渲染')
  })

  await step('4. 保存草稿 + 发布', async () => {
    const btns = await page.$$('button')
    for (const b of btns) { const t = (await b.textContent()) || ''; if (t.includes('保存草稿')) { await b.click(); await page.waitForTimeout(1200); break } }
    const btns2 = await page.$$('button')
    for (const b of btns2) { const t = (await b.textContent()) || ''; if (t.includes('发布')) { await b.click(); break } }
    await page.waitForTimeout(900)
    const confirm = await page.$('.el-message-box .el-button--primary')
    if (confirm) { await confirm.click(); await page.waitForTimeout(1800) }
    const ver = await page.evaluate(async id => {
      const r = await window.electronAPI.workflow.getDefinition(id)
      return r.success ? r.data.publishedVersion : 0
    }, defId)
    assert(ver > 0, `发布后版本号异常: ${ver}`)
  })

  await step('5. 列表页出现已发布条目', async () => {
    await gotoHash('#/workflow'); await closeOverlays(); await page.waitForTimeout(900)
    const text = await page.textContent('body')
    assert(text.includes(WF_NAME), '列表未见新建工作流')
  })

  await step('6. 启动运行并等待终态（引擎+搜索+LLM+report 全链路）', async () => {
    const r = await page.evaluate(async id => {
      const resp = await window.electronAPI.workflow.startRun({ definitionId: id, inputs: {} })
      return resp.success ? { runId: resp.data.id } : { error: resp.error }
    }, defId)
    assert(r.runId, `启动失败: ${r.error}`)
    runId = r.runId
    let status = 'pending'
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(3000)
      status = await page.evaluate(async rid => {
        const resp = await window.electronAPI.workflow.getRun(rid)
        return resp.success ? resp.data.status : 'unknown'
      }, runId)
      console.log(`   [${i * 3}s] ${status}`)
      if (['succeeded', 'failed', 'cancelled', 'timed_out', 'interrupted'].includes(status)) break
    }
    console.log('   终态:', status)
    assert(status === 'succeeded', `运行终态为 ${status}（期望 succeeded）`)
  })

  await step('7. 运行统计与节点产物（report 有 markdown 输出）', async () => {
    const detail = await page.evaluate(async rid => {
      const resp = await window.electronAPI.workflow.getRun(rid)
      return resp.success ? resp.data : null
    }, runId)
    assert(detail, '取运行详情失败')
    console.log('   stats:', JSON.stringify(detail.stats))
    assert((detail.stats?.doneNodes ?? 0) >= 4, `完成节点数不足: ${JSON.stringify(detail.stats)}`)
  })

  await step('8. 运行详情页时间线渲染', async () => {
    await gotoHash(`#/workflow/run/${runId}`)
    await page.waitForTimeout(1500)
    await closeOverlays()
    const body = await page.textContent('body')
    assert(/成功|succeeded|完成|节点/.test(body), '详情页内容异常')
  })

  console.log('\n===== E2E 结果 =====')
  results.forEach(r => console.log(r))
  const fail = results.filter(r => r.startsWith('❌')).length
  console.log(fail === 0 ? `\n全部 ${results.length} 步通过 ✅  (defId=${defId} runId=${runId})` : `\n${fail}/${results.length} 步失败 ❌`)
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error('E2E FATAL:', e.message); process.exit(2) })
