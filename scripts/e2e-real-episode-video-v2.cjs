/**
 * E2E 真实业务测试 #4v2：剧集制作最小流程 + 火山视频合成（自包含版）
 * 前置数据现场创建：长文项目 → chapter → section(B3 绕过) + 正文
 * → EP 建项目(outline 模式) → 建集 → AI 剧本 → AI 场景 → AI 分镜
 * → 火山 Seedance 文生视频(5s) → 验证视频文件（ftyp magic + 尺寸）
 * 输出 EP_RESULT=...
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

const EPISODE_CONTENT = `深夜的旧书修复工作室里，苏晚独自伏案。台灯下，那本焦黑的古书突然无风自动，翻到一页空白。空白处缓缓浮现一行字："不要把它交给穿灰大衣的人。"窗外巷口，恰好立着一个穿灰大衣的身影。苏晚屏住呼吸，轻轻合上了书。`

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

  // 0. 视频 provider 可用性
  const vps = await ev(() => window.electronAPI.episodeProduction.listVideoProviders())
  const volc = vps.success && vps.data.find(p => p.providerConfigId === PC_VIDEO)
  if (!volc || !volc.ready) fail('火山视频 provider 未就绪', volc || vps)
  console.log('火山视频 provider 就绪:', volc.models?.map(m => m.id).join(','))

  // 1. 长文前置：项目 → chapter（一级大纲）→ 正文直挂 + section 子节点挂正文（B3 绕过）
  const lwProj = await ev((d) => window.electronAPI.longwriting.createProject(d), { name: 'E2E真实-长文-视频验证', type: 'story' })
  if (!lwProj.success) fail('建长文项目', lwProj)
  const lwPid = lwProj.data.id
  console.log('长文项目:', lwPid)

  const mkNode = (parentId, name, level, nodeType, orderIndex) => ev(
    (d) => window.electronAPI.longwriting.createOutline(d),
    { projectId: lwPid, parentId, name, level, nodeType, summary: '', estimatedWords: 300, involvedCharacters: [], involvedLocations: [], status: 'pending', orderIndex }
  )
  const chNode = await mkNode(null, '第1章 深夜古书', 1, 'chapter', 0)
  if (!chNode.success) fail('建 chapter', chNode)
  const chapterId = chNode.data.id
  const secNode = await mkNode(chapterId, '第一节', 2, 'section', 0)
  if (!secNode.success) fail('建 section', secNode)
  const sc1 = await ev(({ oid, c }) => window.electronAPI.longwriting.saveChapter(oid, c), { oid: chapterId, c: EPISODE_CONTENT })
  if (!sc1.success) fail('chapter 正文', sc1)
  const sc2 = await ev(({ oid, c }) => window.electronAPI.longwriting.saveChapter(oid, c), { oid: secNode.data.id, c: EPISODE_CONTENT })
  if (!sc2.success) fail('section 正文', sc2)
  console.log('chapter/section 正文已挂载:', chapterId)

  // 2. EP 建项目（outline 模式）
  const proj = await ev((lwPid) => window.electronAPI.episodeProduction.createProject('E2E真实-剧集-视频验证', lwPid, {}), lwPid)
  if (!proj.success) fail('建 EP 项目', proj)
  const projectId = proj.data.id
  console.log('EP 项目:', projectId)

  // 3. 建集（outline 模式）
  const ep = await ev(({ projectId, outlineId }) => window.electronAPI.episodeProduction.createEpisode(projectId, {
    sourceType: 'outline', outlineId, episodeNumber: 1, title: 'E2E真实-第1集',
    storyEra: '近未来', storyRegion: '城市',
  }), { projectId, outlineId: chapterId })
  if (!ep.success) fail('建集', ep)
  const episodeId = ep.data.id
  console.log('剧集:', episodeId)

  // 4. AI 生成剧本
  const t0 = Date.now()
  const script = await ev(({ episodeId, pc, m }) => window.electronAPI.episodeProduction.generateScript(episodeId, pc, m)
    .catch(e => ({ success: false, error: String(e && e.message || e) })),
    { episodeId, pc: PC_TEXT, m: MODEL_TEXT })
  if (!script.success) fail('生成剧本', script)
  const scriptId = script.data?.id || script.data?.scriptId
  console.log(`✅ 剧本生成(${(Date.now() - t0) / 1000 | 0}s):`, scriptId)

  // 5. 场景（generateScript 内已落库则直接列出，否则显式生成）
  let sceneList = await ev((scriptId) => window.electronAPI.episodeProduction.listScenes(scriptId), scriptId)
  let sceneArr = sceneList.success ? sceneList.data : []
  if (!sceneArr.length) {
    const scenes = await ev(({ scriptId, pc, m }) => window.electronAPI.episodeProduction.generateScenes(scriptId, pc, m)
      .catch(e => ({ success: false, error: String(e && e.message || e) })),
      { scriptId, pc: PC_TEXT, m: MODEL_TEXT })
    if (!scenes.success) fail('生成场景', scenes)
    sceneList = await ev((scriptId) => window.electronAPI.episodeProduction.listScenes(scriptId), scriptId)
    sceneArr = sceneList.success ? sceneList.data : []
  }
  console.log('✅ 场景数:', sceneArr.length)
  if (!sceneArr.length) fail('场景为空', sceneList)
  const sceneId = sceneArr[0].id

  // 6. AI 生成分镜
  const sb = await ev(({ sceneId, pc, m }) => window.electronAPI.episodeProduction.generateStoryboard(sceneId, pc, m)
    .catch(e => ({ success: false, error: String(e && e.message || e) })),
    { sceneId, pc: PC_TEXT, m: MODEL_TEXT })
  if (!sb.success) fail('生成分镜', sb)
  const sbList = await ev((sceneId) => window.electronAPI.episodeProduction.listStoryboards(sceneId), sceneId)
  const sbArr = sbList.success ? sbList.data : []
  console.log('✅ 分镜数:', sbArr.length)
  if (!sbArr.length) fail('分镜为空', sbList)
  const storyboard = sbArr[0]

  // 7. 火山 Seedance 文生视频（5 秒，最长等 10 分钟）
  console.log('开始视频合成（可能数分钟）...')
  const tv = Date.now()
  const video = await ev(({ storyboardId, pc, m }) => window.electronAPI.episodeProduction.generateVideoSegment(storyboardId, {
    providerConfigId: pc, modelId: m, durationSec: 5, width: 1280, height: 720, forceMode: 'text2video',
  }).catch(e => ({ success: false, error: String(e && e.message || e) })),
    { storyboardId: storyboard.id, pc: PC_VIDEO, m: MODEL_VIDEO })
  const durSec = (Date.now() - tv) / 1000 | 0
  if (!video.success) {
    console.error(`❌ 视频合成失败(${durSec}s):`, JSON.stringify(video.error).slice(0, 400))
    console.log('EP_RESULT=' + JSON.stringify({
      ok: false, stage: 'video', projectId, episodeId, scriptId, sceneId, storyboardId: storyboard.id,
      error: String(video.error).slice(0, 400), durSec,
    }))
    await browser.close(); process.exit(1)
  }
  console.log(`✅ 视频合成完成(${durSec}s):`, JSON.stringify(video.data?.output || video.data).slice(0, 300))

  // 8. 验证视频文件
  const sbRow = q(`SELECT video_path, video_mode, duration FROM scene_storyboards WHERE id='${storyboard.id}'`)[0]
    || q(`SELECT video_path, video_mode, duration FROM storyboards WHERE id='${storyboard.id}'`)[0]
  const vpath = video.data?.output?.videoPath || sbRow?.video_path
  const abs = vpath && (path.isAbsolute(vpath) ? vpath : path.join(DATA_PATH, vpath))
  const exists = abs && fs.existsSync(abs)
  const size = exists ? fs.statSync(abs).size : 0
  let magic = false
  if (exists) {
    const buf = fs.readFileSync(abs).subarray(0, 16)
    magic = buf.subarray(4, 8).toString('ascii') === 'ftyp'
  }
  console.log(`视频文件: ${abs} exists=${exists} size=${size} ftyp=${magic}`)
  const ok = !!(exists && size > 0 && magic)
  console.log(ok ? '✅ 剧集最小流程+视频合成全部通过' : '❌ 视频文件校验失败')
  console.log('EP_RESULT=' + JSON.stringify({
    ok, projectId, episodeId, scriptId, sceneId, storyboardId: storyboard.id,
    videoPath: abs, size, durSec, mode: sbRow?.video_mode, sceneCount: sceneArr.length, storyboardCount: sbArr.length,
  }))
  await browser.close()
  if (!ok) process.exit(1)
})().catch(e => { console.error('脚本失败:', e.message); console.log('EP_RESULT=' + JSON.stringify({ ok: false, stage: 'exception', error: e.message })); process.exit(1) })
