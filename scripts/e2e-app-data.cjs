/**
 * 应用数据层 E2E（2026-10-08 P1 验收）：
 * 内置「数据表演示·增量记录」→ 会话运行两次（同 url 不同价）→ message 回显 →
 * appData.listTables/queryRows 验证 app 作用域与 upsert 幂等 → deleteRow/exportCsv 冒烟
 * 前置：electron-vite dev --remote-debugging-port=9222（含应用数据层代码；demo 随种子迁移入库）
 */
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const step = async (name, fn) => { try { const r = await fn(); console.log('✅', name); return r } catch (e) { console.error('❌', name, e.message); throw e } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const APP_NAME = '数据表演示·增量记录'

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口（dev 实例未启动或未开 9222）')

  // 1. 内置应用存在（种子迁移生效 = 应用数据层代码已在该实例运行）
  const app = await step('1. 内置应用「数据表演示」存在（种子迁移+新代码已生效）', async () => {
    const r = await page.evaluate(async (name) => {
      const list = await window.electronAPI.app.list({ page: 1, pageSize: 200 })
      if (!list.success) return { error: list.error }
      return { app: (list.data?.items ?? []).find(a => a.name === name) ?? null }
    }, APP_NAME)
    assert(r.app, `应用不存在：${r.error ?? '列表无此应用（实例可能是旧代码，需重启 dev）'}`)
    return r.app
  })

  // 2. 会话 + 第一次运行（price=199.5）
  const runOnce = async (url, name, price) => page.evaluate(async (args) => {
    const s = window.electronAPI.appSession
    const created = await s.create({ appId: args.appId })
    if (!created.success) return { error: created.error }
    const started = await s.start({ sessionId: created.data.id, inputs: { url: args.url, name: args.name, price: args.price } })
    return started.success ? { sessionId: created.data.id, runId: started.data.runId } : { error: started.error }
  }, { appId: app.id, url, name, price })

  const first = await step('2. 创建会话并第一次运行', async () => {
    const r = await runOnce('https://shop/e2e-item-1', 'E2E无线耳机', '199.5')
    assert(r.runId, `启动失败 ${r.error}`)
    return r
  })

  // 3. 等终态 + message 卡回显
  await step('3. 运行成功且 message 回显命中行', async () => {
    let status = ''
    for (let i = 0; i < 60; i++) {
      const r = await page.evaluate(async (runId) => {
        const runs = await window.electronAPI.workflow.listRuns({ definitionId: '', page: 1, pageSize: 5 })
        return runs
      }, first.runId).catch(() => null)
      status = ''
      // 直接经会话消息流判断（report/message 卡出现即终态）
      const msgs = await page.evaluate(async (sessionId) => {
        const m = await window.electronAPI.appSession.messages(sessionId)
        if (!m.success) return []
        return (m.data ?? []).map(x => x.metadata?.sessionCard?.card ?? x.role)
      }, first.sessionId)
      if (msgs.includes('message') || msgs.includes('report')) { status = 'done'; break }
      await sleep(1000)
    }
    assert(status === 'done', '等待运行终态超时（60s）')
    const content = await page.evaluate(async (sessionId) => {
      const m = await window.electronAPI.appSession.messages(sessionId)
      const card = (m.data ?? []).find(x => x.metadata?.sessionCard?.card === 'message' || x.metadata?.sessionCard?.card === 'report')
      return card ? String(card.metadata.sessionCard.content ?? '') : ''
    }, first.sessionId)
    assert(/E2E无线耳机/.test(content) && /199\.5/.test(content), `回显未命中：${content.slice(0, 200)}`)
  })

  // 4. 数据页签后端：表归属该应用 + 行内容（number 校正）
  const table = await step('4. appData.listTables：表存在且归属本应用', async () => {
    const r = await page.evaluate(async (appId) => {
      const t = await window.electronAPI.appData.listTables(appId)
      return t.success ? { tables: t.data?.tables ?? [] } : { error: t.error }
    }, app.id)
    assert(!r.error, `listTables 失败 ${r.error}`)
    const t = r.tables.find(x => x.name === '商品价格')
    assert(t, `未找到「商品价格」表，现有：${r.tables.map(x => x.name).join(',')}`)
    assert(t.dedupKeys.includes('url'), '去重键缺失')
    return t
  })

  await step('5. appData.queryRows：行内容正确（价格 number 校正为 199.5）', async () => {
    const r = await page.evaluate(async (args) => {
      const q = await window.electronAPI.appData.queryRows({ appId: args.appId, tableId: args.tableId, filterContains: 'E2E无线耳机' })
      return q.success ? { rows: q.data?.rows ?? [], total: q.data?.total ?? 0 } : { error: q.error }
    }, { appId: app.id, tableId: table.id })
    assert(!r.error, `queryRows 失败 ${r.error}`)
    assert(r.total === 1, `应命中 1 行，实际 ${r.total}`)
    assert(r.rows[0].price === 199.5, `价格应 number 199.5，实际 ${typeof r.rows[0].price} ${r.rows[0].price}`)
  })

  // 6. 第二次运行同 url 不同价 → 幂等
  await step('6. 第二次运行（同链接不同价）→ 行数不涨、价格更新（非一次性语义）', async () => {
    const r = await runOnce('https://shop/e2e-item-1', 'E2E无线耳机', '250')
    assert(r.runId, `第二次启动失败 ${r.error}`)
    await sleep(4000) // 确定性小图，几秒内完成
    const q = await page.evaluate(async (args) => {
      const res = await window.electronAPI.appData.queryRows({ appId: args.appId, tableId: args.tableId, filterContains: 'E2E无线耳机' })
      return res.success ? { total: res.data?.total ?? 0, rows: res.data?.rows ?? [] } : { error: res.error }
    }, { appId: app.id, tableId: table.id })
    assert(q.total === 1, `同链接应仍 1 行（upsert 幂等），实际 ${q.total}`)
    assert(q.rows[0].price === 250, `价格应更新为 250，实际 ${q.rows[0].price}`)
  })

  // 7. 删行 + CSV 导出冒烟
  await step('7. deleteRow + exportCsv 冒烟', async () => {
    const q = await page.evaluate(async (args) => {
      const res = await window.electronAPI.appData.queryRows({ appId: args.appId, tableId: args.tableId, filterContains: 'E2E无线耳机' })
      return res.success ? { rowId: res.data?.rows?.[0]?.id } : { error: res.error }
    }, { appId: app.id, tableId: table.id })
    assert(q.rowId, '未取到待删行')
    const del = await page.evaluate(async (args) => window.electronAPI.appData.deleteRow(args), { appId: app.id, tableId: table.id, rowId: q.rowId })
    assert(del.success, `删行失败 ${del.error}`)
    const csv = await page.evaluate(async (args) => window.electronAPI.appData.exportCsv(args), { appId: app.id, tableId: table.id })
    assert(csv.success && csv.data.csv.includes('固定演示行'), `CSV 导出异常：${csv.error ?? '未见固定行'}`)
    console.log('   CSV 字节数：', csv.data.csv.length, '文件名：', csv.data.filename)
  })

  // 8. 清理测试会话
  await step('8. 清理测试会话', async () => {
    await page.evaluate(async (sessionId) => window.electronAPI.appSession.delete(sessionId), first.sessionId)
  })

  console.log('\n🎉 应用数据层 E2E 全部通过（真实 dev 实例：应用→运行→数据页签后端→幂等→导出）')
})().catch(e => { console.error('\nE2E 失败：', e.message); process.exit(1) })
