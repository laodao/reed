/**
 * video-extract-audio 端到端验证：
 * 1. ffmpeg 生成 1 秒测试视频 → 2. 模板导入"视频文案提取"工作流 → 3. 发布 → 4. 运行
 * 5. 断言：video1 节点 succeeded + wav 文件生成；stt1 之后的节点状态如实记录
 */
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')
const assert = (c, m) => { if (!c) throw new Error(m) }
const step = async (name, fn) => { try { await fn(); console.log('✅', name) } catch (e) { console.error('❌', name, e.message); throw e } }

const ffmpeg = require('ffmpeg-static')
const DATA_DIR = 'C:/Users/daoge/the-bot/wf-test'
const TEST_VIDEO = path.join(DATA_DIR, 'test-clip.mp4')
const TEMPLATE = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/src/assets/workflow-templates/video-transcript.json'), 'utf8'))

;(async () => {
  // ---- 0. 生成测试视频（1 秒，带合成音调） ----
  await step('生成测试视频（ffmpeg 1s 音画）', () => {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    const r = spawnSync(ffmpeg, [
      '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15:duration=1',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-y', TEST_VIDEO,
    ], { stdio: 'pipe' })
    assert(fs.existsSync(TEST_VIDEO) && fs.statSync(TEST_VIDEO).size > 0, `视频生成失败：${r.stderr?.toString().slice(0, 200)}`)
    console.log('   视频:', TEST_VIDEO, fs.statSync(TEST_VIDEO).size, 'bytes')
  })

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http'))
  assert(page, '未找到应用窗口')

  let defId
  // ---- 1. 模板导入 ----
  await step('模板导入「视频文案提取」工作流', async () => {
    const r = await page.evaluate(async (content) => {
      const resp = await window.electronAPI.workflow.importDefinition({ content, duplicatePolicy: 'copy' })
      return resp.success ? { id: resp.data.id } : { error: resp.error }
    }, JSON.stringify(TEMPLATE))
    assert(r.id, `导入失败 ${r.error}`)
    defId = r.id
  })

  // ---- 2. 发布（引擎图校验含新节点 config 深度校验） ----
  await step('发布工作流（校验 video-extract-audio 配置通过）', async () => {
    const r = await page.evaluate(async (id) => {
      const resp = await window.electronAPI.workflow.publishDefinition({ id })
      return resp.success ? { v: resp.data?.publishedVersion } : { error: resp.error }
    }, defId)
    assert(r.v >= 1, `发布失败 ${r.error}`)
  })

  // ---- 3. 运行（video 传 {path} 形态，模拟表单 file 字段值） ----
  let runId
  await step('运行工作流（video1 提取音频）', async () => {
    const r = await page.evaluate(async ({ id, videoPath }) => {
      const resp = await window.electronAPI.workflow.startRun({
        definitionId: id,
        inputs: { video: { path: videoPath, name: 'test-clip.mp4' }, language: 'zh', style: 'bullets' },
      })
      return resp.success ? { runId: resp.data.id, status: resp.data.status } : { error: resp.error }
    }, { id: defId, videoPath: TEST_VIDEO.replace(/\\/g, '/') })
    assert(r.runId, `启动失败 ${r.error}`)
    runId = r.runId
  })

  // ---- 4. 轮询节点状态 ----
  let videoNode
  await step('断言 video1 节点成功 + wav 生成（stt 无 key 失败属预期）', async () => {
    let detail = null
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 400))
      const d = await page.evaluate(async (id) => {
        const resp = await window.electronAPI.workflow.getRun(id)
        return resp.success ? resp.data : null
      }, runId)
      if (d?.run?.status === 'succeeded' || d?.run?.status === 'failed') { detail = d; break }
      detail = d
    }
    assert(detail, '未取到运行详情')
    const nodes = detail.nodeRuns ?? []
    const statusMap = nodes.map(n => `${n.nodeType}:${n.status}`).join(' | ')
    console.log('   节点状态:', statusMap)
    videoNode = nodes.find(n => n.nodeType === 'video-extract-audio')
    assert(videoNode, '缺少 video-extract-audio 节点执行记录')
    assert(videoNode.status === 'succeeded', `video-extract-audio 未成功：${videoNode.status} ${videoNode.error ?? ''}`)
    const out = videoNode.output ?? {}
    assert(typeof out.audioPath === 'string' && out.audioPath.endsWith('.wav'), `audioPath 异常：${JSON.stringify(out)}`)
    assert(fs.existsSync(out.audioPath), `wav 文件未生成：${out.audioPath}`)
    console.log('   wav:', out.audioPath, fs.statSync(out.audioPath).size, 'bytes,', out.durationMs, 'ms')
  })

  console.log('\n===== video-extract-audio 端到端验证通过 ✅ =====')
  console.log('（stt 后续节点取决于是否配置 DashScope 语音 key；节点链路与产物已验证）')
  process.exit(0)
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
