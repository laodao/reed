/**
 * EP 视频验证续跑：从已有场景 ss_xxx 重试分镜 → 火山视频合成 → 文件校验
 * 用法: node e2e-real-episode-video-continue2.cjs <sceneId>
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
const SCENE_ID = process.argv[2]

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

  // 分镜（失败重试 3 次，AI JSON 解析是瞬态）
  let sbArr = []
  for (let i = 0; i < 3 && !sbArr.length; i++) {
    if (i > 0) console.log(`分镜重试 ${i}...`)
    const sb = await ev(({ sceneId, pc, m }) => window.electronAPI.episodeProduction.generateStoryboard(sceneId, pc, m)
      .catch(e => ({ success: false, error: String(e && e.message || e) })),
      { sceneId: SCENE_ID, pc: PC_TEXT, m: MODEL_TEXT })
    if (!sb.success) { console.error('  分镜失败:', JSON.stringify(sb.error).slice(0, 200)); continue }
    const sbList = await ev((sceneId) => window.electronAPI.episodeProduction.listStoryboards(sceneId), SCENE_ID)
    sbArr = sbList.success ? sbList.data : []
  }
  console.log('✅ 分镜数:', sbArr.length)
  if (!sbArr.length) fail('分镜三次均失败', {})
  const storyboard = sbArr[0]

  // 火山视频合成
  console.log('开始视频合成（可能数分钟）...')
  const tv = Date.now()
  const video = await ev(({ storyboardId, pc, m }) => window.electronAPI.episodeProduction.generateVideoSegment(storyboardId, {
    providerConfigId: pc, modelId: m, durationSec: 5, width: 1280, height: 720, forceMode: 'text2video',
  }).catch(e => ({ success: false, error: String(e && e.message || e) })),
    { storyboardId: storyboard.id, pc: PC_VIDEO, m: MODEL_VIDEO })
  const durSec = (Date.now() - tv) / 1000 | 0
  if (!video.success) fail(`视频合成(${durSec}s)`, video)
  console.log(`✅ 视频合成完成(${durSec}s):`, JSON.stringify(video.data?.output || video.data).slice(0, 300))

  // 文件校验
  const sbRow = q(`SELECT video_path, video_mode, duration FROM scene_storyboards WHERE id='${storyboard.id}'`)[0]
    || q(`SELECT video_path, video_mode, duration FROM storyboards WHERE id='${storyboard.id}'`)[0]
  const vpath = video.data?.output?.videoPath || sbRow?.video_path
  const abs = vpath && (path.isAbsolute(vpath) ? vpath : path.join(DATA_PATH, vpath))
  const exists = abs && fs.existsSync(abs)
  const size = exists ? fs.statSync(abs).size : 0
  let magic = false
  if (exists) magic = fs.readFileSync(abs).subarray(4, 8).toString('ascii') === 'ftyp'
  console.log(`视频文件: ${abs} exists=${exists} size=${size} ftyp=${magic}`)
  const ok = !!(exists && size > 0 && magic)
  console.log(ok ? '✅ 视频合成链路全部通过' : '❌ 视频文件校验失败')
  console.log('EP_RESULT=' + JSON.stringify({ ok, videoPath: abs, size, durSec }))
  await browser.close()
  if (!ok) process.exit(1)
})().catch(e => { console.error('脚本失败:', e.message); process.exit(1) })
