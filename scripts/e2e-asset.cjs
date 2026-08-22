/**
 * 通用资产库 E2E（阶段一）：
 * 1. 工作流运行：save-asset（text/json/file 三形态）→ read-asset（content/path）→ message 串联，
 *    验证节点输出、assets 表行、磁盘文件
 * 2. 资产 IPC：asset:list / stats / create / update / delete
 * 3. 资产中心页面 /assets：分类筛选 + 卡片渲染 + 分页
 * 4. 清理：删 E2E 工作流 + E2E 资产（含磁盘文件）+ 临时文件
 */
const fs = require('fs')
const path = require('path')
const { DatabaseSync } = require('node:sqlite')
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const step = async (name, fn) => { try { await fn(); console.log('✅', name) } catch (e) { console.error('❌', name, e.message); throw e } }

const DATA_PATH = 'C:\\Users\\daoge\\the-bot'
const DB_PATH = path.join(DATA_PATH, 'the_bot.db')

function queryDb(sql, params = []) {
  const db = new DatabaseSync(DB_PATH)
  try {
    return db.prepare(sql).all(...params)
  } finally {
    db.close()
  }
}

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')

  // 临时文件（file 形态保存用）
  const tmpFile = path.join(DATA_PATH, 'e2e-asset-tmp.txt')
  fs.writeFileSync(tmpFile, '这是 E2E 文件形态资产的原文内容', 'utf-8')

  // 前置清理：删除历史 E2E 资产与 E2E 工作流（走真实删除路径，幂等）
  await step('前置清理（历史 E2E 资产/工作流）', async () => {
    const r = await page.evaluate(async () => {
      const a = window.electronAPI.assets
      const wf = window.electronAPI.workflow
      const listA = await a.list({ page: 1, pageSize: 200 })
      let removed = 0
      for (const item of (listA.success ? listA.data.items : [])) {
        if (item.name.startsWith('E2E') || item.name.includes('E2E')) {
          await a.delete(item.id)
          removed += 1
        }
      }
      const listW = await wf.listDefinitions({ keyword: 'E2E', page: 1, pageSize: 200 })
      let removedW = 0
      for (const item of (listW.success ? listW.data.items : [])) {
        if (item.name.startsWith('E2E-资产') || item.name.startsWith('E2E-重构')) {
          await wf.deleteDefinition(item.id)
          removedW += 1
        }
      }
      return { removed, removedW }
    })
    console.log(`   清理资产 ${r.removed} 个 / 工作流 ${r.removedW} 个`)
  })

  let defId
  let createdAssetIds = []

  await step('建工作流（text/json/file 三种保存 + 读取串联）并发布', async () => {
    const r = await page.evaluate(async () => {
      const wf = window.electronAPI.workflow
      const c = await wf.createDefinition({ name: `E2E-资产-${Date.now().toString(36)}` })
      if (!c.success) return { error: c.error }
      const graph = {
        version: 1,
        nodes: [
          { id: 'start', type: 'start', name: '开始', position: { x: 40, y: 200 }, config: { inputs: [{ key: 'topic', label: '主题', type: 'string' }] } },
          { id: 'save1', type: 'save-asset', name: '保存文本', position: { x: 260, y: 80 }, config: { content: 'Hello {{start.topic}}', kind: 'text', category: 'text', name: 'E2E文本资产', tags: 'e2e,文本' } },
          { id: 'read1', type: 'read-asset', name: '读取文本', position: { x: 460, y: 80 }, config: { assetId: '{{save1.assetId}}', output: 'content' } },
          { id: 'msg1', type: 'message', name: '输出文本', position: { x: 660, y: 80 }, config: { content: '读到:{{read1.content}}' } },
          { id: 'save2', type: 'save-asset', name: '保存数据', position: { x: 260, y: 220 }, config: { content: '{"greeting":"{{start.topic}}","n":42}', kind: 'json', category: 'json', name: 'E2E数据' } },
          { id: 'read2', type: 'read-asset', name: '读取数据', position: { x: 460, y: 220 }, config: { assetId: '{{save2.assetId}}', output: 'content' } },
          { id: 'msg2', type: 'message', name: '输出数据', position: { x: 660, y: 220 }, config: { content: '数据:{{read2.json.greeting}}/{{read2.json.n}}' } },
          { id: 'save3', type: 'save-asset', name: '保存文件', position: { x: 260, y: 360 }, config: { content: '{{start.filePath}}', kind: 'file', category: 'auto', name: 'E2E文件资产.txt' } },
          { id: 'read3', type: 'read-asset', name: '读取文件', position: { x: 460, y: 360 }, config: { assetId: '{{save3.assetId}}', output: 'path' } },
          { id: 'msg3', type: 'message', name: '输出路径', position: { x: 660, y: 360 }, config: { content: '文件:{{read3.path}}' } },
          { id: 'end', type: 'end', name: '结束', position: { x: 880, y: 200 }, config: {} },
        ],
        edges: [
          { id: 'e0', sourceNodeId: 'start', targetNodeId: 'save1', kind: 'normal' },
          { id: 'e1', sourceNodeId: 'save1', targetNodeId: 'read1', kind: 'normal' },
          { id: 'e2', sourceNodeId: 'read1', targetNodeId: 'msg1', kind: 'normal' },
          { id: 'e3', sourceNodeId: 'msg1', targetNodeId: 'save2', kind: 'normal' },
          { id: 'e4', sourceNodeId: 'save2', targetNodeId: 'read2', kind: 'normal' },
          { id: 'e5', sourceNodeId: 'read2', targetNodeId: 'msg2', kind: 'normal' },
          { id: 'e6', sourceNodeId: 'msg2', targetNodeId: 'save3', kind: 'normal' },
          { id: 'e7', sourceNodeId: 'save3', targetNodeId: 'read3', kind: 'normal' },
          { id: 'e8', sourceNodeId: 'read3', targetNodeId: 'msg3', kind: 'normal' },
          { id: 'e9', sourceNodeId: 'msg3', targetNodeId: 'end', kind: 'normal' },
        ],
      }
      const s = await wf.saveDraft(c.data.id, graph)
      if (!s.success) return { error: s.error }
      const p = await wf.publishDefinition({ id: c.data.id })
      if (!p.success) return { error: p.error }
      return { id: c.data.id }
    })
    assert(r.id, `失败 ${r.error}`)
    defId = r.id
  })

  await step('运行工作流（start.topic=你好，filePath=临时文件）→ 成功', async () => {
    const r = await page.evaluate(async ({ defId, tmpFile }) => {
      const wf = window.electronAPI.workflow
      const started = await wf.startRun({ definitionId: defId, inputs: { topic: '你好', filePath: tmpFile } })
      if (!started.success) return { error: started.error }
      const runId = started.data.id
      for (let i = 0; i < 40; i++) {
        await new Promise(r2 => setTimeout(r2, 300))
        const run = await wf.getRun(runId)
        if (!run.success) continue
        const status = run.data?.run?.status ?? run.data?.status
        if (status === 'succeeded') return { runId }
        if (status === 'failed') return { error: `运行失败: ${run.data?.run?.error || ''}` }
      }
      return { error: '运行超时' }
    }, { defId, tmpFile })
    assert(r.runId, r.error)
    console.log('   运行成功:', r.runId)
  })

  await step('assets 表落库：三种形态各一行，内容/分类/来源正确', async () => {
    const rows = queryDb(
      `SELECT id, name, category, kind, storage_path, url, text_content, json_content, size_bytes, source_type, source_ref
       FROM assets WHERE name LIKE 'E2E%' ORDER BY created_at DESC LIMIT 10`
    )
    assert(rows.length >= 3, `资产行不足: ${rows.length}`)
    const text = rows.find(x => x.kind === 'text')
    const json = rows.find(x => x.kind === 'json')
    const file = rows.find(x => x.kind === 'file')
    assert(text && text.text_content === 'Hello 你好', `文本资产异常 ${JSON.stringify(text)}`)
    assert(text.category === 'text' && text.source_type === 'workflow' && text.source_ref, `文本来源异常 ${JSON.stringify(text)}`)
    const parsed = JSON.parse(json.json_content)
    assert(json && parsed.greeting === '你好' && parsed.n === 42, `数据资产异常 ${JSON.stringify(json)}`)
    assert(json.category === 'json', `数据分类异常 ${JSON.stringify(json)}`)
    assert(file && file.storage_path && file.storage_path.startsWith('assets/text/'), `文件资产路径异常 ${JSON.stringify(file)}`)
    createdAssetIds = rows.map(x => x.id)
  })

  await step('磁盘文件真实存在（assets/text/<yyyyMM>/E2E文件资产.txt）', async () => {
    const rows = queryDb(`SELECT storage_path FROM assets WHERE name = 'E2E文件资产.txt'`)
    assert(rows.length === 1, '文件资产记录缺失')
    const abs = path.join(DATA_PATH, rows[0].storage_path)
    assert(fs.existsSync(abs), `磁盘文件不存在: ${abs}`)
    const content = fs.readFileSync(abs, 'utf-8')
    assert(content.includes('这是 E2E 文件形态资产的原文内容'), `文件内容异常: ${content}`)
    console.log('   落盘:', rows[0].storage_path)
  })

  await step('节点输出验证：msg1/msg2/msg3 的 output_json 内容正确', async () => {
    const runRows = queryDb(
      `SELECT node_id, node_name, output_json FROM workflow_node_runs
       WHERE run_id = (SELECT id FROM workflow_runs ORDER BY created_at DESC LIMIT 1)
       AND node_id IN ('msg1','msg2','msg3') ORDER BY node_id`
    )
    assert(runRows.length === 3, `消息节点记录不足 ${runRows.length}`)
    const get = id => JSON.parse(runRows.find(x => x.node_id === id).output_json || '{}')
    assert(get('msg1').content === '读到:Hello 你好', `msg1 异常 ${JSON.stringify(get('msg1'))}`)
    assert(get('msg2').content === '数据:你好/42', `msg2 异常 ${JSON.stringify(get('msg2'))}`)
    assert(get('msg3').content.startsWith('文件:') && get('msg3').content.includes('E2E文件资产.txt'), `msg3 异常 ${JSON.stringify(get('msg3'))}`)
    console.log('   msg1:', get('msg1').content)
    console.log('   msg2:', get('msg2').content)
    console.log('   msg3:', get('msg3').content)
  })

  await step('资产 IPC：stats / list（关键词+分类过滤）', async () => {
    const r = await page.evaluate(async () => {
      const a = window.electronAPI.assets
      const stats = await a.stats()
      const list = await a.list({ page: 1, pageSize: 50 })
      const filtered = await a.list({ category: 'text', keyword: 'E2E', page: 1, pageSize: 50 })
      return {
        statsOk: stats.success,
        total: list.success ? list.data.total : -1,
        textCount: filtered.success ? filtered.data.total : -1,
      }
    })
    assert(r.statsOk && r.total >= 3, `stats/list 异常 ${JSON.stringify(r)}`)
    assert(r.textCount >= 1, `分类+关键词过滤异常 ${JSON.stringify(r)}`)
  })

  await step('资产中心页面 /assets：导航 + 卡片渲染（含文本/JSON 预览、分页）', async () => {
    // page.goto 同 URL 不触发重载，可能命中 keep-alive 缓存实例 → 强制 reload 全新挂载
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(1500)
    await page.evaluate(() => { window.location.hash = '#/assets' })
    await page.waitForTimeout(1500)
    const r = await page.evaluate(() => ({
      title: document.querySelector('.page-title')?.textContent ?? '',
      cards: document.querySelectorAll('.asset-card').length,
      catTabs: [...document.querySelectorAll('.cat-tab')].map(t => t.textContent?.trim()),
      pager: !!document.querySelector('.pager .el-pagination'),
    }))
    assert(r.title === '资产管理', `页面标题异常 ${JSON.stringify(r)}`)
    assert(r.cards >= 3, `卡片数不足 ${r.cards}`)
    assert(r.catTabs.some(t => t.startsWith('全部')), `分类条异常 ${JSON.stringify(r.catTabs)}`)
    assert(r.pager, '分页缺失')
    console.log('   卡片:', r.cards, '| 分类:', r.catTabs.join(' '))
    // 切到"文本"分类 → 只剩文本类资产卡片（文本资产 + 文件资产）
    await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('.cat-tab')]
      tabs.find(t => t.textContent.startsWith('文本'))?.click()
    })
    await page.waitForTimeout(800)
    const catCards = await page.evaluate(() => document.querySelectorAll('.asset-card').length)
    assert(catCards >= 2, `文本分类卡片异常 ${catCards}`)
    await page.evaluate(() => { window.location.hash = '#/apps' })
    await page.waitForTimeout(400)
  })

  await step('资产 IPC：update 改名 + delete 删除（含磁盘清理）', async () => {
    const r = await page.evaluate(async (assetId) => {
      const a = window.electronAPI.assets
      const up = await a.update({ id: assetId, name: 'E2E改名资产', tags: ['e2e', '改名'] })
      if (!up.success) return { error: up.error }
      const del = await a.delete(assetId)
      return { name: up.data.name, tags: up.data.tags, deleted: del.success && del.data.deleted }
    }, createdAssetIds[0])
    assert(r.name === 'E2E改名资产' && r.tags.join(',') === 'e2e,改名' && r.deleted, `update/delete 异常 ${JSON.stringify(r)}`)
    const remaining = queryDb(`SELECT id FROM assets WHERE id = ?`, [createdAssetIds[0]])
    assert(remaining.length === 0, '删除后记录仍存在')
  })

  await step('清理：删 E2E 工作流 + 剩余 E2E 资产 + 临时文件', async () => {
    const r = await page.evaluate(async ({ defId, assetIds }) => {
      const wf = window.electronAPI.workflow
      const a = window.electronAPI.assets
      const results = []
      for (const id of assetIds) {
        const d = await a.delete(id)
        results.push(d.success)
      }
      const w = await wf.deleteDefinition(defId)
      return { assets: results.every(Boolean), workflow: w.success }
    }, { defId, assetIds: createdAssetIds.slice(1) })
    assert(r.assets && r.workflow, `清理失败 ${JSON.stringify(r)}`)
    const left = queryDb(`SELECT COUNT(*) AS c FROM assets WHERE name LIKE 'E2E%'`)
    assert(left[0].c === 0, `残留资产 ${left[0].c}`)
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
  })

  console.log('\n===== 通用资产库（阶段一）E2E 通过 ✅ =====')
  process.exit(0)
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
