/**
 * 演示视频续跑：从已有剧集继续 剧本(重试) → 场景 → 分镜(重试) → 火山视频合成 → 校验
 * 用法: node e2e-real-episode-video-continue3.cjs <episodeId>
 * 注意：产物保留不清理（真实计费生成内容）
 */
const { chromium } = require('playwright')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const DB = path.join(os.homedir(), '.config/the_bot/the_bot.db')
const DATA_PATH = path.join(os.homedir(), '.config/the_bot')
const PC_TEXT = 'pc_mtee10tz_ijz2yq1ro'
const MODEL_TEXT = 'deepseek-v4-flash-0731'
const PC_VIDEO = 'pc_mtefri7z_gmou93g8m'
const MODEL_VIDEO = 'ep-20260511121109-hchqf'
const EPISODE_ID = process.argv[2]

function q(sql) {
  try {
    const out = execSync(`sqlite3 -json "${DB}" "${sql}"`, { encoding: 'utf8' }).trim()
    return out ? JSON.parse(out) : []
  } catch { return [] }
}

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  const ev = (fn, arg) => page.evaluate(fn, arg)
  const fail = (stage, r) => {
    console.error(`❌ ${stage}:`, JSON.stringify(r?.error ?? r).slice(0, 400))
    process.exit(1)
  }
  const withRetry = async (name, fn, times = 3) => {
    for (let i = 0; i < times; i++) {
      if (i > 0) console.log(`${name} 重试 ${i}...`)
      const r = await fn()
      if (r && r.success) return r
      console.error(`  ${name} 失败:`, JSON.stringify(r?.error ?? r).slice(0, 200))
    }
    return null
  }

  // 4. 剧本（重试 3 次）
  const script = await withRetry('生成剧本', () =>
    ev(({ episodeId, pc, m }) => window.electronAPI.episodeProduction.generateScript(episodeId, pc, m)
      .catch(e => ({ success: false, error: String(e && e.message || e) })),
      { episodeId: EPISODE_ID, pc: PC_TEXT, m: MODEL_TEXT }))
  if (!script) fail('生成剧本三次均失败', {})
  const scriptId = script.data?.id || script.data?.scriptId
  console.log('✅ 剧本:', scriptId)

  // 5. 场景
  let sceneArr = (await ev((scriptId) => window.electronAPI.episodeProduction.listScenes(scriptId), scriptId))?.data || []
  if (!sceneArr.length) {
    const scenes = await withRetry('生成场景', () =>
      ev(({ scriptId, pc, m }) => window.electronAPI.episodeProduction.generateScenes(scriptId, pc, m)
        .catch(e => ({ success: false, error: String(e && e.message || e) })),
        { scriptId, pc: PC_TEXT, m: MODEL_TEXT }))
    if (!scenes) fail('生成场景失败', {})
    sceneArr = (await ev((scriptId) => window.electronAPI.episodeProduction.listScenes(scriptId), scriptId))?.data || []
  }
  console.log('✅ 场景数:', sceneArr.length)
  if (!sceneArr.length) fail('场景为空', {})
  const sceneId = sceneArr[0].id

  // 6. 分镜（重试 3 次）
  let sbArr = []
  for (let i = 0; i < 3 && !sbArr.length; i++) {
    if (i > 0) console.log(`分镜重试 ${i}...`)
    const sb = await ev(({ sceneId, pc, m }) => window.electronAPI.episodeProduction.generateStoryboard(sceneId, pc, m)
      .catch(e => ({ success: false, error: String(e && e.message || e) })),
      { sceneId, pc: PC_TEXT, m: MODEL_TEXT })
    if (!sb.success) { console.error('  分镜失败:', JSON.stringify(sb.error).slice(0, 200)); continue }
    sbArr = (await ev((sceneId) => window.electronAPI.episodeProduction.listStoryboards(sceneId), sceneId))?.data || []
  }
  console.log('✅ 分镜数:', sbArr.length)
  if (!sbArr.length) fail('分镜三次均失败', {})
  const storyboard = sbArr[0]

  // 7. 火山视频合成（真实计费，产物保留）
  console.log('开始视频合成（可能数分钟）...')
  const tv = Date.now()
  const video = await ev(({ storyboardId, pc, m }) => window.electronAPI.episodeProduction.generateVideoSegment(storyboardId, {
    providerConfigId: pc, modelId: m, durationSec: 5, width: 1280, height: 720, forceMode: 'text2video',
  }).catch(e => ({ success: false, error: String(e && e.message || e) })),
    { storyboardId: storyboard.id, pc: PC_VIDEO, m: MODEL_VIDEO })
  const durSec = (Date.now() - tv) / 1000 | 0
  if (!video.success) fail(`视频合成(${durSec}s)`, video)
  console.log(`✅ 视频合成完成(${durSec}s)`)

  const vpath = video.data?.output?.videoPath
  const abs = vpath && (path.isAbsolute(vpath) ? vpath : path.join(DATA_PATH, vpath))
  const exists = abs && fs.existsSync(abs)
  const size = exists ? fs.statSync(abs).size : 0
  console.log(`视频文件: ${abs} exists=${exists} size=${size}`)
  console.log('EP_RESULT=' + JSON.stringify({ ok: !!(exists && size > 0), episodeId: EPISODE_ID, scriptId, sceneId, storyboardId: storyboard.id, videoPath: abs, size, durSec }))
  await browser.close()
  if (!(exists && size > 0)) process.exit(1)
})().catch(e => { console.error('脚本失败:', e.message); process.exit(1) })
