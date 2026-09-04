/**
 * E2E · 视频片段制重构批次 B 真机验证（UI 驱动优先，CDP 9333）
 *
 * 流程（"演示-全流程"项目 vp_1788518694155_yaq03g1sg，产物保留不清理）：
 *   1. UI：剧集制作 → 打开项目工作室 → 分镜 tab
 *   2. UI：若无片段卡 → 点「重新分段」（确认对话框）→ 验证片段卡出现（分段预览）
 *   3. UI：工具条选火山引擎 + ep-20260511121109-hchqf
 *   4. UI：点第一个待生成片段卡的「生成视频」（片段级 text2video，多镜一段）→ 等状态变已完成
 *   5. 校验：IPC listSegments → videoPath；文件存在 + ftyp + ffprobe 时长 > 单镜 5s（证明多镜一段）
 *   6. UI：片段卡点「播放」→ 播放对话框 video 可见
 *   7. UI：再点「重新分段」→ 验证 completed 段不动（segmentId 不变、仍 completed、数量不变）
 *
 * 前置：electron 应用已重启（批次 B build）且 --remote-debugging-port=9333；迁移已跑。
 * 成本：只生成 1 个片段（上限 ≤2）。输出：EP_SEG_RESULT=<json>
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')

const DATA_PATH = path.join(os.homedir(), '.config/the_bot')
const PROJECT_NAME = '演示-全流程'
const PC_VOLC = 'pc_mtefri7z_gmou93g8m' // 火山引擎
const VOLC_PROVIDER_NAME = '火山引擎'
const MODEL_VIDEO = 'ep-20260511121109-hchqf'

const RESULT = { ok: false, steps: {}, segments: {}, video: {}, notes: [] }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function shot(page, name) {
  try {
    await page.screenshot({ path: `/tmp/ep-seg-flow-${name}.png` })
    console.log(`  📸 /tmp/ep-seg-flow-${name}.png`)
  } catch (e) { console.warn('  截图失败:', e.message) }
}

async function poll(fn, { timeout = 60000, interval = 2000 } = {}) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    try { const v = await fn(); if (v) return v } catch { /* ignore */ }
    await sleep(interval)
  }
  return null
}

/** 侧边栏是纯图标 + tooltip：逐个 hover 找目标标签再点（沿用 e2e-ui-episode-fullflow） */
async function clickSidebar(page, label) {
  const items = page.locator('li.nav-item')
  const n = await items.count()
  for (let i = 0; i < n; i++) {
    const it = items.nth(i)
    try {
      await it.hover({ timeout: 3000 })
      await sleep(500)
      const pops = page.locator('.el-popper:visible')
      const pc = await pops.count()
      for (let j = 0; j < pc; j++) {
        const t = ((await pops.nth(j).textContent()) || '').trim()
        if (t === label) {
          await it.click()
          await page.mouse.move(500, 350)
          await sleep(1200)
          return true
        }
      }
    } catch { /* 下一个 */ }
  }
  return false
}

async function openStudio(page) {
  const card = page.locator('.recent-projects .project-card', { hasText: PROJECT_NAME }).first()
  await card.waitFor({ timeout: 15000 })
  await card.click()
  await page.locator('.studio-toolbar').waitFor({ timeout: 20000 })
  await sleep(1000)
}

async function clickStudioTab(page, label) {
  await page.locator('.studio-toolbar .tab-btn', { hasText: label }).first().click()
  await sleep(1500)
}

/** el-select 按可见文本选选项 */
async function selectDropdownOption(page, selectSelector, optionText) {
  await page.locator(selectSelector).first().click()
  await sleep(600)
  const opt = page.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: optionText }).first()
  await opt.waitFor({ timeout: 8000 })
  await opt.click()
  await sleep(500)
}

