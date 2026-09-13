// 守护 script-to-video 运行：轮询状态 + 自动批准 review1（用户已授权中间确认由 Agent 代为确认）
const { chromium } = require('playwright-core')
const fs = require('fs')

const RUN_ID = process.argv[2]
const LOG_FILE = 'C:/Users/daoge/code/project/the-bot/progress/_sv_watch.log'
function log(msg) {
  const line = '[' + new Date().toLocaleTimeString() + '] ' + msg
  console.log(line)
  fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8')
}

function summarize(d) {
  const nr = Array.isArray(d.nodeRuns) ? d.nodeRuns : []
  return nr.map(n => `${n.nodeId}#${n.iterationIndex ?? 0}:${n.status}${n.error ? '(' + n.error.slice(0, 120) + ')' : ''}`).join(' | ')
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const ev = (expr) => page.evaluate(expr)

  const t0 = Date.now()
  let last = ''
  let approved = new Set()
  while (true) {
    const r = await ev(`window.electronAPI.workflow.getRun(${JSON.stringify(RUN_ID)}).then(x => (x.success ? x.data : { error: x.error }))`)
    const d = r || {}
    const run = d.run || {}
    const status = run.status
    const nr = Array.isArray(d.nodeRuns) ? d.nodeRuns : []

    // 自动批准：run 在 waiting_review 时对挂起的 review1 提交 approve
    if (status === 'waiting_review') {
      const waiting = nr.filter(n => n.status === 'waiting_review')
      for (const n of waiting) {
        const key = n.nodeId + '#' + (n.iterationIndex ?? 0)
        if (approved.has(key)) continue
        const payload = n.input && n.input.payload
        const shot = payload ? payload.shotIndex : n.iterationIndex
        const visual = payload ? String(payload.visual || '').slice(0, 60) : ''
        const cap = payload ? String(payload.caption || '') : ''
        const dur = payload ? payload.duration : ''
        const decide = await ev(`window.electronAPI.workflow.reviewDecide(${JSON.stringify({ runId: RUN_ID, nodeId: n.nodeId, decision: 'approve', comment: '用户授权：ComfyUI 免费，审核环节由 Agent 代为批准' })}).then(x => (x.success ? x.data : { error: x.error, success: x.success }))`)
        if (decide && decide.success !== false) {
          approved.add(key)
          log(`✅ 批准 ${n.nodeId}#${n.iterationIndex ?? 0} 镜头${shot}｜字幕:「${cap}」｜时长:${dur}s｜画面:${visual}`)
        } else {
          log(`⚠️ 批准失败 ${key}: ${JSON.stringify(decide)}（下轮重试）`)
        }
      }
    }

    const s = summarize(d)
    if (s !== last) {
      const el = Math.round((Date.now() - t0) / 60000)
      log(`[${el}min] ${status} :: ${s}${run.error ? ' ERR=' + String(run.error).slice(0, 200) : ''}`)
      last = s
    }

    if (['succeeded', 'failed', 'cancelled', 'timed_out', 'interrupted'].includes(status)) {
      fs.writeFileSync('C:/Users/daoge/code/project/the-bot/progress/_sv_run_final.json', JSON.stringify(r, null, 2), 'utf-8')
      log('TERMINAL: ' + status)
      await browser.close()
      return
    }
    await new Promise(res => setTimeout(res, 5000))
  }
}
main().catch(e => { console.error(e); process.exit(1) })
