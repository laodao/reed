// 读取本次运行的轮次诊断（round1 每轮 verdict/gaps），用 CDP 从运行详情取
const { chromium } = require('playwright-core')
const fs = require('fs')
const RUN_ID = fs.readFileSync('C:/Users/daoge/code/project/the-bot/progress/_topic_run_id.txt', 'utf-8').trim()

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const res = await page.evaluate((id) => window.electronAPI.workflow.getRun(id).then(x => x), RUN_ID)
  const d = res?.data
  console.log('run.status =', d?.run?.status, '| error =', d?.run?.error ?? '无')
  const round = (d?.nodeRuns ?? []).find(n => n.nodeId === 'round1')
  console.log('round1.status =', round?.status, '| iterations =', round?.output?.iterations, '| count =', round?.output?.count)
  const results = round?.output?.results ?? []
  results.forEach((r, i) => {
    const p = r?.result ?? r
    const gaps = Array.isArray(p?.gaps) ? p.gaps : []
    console.log(`\n--- 第${i}轮评估 verdict=${p?.verdict} 差距${gaps.length}条 ---`)
    gaps.slice(0, 5).forEach(g => console.log(`  [${g?.priority ?? '-'}] ${String(g?.issue ?? '').slice(0, 80)} → ${String(g?.action ?? '').slice(0, 80)}`))
  })
  const nodes = (d?.nodeRuns ?? []).map(n => `${n.nodeId}:${n.status}`).join(' ')
  console.log('\n节点状态:', nodes)
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })
