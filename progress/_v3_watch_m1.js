// V3 M1 观察器：仅自动批准「大纲审核」；到达「素材板审核」打印卡片模式/来源后取消运行并退出
// gate 场景：预期 run failed（strategy 抛缺素材），直接打印终态退出。
const { chromium } = require('playwright-core')
const RUN_ID = process.argv[2]
const MODE = process.argv[3] || 'stopAtBoard'
const fs = require('fs')
const LOG = 'C:/Users/daoge/code/project/the-bot/progress/_v3_m1_watch.log'
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
      const stage = String((n.input && n.input.payload && n.input.payload.stage) || '')
      if (stage.includes('大纲审核')) {
        const dec = await ev(`window.electronAPI.workflow.reviewDecide(${JSON.stringify({ runId: RUN_ID, nodeId: n.nodeId, decision: 'approve', comment: 'V3 M1 验证：大纲自动批准' })}).then(x => x)`)
        log('✅ 批准大纲 ' + n.nodeId + ' ' + JSON.stringify(dec && dec.error))
      } else if (stage.includes('素材板审核')) {
        const payload = (n.input && n.input.payload) || {}
        const cards = Array.isArray(payload.cards) ? payload.cards : []
        const modes = cards.map(c => (c.source || c.mode || '?') + ':' + String(c.caption || '').slice(0, 24)).join(' | ')
        log('✅ 到达素材板审核；视觉策略=' + String(payload.visualStrategy) + '；卡片 ' + cards.length + ' 张 → ' + modes)
        const c = await ev(`window.electronAPI.workflow.cancelRun(${JSON.stringify(RUN_ID)}).then(x => x)`)
        log('M1 验证完成，取消运行: ' + JSON.stringify(c && c.error))
        await browser.close()
        return
      }
    }
    if (['failed', 'cancelled', 'succeeded', 'timed_out', 'interrupted'].includes(status)) {
      log('TERMINAL ' + status + (run.error ? ' ERR=' + String(run.error).slice(0, 400) : ''))
      const failedNode = nr.find(n => n.status === 'failed')
      if (failedNode) log('failed node: ' + failedNode.nodeId + ' → ' + String(failedNode.error || '').slice(0, 500))
      await browser.close()
      return
    }
    if (Date.now() - t0 > 8 * 60 * 1000) { log('TIMEOUT watching'); await browser.close(); return }
    await new Promise(r => setTimeout(r, 3000))
  }
}
main().catch(e => { console.error(e); process.exit(1) })
