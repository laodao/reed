// 验证 v3 定义已入库（字符串表达式形式，避免 function-arg 序列化问题）
const { chromium } = require('playwright-core')
async function main() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const p = b.contexts()[0].pages()[0]
  await p.waitForLoadState('domcontentloaded')
  await new Promise(r => setTimeout(r, 1000))
  const expr = `(async () => {
    const def = await window.electronAPI.workflow.getDefinition('builtin_def_script-to-video-v3').then(x => (x && x.success ? x.data : null)).catch(() => null)
    if (!def) return { found: false }
    const g = def.publishedGraph
    const start = g.nodes.find(n => n.id === 'start')
    return {
      found: true,
      name: def.name,
      nodes: g.nodes.length,
      edges: g.edges.length,
      hasStrategy: g.nodes.some(n => n.id === 'strategy'),
      visualStrategy: (start.config.inputs || []).some(i => i.key === 'visualStrategy'),
    }
  })()`
  const out = await p.evaluate(expr)
  console.log('v3 def:', JSON.stringify(out))
  const apps = await p.evaluate(`window.electronAPI.app.listApps ? window.electronAPI.app.listApps().then(x => JSON.stringify((x && x.data || []).map(a => a.name))) : 'no app api'`)
  console.log('apps:', String(apps).slice(0, 400))
  await b.close()
}
main().catch(e => { console.error(e); process.exit(1) })
