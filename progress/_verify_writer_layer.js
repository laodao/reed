// 核对：技能库含 video-writer-*；v3 定义已同步 writerPick/Call/Md 与 start 新输入
const { connect } = require('./_lib_cdp')
async function main() {
  const { browser, page } = await connect()
  const ev = (expr) => page.evaluate(expr)
  const skills = await ev(`window.electronAPI.skills.list().then(x => (x.success ? x.data : { error: x.error }))`)
  const list = Array.isArray(skills) ? skills : []
  console.log('skills total:', list.length)
  for (const s of list.filter(x => /video-writer|short-video|deep-analysis/.test(String(x.id)))) {
    console.log(' -', s.id, '|', s.title, '| source=' + s.source, '| inputs=' + (s.inputs || []).map(i => i.key).join(','))
  }
  const def = await ev(`window.electronAPI.workflow.getDefinition('builtin_def_script-to-video-v3').then(x => (x.success ? x.data : { error: x.error }))`)
  const graph = (def && (def.publishedGraph || def.graph)) || {}
  console.log('def nodes:', (graph.nodes || []).map(n => n.id).join(','))
  const st = (graph.nodes || []).find(n => n.id === 'start')
  console.log('start writer inputs:', (st.config.inputs || []).filter(i => /writer/.test(i.key)).map(i => i.key + ':' + i.type).join(' | '))
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
