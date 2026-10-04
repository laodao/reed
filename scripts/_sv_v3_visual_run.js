/**
 * V3 视觉层真机驱动（配图相关性验证）
 *
 * 作用：通过 CDP 驱动**隔离运行**的 App，用一篇真实财经短新闻跑
 *       builtin_def_script-to-video-v3，自动通过两级人工审核，并落盘全过程证据：
 *       - 大纲（writer 技能产出）
 *       - 素材板逐镜卡片（来源 stock-video/stock-image/generated、相关性分、检索词、素材出处页）
 *       - 片段规划与最终成片路径
 *
 * 用法（先启动隔离实例：electron-vite dev -- --remote-debugging-port=9333 --user-data-dir=...）：
 *   node scripts/_sv_v3_visual_run.js
 * 环境变量：
 *   SV_CDP=http://127.0.0.1:9333   SV_STOCK_KEY=<Pexels Key>   SV_TAG=<文件名后缀>
 */
const { chromium } = require('playwright-core')
const fs = require('fs')
const path = require('path')

const CDP = process.env.SV_CDP || 'http://127.0.0.1:9333'
const DEF_ID = 'builtin_def_script-to-video-v3'
const STOCK_KEY = process.env.SV_STOCK_KEY || ''
const TAG = process.env.SV_TAG || 'run'
const OUT_DIR = path.join(process.cwd(), 'outputs')
const MAX_WAIT_MS = Number(process.env.SV_MAX_WAIT_MS || 60 * 60 * 1000)
const POLL_MS = 5000

