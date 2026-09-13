// 审批页端到端验证：等待大纲待审 → 打开 /workflow/review/:runId → 检查表单 → 点「批准」 → 校验决策生效 & 通知已读回落 → 取消运行
const { connect } = require('./_lib_cdp')
const fs = require('fs')
const RUN_ID = process.argv[2] || fs.readFileSync('progress/_v3_60s_invest_run_id.txt', 'utf-8').trim()
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const { browser, page } = await connect()
  const ev = (expr) => page.evaluate(expr)
  const log = (m) => console.log(m)

  // 1) 等 outlineReview 待审
  let pending = null
  for (let i = 0; i < 60; i++) {
    const d = await ev(`window.electronAPI.workflow.getRun(${JSON.stringify(RUN_ID)}).then(x => (x.success ? x.data : null))`)
    pending = ((d && d.nodeRuns) || []).find(n => n.status === 'waiting_review' && n.nodeType === 'human-review') || null
    if (pending) break
    if (d && d.run && ['failed', 'cancelled', 'succeeded'].includes(d.run.status)) { log('TERMINAL 早至: ' + d.run.status); await browser.close(); return }
    await sleep(3000)
  }
  log('待审节点: ' + (pending ? pending.nodeId + ' / ' + ((pending.input && pending.input.payload && pending.input.payload.stage) || '') : '无'))
  if (!pending) { await browser.close(); return }

  // 2) 通知未读数（决策前）
  const u1 = await ev(`window.electronAPI.notification.unreadCount().then(x => (x.success ? x.data : -1))`)
  const list1 = await ev(`window.electronAPI.notification.list({ page: 1, pageSize: 20 }).then(x => (x.success ? x.data : null))`)
  const mine = (list1 && list1.items || []).find(n => n.runId === RUN_ID)
  log('决策前 unread=' + u1 + ' | 该运行通知 route=' + (mine && mine.route))

  // 3) 打开审批页（hash 路由）
  await ev(`(function(){ location.hash = '#/workflow/review/${RUN_ID}' })()`)
  await sleep(3500)
  const bodyText = await ev(`document.body.innerText.slice(0, 2000)`)
  log('页面含“审核确认”:', bodyText.includes('审核确认'), '| 含“口播全文”:', bodyText.includes('口播全文'))
  const railCount = await ev(`document.querySelectorAll('.rp-step').length`)
  const taLen = await ev(`(document.querySelector('.rp-md-editor textarea') || {}).value ? document.querySelector('.rp-md-editor textarea').value.length : -1`)
  log('待审步骤数=' + railCount + ' | 大纲编辑框字数=' + taLen)

  // 4) 找「批准」按钮并真实鼠标点击
  const btn = await ev(`(() => {
    const bs = Array.from(document.querySelectorAll('.rp-actions button'))
    const b = bs.find(x => x.textContent.trim() === '批准' && !x.disabled)
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
  log('批准按钮位置: ' + JSON.stringify(btn))
  if (btn) { await page.mouse.click(btn.x, btn.y); log('已点击批准') }

  // 5) 校验决策生效 + 通知回落
  await sleep(4000)
  const d2 = await ev(`window.electronAPI.workflow.getRun(${JSON.stringify(RUN_ID)}).then(x => (x.success ? x.data : null))`)
  const or = ((d2 && d2.nodeRuns) || []).find(n => n.nodeId === 'outlineReview')
  log('outlineReview 状态: ' + (or && or.status))
  const u2 = await ev(`window.electronAPI.notification.unreadCount().then(x => (x.success ? x.data : -1))`)
  log('决策后 unread=' + u2)

  // 6) 收尾：取消运行（避免继续烧图生视频），并再次确认取消后通知被自动清
  await ev(`window.electronAPI.workflow.cancelRun(${JSON.stringify(RUN_ID)}).then(x => x)`)
  await sleep(1500)
  const u3 = await ev(`window.electronAPI.notification.unreadCount().then(x => (x.success ? x.data : -1))`)
  log('取消后 unread=' + u3)
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
