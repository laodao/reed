// 取资产全文（assets 命名空间方法探测）+ start select 选项
const { chromium } = require('playwright-core')
const fs = require('fs')
const ASSET_ID = 'asset_1788523944352_tjb4e1jsi'

async function main() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const p = b.contexts()[0].pages()[0]
  await p.waitForLoadState('domcontentloaded')
  const ev = (e) => p.evaluate(e)

  const probe = await ev(`(async () => {
    const ns = window.electronAPI.assets || {}
    const methods = Object.keys(ns)
    const out = { methods }
    for (const m of methods) {
      try {
        const r = await ns[m](ASSET_ID)
        const d = r && r.success ? r.data : (r && r.data ? r.data : r)
        if (d && typeof d === 'object' && (d.content || d.text)) {
          out.found = m
          out.name = d.name
          out.len = String(d.content || d.text || '').length
          out.content = String(d.content || d.text || '')
          break
        }
      } catch { /* continue */ }
    }
    return out
  })()`)
  console.log('probe.methods:', JSON.stringify(probe.methods))
  if (probe.found) {
    console.log('FETCHED via:', probe.found, '| name:', probe.name, '| len:', probe.len)
    fs.writeFileSync('progress/_60s_asset.md', probe.content || '', 'utf-8')
    console.log(probe.content.slice(0, 400))
  } else {
    console.log('not fetched via simple getters; content sample keys=', JSON.stringify(probe).slice(0, 800))
  }

  const def = await ev(`window.electronAPI.workflow.getDefinition('builtin_def_script-to-video-v2').then(x => (x && x.success ? x.data : null))`)
  const start = def.publishedGraph.nodes.find(n => n.id === 'start')
  const inputs = start.config.inputs || []
  const pick = (k) => inputs.find(i => i.key === k)
  console.log('scriptSource options:', JSON.stringify(pick('scriptSource') && pick('scriptSource').options))
  console.log('videoQuality options:', JSON.stringify(pick('videoQuality') && pick('videoQuality').options))
  console.log('h3Steps default:', JSON.stringify(pick('h3Steps') && pick('h3Steps').defaultValue), '| videoQuality default:', JSON.stringify(pick('videoQuality') && pick('videoQuality').defaultValue))
  await b.close()
}
main().catch(e => { console.error(e); process.exit(1) })
