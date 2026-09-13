// 查询2：目标资产全文 + script-to-video 运行状态（落盘 UTF-8 JSON）
const { chromium } = require('playwright-core')
const fs = require('fs')
const DEF_ID = 'builtin_def_script-to-video'
const ASSET_NAME = '星宇股份短视频脚本-2026-09-04'
const OUT = 'C:/Users/daoge/code/project/the-bot/progress/_task_sv_state.json'

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const ev = (expr) => page.evaluate(expr)

  const out = { assets: [], runs: [], pendingReviews: [] }

  // 1) 目标资产全文
  const r = await ev(`window.electronAPI.assets.list(${JSON.stringify({ keyword: '星宇股份', page: 1, pageSize: 50 })}).then(x => (x.success ? x.data : { error: x.error }))`)
  for (const a of (r?.items || [])) {
    if (a.name === ASSET_NAME || a.name.includes('星宇股份短视频脚本')) {
      const d = await ev(`window.electronAPI.assets.get(${JSON.stringify(a.id)}).then(x => (x.success ? x.data : null))`)
      out.assets.push({ id: a.id, name: a.name, kind: a.kind, category: a.category, subCategory: a.subCategory, textLen: d ? (d.textContent || '').length : -1 })
      if (a.name === ASSET_NAME) fs.writeFileSync('C:/Users/daoge/code/project/the-bot/progress/_task_sv_script.md', d.textContent || '', 'utf-8')
    }
  }

  // 2) 运行列表（倒序）
  const runs = await ev(`window.electronAPI.workflow.listRuns(${JSON.stringify({ definitionId: DEF_ID, page: 1, pageSize: 20 })}).then(x => (x.success ? x.data : { error: x.error }))`)
  out.runs = (runs?.items || []).map(run => {
    const si = run.startInputs || {}
    return {
      id: run.id, status: run.status, createdAt: run.createdAt, finishedAt: run.finishedAt,
      scriptHead: String(si.script || '').replace(/\n/g, ' ').slice(0, 70),
      videoStyle: String(si.videoStyle || ''),
      videoCfg: si.videoProviderConfigId, videoModel: si.videoModelId,
      imgCfg: si.imageProviderConfigId, imgModel: si.imageModelId,
      voice: si.voiceId, voiceCfg: si.voiceProviderConfigId, llmCfg: si.model && si.model.providerConfigId, llm: si.model && si.model.modelId,
      w: si.width, h: si.height, ref: si.styleReferenceImage || '',
    }
  })

  // 3) 该定义挂起审核（从全部 pending 中筛选）
  const pending = await ev(`window.electronAPI.workflow.getPendingReviews().then(x => (x.success ? x.data : { error: x.error }))`)
  for (const p of (pending || [])) {
    if (p.runId && p.nodeType === 'human-review') {
      out.pendingReviews.push({ runId: p.runId, nodeId: p.nodeId, iter: p.iterationIndex, payload: p.input && p.input.payload, status: p.status })
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf-8')
  console.log('WROTE', OUT, 'assets=' + out.assets.length, 'runs=' + out.runs.length, 'humanReviewPending=' + out.pendingReviews.length)
  await browser.close()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
