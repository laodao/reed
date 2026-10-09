/**
 * 复杂应用 E2E：「价格监控台」——全面覆盖应用平台 P0+P1 能力组合
 * 覆盖点：
 *  - P0 宿主桥：code 节点内 await host.http（真实外网 httpbin）/ host.table.upsert / host.table.query（读旧追史）/ host.log
 *  - P0 inputs：valueType=json 结构化注入（start.items 数组直入代码）
 *  - P1 数据层：createTable（boolean/json 列）/ foreach 循环 upsert / query 过滤分页 / count
 *  - 人工环节：human-review 挂起 → app-session:review 决策续跑
 *  - 非一次性：两次运行（价格变动）→ 行数不涨、价格更新、history 追加
 *  - UI：AppDetail「数据」页签真实渲染走查 + 截图
 * 前置：dev 实例 9222（新代码）
 */
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const step = async (name, fn) => { try { const r = await fn(); console.log('✅', name); return r } catch (e) { console.error('❌', name, e.message); throw e } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const WF_NAME = `E2E-价格监控台-${Date.now().toString(36)}`
const TABLE = '监控价格'

// ---- 采集代码（宿主桥核心：http + query 读旧 + upsert） ----
const COLLECT_CODE = `
const it = inputs.item
host.log.info('采集', it.name)
// 真实外网请求：httpbin 回显 args 作为"价格 API"
const base = Number(it.base || 100)
const price = base + Number(inputs.bump || 0)
const r = await host.http({ method: 'GET', url: 'https://httpbin.org/get?price=' + price + '&stock=' + (price < 150 ? 'true' : 'false'), responseType: 'json' })
const args = (r.json && r.json.args) || {}
const now = new Date().toISOString().slice(0, 10)
// 读旧行（host.table.query）→ history 增量追加（非一次性语义）
const old = await host.table.query({ tableName: inputs.table, scope: 'app', filter: { field: 'url', contains: it.url } })
const prev = old && old[0] ? (old[0].history || []) : []
const priceNow = Number(args.price)
const w = await host.table.upsert({
  tableName: inputs.table, scope: 'app',
  row: { url: it.url, name: it.name, price: priceNow, inStock: String(args.stock), history: [...prev, { at: now, price: priceNow }] },
})
return { name: it.name, price: priceNow, action: w.action }
`

const GRAPH = {
  version: 1,
  nodes: [
    {
      id: 'start', type: 'start', name: '开始', position: { x: 40, y: 300 },
      config: { inputs: [
        { key: 'items', label: '商品清单', type: 'json', required: true },
        { key: 'threshold', label: '低价线', type: 'string', required: false },
      ] },
    },
    {
      id: 'normalize', type: 'code', name: '解析清单(json 注入)', position: { x: 260, y: 300 },
      config: {
        code: `const list = Array.isArray(inputs.items) ? inputs.items : JSON.parse(inputs.items || '[]')\nhost.log.info('商品数', list.length)\nif (!list.length) throw new Error('清单为空')\nreturn { list, threshold: Number(inputs.threshold || 9999) }`,
        inputs: [
          { key: 'items', value: '{{start.items}}', valueType: 'json' },
          { key: 'threshold', value: '{{start.threshold}}' },
        ],
      },
    },
    {
      id: 'mkTable', type: 'data-table', name: '建表(幂等)', position: { x: 480, y: 300 },
      config: {
        op: 'createTable', scope: 'app', tableName: TABLE,
        columns: '[{"key":"url","type":"string"},{"key":"name","type":"string"},{"key":"price","type":"number"},{"key":"inStock","type":"boolean"},{"key":"history","type":"json"}]',
        dedupKeys: 'url',
      },
    },
    {
      id: 'loopEach', type: 'loop', name: '逐商品采集', position: { x: 700, y: 300 },
      config: { listExpression: '{{normalize.result.list}}', emptyPolicy: 'skip' },
    },
    {
      id: 'collect', type: 'code', name: '采集+入库(宿主桥)', position: { x: 920, y: 420 },
      config: {
        code: COLLECT_CODE,
        inputs: [
          { key: 'item', value: '{{loopEach.item}}' },
          { key: 'table', value: TABLE },
          { key: 'bump', value: '{{start.bump}}' },
        ],
      },
    },
    {
      id: 'total', type: 'data-table', name: '行数', position: { x: 1140, y: 300 },
      config: { op: 'count', scope: 'app', tableName: TABLE },
    },
    {
      id: 'review', type: 'human-review', name: '人工确认入库', position: { x: 1360, y: 300 },
      config: {
        payload: { stage: '价格监控采集完成', md: '已入库 {{total.total}} 条商品价格，确认后输出报告' },
        editableFields: [], timeoutMs: null, timeoutPolicy: 'fail',
      },
    },
    {
      id: 'pg', type: 'data-table', name: '分页查询', position: { x: 1580, y: 300 },
      config: { op: 'query', scope: 'app', tableName: TABLE, page: 1, pageSize: 2 },
    },
    {
      id: 'msg', type: 'message', name: '回显', position: { x: 1800, y: 300 },
      config: { content: '监控完成：共 {{total.total}} 条；本页 {{pg.rows.length}} 条，首条 {{pg.rows.0.name}} 价格 {{pg.rows.0.price}}（{{pg.rows.0.inStock}}），历史 {{pg.rows.0.history.length}} 次。低价线 {{normalize.result.threshold}}。' },
    },
    { id: 'end', type: 'end', name: '结束', position: { x: 2020, y: 300 }, config: {} },
  ],
  edges: [
    { id: 'e1', sourceNodeId: 'start', targetNodeId: 'normalize', kind: 'normal' },
    { id: 'e2', sourceNodeId: 'normalize', targetNodeId: 'mkTable', kind: 'normal' },
    { id: 'e3', sourceNodeId: 'mkTable', targetNodeId: 'loopEach', kind: 'normal' },
    { id: 'e4', sourceNodeId: 'loopEach', targetNodeId: 'collect', kind: 'loop-body' },
    { id: 'e5', sourceNodeId: 'collect', targetNodeId: 'loopEach', kind: 'loop-back' },
    { id: 'e6', sourceNodeId: 'loopEach', targetNodeId: 'total', kind: 'loop-done' },
    { id: 'e7', sourceNodeId: 'total', targetNodeId: 'review', kind: 'normal' },
    { id: 'e8', sourceNodeId: 'review', targetNodeId: 'pg', kind: 'approve' },
    { id: 'e9', sourceNodeId: 'pg', targetNodeId: 'msg', kind: 'normal' },
    { id: 'e10', sourceNodeId: 'msg', targetNodeId: 'end', kind: 'normal' },
  ],
}

const ITEMS = (bump) => JSON.stringify([
  { name: '机械键盘', url: 'https://shop/e2e-kb', base: 120 },
  { name: '显示器', url: 'https://shop/e2e-mon', base: 899 },
  { name: '鼠标垫', url: 'https://shop/e2e-pad', base: 39 },
])

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')

  // 1. 建复杂工作流 → 发布 → 建应用
  const ids = await step('1. 创建复杂工作流→发布→建应用（含 loop/code 宿主桥/审核/数据表 9 节点）', async () => {
    const r = await page.evaluate(async (args) => {
      const wf = window.electronAPI.workflow
      const created = await wf.createDefinition({ name: args.name })
      if (!created.success) return { error: created.error }
      await wf.saveDraft(created.data.id, args.graph)
      const pub = await wf.publishDefinition({ id: created.data.id })
      if (!pub.success) return { error: pub.error }
      const app = await window.electronAPI.app.createFromWorkflow({ definitionId: created.data.id, name: args.name, channelSession: true, channelShare: false, channelApi: false })
      return app.success ? { defId: created.data.id, appId: app.data.id } : { error: app.error }
    }, { name: WF_NAME, graph: GRAPH })
    assert(r.appId, `建应用失败 ${r.error}`)
    return r
  })

  // 运行一轮（start 输入 + 审核决策 + 等终态）
  const runRound = async (round, bump) => {
    const s = await page.evaluate(async (args) => {
      const created = await window.electronAPI.appSession.create({ appId: args.appId })
      if (!created.success) return { error: created.error }
      const started = await window.electronAPI.appSession.start({ sessionId: created.data.id, inputs: { items: args.items, threshold: '150', bump: String(args.bump) } })
      return started.success ? { sessionId: created.data.id } : { error: started.error }
    }, { appId: ids.appId, items: ITEMS(bump), bump })
    assert(s.sessionId, `第${round}轮启动失败 ${s.error}`)
    // 等 review 卡（挂起）
    let reviewCard = null
    for (let i = 0; i < 90; i++) {
      reviewCard = await page.evaluate(async (sessionId) => {
        const m = await window.electronAPI.appSession.messages(sessionId)
        return (m.data ?? []).find(x => x.metadata?.sessionCard?.card === 'review') ?? null
      }, s.sessionId)
      if (reviewCard) break
      await sleep(1000)
    }
    assert(reviewCard, `第${round}轮等待审核卡超时（90s）`)
    const dec = await page.evaluate(async (args) => window.electronAPI.appSession.review({ sessionId: args.sessionId, nodeId: args.nodeId, decision: 'approve' }), { sessionId: s.sessionId, nodeId: 'review' })
    assert(dec.success !== false, `审核决策失败 ${dec.error}`)
    // 等终态 + message 卡
    for (let i = 0; i < 60; i++) {
      const done = await page.evaluate(async (sessionId) => {
        const m = await window.electronAPI.appSession.messages(sessionId)
        return (m.data ?? []).find(x => x.metadata?.sessionCard?.card === 'message') ?? null
      }, s.sessionId)
      if (done) return { sessionId: s.sessionId, content: String(done.metadata.sessionCard.content ?? '') }
      await sleep(1000)
    }
    throw new Error(`第${round}轮等待终态超时`)
  }

  const r1 = await step('2. 第 1 轮运行：json 注入→循环采集(httpbin)→审核 approve→完成', async () => runRound(1, 0))
  assert(/共 3 条/.test(r1.content), `回显应 3 条：${r1.content.slice(0, 160)}`)
  assert(/历史 1 次/.test(r1.content), `首轮 history 应 1 次：${r1.content.slice(0, 160)}`)

  await step('3. 数据验证：3 行、price=number、inStock=boolean、history=json 数组', async () => {
    const tables = await page.evaluate(async (appId) => window.electronAPI.appData.listTables(appId), ids.appId)
    const t = (tables.data?.tables ?? []).find(x => x.name === TABLE)
    assert(t, '表未找到')
    const rows = await page.evaluate(async (args) => window.electronAPI.appData.queryRows({ appId: args.appId, tableId: args.tableId }), { appId: ids.appId, tableId: t.id })
    const rs = rows.data?.rows ?? []
    assert(rs.length === 3, `应 3 行，实际 ${rs.length}`)
    const kb = rs.find(r => r.name === '机械键盘')
    assert(typeof kb.price === 'number' && kb.price === 120, `price 应 number 120，实际 ${typeof kb.price} ${kb.price}`)
    assert(typeof kb.inStock === 'boolean' && kb.inStock === true, `inStock 应 boolean true（低价<150），实际 ${typeof kb.inStock} ${kb.inStock}`)
    assert(Array.isArray(kb.history) && kb.history.length === 1 && kb.history[0].price === 120, `history 应 json 数组 1 条，实际 ${JSON.stringify(kb.history).slice(0, 80)}`)
    const mon = rs.find(r => r.name === '显示器')
    assert(mon.inStock === false, `显示器(899)应 inStock false，实际 ${mon.inStock}`)
  })

  const r2 = await step('4. 第 2 轮运行（价格+30）→ 行数不涨、价格更新、history 追加', async () => runRound(2, 30))
  assert(/共 3 条/.test(r2.content), `二轮仍应 3 条：${r2.content.slice(0, 160)}`)
  await step('5. 幂等+增量验证', async () => {
    const tables = await page.evaluate(async (appId) => window.electronAPI.appData.listTables(appId), ids.appId)
    const t = (tables.data?.tables ?? []).find(x => x.name === TABLE)
    const rows = await page.evaluate(async (args) => window.electronAPI.appData.queryRows({ appId: args.appId, tableId: args.tableId, filterContains: '机械键盘' }), { appId: ids.appId, tableId: t.id })
    const kb = (rows.data?.rows ?? [])[0]
    assert(rows.data?.total === 1 && kb.price === 150, `键盘应更新为 150，实际 ${kb.price}`)
    assert(kb.history.length === 2 && kb.history[1].price === 150, `history 应追加为 2 条且新价 150，实际 ${JSON.stringify(kb.history)}`)
    assert(kb.inStock === false, `150 不再 <150 → inStock false，实际 ${kb.inStock}`)
  })

  // 6. UI 走查：数据页签真实渲染 + 截图
  await step('6. UI 走查：AppDetail「数据」页签渲染 + 截图', async () => {
    await page.goto(`${new URL(page.url()).origin}/#/apps/${ids.appId}`)
    await page.waitForSelector('.el-tabs__item', { timeout: 15000 })
    await page.click('.el-tabs__item:has-text("数据")')
    await page.waitForSelector('text=监控价格', { timeout: 10000 })
    await page.click('button:has-text("浏览数据")')
    await page.waitForSelector('.el-table__row:visible', { timeout: 10000 })
    const rowCount = await page.locator('.el-tab-pane:visible .el-table__row').count()
    assert(rowCount >= 3, `数据页签应至少渲染 3 行，实际 ${rowCount}`)
    const pagerTotal = await page.locator('.el-tab-pane:visible .el-pagination__total').first().innerText().catch(() => '')
    assert(/3/.test(pagerTotal), `分页总数应 3，实际 "${pagerTotal.trim()}"`)
    await page.screenshot({ path: 'outputs/e2e-app-complex-data-tab.png', fullPage: true })
  })

  // 7. 清理（会话×2、应用、定义）
  await step('7. 清理测试产物', async () => {
    await page.evaluate(async (args) => {
      const s = await window.electronAPI.appSession.list(args.appId)
      for (const it of s.data ?? []) await window.electronAPI.appSession.delete(it.id)
      await window.electronAPI.app.delete(args.appId)
      await window.electronAPI.workflow.deleteDefinition(args.defId)
    }, ids)
  })

  console.log('\n🎉 复杂应用 E2E 全部通过：宿主桥(http+query+upsert)/json 注入/循环/审核/类型校正/幂等增量/分页/UI 页签')
})().catch(e => { console.error('\nE2E 失败：', e.message); process.exit(1) })
