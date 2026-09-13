// V3 60s 星宇 观察器（阶段1）：自动批准「大纲审核」；到达「素材板审核」→ 快照卡片 JSON 并退出（不代批，留待意象审核）
const { chromium } = require('playwright-core')
const fs = require('fs')
const RUN_ID = fs.readFileSync('progress/_v3_60s_run_id.txt', 'utf-8').trim()
const LOG = 'C:/Users/daoge/code/project/the-bot/progress/_v3_60s_watch1.log'
function log(msg) {
  const line = '[' + new Date().toLocaleTimeString() + '] ' + msg
  console.log(line)
  fs.appendFileSync(LOG, line + '\n', 'utf-8')
}
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const ev = (expr) => page.evaluate(expr)
  const t0 = Date.now()
  while (true) {
    const d = await ev(`window.electronAPI.workflow.getRun(${JSON.stringify(RUN_ID)}).then(x => (x.success ? x.data : { error: x.error }))`)
    const run = (d && d.run) || {}
    const nr = (d && Array.isArray(d.nodeRuns)) ? d.nodeRuns : []
    const status = run.status
    const pending = nr.filter(n => n.status === 'waiting_review')
    for (const n of pending) {
      const payload = (n.input && n.input.payload) || {}
      const stage = String(payload.stage || n.nodeName || '')
      const fn = 'progress/_v3_60s_review_' + n.nodeId.replace(/[^a-zA-Z0-9_]/g, '_') + '.json'
      fs.writeFileSync(fn, JSON.stringify({ nodeId: n.nodeId, nodeName: n.nodeName, stage, payload }, null, 2), 'utf-8')
      log('⏸ review 挂起 ' + n.nodeId + ' stage=' + stage + '（快照 ' + fn + '）')
      if (stage.includes('大纲')) {
        const dec = await ev(`window.electronAPI.workflow.reviewDecide(${JSON.stringify({ runId: RUN_ID, nodeId: n.nodeId, decision: 'approve', comment: 'V3 60s 星宇：大纲批准（口播时长目标约60s）' })}).then(x => x)`)
        log('✅ 批准大纲 ' + n.nodeId + ' err=' + JSON.stringify(dec && dec.error))
      } else if (stage.includes('素材板') || stage.includes('材料板') || /素材/.test(stage)) {
        const cards = Array.isArray(payload.cards) ? payload.cards : []
        log('📋 素材板审核到达：visualStrategy=' + String(payload.visualStrategy) + ' 卡片=' + cards.length)
        for (const c of cards) {
          log('  - [' + (c.shotIndex ?? '?') + '] ' + String(c.mode || c.source || '?') + ' | ' + String(c.caption || '').slice(0, 40) + ' | img=' + String((c.image || '').slice(0, 40)) + ' | visual=' + String((c.visual || c.imageryText || c.prompt || '').slice(0, 60)))
        }
        log('阶段1完成：已停于素材板等待意象审核（未代批）')
        await browser.close()
        return
      }
    }
    if (['failed', 'cancelled', 'succeeded', 'timed_out', 'interrupted'].includes(status)) {
      log('TERMINAL ' + status + (run.error ? ' ERR=' + String(run.error).slice(0, 500) : ''))
      const failedNode = nr.find(n => n.status === 'failed')
      if (failedNode) log('failed node: ' + failedNode.nodeId + ' → ' + String(failedNode.error || '').slice(0, 600))
      await browser.close()
      return
    }
    if (Date.now() - t0 > 25 * 60 * 1000) { log('TIMEOUT'); await browser.close(); return }
    await new Promise(r => setTimeout(r, 4000))
  }
}
main().catch(e => { console.error(e); process.exit(1) })