/** 测试用真实新闻稿：新华财经《国家统计局：2026年8月份规模以上工业增加值增长5.2%》 */
const ARTICLE = fs.readFileSync(path.join(process.cwd(), 'progress', '_sv_v3_news_article.md'), 'utf-8')

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const browser = await chromium.connectOverCDP(CDP)
  const page = browser.contexts()[0].pages()[0]
  await page.waitForLoadState('domcontentloaded')
  console.log('[v3-visual] 已连接 App')

  // ── 1) 素材库凭据（幂等：同名已存在则复用）──
  let credId = ''
  const creds = await page.evaluate(() => window.electronAPI.tools.listCredentials().then(x => x))
  const existing = (creds?.data ?? []).find(c => String(c.name || '').trim() === 'Pexels API Key')
  if (existing) {
    credId = existing.id
    console.log('[v3-visual] 复用凭据:', credId)
  } else {
    if (!STOCK_KEY) throw new Error('缺少 Pexels Key（SV_STOCK_KEY）且库中无同名凭据')
    const saved = await page.evaluate(
      k => window.electronAPI.tools.saveCredential({ name: 'Pexels API Key', apiKey: k }).then(x => x),
      STOCK_KEY,
    )
    credId = saved?.data?.id
    console.log('[v3-visual] 新建凭据:', credId, 'success=', saved?.success)
  }
  if (!credId) throw new Error('凭据不可用')

  // ── 2) 模型选择（真实云端模型）──
  const pcRes = await page.evaluate(() => window.electronAPI.providerConfig.list().then(x => x))
  const providers = pcRes?.data ?? []
  const volc = providers.find(p => p.templateId === 'volcengine' || p.shortId === 'volcengine')
  const bailian = providers.find(p => p.templateId === 'bailian')
  const comfyui = providers.find(p => p.templateId === 'comfyui')
  if (!volc) throw new Error('未找到火山引擎 provider（图像/文本模型来源）')
  const planModel = { providerConfigId: volc.id, modelId: 'ep-20260225205702-vh6zc' } // Doubao-Seed-2.0-pro
  const visionModel = { providerConfigId: volc.id, modelId: process.env.SV_VISION_MODEL || 'ep-20260225205702-vh6zc' }
  const imageModel = { providerConfigId: volc.id, modelId: 'ep-20260329002741-4wjp7' } // Doubao-Seedream-4.5
  console.log('[v3-visual] 规划/质检模型:', JSON.stringify(planModel), '图像模型:', JSON.stringify(imageModel))

  // 视觉质检前置：callVLM 要求模型声明为多模态（type='multimodal'），否则底层会静默丢图。
  // 这里把所选视觉模型的类型纠正为 multimodal（只改这一个条目的 type，其余字段原样保留）。
  if (planModel.providerConfigId === visionModel.providerConfigId) {
    const p = providers.find(x => x.id === visionModel.providerConfigId)
    const models = Array.isArray(p?.models) ? p.models : []
    const idx = models.findIndex(m => m.id === visionModel.modelId)
    if (idx >= 0 && models[idx].type !== 'multimodal') {
      const patched = models.map((m, i) => (i === idx ? { ...m, type: 'multimodal' } : m))
      const r = await page.evaluate(
        ({ id, data }) => window.electronAPI.providerConfig.update(id, data).then(x => x),
        { id: visionModel.providerConfigId, data: { models: patched } },
      )
      console.log('[v3-visual] 已把质检模型类型纠正为 multimodal:', visionModel.modelId, 'success=', r?.success)
    }
  }

  const runInputs = {
    scriptSource: 'text',
    scriptText: ARTICLE,
    topic: '8月工业增加值与出口交货值',
    keyPoints: '工业增加值同比5.2%、制造业6.1%、出口交货值增长11.1%、新能源汽车产量增长21.9%',
    videoType: 'financial-deep',
    videoStyle: '',
    visualStrategy: 'imagery',
    stockProvider: 'pexels',
    stockCredentialId: credId,
    stockKind: process.env.SV_STOCK_KIND || 'auto',
    clipSource: process.env.SV_CLIP_SOURCE || 'auto',
    writerSkill: 'auto',
    writerAttitude: '冷静调查',
    writerAngle: '',
    referenceAssetIds: [],
    baseImageAssetIds: [],
    width: 1080,
    height: 1920,
    voiceId: 'cosyvoice-v3.5-plus-vd-dsn-71398add049048a5b443da80d010b30d',
    voiceProviderConfigId: bailian ? bailian.id : '',
    videoProviderConfigId: comfyui ? comfyui.id : '',
    videoModelId: 'h3',
    videoQuality: 'low',
    h3Steps: 4,
    imageProviderConfigId: imageModel.providerConfigId,
    imageModelId: imageModel.modelId,
    bgmPath: '',
    model: planModel,
    visionModel,
  }

  const started = await page.evaluate(
    ({ defId, ins }) => window.electronAPI.workflow.startRun({ definitionId: defId, inputs: ins }),
    { defId: DEF_ID, ins: runInputs },
  )
  const runId = started?.data?.id
  console.log('[v3-visual] startRun:', JSON.stringify({ success: started?.success, runId, status: started?.data?.status, error: started?.data?.error }))
  if (!runId) throw new Error('启动失败：' + JSON.stringify(started))
  fs.writeFileSync(path.join(OUT_DIR, `_sv-v3-${TAG}-runid.txt`), runId, 'utf-8')

  // ── 3) 轮询 + 自动审核 ──
  const t0 = Date.now()
  const decided = new Set()
  const evidence = { runId, outline: '', board: null, segPlan: null, segments: null, videoPath: '', nodeStatus: {}, notes: [] }
  let lastLine = ''
  while (Date.now() - t0 < MAX_WAIT_MS) {
    const detail = await page.evaluate(id => window.electronAPI.workflow.getRun(id).then(x => x?.data), runId)
    const run = detail?.run
    const nodeRuns = detail?.nodeRuns ?? []
    const status = run?.status
    const byId = Object.fromEntries(nodeRuns.map(n => [n.nodeId, n]))
    const line = `status=${status} 拆镜=${byId.shotsGen?.status ?? '-'} 画面=${(byId.matItem?.status) ?? '-'} 片段=${byId.segPlan?.status ?? '-'} 合成=${byId.comp1?.status ?? '-'}`
    if (line !== lastLine) {
      console.log('[v3-visual]', line)
      lastLine = line
    }

    // 记录 writer 大纲（审核前）
    const wr = byId.writerMd?.output?.result?.md || byId.writerMd?.output?.md
    if (wr) evidence.outline = String(wr).slice(0, 4000)

    if (status === 'waiting_review') {
      for (const w of nodeRuns.filter(n => n.status === 'waiting_review')) {
        if (decided.has(w.nodeId)) continue
        if (w.nodeId === 'outlineReview') {
          const md = w.output?.payload?.md || ''
          fs.writeFileSync(path.join(OUT_DIR, `_sv-v3-${TAG}-outline.md`), String(md), 'utf-8')
          const r = await page.evaluate(
            p => window.electronAPI.workflow.reviewDecide(p),
            { runId, nodeId: 'outlineReview', decision: 'approve', comment: '真机脚本自动通过（大纲）' },
          )
          decided.add('outlineReview')
          console.log('[v3-visual] 大纲已通过:', r?.success)
        } else if (w.nodeId === 'boardReview') {
          const payload = w.output?.payload ?? w.payload ?? {}
          evidence.board = { summary: payload.summary, cards: payload.cards, visualStrategy: payload.visualStrategy }
          fs.writeFileSync(
            path.join(OUT_DIR, `_sv-v3-${TAG}-board.json`),
            JSON.stringify(evidence.board, null, 2),
            'utf-8',
          )
          console.log('[v3-visual] 素材板摘要：\n' + String(payload.summary || '(payload 未随 nodeRun 返回，稍后从库里读)').split('\n').slice(0, 20).join('\n'))
          const r = await page.evaluate(
            p => window.electronAPI.workflow.reviewDecide(p),
            { runId, nodeId: 'boardReview', decision: 'approve', comment: '真机脚本自动通过（素材板）' },
          )
          decided.add('boardReview')
          console.log('[v3-visual] 素材板已通过:', r?.success)
        } else {
          // 逐镜审核（clipSource=h3 时才会出现）
          const r = await page.evaluate(
            p => window.electronAPI.workflow.reviewDecide(p),
            { runId, nodeId: w.nodeId, decision: 'approve', comment: '真机脚本自动通过（逐镜）' },
          )
          decided.add(w.nodeId)
          console.log('[v3-visual] 逐镜通过:', w.nodeId, r?.success)
        }
      }
    }

    evidence.nodeStatus = Object.fromEntries(nodeRuns.map(n => [n.nodeId, n.status]))
    if (status && ['succeeded', 'failed', 'cancelled', 'timed_out'].includes(status)) {
      evidence.notes.push(`终态 ${status}${run?.error ? ' 错误: ' + run.error : ''}`)
      console.log('[v3-visual] 终态:', status, run?.error || '')
      // 终态时补齐 segPlan / segments / comp1 输出（含失败现场的降级说明）
      const finalDetail = await page.evaluate(id => window.electronAPI.workflow.getRun(id).then(x => x?.data), runId)
      const fb = Object.fromEntries((finalDetail?.nodeRuns ?? []).map(n => [n.nodeId, n]))
      const pick = id => fb[id]?.output?.result ?? fb[id]?.output ?? null
      evidence.segPlan = pick('segPlan')
      evidence.segments = pick('segments')
      evidence.videoPath = pick('comp1')?.videoPath || ''
      evidence.visualShotNotes = (finalDetail?.nodeRuns ?? [])
        .filter(n => n.nodeId === 'visualShot')
        .map(n => ({ status: n.status, note: (n.output?.result ?? n.output)?.note, source: (n.output?.result ?? n.output)?.source, relevance: (n.output?.result ?? n.output)?.relevance }))
      for (const n of finalDetail?.nodeRuns ?? []) {
        if (n.status === 'failed') evidence.notes.push(`${n.nodeId} 失败：${n.error || ''}`)
      }
      break
    }
    await sleep(POLL_MS)
  }

  fs.writeFileSync(path.join(OUT_DIR, `_sv-v3-${TAG}-evidence.json`), JSON.stringify(evidence, null, 2), 'utf-8')
  console.log('\n[v3-visual] 证据已写入 outputs/_sv-v3-' + TAG + '-evidence.json')
  console.log('[v3-visual] 成片:', evidence.videoPath || '(无)')
  const cards = evidence.board?.cards ?? []
  const stat = cards.reduce((m, c) => ((m[c.source] = (m[c.source] || 0) + 1), m), {})
  console.log('[v3-visual] 素材来源分布:', JSON.stringify(stat), '镜头数:', cards.length)
  console.log('[v3-visual] 卡片明细：')
  for (const c of cards) {
    console.log(
      `  #${c.cardIndex} [${c.source}] rel=${c.relevance} q=${c.searchQuery || '-'} img=${c.imagePath || '-'} clip=${c.clipPath || '-'} src=${c.pageUrl || '-'} | ${String(c.caption || '').slice(0, 24)}`,
    )
  }
  await browser.close()
}

main().catch(e => {
  console.error('[v3-visual] 失败:', e)
  process.exit(1)
})