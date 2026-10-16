/**
 * video-extract-audio URL 支持 E2E：
 * 1. 常规视频直链（本地 HTTP 服务提供 mp4）→ 提取音频成功
 * 2. 抖音链接 → 节点明确失败提示（降级路径）
 */
const http = require('http')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const step = async (name, fn) => { try { await fn(); console.log('✅', name) } catch (e) { console.error('❌', name, e.message); throw e } }

const ffmpeg = require('ffmpeg-static')
const DATA_DIR = 'C:/Users/daoge/the-bot/wf-test'
const VIDEO_FILE = path.join(DATA_DIR, 'url-test.mp4')
const PORT = 18801

;(async () => {
  // 生成测试视频
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const r = spawnSync(ffmpeg, [
    '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15:duration=1',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-y', VIDEO_FILE,
  ], { stdio: 'pipe' })
  assert(fs.existsSync(VIDEO_FILE), '视频生成失败')

  // 本地 HTTP 视频服务（模拟常规直链 CDN）
  const server = http.createServer((req, res) => {
    if (req.url === '/video.mp4') {
      res.setHeader('content-type', 'video/mp4')
      fs.createReadStream(VIDEO_FILE).pipe(res)
    } else {
      res.statusCode = 404
      res.end()
    }
  })
  await new Promise(res => server.listen(PORT, '127.0.0.1', res))
  const DIRECT_URL = `http://127.0.0.1:${PORT}/video.mp4`

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')

  // ---- 1. 常规直链 ----
  let defId
  await step('建工作流（start[videoUrl] → video-extract-audio → message）', async () => {
    const r = await page.evaluate(async () => {
      const wf = window.electronAPI.workflow
      const c = await wf.createDefinition({ name: `E2E-视频URL-${Date.now().toString(36)}` })
      if (!c.success) return { error: c.error }
      const graph = {
        version: 1,
        nodes: [
          { id: 'start', type: 'start', name: '开始', position: { x: 60, y: 200 }, config: { inputs: [{ key: 'videoUrl', label: '视频链接', type: 'string' }] } },
          { id: 'video1', type: 'video-extract-audio', name: '提取音频', position: { x: 280, y: 200 }, config: { videoUrl: '{{start.videoUrl}}' } },
          { id: 'msg1', type: 'message', name: '输出', position: { x: 480, y: 200 }, config: { content: '音频：{{video1.audioPath}}（{{video1.videoName}}）' } },
          { id: 'end', type: 'end', name: '结束', position: { x: 680, y: 200 }, config: {} },
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'start', targetNodeId: 'video1', kind: 'normal' },
          { id: 'e2', sourceNodeId: 'video1', targetNodeId: 'msg1', kind: 'normal' },
          { id: 'e3', sourceNodeId: 'msg1', targetNodeId: 'end', kind: 'normal' },
        ],
      }
      const s = await wf.saveDraft(c.data.id, graph)
      if (!s.success) return { error: s.error }
      const p = await wf.publishDefinition({ id: c.data.id })
      if (!p.success) return { error: p.error }
      return { id: c.data.id }
    })
    assert(r.id, `建流失败 ${r.error}`)
    defId = r.id
  })

  await step('运行（videoUrl=本地直链 mp4）→ 提取音频成功', async () => {
    const r = await page.evaluate(async ({ defId, url }) => {
      const wf = window.electronAPI.workflow
      const st = await wf.startRun({ definitionId: defId, inputs: { videoUrl: url } })
      if (!st.success) return { error: st.error }
      for (let i = 0; i < 30; i++) {
        await new Promise(r2 => setTimeout(r2, 400))
        const d = await wf.getRun(st.data.id)
        if (d.success && (d.data.run?.status === 'succeeded' || d.data.run?.status === 'failed')) {
          const v = (d.data.nodeRuns ?? []).find(n => n.nodeType === 'video-extract-audio')
          const msg = (d.data.nodeRuns ?? []).find(n => n.nodeType === 'message')
          return { runStatus: d.data.run.status, vStatus: v?.status, vOut: v?.output, vError: v?.error, msg: msg?.output?.content }
        }
      }
      return { error: '超时' }
    }, { defId, url: DIRECT_URL })
    assert(r.runStatus === 'succeeded', `运行失败 ${JSON.stringify(r)}`)
    assert(r.vStatus === 'succeeded', `节点未成功 ${r.vStatus} ${r.vError}`)
    assert(String(r.vOut?.audioPath).endsWith('.wav'), `audioPath 异常 ${r.vOut?.audioPath}`)
    assert(fs.existsSync(r.vOut?.audioPath), `wav 未生成 ${r.vOut?.audioPath}`)
    assert(r.vOut?.durationMs >= 900, `时长异常 ${r.vOut?.durationMs}`)
    console.log('   直链提取:', r.vOut?.audioPath, `(${r.vOut?.durationMs}ms)`)
  })

  // ---- 2. 抖音降级 ----
  await step('抖音链接 → 节点明确失败提示（降级路径）', async () => {
    const r = await page.evaluate(async ({ defId }) => {
      const wf = window.electronAPI.workflow
      const st = await wf.startRun({ definitionId: defId, inputs: { videoUrl: 'https://v.douyin.com/iABC123/' } })
      if (!st.success) return { error: st.error }
      for (let i = 0; i < 20; i++) {
        await new Promise(r2 => setTimeout(r2, 300))
        const d = await wf.getRun(st.data.id)
        if (d.success && (d.data.run?.status === 'succeeded' || d.data.run?.status === 'failed')) {
          const v = (d.data.nodeRuns ?? []).find(n => n.nodeType === 'video-extract-audio')
          return { runStatus: d.data.run.status, vStatus: v?.status, vError: v?.error }
        }
      }
      return { error: '超时' }
    }, { defId })
    assert(r.runStatus === 'failed', `应失败 ${JSON.stringify(r)}`)
    assert(r.vStatus === 'failed', `节点应 failed ${r.vStatus}`)
    assert(String(r.vError).includes('抖音'), `应提示抖音降级：${r.vError}`)
    console.log('   抖音降级提示:', r.vError)
  })

  server.close()
  console.log('\n===== video URL 支持 E2E 通过 ✅ =====')
  process.exit(0)
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
