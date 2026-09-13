// 取 60s 资产全文 + V2 def 关键配置（readScript/start 的资产引用语义）
const { chromium } = require('playwright-core')
const fs = require('fs')
const ASSET_ID = 'asset_1788523944352_tjb4e1jsi'

async function main() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const p = b.contexts()[0].pages()[0]
  await p.waitForLoadState('domcontentloaded')
  const ev = (e) => p.evaluate(e)

  // 资产内容
  const api = await ev(`(async () => {
    const keys = Object.keys(window.electronAPI || {})
    return keys
  })()`)
  console.log('electronAPI namespaces:', JSON.stringify(api))

  // 找资产读取方法：先试 asset.getById，再试 assetCenter 变体
  let content = null
  for (const expr of [
    "window.electronAPI.asset.getById('" + ASSET_ID + "').then(x => x && x.success ? x.data : null)",
    "window.electronAPI.assetCenter.getById('" + ASSET_ID + "').then(x => x && x.success ? x.data : null)",
    "window.electronAPI.asset.getAsset('" + ASSET_ID + "').then(x => x && x.success ? x.data : null)",
  ]) {
    try {
      const d = await ev(expr)
      if (d && (d.content || d.text)) { content = d; break }
      if (d && typeof d === 'object' && Object.keys(d).length) { content = content || d }
    } catch { /* 下一个 */ }
  }
  if (content) {
    const txt = content.content || content.text || ''
    fs.writeFileSync('progress/_60s_asset.md', txt, 'utf-8')
    console.log('ASSET OK name=', content.name, 'len=', txt.length)
    console.log(txt.slice(0, 500))
  } else {
    console.log('ASSET NOT FETCHED via tried getters; dumps above')
  }

  // V2 def：start 输入 + readScript 配置
  const def = await ev(`window.electronAPI.workflow.getDefinition('builtin_def_script-to-video-v2').then(x => (x && x.success ? x.data : null))`)
  if (!def) { console.log('NO DEF'); await b.close(); return }
  const nodes = def.publishedGraph.nodes
  const start = nodes.find(n => n.id === 'start')
  const rs = nodes.find(n => n.id === 'readScript') || nodes.find(n => n.id === 'readAsset')
  console.log('START inputs keys:', JSON.stringify((start.config.inputs || []).map(i => ({ k: i.key, t: i.type, src: i.source, desc: (i.desc || '').slice(0, 60) }))))
  console.log('readScript cfg:', JSON.stringify(rs ? rs.config : null).slice(0, 1200))
  await b.close()
}
main().catch(e => { console.error(e); process.exit(1) })
