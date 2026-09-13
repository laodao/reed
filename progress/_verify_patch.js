// 验证 dev 已加载：def 单场景纪律 + 技能正文更新
const { connect } = require('./_lib_cdp')
async function main() {
  const { browser, page } = await connect()
  const def = await page.evaluate(`window.electronAPI.workflow.getDefinition('builtin_def_script-to-video-v3').then(x => (x.success ? x.data : null))`)
  const nodes = ((def && (def.publishedGraph || def.graph)) || {}).nodes || []
  const sg = nodes.find(n => n.id === 'shotsGen')
  const sp = nodes.find(n => n.id === 'shotPack')
  console.log('def shotsGen 原子纪律:', String((sg && sg.config && sg.config.systemPrompt) || '').includes('分镜原子纪律'))
  console.log('def shotPack 单场景纪律:', String((sp && sp.config && sp.config.systemPrompt) || '').includes('单场景纪律'))
  const s = await page.evaluate(`window.electronAPI.skills.get('video-writer-investigative').then(x => (x.success ? x.data : null))`)
  console.log('skill 拆句纪律:', String((s && s.body) || '').includes('禁止并进同一句'))
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
