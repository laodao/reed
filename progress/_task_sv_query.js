// 查询：①星宇股份脚本资产 ②script-to-video 最近运行状态 ③当前挂起审核
const { chromium } = require('playwright-core')

const DEF_ID = 'builtin_def_script-to-video'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const ev = (expr) => page.evaluate(expr)

  // 1) 星宇股份脚本资产
  const r = await ev(`window.electronAPI.assets.list(${JSON.stringify({ keyword: '星宇股份', page: 1, pageSize: 20 })}).then(x => (x.success ? x.data : { error: x.error }))`)
  console.log('=== 匹配星宇股份的资产 total=' + (r && r.total) + ' ===')
  for (const a of (r?.items || [])) {
    const d = await ev(`window.electronAPI.assets.get(${JSON.stringify(a.id)}).then(x => (x.success ? x.data : null))`)
    console.log(JSON.stringify({
      id: a.id, name: a.name, kind: a.kind, category: a.category, subCategory: a.subCategory,
      textLen: d ? (d.textContent || '').length : -1,
      textHead: d ? (d.textContent || '').slice(0, 200) : '',
    }))
  }

  // 2) script-to-video 最近运行
  const runs = await ev(`window.electronAPI.workflow.listRuns(${JSON.stringify({ definitionId: DEF_ID, page: 1, pageSize: 15 })}).then(x => (x.success ? x.data : { error: x.error }))`)
  console.log('\n=== ' + DEF_ID + ' 最近运行 total=' + (runs && runs.total) + ' ===')
  for (const run of (runs?.items || [])) {
    const si = run.startInputs || {}
    console.log(JSON.stringify({
      id: run.id, status: run.status, createdAt: run.createdAt, finishedAt: run.finishedAt,
      scriptHead: String(si.script || '').slice(0, 60),
      videoStyle: String(si.videoStyle || '').slice(0, 40),
      videoCfg: si.videoProviderConfigId, videoModel: si.videoModelId,
      imgCfg: si.imageProviderConfigId, imgModel: si.imageModelId,
      w: si.width, h: si.height,
    }))
  }

  // 3) 挂起审核
  const pending = await ev(`window.electronAPI.workflow.getPendingReviews().then(x => (x.success ? x.data : { error: x.error }))`)
  console.log('\n=== 挂起审核 ===')
  console.log(JSON.stringify(pending, null, 2))

  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
