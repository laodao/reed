// 检查三个内置报告工作流定义的 template_version（0=用户接管，改动不会自动同步）
const { chromium } = require('playwright-core')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const defs = await page.evaluate(() => window.electronAPI.workflow.listDefinitions({ keyword: '', page: 1, pageSize: 100 }).then(r => (r.success ? r.data : { error: r.error })))
  const items = (defs && (defs.items || defs.list || [])) || []
  console.log('total=', defs && defs.total)
  for (const d of items) {
    const name = d.name || ''
    if (name.includes('吃瓜') || name.includes('早报') || name.includes('周报')) {
      console.log(JSON.stringify({ id: d.id, name, isBuiltin: d.isBuiltin, templateVersion: d.templateVersion, publishedVersion: d.publishedVersion }))
    }
  }
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
