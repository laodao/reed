/**
 * EP 链路续跑：从已有剧集 ve_1788105478870_gyc4lfmax 继续
 * generateScript → generateScenes → generateStoryboard → 火山视频合成
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
const PROJECT_ID = process.argv[3]

function q(sql) {
  try {
    const out = execSync(`sqlite3 -json "${DB}" "${sql}"`, { encoding: 'utf8' }).trim()
    return out ? JSON.parse(out) : []
  } catch { return [] }
}

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  if (!page) throw new Error('未找到应用页面')
  const fail = (stage, r) => {
    console.error(`❌ ${stage}:`, typeof r === 'string' ? r : JSON.stringify(r?.error ?? r).slice(0, 400))
    console.log('EP_RESULT=' + JSON.stringify({ ok: false, stage, error: String(r?.error ?? r).slice(0, 300) }))
    process.exit(1)
  }
  const ev = (fn, arg) => page.evaluate(fn, arg)

  // 4. 剧本已由上一轮 generateScript 生成（data={script, scenes}，场景已随剧本落库）
  const scriptId = q(`SELECT id FROM episode_scripts WHERE episode_id='${EPISODE_ID}' ORDER BY created_at DESC LIMIT 1`)[0]?.id
  if (!scriptId) fail('剧本不存在（需先跑 generateScript）', { episodeId: EPISODE_ID })
  const synopsis = q(`SELECT substr(synopsis,1,80) AS s FROM episode_scripts WHERE id='${scriptId}'`)[0]?.s
  console.log('剧本:', scriptId, '| synopsis:', synopsis)

  // 5. 场景已在 generateScript 内落库，直接列出
  const sceneList = await ev((scriptId) => window.electronAPI.episodeProduction.listScenes(scriptId), scriptId)
  const sceneArr = sceneList.success ? sceneList.data : []
  console.log(`✅ 场景数:`, sceneArr.length, sceneArr.map(s => s.name || s.location || s.id).join(' / '))
  if (!sceneArr.length) fail('场景为空', sceneList)
  const sceneId = sceneArr[0].id

  // 6. AI 生成分镜（单场景）
  const t0 = Date.now()
  const sb = await ev(({ sceneId, pc, m }) => window.electronAPI.episodeProduction.generateStoryboard(sceneId, pc, m)
    .catch(e => ({ success: false, error: String(e && e.message || e) })),
    { sceneId, pc: PC_TEXT, m: MODEL_TEXT })
  if (!sb.success) fail('生成分镜', sb)
  const sbList = await ev((sceneId) => window.electronAPI.episodeProduction.listStoryboards(sceneId), sceneId)
  const sbArr = sbList.success ? sbList.data : []
  console.log(`✅ 分镜生成(${(Date.now() - t0) / 1000 | 0}s), 数:`, sbArr.length)
  if (!sbArr.length) fail('分镜为空', sbList)
  const storyboard = sbArr[0]
  console.log('  首个分镜:', storyboard.id, '| frameDescription:', String(storyboard.frameDescription || storyboard.subject || '').slice(0, 80))

  // 7. 火山 Seedance 文生视频（5 秒，最长等 10 分钟）
  console.log('开始视频合成（可能数分钟）...')
  const tv = Date.now()
  const video = await ev(({ storyboardId, pc, m }) => window.electronAPI.episodeProduction.generateVideoSegment(storyboardId, {
    providerConfigId: pc, modelId: m, durationSec: 5, width: 1280, height: 720, forceMode: 'text2video',
  }).catch(e => ({ success: false, error: String(e && e.message || e) })),
    { storyboardId: storyboard.id, pc: PC_VIDEO, m: MODEL_VIDEO })
  const durSec = (Date.now() - tv) / 1000 | 0
  if (!video.success) {
    console.error(`❌ 视频合成失败(${durSec}s):`, JSON.stringify(video.error).slice(0, 500))
    console.log('EP_RESULT=' + JSON.stringify({
      ok: false, stage: 'video', projectId: PROJECT_ID, episodeId: EPISODE_ID, scriptId, sceneId,
      storyboardId: storyboard.id, error: String(video.error).slice(0, 500), durSec,
    }))
    await browser.close(); process.exit(1)
  }
  console.log(`✅ 视频合成完成(${durSec}s):`, JSON.stringify(video.data?.output || video.data).slice(0, 300))

  // 8. 验证视频文件
  const sbRow = q(`SELECT video_path, video_mode, duration FROM storyboards WHERE id='${storyboard.id}'`)[0]
  const vpath = video.data?.output?.videoPath || sbRow?.video_path
  const abs = vpath && (path.isAbsolute(vpath) ? vpath : path.join(DATA_PATH, vpath))
  const exists = abs && fs.existsSync(abs)
  const size = exists ? fs.statSync(abs).size : 0
  let magic = false
  if (exists) magic = fs.readFileSync(abs).subarray(4, 8).toString('ascii') === 'ftyp'
  console.log(`视频文件: ${abs} exists=${exists} size=${size} ftyp=${magic}`)
  const ok = !!(exists && size > 0 && magic)
  console.log(ok ? '✅ 剧集最小流程+视频合成全部通过' : '❌ 视频文件校验失败')
  console.log('EP_RESULT=' + JSON.stringify({
    ok, projectId: PROJECT_ID, episodeId: EPISODE_ID, scriptId, sceneId, storyboardId: storyboard.id,
    videoPath: abs, size, durSec, mode: sbRow?.video_mode, sceneCount: sceneArr.length, storyboardCount: sbArr.length,
  }))
  await browser.close()
  if (!ok) process.exit(1)
})().catch(e => { console.error('脚本失败:', e.message); console.log('EP_RESULT=' + JSON.stringify({ ok: false, stage: 'exception', error: e.message })); process.exit(1) })
