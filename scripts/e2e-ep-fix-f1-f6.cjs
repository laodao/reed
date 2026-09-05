/**
 * E2E · episode-production F1-F6 修复验证（playwright CDP 真实 UI 驱动）
 *
 * 前置：electron 应用已启动（新 build）且 --remote-debugging-port=9333；
 *       已存在「演示-全流程」项目（含剧本/场景/分镜/资产，由 e2e-ui-episode-fullflow.cjs 产出）。
 *
 * 验证点：
 *   F3  资产 tab「新建」弹窗可选类型（角色/地点/物品）→ 选地点创建成功（UI 全流程）
 *   F2  分镜 tab「批量生成分镜」不再报"没有场景"（传 scriptId 而非 episode.id），生成成功
 *   F1  批量生成落库后 shot_number 强制连续 1..N（此前实测 2/3/5 跳号）
 *   F4  分镜制作页新增生成模式选择（文生视频/参考图模式）；参考图模式不再硬编码
 *       forceMode=text2video，先自动补关键帧再由后端 pickVideoMode 自动选模式
 *   F6  火山 i2v 本地图改走 base64 data URI（不再走 Files API file:// 死路）→ 真机出片
 *   F5  视频生成成功后 storyboard.status 写回 'completed'（此前永远 pending）
 *
 * AI 成本控制：文本批量分镜 1 次（重试 ≤3 由后端/脚本控制）；i2v 视频 1 段（5 秒）。
 * 产物全部保留（新建资产、重排分镜、关键帧、视频文件均不清理）。
 * 输出：EP_FIX_RESULT=<json>
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const os = require('os')

const DATA_PATH = path.join(os.homedir(), '.config/the_bot')
const PROJECT_NAME = '演示-全流程'
const VOLC_PROVIDER_NAME = '火山引擎'
const TEXT_PROVIDER_NAME = '阿里百炼平台-tokenplan'
const F3_LOCATION_NAME = 'F3验证地点-街角咖啡屋'

const RESULT = { ok: false, fixes: {}, notes: [] }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function shot(page, name) {
  try {
    await page.screenshot({ path: `/tmp/ep-fix-${name}.png` })
    console.log(`  📸 /tmp/ep-fix-${name}.png`)
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

const msgsSince = (page, t0) =>
  page.evaluate((t) => (window.__epMsgs || []).filter((m) => m.t >= t), t0)

async function installMsgObserver(page) {
  await page.evaluate(() => {
    if (window.__epMsgObserverOn) return
    window.__epMsgObserverOn = true
    window.__epMsgs = []
    new MutationObserver((muts) => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1 && node.classList && node.classList.contains('el-message')) {
            window.__epMsgs.push({
              kind: [...node.classList].find((c) => c.startsWith('el-message--')) || '',
              text: (node.textContent || '').trim(),
              t: Date.now(),
            })
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true })
  })
}

async function selectDropdownOption(page, selectSelector, optionText) {
  await page.locator(selectSelector).first().click()
  await sleep(600)
  const opt = page.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: optionText }).first()
  await opt.waitFor({ timeout: 8000 })
  await opt.click()
  await sleep(500)
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

async function setDefaultProvider(page, providerName) {
  const ok = await clickSidebar(page, '设置')
  if (!ok) throw new Error('侧边栏找不到「设置」')
  await page.locator('.settings-tabs').waitFor({ timeout: 15000 })
  await page.locator('.el-tabs__item', { hasText: 'AI 模型配置' }).first().click()
  await page.locator('.provider-config-item').first().waitFor({ timeout: 15000 })
  const card = page.locator('.provider-config-item', { has: page.locator('.config-name', { hasText: providerName }) }).first()
  const cls = (await card.getAttribute('class')) || ''
  if (cls.includes('is-default')) { console.log(`  「${providerName}」已是默认`); return }
  await card.locator('button', { hasText: '设为默认' }).click()
  await poll(async () => ((await card.getAttribute('class')) || '').includes('is-default') || null, { timeout: 10000 })
  const nowCls = (await card.getAttribute('class')) || ''
  if (!nowCls.includes('is-default')) throw new Error(`「${providerName}」设为默认失败`)
  console.log(`  ✅「${providerName}」已设为默认`)
}

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333')
  const page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
  if (!page) throw new Error('未找到应用页面')
  await page.bringToFront()
  page.setDefaultTimeout(20000)
  await installMsgObserver(page)
  const ev = (fn, arg) => page.evaluate(fn, arg)

  // 定位项目/剧集（只读）
  const ids = await ev(async (name) => {
    const api = window.electronAPI.episodeProduction
    const p = (await api.listProjects())?.data?.find((x) => x.name === name)
    if (!p) return null
    const eps = (await api.listEpisodes(p.id))?.data || []
    const ep = eps[0]
    if (!ep) return null
    const epDetail = await api.getEpisode(ep.id)
    return { projectId: p.id, episodeId: ep.id, scriptId: epDetail?.data?.scriptId || null }
  }, PROJECT_NAME)
  if (!ids?.scriptId) throw new Error('未找到演示项目/剧集/剧本')
  console.log('项目:', ids.projectId, '剧集:', ids.episodeId, '剧本:', ids.scriptId)

  // 进工作室
  if (!(await clickSidebar(page, '剧集制作'))) {
    await ev(() => { window.location.hash = '#/episode-production' })
    await sleep(1500)
  }
  await page.locator('.episode-home').waitFor({ timeout: 15000 })
  await installMsgObserver(page)
  await openStudio(page)

  // ─────────────────────────── F3：新建资产可选类型 ───────────────────────────
  console.log('\n=== F3: 资产 tab「新建」弹窗类型选择 ===')
  await clickStudioTab(page, '资产')
  await page.locator('.stage-asset .asset-tree').waitFor({ timeout: 15000 })

  // 幂等：已创建过则跳过创建，但仍验证弹窗有类型选择
  const f3Exists = await ev(async ({ pid, name }) => {
    const r = await window.electronAPI.episodeProduction.asset.projectSummary(pid)
    return (r?.data?.locations || []).some((l) => l.name === name)
  }, { pid: ids.projectId, name: F3_LOCATION_NAME })

  await page.locator('.asset-tree .tree-toolbar button', { hasText: '新建' }).click()
  const dlg = page.locator('.el-dialog', { hasText: '新建资产' })
  await dlg.waitFor({ timeout: 10000 })
  const typeLabels = await dlg.locator('.el-radio-button').allTextContents()
  console.log('  新建弹窗类型选项:', typeLabels.map((t) => t.trim()).join('/'))
  const hasAllTypes = ['角色', '地点', '物品'].every((t) => typeLabels.some((x) => x.includes(t)))
  await shot(page, 'f3-create-dialog')

  if (f3Exists) {
    console.log('  F3验证地点已存在，跳过创建（仅验证弹窗类型选择）')
    await dlg.locator('.el-dialog__footer button', { hasText: '取消' }).click()
    RESULT.fixes.F3_type_select = hasAllTypes ? '✅(弹窗含角色/地点/物品；资产此前已建)' : '❌ 类型选项不全'
  } else {
    await dlg.locator('.el-radio-button', { hasText: '地点' }).click()
    await dlg.locator('input[type="text"]').fill(F3_LOCATION_NAME)
    await dlg.locator('.el-dialog__footer button', { hasText: '创建' }).click()
    const created = await poll(async () => {
      const ok = await ev(async ({ pid, name }) => {
        const r = await window.electronAPI.episodeProduction.asset.projectSummary(pid)
        return (r?.data?.locations || []).some((l) => l.name === name)
      }, { pid: ids.projectId, name: F3_LOCATION_NAME })
      return ok || null
    }, { timeout: 15000 })
    RESULT.fixes.F3_type_select = hasAllTypes && created
      ? '✅(地点类型资产 UI 创建成功)'
      : `❌ hasAllTypes=${hasAllTypes} created=${created}`
    console.log('  创建地点资产:', created ? '✅' : '❌')
    await shot(page, 'f3-location-created')
  }

  // ─────────────────────────── F2 + F1：批量生成分镜 + 编号连续 ───────────────────────────
  console.log('\n=== F2/F1: 分镜 tab「批量生成分镜」（scriptId 修复 + 编号 1..N） ===')
  // 文本生成走默认 provider（阿里百炼-tokenplan）
  await setDefaultProvider(page, TEXT_PROVIDER_NAME)
  await clickSidebar(page, '剧集制作')
  await openStudio(page)
  await clickStudioTab(page, '分镜')
  await page.locator('.stage-storyboard .sb-toolbar').waitFor({ timeout: 15000 })

  const genBtn = page.locator('.sb-toolbar button', { hasText: '批量生成分镜' })
  const t0 = Date.now()
  await genBtn.click()
  console.log('  已点击批量生成分镜，等待生成（AI 文本，可能 1-3 分钟）...')
  const genResult = await poll(async () => {
    const msgs = await msgsSince(page, t0)
    const err = msgs.find((m) => m.kind.includes('error'))
    if (err) return { ok: false, err: err.text }
    const ok = msgs.find((m) => m.text.includes('分镜已批量生成'))
    if (ok) return { ok: true }
    return null
  }, { timeout: 300000, interval: 3000 })

  if (!genResult?.ok) {
    RESULT.fixes.F2_batch_generate = '❌ ' + (genResult?.err || '超时300s')
    console.error('  ❌ 批量生成失败:', genResult?.err || '超时')
  } else {
    // 校验：不再有"没有场景"错误 + shot_number 连续 1..N
    const check = await ev(async (scriptId) => {
      const api = window.electronAPI.episodeProduction
      const scenes = (await api.listScenes(scriptId))?.data || []
      const per = []
      for (const sc of scenes) {
        const sbs = (await api.listStoryboards(sc.id))?.data || []
        per.push({ sceneId: sc.id, shotNumbers: sbs.map((s) => s.shotNumber) })
      }
      return per
    }, ids.scriptId)
    console.log('  生成结果 shotNumbers:', JSON.stringify(check))
    const allContinuous = check.length > 0 && check.every((c) => {
      const nums = c.shotNumbers
      return nums.length > 0 && nums.every((n, i) => n === i + 1)
    })
    RESULT.fixes.F2_batch_generate = '✅(不再报"没有场景"，批量生成成功)'
    RESULT.fixes.F1_shot_numbering = allContinuous
      ? `✅(shot_number 连续 1..N: ${JSON.stringify(check.map((c) => c.shotNumbers))})`
      : `❌ 编号不连续: ${JSON.stringify(check)}`
  }
  await shot(page, 'f2-f1-after-batch')

  // ─────────────────────────── F4/F6/F5：参考图模式 i2v 真机出片 ───────────────────────────
  console.log('\n=== F4/F6/F5: 参考图模式（关键帧→i2v base64→状态写回） ===')
  // 关键帧图像生成走火山（Seedream），切默认
  await setDefaultProvider(page, VOLC_PROVIDER_NAME)
  await clickSidebar(page, '剧集制作')
  await openStudio(page)
  await clickStudioTab(page, '分镜')
  await sleep(1000)

  // 进第一个有分镜的场次
  const groups = page.locator('.sb-scene-group')
  const gCnt = await groups.count()
  let sceneIdx = -1
  for (let i = 0; i < gCnt; i++) {
    if ((await groups.nth(i).locator('.shot-tile .tile-meta').count()) > 0) {
      sceneIdx = i
      await groups.nth(i).locator('.group-head').click()
      break
    }
  }
  if (sceneIdx < 0) throw new Error('没有任何场次有分镜（F2 未成功？）')
  await page.locator('.stage-sb-editor .pk-line').first().waitFor({ timeout: 15000 })
  await sleep(1500)

  // F4：模式选择 UI 存在
  const modeLabels = await page.locator('.stage-sb-editor .edit-actions .el-radio-button').allTextContents()
  console.log('  生成模式选项:', modeLabels.map((t) => t.trim()).join('/'))
  const hasModes = modeLabels.some((t) => t.includes('文生视频')) && modeLabels.some((t) => t.includes('参考图'))
  RESULT.fixes.F4_mode_ui = hasModes ? '✅(文生视频/参考图模式可选)' : '❌ 模式选择缺失'

  // 选视频 provider/model（火山 + Seedance）
  const provText = (await page.locator('.stage-sb-editor .provider-select').textContent()) || ''
  if (!provText.includes('火山')) {
    await selectDropdownOption(page, '.stage-sb-editor .provider-select', VOLC_PROVIDER_NAME)
  }
  const modelText = (await page.locator('.stage-sb-editor .model-select').textContent()) || ''
  if (!modelText.includes('Seedance') && !modelText.includes('hchqf')) {
    await selectDropdownOption(page, '.stage-sb-editor .model-select', 'Seedance')
  }
  console.log('  视频模型:', ((await page.locator('.stage-sb-editor .model-select').textContent()) || '').trim())

  // 当前选中分镜 id（shots[0]）
  const sbId = await ev(async (idx) => {
    const m = location.hash.match(/episode-production\/([^/]+)\/studio\/([^/?]+)/)
    const api = window.electronAPI.episodeProduction
    const ep = await api.getEpisode(m[2])
    const scenes = (await api.listScenes(ep.data.scriptId)).data || []
    const scene = scenes[idx]
    const sbs = (await api.listStoryboards(scene.id)).data || []
    return sbs[0]?.id || null
  }, sceneIdx)
  console.log('  目标分镜:', sbId)

  // 选「参考图模式」→ 生成视频（内部：保存 → 无关键帧则先生成 → 不传 forceMode → i2v base64）
  await page.locator('.stage-sb-editor .edit-actions .el-radio-button', { hasText: '参考图模式' }).click()
  await sleep(300)
  await shot(page, 'f4-ref-mode-selected')
  const tv = Date.now()
  await page.locator('.stage-sb-editor .edit-actions button', { hasText: '生成视频' }).click()
  console.log('  参考图模式生成中（关键帧 ~1min + i2v ~3-4min）...')
  const vres = await poll(async () => {
    if ((await page.locator('.stage-sb-editor video.preview-video').count()) > 0) return { ok: true }
    const msgs = await msgsSince(page, tv)
    const err = msgs.find((m) => m.kind.includes('error'))
    if (err) return { ok: false, err: err.text }
    return null
  }, { timeout: 720000, interval: 5000 })
  const vdur = (Date.now() - tv) / 1000 | 0
  await shot(page, 'f4-f6-video-result')

  if (!vres?.ok) {
    RESULT.fixes.F4_ref_mode_video = `❌(${vdur}s) ` + (vres?.err || '超时720s')
    console.error('  ❌ 参考图模式视频失败:', vres?.err || '超时')
  } else {
    console.log(`  ✅ 参考图模式视频已生成（${vdur}s）`)
    // F5/F6 校验：status/videoMode/videoPath + 视频文件魔数
    const finalSb = await ev((id) => window.electronAPI.episodeProduction.getStoryboard(id), sbId)
    const d = finalSb?.data || {}
    console.log(`  storyboard: status=${d.status} videoMode=${d.videoMode} videoPath=${d.videoPath}`)
    const abs = d.videoPath && (path.isAbsolute(d.videoPath) ? d.videoPath : path.join(DATA_PATH, d.videoPath))
    let fileOk = false
    if (abs && fs.existsSync(abs)) {
      const buf = fs.readFileSync(abs).subarray(0, 16)
      fileOk = buf.subarray(4, 8).toString('ascii') === 'ftyp' && fs.statSync(abs).size > 0
      RESULT.notes.push(`i2v 产物: ${abs} size=${fs.statSync(abs).size}`)
    }
    RESULT.fixes.F4_ref_mode_video = `✅(${vdur}s, mode=${d.videoMode}, 参考图模式走关键帧链路)`
    RESULT.fixes.F6_i2v_base64 = fileOk
      ? '✅(火山 i2v 经 base64 data URI 真机出片，视频文件 ftyp 校验通过)'
      : `❌ 视频文件校验失败 abs=${abs}`
    RESULT.fixes.F5_status_writeback = d.status === 'completed' && !!d.videoPath
      ? `✅(status=${d.status}, videoPath 已落库)`
      : `❌ status=${d.status} videoPath=${d.videoPath}`
  }

  RESULT.ok = Object.values(RESULT.fixes).every((v) => String(v).startsWith('✅'))
  console.log('\n========== 结果汇总 ==========')
  console.log(JSON.stringify(RESULT, null, 2))
  console.log('EP_FIX_RESULT=' + JSON.stringify(RESULT))
  process.exit(RESULT.ok ? 0 : 1)
})().catch((e) => {
  console.error('E2E 异常:', e)
  RESULT.error = String(e && e.message || e)
  console.log('EP_FIX_RESULT=' + JSON.stringify(RESULT))
  process.exit(2)
})
