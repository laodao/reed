// 审批页端到端验证 v2：locator 自动滚动点击；等待大纲待审 → 打开审批页 → 检查表单 → 批准 → 校验 + 取消
const { connect } = require('./_lib_cdp')
const fs = require('fs')
const RUN_ID = process.argv[2] || fs.readFileSync('progress/_v3_60s_invest_run_id.txt', 'utf-8').trim()
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const { browser, page } = await connect()
  const ev = (expr) => page.evaluate(expr)
  const log = (m) => console.log(m)

  let pending = null
  for (let i = 0; i < 60; i++) {
    const d = await ev(`window.electronAPI.workflow.getRun(${JSON.stringify(RUN_ID)}).then(x => (x.success ? x.data : null))`)
    pending = ((d && d.nodeRuns) || []).find(n => n.status === 'waiting_review' && n.nodeType === 'human-review') || null
    if (pending) break
    if (d && d.run && ['failed', 'cancelled', 'succeeded'].includes(d.run.status)) { log('TERMINAL 早至: ' + d.run.status); await browser.close(); return }
    await sleep(3000)
  }
  log('待审: ' + (pending ? pending.nodeId + ' / ' + (((pending.input && pending.input.payload) || {}).stage || '') : '无'))
  if (!pending) { await browser.close(); return }

  const u1 = await ev(`window.electronAPI.notification.unreadCount().then(x => (x.success ? x.data : -1))`)
  const list1 = await ev(`window.electronAPI.notification.list({ page: 1, pageSize: 30 }).then(x => (x.success ? x.data : null))`)
  const mine = (list1 && list1.items || []).find(n => n.runId === RUN_ID)
  log('决策前 unread=' + u1 + ' | 该运行通知 route=' + (mine && mine.route))

  await ev(`(function(){ location.hash = '#/workflow/review/${RUN_ID}' })()`)
  await sleep(4000)
  const ok = await ev(`!!document.querySelector('.rp-rail') && !!document.querySelector('.rp-md-editor textarea')`)
  const taLen = await ev(`(document.querySelector('.rp-md-editor textarea') || { value: '' }).value.length`)
  log('审批页就绪=' + ok + ' | 大纲编辑框字数=' + taLen)

  // locator：自动滚动到可见并真实点击「批准」
  const btn = page.locator('.rp-actions button', { hasText: /^批准$/ }).first()
  await btn.scrollIntoViewIfNeeded()
  await btn.click()
  log('已点击批准')

  await sleep(5000)
  const d2 = await ev(`window.electronAPI.workflow.getRun(${JSON.stringify(RUN_ID)}).then(x => (x.success ? x.data : null))`)
  const or2 = ((d2 && d2.nodeRuns) || []).find(n => n.nodeId === 'outlineReview')
  log('outlineReview after approve: ' + (or2 && or2.status) + ' | run=' + (d2 && d2.run && d2.run.status))
  const u2 = await ev(`window.electronAPI.notification.unreadCount().then(x => (x.success ? x.data : -1))`)
  log('决策后 unread=' + u2)

  await ev(`window.electronAPI.workflow.cancelRun(${JSON.stringify(RUN_ID)}).then(x => x)`)
  await sleep(1500)
  const u3 = await ev(`window.electronAPI.notification.unreadCount().then(x => (x.success ? x.data : -1))`)
  log('取消后 unread=' + u3)
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
