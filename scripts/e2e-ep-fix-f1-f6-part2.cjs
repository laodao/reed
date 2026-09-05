/**
 * E2E · episode-production F1/F2/F5/F6 真机验证 part 2（CDP + IPC 驱动）
 *
 * 背景（part 1 = scripts/e2e-ep-fix-f1-f6.cjs 已验证）：
 *   F3 ✅ 资产新建弹窗类型选择（地点资产 UI 创建成功）
 *   F4 ✅ 参考图模式 UI + 链路：关键帧生成 → 后端 pickVideoMode 自动选 image2video
 *        → 火山 base64 提交成功（失败在 Seedance 真人内容审核，非上传链路）
 *   F5 失败写回 ✅ 真机实证：i2v 审核失败后 storyboard.status='error'
 *
 * 本脚本验证剩余点：
 *   F2/F1 批量生成分镜重试（文本 AI 偶发 JSON 解析失败，≤3 次）→ 落库 shot_number 连续 1..N
 *   F6    无人物参考图（seed 关键帧=地点主图）→ i2v 真机出片（5s，产物保留）
 *   F5    成功写回：status='completed' + videoMode='image2video' + 视频文件 ftyp
 *
 * 前置：应用已启动（CDP 9333）；DB 已 seed kf_e2e_f6_seed/img_e2e_f6_locseed
 *       （见本脚本头部注释对应的 python seed 步骤，产物保留不清理）。
 * 输出：EP_FIX2_RESULT=<json>
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const os = require('os')

const DATA_PATH = path.join(os.homedir(), '.config/the_bot')
const SCRIPT_ID = 'es_1788518923911_x77letrxs' // 演示-全流程 第1集 剧本
const SB_ID = 'sb_1788168635096_76ooqq5z4' // 无人物场景分镜（shot 7）
const PC_VOLC = 'pc_mtefri7z_gmou93g8m'
const MODEL_VIDEO = 'ep-20260511121109-hchqf'

const RESULT = { ok: false, fixes: {}, notes: [] }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function poll(fn, { timeout = 60000, interval = 3000 } = {}) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    try { const v = await fn(); if (v) return v } catch { /* ignore */ }
    await sleep(interval)
  }
  return null
}

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
  if (!page) throw new Error('未找到应用页面')
  await page.bringToFront()
  const ev = (fn, arg) => page.evaluate(fn, arg)

  // ─────────────────────────── F2/F1：批量生成分镜（≤3 次重试） ───────────────────────────
  console.log('=== F2/F1: 批量生成分镜（IPC 重试 ≤3，验证 scriptId 链路 + 编号 1..N） ===')
  const checkNumbering = async () => {
    const per = await ev(async (scriptId) => {
      const api = window.electronAPI.episodeProduction
      const scenes = (await api.listScenes(scriptId))?.data || []
      const out = []
      for (const sc of scenes) {
        const sbs = (await api.listStoryboards(sc.id))?.data || []
        out.push(sbs.map((s) => s.shotNumber))
      }
      return out
    }, SCRIPT_ID)
    const ok = per.length > 0 && per.every((nums) => nums.length > 0 && nums.every((n, i) => n === i + 1))
    return { per, ok }
  }

  let f1Done = false
  for (let attempt = 1; attempt <= 3 && !f1Done; attempt++) {
    console.log(`  批量生成第 ${attempt} 次（AI 文本，可能 1-3 分钟）...`)
    const t0 = Date.now()
    const r = await ev(async (scriptId) => {
      try {
        return await window.electronAPI.episodeProduction.generateStoryboards(scriptId)
      } catch (e) { return { success: false, error: String(e && e.message || e) } }
    }, SCRIPT_ID)
    const dur = (Date.now() - t0) / 1000 | 0
    const created = Array.isArray(r?.data) ? r.data.length : 0
    console.log(`  第 ${attempt} 次返回(${dur}s): success=${r?.success} created=${created} err=${r?.error || '无'}`)
    const { per, ok } = await checkNumbering()
    console.log('  当前 shotNumbers:', JSON.stringify(per))
    if (r?.success && created > 0 && ok) {
      f1Done = true
      RESULT.fixes.F2_batch_generate = `✅(第${attempt}次成功，IPC 链路用 scriptId，不再报"没有场景")`
      RESULT.fixes.F1_shot_numbering = `✅(落库 shot_number 连续: ${JSON.stringify(per)})`
    }
  }
  if (!f1Done) {
    RESULT.fixes.F2_batch_generate = RESULT.fixes.F2_batch_generate || '❌ 3 次均未成功生成（AI JSON 解析失败，见 main 日志）'
    RESULT.fixes.F1_shot_numbering = RESULT.fixes.F1_shot_numbering || '⚠️ 未能真机验证（AI 生成未成功；单测已覆盖 normalizeShotNumbers）'
  }

  // ─────────────────────────── F6/F5：无人物参考图 i2v 真机出片 ───────────────────────────
  console.log('\n=== F6/F5: i2v（seed 关键帧=地点主图，不传 forceMode → 后端自动选 image2video） ===')
  const before = await ev((id) => window.electronAPI.episodeProduction.getStoryboard(id), SB_ID)
  console.log('  生成前:', JSON.stringify({ status: before?.data?.status, videoPath: before?.data?.videoPath || null }))

  const tv = Date.now()
  const gen = await ev(({ id, pc, m }) =>
    window.electronAPI.episodeProduction.generateVideoSegment(id, {
      providerConfigId: pc, modelId: m, durationSec: 5,
    }).catch((e) => ({ success: false, error: String(e && e.message || e) })),
    { id: SB_ID, pc: PC_VOLC, m: MODEL_VIDEO })
  const vdur = (Date.now() - tv) / 1000 | 0
  console.log(`  generate-video-segment 返回(${vdur}s): success=${gen?.success} err=${JSON.stringify(gen?.error || '').slice(0, 300)}`)

  if (!gen?.success) {
    RESULT.fixes.F6_i2v_real = `❌(${vdur}s) ${String(gen?.error).slice(0, 200)}`
  } else {
    const after = await ev((id) => window.electronAPI.episodeProduction.getStoryboard(id), SB_ID)
    const d = after?.data || {}
    console.log(`  生成后: status=${d.status} videoMode=${d.videoMode} videoPath=${d.videoPath}`)
    const abs = d.videoPath && (path.isAbsolute(d.videoPath) ? d.videoPath : path.join(DATA_PATH, d.videoPath))
    let fileOk = false
    if (abs && fs.existsSync(abs)) {
      const st = fs.statSync(abs)
      const buf = fs.readFileSync(abs).subarray(0, 16)
      fileOk = st.size > 0 && buf.subarray(4, 8).toString('ascii') === 'ftyp'
      RESULT.notes.push(`i2v 产物: ${abs} size=${st.size}`)
      console.log(`  视频文件: ${abs} size=${st.size} ftyp=${fileOk}`)
    }
    RESULT.fixes.F6_i2v_real = gen.data?.match?.mode === 'image2video' && fileOk
      ? `✅(${vdur}s, image2video, base64 data URI 直传火山真机出片)`
      : `⚠️ mode=${gen.data?.match?.mode} fileOk=${fileOk}`
    RESULT.fixes.F5_status_success = d.status === 'completed' && !!d.videoPath
      ? `✅(status=${d.status} videoMode=${d.videoMode} videoPath 已落库)`
      : `❌ status=${d.status} videoPath=${d.videoPath}`
  }

  RESULT.ok = Object.values(RESULT.fixes).every((v) => String(v).startsWith('✅'))
  console.log('\n========== 结果汇总 ==========')
  console.log(JSON.stringify(RESULT, null, 2))
  console.log('EP_FIX2_RESULT=' + JSON.stringify(RESULT))
  process.exit(RESULT.ok ? 0 : 1)
})().catch((e) => {
  console.error('E2E 异常:', e)
  RESULT.error = String(e && e.message || e)
  console.log('EP_FIX2_RESULT=' + JSON.stringify(RESULT))
  process.exit(2)
})
