// V3 60s 星宇 分阶段观察/代批工具
// 用法: node _v3_watch2.js <mode>
//  mode=snapshotOutline 等首个 waiting_review（应为大纲）快照后退出（不代批）
//  mode=approveOutline   大纲环节 approve_with_changes 注入净化大纲（读 _v3_60s_outline_clean.md）
//  mode=toBoard          等到素材板审核挂起 → 快照 _v3_60s_board.json + 打印卡片，退出（不代批）
//  mode=approveBoard     素材板审核 approve
//  mode=video            持续代批「逐片段审核」直到终态，快照 _v3_60s_final.json，打印产物摘要
const { connect } = require('./_lib_cdp')
const fs = require('fs')
const RUN_ID = process.argv[3] || fs.readFileSync('progress/_v3_60s_run_id.txt', 'utf-8').trim()
const MODE = process.argv[2] || 'snapshotOutline'
const LOG = 'C:/Users/daoge/code/project/the-bot/progress/_v3_60s_watch2.log'
function log(msg) {
  const line = '[' + new Date().toLocaleTimeString() + '] ' + msg
  console.log(line)
  fs.appendFileSync(LOG, line + '\n', 'utf-8')
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function safe(v, n) { return String(v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : v)).slice(0, n || 400) }

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  const ev = (expr) => page.evaluate(expr)
  const t0 = Date.now()
  const MAX = 40 * 60 * 1000 // 阶段超时上限
  log('MODE=' + MODE + ' RUN=' + RUN_ID)

  if (MODE === 'approveOutline') {
    // 轮询到 outlineReview 挂起即注入净化大纲
    while (Date.now() - t0 < MAX) {
      const d = await ev(`window.electronAPI.workflow.getRun(${JSON.stringify(RUN_ID)}).then(x => (x.success ? x.data : null))`)
      const nr = (d && d.nodeRuns) || []
      const p = nr.find(n => n.status === 'waiting_review' && String(((n.input && n.input.payload) || {}).stage || n.nodeId).includes('大纲'))
      if (p) {
        const clean = fs.readFileSync('progress/_v3_60s_outline_clean.md', 'utf-8')
        const dec = await ev(`window.electronAPI.workflow.reviewDecide(${JSON.stringify({ runId: RUN_ID, nodeId: p.nodeId, decision: 'approve_with_changes', comment: '口播净化：去除内联口径括注，正文即唯一口播文本', editedValues: { md: clean } })}).then(x => x)`)
        log('✅ 大纲注入净化版 ' + p.nodeId + ' err=' + JSON.stringify(dec && dec.error))
        await browser.close()
        return
      }
      const st = d && d.run && d.run.status
      if (['failed', 'cancelled', 'succeeded', 'timed_out', 'interrupted'].includes(st)) { log('⚠ 终态早至 ' + st); await browser.close(); return }
      await sleep(3000)
    }
    log('TIMEOUT approveOutline')
    await browser.close()
    return
  }

  if (MODE === 'approveOutlinePlain') {
    while (Date.now() - t0 < MAX) {
      const d = await ev(`window.electronAPI.workflow.getRun(${JSON.stringify(RUN_ID)}).then(x => (x.success ? x.data : null))`)
      const nr = (d && d.nodeRuns) || []
      const p = nr.find(n => n.status === 'waiting_review' && String(((n.input && n.input.payload) || {}).stage || n.nodeId).includes('大纲'))
      if (p) {
        const dec = await ev(`window.electronAPI.workflow.reviewDecide(${JSON.stringify({ runId: RUN_ID, nodeId: p.nodeId, decision: 'approve', comment: '大纲审核通过：写作技能产出的调查体大纲' })}).then(x => x)`)
        log('✅ 原样批准大纲 ' + p.nodeId + ' err=' + JSON.stringify(dec && dec.error))
        await browser.close()
        return
      }
      const st = d && d.run && d.run.status
      if (['failed', 'cancelled', 'succeeded', 'timed_out', 'interrupted'].includes(st)) { log('⚠ 终态早至 ' + st); await browser.close(); return }
      await sleep(3000)
    }
    log('TIMEOUT approveOutlinePlain')
    await browser.close()
    return
  }

  if (MODE === 'approveBoard') {
    while (Date.now() - t0 < MAX) {
      const d = await ev(`window.electronAPI.workflow.getRun(${JSON.stringify(RUN_ID)}).then(x => (x.success ? x.data : null))`)
      const nr = (d && d.nodeRuns) || []
      const p = nr.find(n => n.status === 'waiting_review' && String(((n.input && n.input.payload) || {}).stage || '').includes('素材板'))
      if (p) {
        const dec = await ev(`window.electronAPI.workflow.reviewDecide(${JSON.stringify({ runId: RUN_ID, nodeId: p.nodeId, decision: 'approve', comment: '素材板意象审核通过：逐镜画面均为匹配脚本的意象化空镜/B-roll（无文字）' })}).then(x => x)`)
        log('✅ 批准素材板 ' + p.nodeId + ' err=' + JSON.stringify(dec && dec.error))
        await browser.close()
        return
      }
      const st = d && d.run && d.run.status
      if (['failed', 'cancelled', 'succeeded', 'timed_out', 'interrupted'].includes(st)) { log('⚠ 终态早至 ' + st); await browser.close(); return }
      await sleep(3000)
    }
    log('TIMEOUT approveBoard')
    await browser.close()
    return
  }

  // 通用轮询（snapshotOutline / toBoard / video）
  while (Date.now() - t0 < MAX) {
    const d = await ev(`window.electronAPI.workflow.getRun(${JSON.stringify(RUN_ID)}).then(x => (x.success ? x.data : { error: x.error }))`)
    const run = (d && d.run) || {}
    const nr = (d && Array.isArray(d.nodeRuns)) ? d.nodeRuns : []
    const status = run.status
    const pending = nr.filter(n => n.status === 'waiting_review')
    for (const n of pending) {
      const payload = (n.input && n.input.payload) || {}
      const stage = String(payload.stage || n.nodeName || '')
      if (MODE === 'snapshotOutline') {
        const fn = 'progress/_v3_60s_review_' + n.nodeId.replace(/[^a-zA-Z0-9_]/g, '_') + '.json'
        fs.writeFileSync(fn, JSON.stringify({ nodeId: n.nodeId, nodeName: n.nodeName, stage, payload }, null, 2), 'utf-8')
        log('⏸ 首审挂起 ' + n.nodeId + ' stage=' + stage + ' → 快照 ' + fn)
        await browser.close()
        return
      }
      if (MODE === 'toBoard') {
        if (stage.includes('素材板')) {
          const fn = 'progress/_v3_60s_board.json'
          fs.writeFileSync(fn, JSON.stringify({ nodeId: n.nodeId, stage, payload }, null, 2), 'utf-8')
          const cards = Array.isArray(payload.cards) ? payload.cards : []
          log('📋 素材板到达：visualStrategy=' + safe(payload.visualStrategy, 80) + ' 卡片=' + cards.length + ' → ' + fn)
          for (const c of cards) {
            log('  - [' + (c.shotIndex ?? '?') + '] mode=' + safe(c.mode, 20) + ' src=' + safe(c.source, 40) + ' cap=' + safe(c.caption, 40) + ' dur=' + safe(c.duration, 8) + ' | visual=' + safe((c.visual || c.imageryText || c.prompt), 90))
          }
          await browser.close()
          return
        }
        // 到素材板前不代批任何环节
      }
      if (MODE === 'video') {
        const isShot = stage.includes('逐片段')
        if (isShot) {
          const dec = await ev(`window.electronAPI.workflow.reviewDecide(${JSON.stringify({ runId: RUN_ID, nodeId: n.nodeId, decision: 'approve', comment: '逐镜代批：画面为已审核意象空镜，运镜提示词合规' })}).then(x => x)`)
          log('✅ 逐镜 ' + n.nodeId + ' #' + safe(payload.shotIndex, 8) + ' err=' + JSON.stringify(dec && dec.error))
        } else if (stage.includes('素材板')) {
          const dec = await ev(`window.electronAPI.workflow.reviewDecide(${JSON.stringify({ runId: RUN_ID, nodeId: n.nodeId, decision: 'approve', comment: '素材板意象审核通过（video 模式兜底代批）' })}).then(x => x)`)
          log('✅ 素材板兜底批准 ' + n.nodeId + ' err=' + JSON.stringify(dec && dec.error))
        }
      }
    }
    if (['failed', 'cancelled', 'succeeded', 'timed_out', 'interrupted'].includes(status)) {
      log('TERMINAL ' + status + (run.error ? ' ERR=' + safe(run.error, 500) : ''))
      const failedNode = nr.find(n => n.status === 'failed')
      if (failedNode) log('failed node: ' + failedNode.nodeId + ' → ' + safe(failedNode.error, 600))
      if (MODE === 'video' && status === 'succeeded') {
        fs.writeFileSync('progress/_v3_60s_final.json', JSON.stringify({ status, runId: RUN_ID, finishedAt: run.finishedAt, nodeRuns: nr }, null, 2), 'utf-8')
        for (const n of nr) {
          if (['save-asset', 'video-compose', 'tts'].includes(n.nodeType)) log('产物节点 ' + n.nodeId + '[' + n.nodeType + '] out=' + safe(JSON.stringify(n.output), 300))
        }
      }
      await browser.close()
      return
    }
    await sleep(3000)
  }
  log('TIMEOUT mode=' + MODE)
  await browser.close()
}

// 直接用 chromium 连接
const { chromium } = require('playwright-core')
main().catch(e => { console.error(e); process.exit(1) })
