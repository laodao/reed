/**
 * yt-dlp 集成 E2E：
 * 1. 放置无效 yt-dlp 二进制 → YouTube URL 运行 → 节点明确失败提示（含 yt-dlp）
 * 2. 常规直链回归（本地 HTTP mp4 → 成功，确认未破坏）
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
const BIN_DIR = 'C:/Users/daoge/the-bot/bin'
const FAKE_YTDLP = path.join(BIN_DIR, 'yt-dlp.exe')
const VIDEO_FILE = path.join(DATA_DIR, 'url-test.mp4')
const PORT = 18802

;(async () => {
  // 测试视频 + 本地直链服务
  fs.mkdirSync(DATA_DIR, { recursive: true })
  spawnSync(ffmpeg, ['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15:duration=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-y', VIDEO_FILE], { stdio: 'pipe' })
  const server = http.createServer((req, res) => {
    if (req.url === '/video.mp4') { res.setHeader('content-type', 'video/mp4'); fs.createReadStream(VIDEO_FILE).pipe(res) }
    else { res.statusCode = 404; res.end() }
  })
  await new Promise(res => server.listen(PORT, '127.0.0.1', res))

  // 放置无效 yt-dlp（确保 ensureBinary 认为已安装 → spawn 失败 → 明确提示）
  fs.mkdirSync(BIN_DIR, { recursive: true })
  fs.writeFileSync(FAKE_YTDLP, 'this is not a real binary')
  console.log('已放置无效 yt-dlp:', FAKE_YTDLP)

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')

  let defId
  await step('建工作流（start[videoUrl] → video-extract-audio → message）', async () => {
    const r = await page.evaluate(async () => {
      const wf = window.electronAPI.workflow
      const c = await wf.createDefinition({ name: `E2E-ytdlp-${Date.now().toString(36)}` })
      if (!c.success) return { error: c.error }
      const graph = {
        version: 1,
        nodes: [
          { id: 'start', type: 'start', name: '开始', position: { x: 60, y: 200 }, config: { inputs: [{ key: 'videoUrl', label: '视频链接', type: 'string' }] } },
          { id: 'video1', type: 'video-extract-audio', name: '提取音频', position: { x: 280, y: 200 }, config: { videoUrl: '{{start.videoUrl}}' } },
          { id: 'end', type: 'end', name: '结束', position: { x: 480, y: 200 }, config: {} },
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'start', targetNodeId: 'video1', kind: 'normal' },
          { id: 'e2', sourceNodeId: 'video1', targetNodeId: 'end', kind: 'normal' },
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

  const runAndGetVideoNode = (inputs) => page.evaluate(async ({ defId, inputs }) => {
    const wf = window.electronAPI.workflow
    const st = await wf.startRun({ definitionId: defId, inputs })
    if (!st.success) return { error: st.error }
    for (let i = 0; i < 30; i++) {
      await new Promise(r2 => setTimeout(r2, 400))
      const d = await wf.getRun(st.data.id)
      if (d.success && (d.data.run?.status === 'succeeded' || d.data.run?.status === 'failed')) {
        const v = (d.data.nodeRuns ?? []).find(n => n.nodeType === 'video-extract-audio')
        return { runStatus: d.data.run.status, vStatus: v?.status, vError: v?.error, vOut: v?.output }
      }
    }
    return { error: '超时' }
  }, { defId, inputs })

  await step('yt-dlp 平台 URL（YouTube）→ 无效二进制 → 明确失败提示含 "yt-dlp"', async () => {
    const r = await runAndGetVideoNode({ videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
    assert(r.runStatus === 'failed', `应失败 ${JSON.stringify(r)}`)
    assert(r.vStatus === 'failed', `节点应 failed ${r.vStatus}`)
    assert(String(r.vError).includes('yt-dlp'), `应提示 yt-dlp 问题：${r.vError}`)
    console.log('   yt-dlp 失败提示:', r.vError)
  })

  await step('直链回归：本地 mp4 URL → 提取成功（yt-dlp 集成未破坏直链路径）', async () => {
    const r = await runAndGetVideoNode({ videoUrl: `http://127.0.0.1:${PORT}/video.mp4` })
    assert(r.runStatus === 'succeeded', `直链失败 ${JSON.stringify(r)}`)
    assert(r.vStatus === 'succeeded', `节点未成功 ${r.vStatus} ${r.vError}`)
    assert(fs.existsSync(r.vOut?.audioPath), `wav 未生成 ${r.vOut?.audioPath}`)
    console.log('   直链回归 OK:', r.vOut?.audioPath)
  })

  server.close()
  fs.unlinkSync(FAKE_YTDLP) // 清理假二进制
  console.log('\n===== yt-dlp 集成 E2E 通过 ✅ =====')
  process.exit(0)
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
