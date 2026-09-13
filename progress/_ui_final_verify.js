// 最终 UI 口径验收：①运行详情：只读图/无历史输出物/滚轮缩放/空白拖拽平移/禁拖节点/节点详情开关重开
// ②运行历史页：操作栏「查看产物」抽屉列出该 run 的 asset_* 产物
const { chromium } = require('playwright-core')
const DETAIL_RUN = 'wfrun_1788708132226_3r7rt9zxu'
const DEF_ID = 'builtin_def_script-to-video-v2'
async function main() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const p = b.contexts()[0].pages()[0]
  await p.waitForLoadState('domcontentloaded')
  const wait = (ms) => new Promise(r => setTimeout(r, ms))

  // ---------- A. 运行详情 ----------
  await p.evaluate(`location.hash = '#/workflow/run/${DETAIL_RUN}'`)
  await wait(2600)
  const a1 = await p.evaluate(`({
    nodes: document.querySelectorAll('.wf-node').length,
    edges: document.querySelectorAll('.edge-path').length,
    legend: Array.from(document.querySelectorAll('.legend .lg-item')).map(x => x.textContent.trim()),
    hasHistoryTitle: document.body.innerText.includes('历史输出物'),
    viewport: !!document.querySelector('.viewport'),
    zoomVal: (document.querySelector('.zoom-val') || {}).textContent || '',
  })`)
  console.log('A1 detail:', JSON.stringify(a1))

  // 滚轮缩放（真实鼠标置于视口中心后 wheel）
  const vpBox = await p.evaluate(`(() => { const r = document.querySelector('.viewport').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  await p.mouse.move(vpBox.x, vpBox.y)
  const t0 = await p.evaluate(`(document.querySelector('.content') || {}).style ? document.querySelector('.content').style.transform : ''`)
  await p.mouse.wheel(0, -300)
  await wait(300)
  const t1 = await p.evaluate(`(document.querySelector('.content') || {}).style ? document.querySelector('.content').style.transform : ''`)
  const zoom1 = await p.evaluate(`(document.querySelector('.zoom-val') || {}).textContent || ''`)
  console.log('A2 wheel zoom:', JSON.stringify({ before: t0, after: t1, zoomVal: zoom1 }))

  // 空白拖拽平移：视口左上空白区 drag
  await p.mouse.move(vpBox.x - 250, vpBox.y - 150)
  await p.mouse.down()
  await p.mouse.move(vpBox.x - 180, vpBox.y - 100, { steps: 4 })
  await p.mouse.up()
  await wait(250)
  const pan = await p.evaluate(`(document.querySelector('.content') || {}).style ? document.querySelector('.content').style.transform : ''`)
  console.log('A3 pan:', JSON.stringify({ transform: pan }))

  // 点击已执行节点（文生图）→ 详情出现；关闭 → 消失；再点同一节点 → 重新出现
  async function clickNodeByText(txt) {
    const r = await p.evaluate(`(() => { const els = Array.from(document.querySelectorAll('.wf-node')); const el = els.find(e => e.textContent.includes(${JSON.stringify(txt)})); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)
    if (r) { await p.mouse.click(r.x, r.y); await wait(500) }
    return !!r
  }
  const hasDetail = () => p.evaluate(`({ has: document.body.innerText.includes('imgShot'), closeBtn: !!Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('关闭')) })`)
  await clickNodeByText('文生图')
  console.log('A4 open:', JSON.stringify(await hasDetail()))
  await p.evaluate(`(() => { const btns = Array.from(document.querySelectorAll('button')); const b = btns.find(x => x.textContent.includes('关闭')); if (b) b.click(); })()`)
  await wait(400)
  const closed = await p.evaluate(`document.body.innerText.includes('imgShot')`)
  await clickNodeByText('文生图')
  const reopened = await hasDetail()
  console.log('A5 close→reopen:', JSON.stringify({ closed: !closed, reopened }))

  // ---------- B. 历史页产物 ----------
  await p.evaluate(`location.hash = '#/workflow/runs/${DEF_ID}'`)
  await wait(2600)
  const rows = await p.evaluate(`Array.from(document.querySelectorAll('tr')).map(x => x.textContent).filter(t => t.includes('wfrun_'))`)
  const tooltips = await p.evaluate(`document.body.innerText.includes('查看产物')`)
  // 点第一行「查看产物」
  await p.evaluate(`(() => { const els = Array.from(document.querySelectorAll('[title], .el-button')); const el = els.find(x => (x.getAttribute && x.getAttribute('title') === '查看产物') || (x.textContent && x.textContent.includes('查看产物'))); if (el) el.click(); })()`)
  await wait(1500)
  const drawer = await p.evaluate(`(() => ({
    drawerOpen: !!document.querySelector('.el-drawer'),
    drawerText: document.body.innerText.includes('运行产物'),
    hasAsset: (document.body.innerText.match(/asset_[0-9a-z]+/g) || []).slice(0, 6),
  }))()`)
  console.log('B rows:', rows.length, 'tooltip found:', tooltips)
  console.log('B drawer:', JSON.stringify(drawer))
  await b.close()
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
