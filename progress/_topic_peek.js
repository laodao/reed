const { chromium } = require('playwright-core')
const fs = require('fs')
const RUN_ID = fs.readFileSync('C:/Users/daoge/code/project/the-bot/progress/_topic_run_id.txt','utf-8').trim()
async function main(){
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const p = b.contexts()[0].pages()[0]
  await p.waitForLoadState('domcontentloaded')
  const r = await p.evaluate(id => window.electronAPI.workflow.getRun(id).then(x=>x), RUN_ID)
  const rows = (r?.data?.nodeRuns ?? [])
  const e1 = rows.filter(n=>n.nodeId==='e1').sort((a,c)=>a.iterationIndex-c.iterationIndex)
  const r1 = rows.filter(n=>n.nodeId==='r1').sort((a,c)=>a.iterationIndex-c.iterationIndex)
  for (const it of [e1.length-1, e1.length-2]) {
    const e = e1[it]; const rr = r1[it]
    console.log(`\n===== 第${it}轮 =====`)
    console.log('verdict:', e?.output?.parsed?.verdict, '| overall:', String(e?.output?.parsed?.overall ?? '').slice(0,200))
    const gaps = e?.output?.parsed?.gaps ?? []
    gaps.slice(0,6).forEach(g=>console.log(`  [${g.priority}] ${String(g.issue??'').slice(0,90)} → ${String(g.action??'').slice(0,90)}`))
    console.log('--- 研究员进展节选 ---')
    console.log(String(rr?.output?.answer ?? '').slice(0,700).replace(/\n+/g,'\n'))
  }
  await b.close()
}
main().catch(e=>{console.error(e);process.exit(1)})
