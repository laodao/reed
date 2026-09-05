/**
 * E2E 真实业务测试 #4：剧集制作最小流程 + 火山视频合成
 * 建项目 → 建 1 个 standalone 角色资产 → 建集(uploaded) → AI 生成剧本(deepseek)
 * → AI 生成场景 → AI 生成分镜 → 火山 Seedance 文生视频(5s)合成最小视频
 * 验证：剧本/场景/分镜落库 + 视频文件真实存在（ftyp magic）+ 尺寸非 0
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
  console.log('视频 providers:', JSON.stringify(vps.data?.map(p => ({ name: p.name, type: p.type, ready: p.ready, models: p.models }))))
  if (!volc || !volc.ready) fail('火山视频 provider 未就绪', volc || vps)

  // AI 调用重试（deepseek 网关偶发超时/JSON 解析失败）
  const aiCall = async (fn, arg, label) => {
    for (let i = 1; i <= 3; i++) {
      const r = await ev(fn, arg).catch(e => ({ success: false, error: String(e && e.message || e) }))
      if (r.success) return r
      console.log(`  ${label} 第${i}次失败:`, String(r.error).slice(0, 120))
      if (i < 3) await new Promise(r2 => setTimeout(r2, 5000))
    }
    return { success: false, error: `${label} 重试 3 次均失败` }
  }

  // 1. 建项目（关联 E2E真实-长文 项目，走 outline 模式；
  //    uploaded 模式因 video_episodes.outline_id NOT NULL 迁移缺口不可用，见报告）
  const LW_PROJECT = 'lw_1788516462392_gyie802ne' // E2E真实-长文-视频验证
  const LW_OUTLINE = 'outline_1788516462410_2uthm8ep6' // 第1章「深夜古书」
  // 现场创建 lw 角色（旧硬编码 id 已随旧长文项目清理）
  const lwChar = await ev((lwPid) => window.electronAPI.longwriting.createCharacter({
    projectId: lwPid, name: '苏晚', role: '主角', description: '旧书修复师，沉静敏锐',
  }), LW_PROJECT)
  if (!lwChar.success) fail('创建 lw 角色', lwChar)
  const LW_CHAR = lwChar.data.id
  const PORTRAIT_ID = '' // 不绑人像（本次仅验证火山视频 provider 合并后的真实生成）
  const proj = await ev((lwPid) => window.electronAPI.episodeProduction.createProject('E2E真实-剧集', lwPid, {}), LW_PROJECT)
  if (!proj.success) fail('建项目', proj)
  const projectId = proj.data.id
  console.log('项目:', projectId)

  // 2. 角色资产绑定跳过：本次目标是验证合并后的火山视频 provider（t2v 不需要参考图）

  // 3. 建集（outline 模式）
  //    注：EP 读章节正文只认 chapter→section 子节点，不认一级 chapter 直挂正文（见报告）。
  //    这里先给第1章补一个 section 子节点并把已生成正文挂上去，再走真实链路。
  const sec = await ev(({ lwPid, parentId }) => window.electronAPI.longwriting.createOutline({
    projectId: lwPid, parentId, name: '第一节', level: 2, nodeType: 'section',
    summary: '苏晚收到焦黑古书', estimatedWords: 300, involvedCharacters: [], involvedLocations: [],
    status: 'pending', orderIndex: 0,
  }), { lwPid: LW_PROJECT, parentId: LW_OUTLINE })
  if (!sec.success) fail('补 section 节点', sec)
  // 当前长文项目该章暂无正文，直接把脚本内置文本写入 section
  const secContent = EPISODE_CONTENT
  const sc = await ev(({ oid, c }) => window.electronAPI.longwriting.saveChapter(oid, c), { oid: sec.data.id, c: secContent })
  if (!sc.success) fail('正文挂到 section', sc)
  console.log('section 节点:', sec.data.id, `正文 ${secContent.length} 字已挂载`)

  const ep = await ev(({ projectId, outlineId }) => window.electronAPI.episodeProduction.createEpisode(projectId, {
    sourceType: 'outline', outlineId, episodeNumber: 1, title: 'E2E真实-第1集',
    storyEra: '近未来', storyRegion: '城市',
  }), { projectId, outlineId: LW_OUTLINE })
  if (!ep.success) fail('建集', ep)
  const episodeId = ep.data.id
  console.log('剧集:', episodeId)

  // 4. AI 生成剧本（deepseek；内含角色识别 + 剧本）
  const t0 = Date.now()
  const script = await aiCall(({ episodeId, pc, m }) => window.electronAPI.episodeProduction.generateScript(episodeId, pc, m),
    { episodeId, pc: PC_TEXT, m: MODEL_TEXT }, '生成剧本')
  if (!script.success) fail('生成剧本', script)
  const scriptId = script.data?.script?.id || script.data?.id || script.data?.scriptId
  console.log(`✅ 剧本生成(${(Date.now() - t0) / 1000 | 0}s):`, scriptId, '| synopsis:', String(script.data?.synopsis || '').slice(0, 60))
  if (!scriptId) fail('剧本 ID 缺失', script.data)

  // 5. AI 生成场景
  const scenes = await aiCall(({ scriptId, pc, m }) => window.electronAPI.episodeProduction.generateScenes(scriptId, pc, m),
    { scriptId, pc: PC_TEXT, m: MODEL_TEXT }, '生成场景')
  if (!scenes.success) fail('生成场景', scenes)
  const sceneList = await ev((scriptId) => window.electronAPI.episodeProduction.listScenes(scriptId), scriptId)
  const sceneArr = sceneList.success ? sceneList.data : []
  console.log('✅ 场景数:', sceneArr.length, sceneArr.map(s => s.name || s.location).join(' / '))
  if (!sceneArr.length) fail('场景为空', sceneList)
  const sceneId = sceneArr[0].id

  // 6. AI 生成分镜（单场景）
  const sb = await aiCall(({ sceneId, pc, m }) => window.electronAPI.episodeProduction.generateStoryboard(sceneId, pc, m),
    { sceneId, pc: PC_TEXT, m: MODEL_TEXT }, '生成分镜')
  if (!sb.success) fail('生成分镜', sb)
  const sbList = await ev((sceneId) => window.electronAPI.episodeProduction.listStoryboards(sceneId), sceneId)
  const sbArr = sbList.success ? sbList.data : []
  console.log('✅ 分镜数:', sbArr.length)
  if (!sbArr.length) fail('分镜为空', sbList)
  const storyboard = sbArr[0]
  console.log('  首个分镜:', storyboard.id, '| frameDescription:', String(storyboard.frameDescription || storyboard.subject || '').slice(0, 60))

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
