// 备份：改动前保存 内置 v3 定义(DB 现状) + 写作技能内容 到 scripts/backup-writerlayer-20260907/
const { connect } = require('./_lib_cdp')
const fs = require('fs')
const path = require('path')
const OUT = 'scripts/backup-writerlayer-20260907'
fs.mkdirSync(OUT, { recursive: true })
async function main() {
  const { browser, page } = await connect()
  const ev = (expr) => page.evaluate(expr)
  const def = await ev(`window.electronAPI.workflow.exportDefinition('builtin_def_script-to-video-v3').then(x => (x.success ? x.data : { error: x.error }))`)
  fs.writeFileSync(path.join(OUT, 'def-script-to-video-v3.json'), JSON.stringify(def, null, 2), 'utf-8')
  console.log('def exported:', def && def.id, '| graph nodes:', def && def.graph && def.graph.nodes ? def.graph.nodes.length : (def && def.publishedGraph ? def.publishedGraph.nodes.length : '?'))

  const skills = await ev(`window.electronAPI.skills.list().then(x => (x.success ? x.data : []))`)
  const ws = (Array.isArray(skills) ? skills : []).filter(s => /video-writer/.test(String(s.id)))
  fs.writeFileSync(path.join(OUT, 'writer-skills.json'), JSON.stringify(ws, null, 2), 'utf-8')
  console.log('skills backed up:', ws.map(s => s.id).join(','))

  // 同时把源码里对应技能定义原文拷贝留底（内容资产以仓库文件为源）
  const src = fs.readFileSync('src/core/platform/workflow/skills/builtin-skills.ts', 'utf-8')
  fs.writeFileSync(path.join(OUT, 'builtin-skills.ts.txt'), src, 'utf-8')
  const j = fs.readFileSync('src/core/database/migrations/builtin-apps/script-to-video-v3.json', 'utf-8')
  fs.writeFileSync(path.join(OUT, 'script-to-video-v3.json'), j, 'utf-8')
  console.log('source copies saved to', OUT)
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