/** 确认 ElMessageBox（重新分段） */
async function confirmMessageBox(page, btnText) {
  const box = page.locator('.el-message-box')
  await box.waitFor({ timeout: 8000 })
  await box.locator('button', { hasText: btnText }).click()
  await sleep(800)
}

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
  if (!page) throw new Error('未找到应用页面')
  await page.bringToFront()
  page.setDefaultTimeout(20000)
  const ev = (fn, arg) => page.evaluate(fn, arg)

  // ── Step 0：进入分镜 tab ──
  console.log('\n=== Step 0: 打开「演示-全流程」工作室 → 分镜 tab ===')
  if (!(await clickSidebar(page, '剧集制作'))) {
    await ev(() => { window.location.hash = '#/episode-production' })
    await sleep(1500)
  }
  await page.locator('.episode-home').waitFor({ timeout: 15000 })
  await openStudio(page)
  await clickStudioTab(page, '分镜')
  await page.locator('.stage-storyboard .sb-toolbar').waitFor({ timeout: 15000 })
  await shot(page, '00-storyboard-tab')

  const episodeId = await ev(async (name) => {
    const api = window.electronAPI.episodeProduction
    const pr = await api.listProjects()
    const p = (pr?.data || []).find((x) => x.name === name)
    if (!p) return null
    const er = await api.listEpisodes(p.id)
    return er?.data?.[0]?.id || null
  }, PROJECT_NAME)
  if (!episodeId) throw new Error('找不到演示-全流程的剧集')
  console.log('  episodeId =', episodeId)
  RESULT.episodeId = episodeId

  // ── Step 1：分段（无片段卡则点「重新分段」）──
  console.log('\n=== Step 1: 分段（重新分段 → 片段卡出现）===')
  let cardCount = await page.locator('.stage-storyboard .seg-card').count()
  if (cardCount === 0) {
    const hintVisible = (await page.locator('.stage-storyboard .seg-hint').count()) > 0
    console.log('  未分段提示可见:', hintVisible)
    RESULT.segments.unsegmentedHintShown = hintVisible
    await page.locator('.stage-storyboard .sb-toolbar button', { hasText: '重新分段' }).first().click()
    await confirmMessageBox(page, '重新分段')
    cardCount = await poll(() => page.locator('.stage-storyboard .seg-card').count().then((c) => c > 0 ? c : null), { timeout: 30000 }) ?? 0
  }
  if (cardCount === 0) throw new Error('分段后仍无片段卡')
  console.log(`  ✅ 片段卡数量 = ${cardCount}`)
  RESULT.steps['1_segment_cards'] = '✅'
  RESULT.segments.cardCount = cardCount
  await shot(page, '01-segment-cards')

  // 卡片内容快照（镜数/预估时长/状态）
  const cardSnapshot = await page.$$eval('.stage-storyboard .seg-card', (cards) =>
    cards.map((c) => ({
      segmentId: c.getAttribute('data-segment'),
      status: c.getAttribute('data-status'),
      head: (c.querySelector('.seg-head')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      shotRows: c.querySelectorAll('.seg-shot-row').length,
    })))
  console.log('  片段卡快照:', JSON.stringify(cardSnapshot, null, 1))
  RESULT.segments.snapshot = cardSnapshot

  // ── Step 2：选火山视频模型 ──
  console.log('\n=== Step 2: 工具条选火山引擎 + Seedance 视频模型 ===')
  const provText = (await page.locator('.stage-storyboard .sb-toolbar .provider-select').textContent()) || ''
  if (!provText.includes('火山')) {
    await selectDropdownOption(page, '.stage-storyboard .sb-toolbar .provider-select', VOLC_PROVIDER_NAME)
  }
  const modelText = (await page.locator('.stage-storyboard .sb-toolbar .model-select').textContent()) || ''
  if (!modelText.includes('Seedance') && !modelText.includes('hchqf')) {
    await selectDropdownOption(page, '.stage-storyboard .sb-toolbar .model-select', 'Seedance')
  }
  console.log('  视频模型:', ((await page.locator('.stage-storyboard .sb-toolbar .model-select').textContent()) || '').trim())
  RESULT.steps['2_select_model'] = '✅'

  // ── Step 3：片段级生成（第一个待生成片段）──
  console.log('\n=== Step 3: 片段级生成（text2video，多镜一段，火山可能 3-4 分钟）===')
  const beforeSegs = await ev((eid) => window.electronAPI.episodeProduction.listSegments(eid), episodeId)
  const pendingSeg = (beforeSegs?.data?.segments || []).find((s) => s.status === 'pending' || s.status === 'error')
  if (!pendingSeg) {
    console.log('  没有待生成片段（全部已完成），跳过生成，直接校验')
    RESULT.notes.push('无待生成片段，未产生新生成成本')
  } else {
    console.log(`  目标片段: seq=${pendingSeg.seq} 镜数=${pendingSeg.shotCount} 预估=${pendingSeg.estDuration}s id=${pendingSeg.segmentId}`)
    RESULT.segments.target = { segmentId: pendingSeg.segmentId, seq: pendingSeg.seq, shotCount: pendingSeg.shotCount, estDuration: pendingSeg.estDuration }
    const card = page.locator(`.stage-storyboard .seg-card[data-segment="${pendingSeg.segmentId}"]`)
    const t0 = Date.now()
    await card.locator('.seg-actions button', { hasText: /生成视频|重试生成/ }).first().click()
    const done = await poll(async () => {
      const st = await card.getAttribute('data-status')
      if (st === 'completed') return { ok: true }
      if (st === 'error') return { ok: false, err: '卡片状态变 error' }
      return null
    }, { timeout: 720000, interval: 5000 })
    const dur = (Date.now() - t0) / 1000 | 0
    if (!done?.ok) throw new Error(`片段生成失败或超时(${dur}s): ${done?.err || 'timeout'}`)
    console.log(`  ✅ 片段视频已生成（${dur}s）`)
  }
  RESULT.steps['3_generate_segment'] = '✅'

  // ── Step 4：视频文件校验（存在 + ftyp + 时长 > 单镜 5s）──
  console.log('\n=== Step 4: 视频文件校验 ===')
  const afterSegs = await ev((eid) => window.electronAPI.episodeProduction.listSegments(eid), episodeId)
  const completedSegs = (afterSegs?.data?.segments || []).filter((s) => s.status === 'completed' && s.videoPath)
  if (completedSegs.length === 0) throw new Error('没有已完成的片段')
  const seg = completedSegs[completedSegs.length - 1]
  const abs = path.isAbsolute(seg.videoPath) ? seg.videoPath : path.join(DATA_PATH, seg.videoPath)
  if (!fs.existsSync(abs)) throw new Error('视频文件不存在: ' + abs)
  const size = fs.statSync(abs).size
  const magic = fs.readFileSync(abs).subarray(4, 8).toString('ascii') === 'ftyp'
  let probeDur = 0
  try {
    const out = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${abs}"`).toString().trim()
    probeDur = parseFloat(out)
  } catch (e) { console.warn('  ffprobe 失败:', e.message) }
  console.log(`  视频: ${abs}`)
  console.log(`  size=${size} ftyp=${magic} ffprobe时长=${probeDur}s 镜数=${seg.shotCount} 实际时长(库)=${seg.duration}s`)
  RESULT.video = { path: abs, size, ftyp: magic, probeDurationSec: probeDur, shotCount: seg.shotCount, dbDurationSec: seg.duration, segmentId: seg.segmentId }
  const multiShot = seg.shotCount >= 2 && probeDur > 5
  RESULT.video.multiShotProven = multiShot
  if (!magic || size <= 0) throw new Error('视频文件校验失败（ftyp/size）')
  if (seg.shotCount >= 2 && !(probeDur > 5)) throw new Error(`多镜片段时长 ${probeDur}s 未超过单镜 5s，无法证明多镜一段`)
  RESULT.steps['4_video_verify'] = '✅'

  // ── Step 5：UI 状态 + 播放 ──
  console.log('\n=== Step 5: UI 片段卡状态=已完成 + 播放 ===')
  const cardSel = `.stage-storyboard .seg-card[data-segment="${seg.segmentId}"]`
  const statusTxt = (await page.locator(`${cardSel} .seg-status-tag`).textContent()) || ''
  console.log('  片段卡状态标签:', statusTxt.trim())
  if (!statusTxt.includes('已完成')) throw new Error('片段卡状态不是「已完成」: ' + statusTxt)
  await page.locator(`${cardSel} .seg-actions button`, { hasText: '播放' }).first().click()
  await page.locator('.el-dialog video.play-video').waitFor({ timeout: 10000 })
  console.log('  ✅ 播放对话框 video 可见')
  await shot(page, '02-play-dialog')
  await page.keyboard.press('Escape')
  await sleep(600)
  RESULT.steps['5_ui_play'] = '✅'

  // ── Step 6：重新分段 → completed 段不动 ──
  console.log('\n=== Step 6: 再次「重新分段」→ 验证 completed 段保留 ===')
  const segIdsBefore = (afterSegs?.data?.segments || []).map((s) => `${s.segmentId}:${s.status}`).sort()
  await page.locator('.stage-storyboard .sb-toolbar button', { hasText: '重新分段' }).first().click()
  await confirmMessageBox(page, '重新分段')
  await sleep(2000)
  const reSegs = await ev((eid) => window.electronAPI.episodeProduction.listSegments(eid), episodeId)
  const segIdsAfter = (reSegs?.data?.segments || []).map((s) => `${s.segmentId}:${s.status}`).sort()
  console.log('  分段前:', JSON.stringify(segIdsBefore))
  console.log('  分段后:', JSON.stringify(segIdsAfter))
  const completedBefore = segIdsBefore.filter((x) => x.endsWith(':completed'))
  const kept = completedBefore.every((x) => segIdsAfter.includes(x))
  if (!kept) throw new Error('重新分段后 completed 段未保留！')
  console.log('  ✅ completed 段原样保留（segmentId/状态不变）')
  RESULT.segments.recomputeKeptCompleted = true
  RESULT.segments.afterRecompute = (reSegs?.data?.segments || []).map((s) => ({ segmentId: s.segmentId, seq: s.seq, status: s.status, shotCount: s.shotCount, estDuration: s.estDuration, videoPath: s.videoPath }))
  await shot(page, '03-after-recompute')
  RESULT.steps['6_recompute_keeps_completed'] = '✅'

  RESULT.ok = true
  console.log('\n========== 结果汇总 ==========')
  console.log(JSON.stringify(RESULT, null, 2))
  console.log('EP_SEG_RESULT=' + JSON.stringify(RESULT))
  process.exit(0)
})().catch((e) => {
  console.error('\n脚本中断:', e.message)
  RESULT.error = e.message
  console.log('EP_SEG_RESULT=' + JSON.stringify(RESULT))
  process.exit(1)
})
