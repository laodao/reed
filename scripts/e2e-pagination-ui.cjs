/**
 * 前端分页 UI 验证：工作流列表 / 应用列表 的固定表头 + 内部滚动 + 底部固定分页
 */
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const step = async (name, fn) => { try { await fn(); console.log('✅', name) } catch (e) { console.error('❌', name, e.message); throw e } }

async function checkListPage(page, path, { expectRows, totalText }) {
  await page.goto(`http://localhost:5173/#${path}`)
  await page.waitForTimeout(1500)
  const info = await page.evaluate(() => {
    const pager = document.querySelector('.pager .el-pagination')
    const total = document.querySelector('.pager .el-pagination__total')
    const tableWrap = document.querySelector('.table-wrap')
    const table = document.querySelector('.table-wrap .el-table')
    const headerWrap = document.querySelector('.el-table__header-wrapper')
    const bodyWrap = document.querySelector('.el-table__body-wrapper')
    // el-table 内部滚动容器是 .el-scrollbar__wrap（body-wrapper 本身 overflow hidden 属正常布局）
    const scrollWrap = bodyWrap?.querySelector('.el-scrollbar__wrap')
    const rows = document.querySelectorAll('.el-table__body-wrapper .el-table__row').length
    return {
      hasPager: !!pager,
      totalText: total?.textContent ?? '',
      wrapH: tableWrap ? Math.round(tableWrap.getBoundingClientRect().height) : 0,
      tableH: table ? Math.round(table.getBoundingClientRect().height) : 0,
      scrollOverflowY: scrollWrap ? getComputedStyle(scrollWrap).overflowY : '',
      canScroll: scrollWrap ? scrollWrap.scrollHeight > scrollWrap.clientHeight : false,
      headerTop: headerWrap ? Math.round(headerWrap.getBoundingClientRect().top) : null,
      rows,
    }
  })
  assert(info.hasPager, `${path}: 缺分页组件`)
  assert(info.totalText.includes('共'), `${path}: 分页 total 缺失（${info.totalText}）`)
  assert(info.wrapH > 100, `${path}: 表格容器高度异常 ${info.wrapH}`)
  assert(info.tableH > 0 && info.tableH <= info.wrapH, `${path}: 表格高度未约束在容器内（table=${info.tableH} wrap=${info.wrapH}）`)
  assert(info.scrollOverflowY === 'auto' || info.scrollOverflowY === 'scroll', `${path}: 表体滚动容器异常（${info.scrollOverflowY}）`)
  assert(info.rows > 0, `${path}: 无数据行`)
  console.log(`   ${path}: rows=${info.rows} ${info.totalText.trim()} table=${info.tableH}px wrap=${info.wrapH}px scrollY=${info.scrollOverflowY} canScroll=${info.canScroll} headerTop=${info.headerTop}`)
  return info
}

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')

  await step('工作流列表：分页+固定表头+内部滚动', () => checkListPage(page, '/workflow', {}))
  await step('应用列表：分页+固定表头+内部滚动', () => checkListPage(page, '/apps', {}))

  // 分页翻页交互验证（应用列表：总数 > pageSize 时翻页）
  await step('应用列表翻页：点第 2 页数据变化', async () => {
    const info = await checkListPage(page, '/apps', {})
    const total = parseInt(info.totalText.replace(/[^\d]/g, ''), 10)
    if (total <= 20) { console.log('   数据量不足一页，跳过翻页交互'); return }
    const firstRow = await page.evaluate(() => document.querySelector('.el-table__body-wrapper .el-table__row')?.textContent?.slice(0, 30))
    await page.click('.pager .el-pagination .btn-next')
    await page.waitForTimeout(1200)
    const secondRow = await page.evaluate(() => document.querySelector('.el-table__body-wrapper .el-table__row')?.textContent?.slice(0, 30))
    assert(firstRow !== secondRow, '翻页后首行数据未变化')
    console.log(`   翻页成功：${firstRow?.trim()} → ${secondRow?.trim()}`)
  })

  // 表头固定：滚动表体后表头位置不变
  await step('表头固定：滚动表体后表头位置不移动', async () => {
    const r = await page.evaluate(async () => {
      const wrap = document.querySelector('.el-table__body-wrapper .el-scrollbar__wrap')
      if (!wrap || wrap.scrollHeight <= wrap.clientHeight) return { skipped: true }
      const headerBefore = document.querySelector('.el-table__header-wrapper').getBoundingClientRect().top
      wrap.scrollTop = 60
      await new Promise(res => setTimeout(res, 250))
      const headerAfter = document.querySelector('.el-table__header-wrapper').getBoundingClientRect().top
      wrap.scrollTop = 0
      return { skipped: false, before: Math.round(headerBefore), after: Math.round(headerAfter) }
    })
    if (r.skipped) { console.log('   数据不足一屏，滚动表头验证跳过'); return }
    assert(Math.abs(r.before - r.after) < 2, `滚动后表头移动了（${r.before} → ${r.after}）`)
    console.log(`   滚动 60px 表头位置不变（${r.before}px）`)
  })

  console.log('\n===== 前端分页 UI 验证全部通过 ✅ =====')
  process.exit(0)
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
