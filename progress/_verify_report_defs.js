// 重启后核对：三个内置报告工作流 DB draftGraph 是否含 saveImg 图片资产节点（manual run 用 draftGraph）
const { chromium } = require('playwright-core')

const DEFS = ['builtin_def_gossip-event-report', 'builtin_def_daily-news-brief', 'builtin_def_industry-weekly']

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  for (const id of DEFS) {
    const d = await page.evaluate(did => window.electronAPI.workflow.getDefinition(did).then(x => (x.success ? x.data : { error: x.error })), id)
    const draft = d && d.draftGraph
    const imgNodes = ((draft && draft.nodes) || []).filter(n => n.type === 'save-asset' && (n.config || {}).category === 'image')
    const reportNodes = ((draft && draft.nodes) || []).filter(n => n.type === 'report-image')
    const name = d && d.name
    console.log(id, '|', name, '| templateVersion=', d && d.templateVersion, '| publishedVersion=', d && d.publishedVersion)
    console.log('  draft report-image:', reportNodes.map(n => n.id).join(', ') || 'NONE')
    console.log('  draft image-save  :', imgNodes.map(n => `${n.id}[${(n.config || {}).subCategory}]`).join(', ') || 'NONE')
  }
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
