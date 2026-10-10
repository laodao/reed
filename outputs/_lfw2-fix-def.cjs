/** 用应用自身通道修正内置长文写作定义：saveDraft + publish（graph 取自迁移文件终态） */
const fs = require('fs')
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
;(async () => {
  const GRAPH = JSON.parse(fs.readFileSync('src/core/database/migrations/builtin-apps/long-form-writing.json', 'utf-8')).graph
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('http') || p.url().includes('renderer'))
  assert(page, '未找到渲染页')
  const r = await page.evaluate(async (a) => {
    const wf = window.electronAPI.workflow
    const save = await wf.saveDraft(a.defId, a.graph)
    if (!save.success) return { step: 'saveDraft', error: save.error }
    const pub = await wf.publishDefinition({ id: a.defId })
    return pub.success ? { ok: true, version: pub.data?.version } : { step: 'publish', error: pub.error }
  }, { defId: 'builtin_def_long-form-writing', graph: GRAPH })
  console.log(JSON.stringify(r, null, 1))
  assert(r.ok, `修正失败: ${JSON.stringify(r)}`)
})().catch(e => { console.error('❌', e.message); process.exit(1) })
