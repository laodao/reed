const { chromium } = require('playwright-core')
async function main(){
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const p = b.contexts()[0].pages()[0]
  await p.waitForLoadState('domcontentloaded')
  const def = await p.evaluate(() => window.electronAPI.workflow.getDefinition('builtin_def_topic-research').then(x => x.success ? x.data : null))
  console.log('定义:', def?.name, '| settings:', JSON.stringify(def?.settings))
  const list = await p.evaluate(() => window.electronAPI.searchEngine.list().then(x=>x))
  const d = (list?.data ?? []).find(c=>c.isDefault)
  console.log('默认搜索:', d ? `${d.name}(${d.templateId})` : '无')
  await b.close()
}
main().catch(e=>{console.error(e);process.exit(1)})
