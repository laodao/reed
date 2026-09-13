// 备份当前内置工作流定义（V2 基线，开工 V3 前快照）
const { chromium } = require('playwright-core')
const fs = require('fs')
const OUT = 'C:/Users/daoge/code/project/the-bot/scripts/backup-builtin-defs-v2-baseline-20260906.json'
async function main() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const p = b.contexts()[0].pages()[0]
  await p.waitForLoadState('domcontentloaded')
  const defs = await p.evaluate(`(async () => {
    const out = {}
    for (const id of ['builtin_def_script-to-video', 'builtin_def_script-to-video-v2']) {
      const r = await window.electronAPI.workflow.getDefinition(id).then(x => (x && x.success ? x.data : null))
      if (r) out[id] = r
    }
    return out
  })()`)
  fs.writeFileSync(OUT, JSON.stringify(defs, null, 2), 'utf-8')
  console.log('saved defs:', Object.keys(defs).join(', '), '->', OUT)
  await b.close()
}
main().catch(e => { console.error(e); process.exit(1) })
