// 查询：报告类工作流（吃瓜/早报/周报）产出的资产实况 + 分类定义（previewMode/模板）
const { chromium } = require('playwright-core')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')

  async function ev(expr) {
    return page.evaluate(expr)
  }

  // 1) 全部分类定义
  const cats = await ev(`window.electronAPI.assets.listCategories().then(r => (r.success ? r.data : {error:r.error}))`)
  console.log('=== asset_categories ===')
  for (const c of cats ?? []) {
    console.log(JSON.stringify({ name: c.name, code: c.code, previewMode: c.previewMode, templateId: c.previewTemplateId, isBuiltin: c.isBuiltin, count: c.count }))
  }

  // 2) 各大类中与报告相关的资产
  for (const q of [
    { category: 'text', subCategory: '早报' },
    { category: 'text', subCategory: '行业周报' },
    { category: 'text', subCategory: '吃瓜报告' },
    { category: 'image', subCategory: '吃瓜长图' },
    { category: 'text', subCategory: '吃瓜' },
  ]) {
    const r = await ev(`window.electronAPI.assets.list(${JSON.stringify({ ...q, page: 1, pageSize: 20 })}).then(x => (x.success ? x.data : {error:x.error}))`)
    const items = (r && r.items) || []
    console.log(`\n=== assets ${q.category}/${q.subCategory} total=${r && r.total} ===`)
    for (const a of items) {
      console.log(JSON.stringify({ id: a.id, name: a.name, kind: a.kind, category: a.category, subCategory: a.subCategory, storagePath: a.storagePath, sizeBytes: a.sizeBytes, textLen: (a.textContent || '').length }))
    }
  }

  // 3) 一次 report 渲染实测（找一条早报/行业周报/吃瓜报告文本资产调 previewRender，看返回模式与大小）
  for (const sub of ['早报', '行业周报', '吃瓜报告']) {
    const r = await ev(`window.electronAPI.assets.list(${JSON.stringify({ category: 'text', subCategory: sub, page: 1, pageSize: 1 })}).then(x => (x.success ? x.data : {error:x.error}))`)
    const a = r && r.items && r.items[0]
    if (!a) { console.log(`\n[previewRender] ${sub}: 无资产`); continue }
    const t0 = Date.now()
    const pr = await ev(`window.electronAPI.assets.previewRender(${JSON.stringify(a.id)}).then(x => (x.success ? x.data : {error:x.error}))`)
    console.log(`\n[previewRender] ${sub} asset=${a.id} name=${a.name} -> mode=${pr && pr.mode} len=${pr && (pr.url ? pr.url.length : (pr.html || '').length)} ms=${Date.now() - t0}`)
  }

  await browser.close()
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
