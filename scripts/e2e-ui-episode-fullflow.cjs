/**
 * E2E · UI 驱动的剧集制作全流程演示（playwright 真实点击，非 evaluate 调 IPC）
 *
 * 流程：
 *   1. UI：剧集制作首页 → 新建项目「演示-全流程」
 *   2. IPC 补一步：建第 1 集（降级原因见 DEGRADATIONS[0]——工作室资产页必须已有剧集才能进入，
 *      而 UI 建集入口（剧本创建页）会立刻连带 AI 剧本生成，无法"先资产后剧本"）
 *   3. UI：资产 tab → 新建角色「苏晚」（UI 新建按钮）；地点/物品用 IPC 补建
 *      （DEGRADATIONS[1]：资产树「新建」只按当前选中类型创建，空项目下无法选中地点/物品类型 —— 界面缺陷）
 *   4. UI：三个资产各填提示词 → 点「生成图片」→ 等主图（图像模型由后端 pickImageModel
 *      路由到火山引擎 pc_mtefri7z_gmou93g8m / ep-20260804233757-mpnsg —— 当前 enabled 排序下
 *      第一个含 image 模型的配置，无需改设置）
 *   5. UI：设置 → AI 模型配置 → 把「阿里百炼平台-tokenplan」设为默认
 *      （UI 剧本/分镜生成不传 provider，后端 getProviderConfig 回落 getDefault/getEnabled[0]，
 *      enabled[0] 是 embedding-only 配置会失败；设为默认后文本走 deepseek-v4-flash-0731）
 *   6. UI：剧本 tab →「生成剧本」（含自动拆场景；AI 文本偶发超时，重试 ≤3）
 *   7. UI：分镜 tab →「批量生成分镜」→ 进入场次分镜制作
 *   8. UI：提示词框用 @ 引用 苏晚/焦黑古书/旧书修复工作室 → 保存 → 选火山视频模型
 *      ep-20260511121109-hchqf →「生成视频」（UI 硬编码 text2video，界面缺陷见 DEFECTS）
 *   9. IPC 补一步（DEGRADATIONS[2]）：火山设为默认 → 生成 1 帧关键帧（吃 @ 引用参考图）
 *      → forceMode image2video 出参考图模式视频（工作室「生成视频」按钮硬编码 text2video，
 *      新工作室无关键帧 UI，参考图模式只能降级）
 *  10. 校验视频文件（存在 + ftyp magic），界面回看截图
 *
 * 产物全部保留，不做任何清理/删除。可断点续跑：每步先查已有产物，存在则跳过。
 * 前置：electron 应用已启动且 --remote-debugging-port=9333
 * 输出：EP_UI_RESULT=<json>
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const os = require('os')

const DATA_PATH = path.join(os.homedir(), '.config/the_bot')
const PC_TEXT = 'pc_mtee10tz_ijz2yq1ro' // 阿里百炼平台-tokenplan（deepseek-v4-flash-0731）
const PC_VOLC = 'pc_mtefri7z_gmou93g8m' // 火山引擎
const MODEL_VIDEO = 'ep-20260511121109-hchqf'
const TEXT_PROVIDER_NAME = '阿里百炼平台-tokenplan'
const VOLC_PROVIDER_NAME = '火山引擎'

const PROJECT_NAME = '演示-全流程'
const EPISODE_TITLE = '第1集 深夜古书'
const CHAR_NAME = '苏晚'
const ITEM_NAME = '焦黑古书'
const LOC_NAME = '旧书修复工作室'
const STORY = `深夜的旧书修复工作室里，苏晚独自伏案。台灯下，那本焦黑的古书突然无风自动，翻到一页空白。空白处缓缓浮现一行字："不要把它交给穿灰大衣的人。"窗外巷口，恰好立着一个穿灰大衣的身影。苏晚屏住呼吸，轻轻合上了书。`

const PROMPTS = {
  [CHAR_NAME]: '苏晚，26岁女性古籍修复师，齐肩黑发，细框眼镜，穿深灰色围裙工作服，气质安静专注，正面全身定妆照，纯色浅灰背景，写实风格',
  [ITEM_NAME]: '一本封面焦黑破损的古旧线装书，书脊磨损，书页泛黄卷边，静物特写，居中构图，干净浅色背景，写实质感',
  [LOC_NAME]: '深夜的旧书修复工作室内部，木质工作台与台灯暖光，四周满墙旧书架，窗外昏暗巷口，电影质感场景，写实风格，无人物',
}

const RESULT = { ok: false, steps: {}, degradations: [], defects: [], projectId: null, episodeId: null, storyboardId: null, images: {}, videos: {}, notes: [] }
const DEGRADE = (id, reason) => { RESULT.degradations.push({ id, reason }); console.log('⚠️  降级 IPC:', id, '—', reason) }
const DEFECT = (id, desc) => { RESULT.defects.push({ id, desc }); console.log('🐞 界面缺陷记录:', id, '—', desc) }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function shot(page, name) {
  try {
    await page.screenshot({ path: `/tmp/ep-ui-flow-${name}.png` })
    console.log(`  📸 /tmp/ep-ui-flow-${name}.png`)
  } catch (e) { console.warn('  截图失败:', e.message) }
}

/** 轮询直到 fn 返回真值；超时返回 null */
async function poll(fn, { timeout = 60000, interval = 1500 } = {}) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    try { const v = await fn(); if (v) return v } catch { /* ignore */ }
    await sleep(interval)
  }
  return null
}

/** 侧边栏是纯图标 + tooltip：逐个 hover 找目标标签再点 */
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
          await page.mouse.move(500, 350) // 移开收 tooltip
          await sleep(1200)
          return true
        }
      }
    } catch { /* 下一个 */ }
  }
  return false
}

/** 读 ElMessage 记录（由注入的 MutationObserver 收集） */
const msgsSince = (page, t0) =>
  page.evaluate((t) => (window.__epMsgs || []).filter((m) => m.t >= t), t0)

/** 注入 ElMessage 收集器（SPA 单页不刷新，只需注一次） */
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

/** el-select 按可见文本选选项 */
async function selectDropdownOption(page, selectSelector, optionText) {
  await page.locator(selectSelector).first().click()
  await sleep(600)
  const opt = page.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: optionText }).first()
  await opt.waitFor({ timeout: 8000 })
  await opt.click()
  await sleep(500)
}

/** 进工作室（首页点项目卡） */
async function openStudio(page) {
  const card = page.locator('.recent-projects .project-card', { hasText: PROJECT_NAME }).first()
  await card.waitFor({ timeout: 15000 })
  await card.click()
  await page.locator('.studio-toolbar').waitFor({ timeout: 20000 })
  await sleep(1000)
}

async function clickStudioTab(page, label) {
  await page.locator('.studio-toolbar .tab-btn', { hasText: label }).first().click()
  await sleep(1200)
}

/** 设置页把某 provider 设为默认（真实 UI 操作） */
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

  // ─────────────────────────── Step 1：进剧集制作 + 建项目（UI） ───────────────────────────
  console.log('\n=== Step 1: 打开剧集制作，创建项目「演示-全流程」(UI) ===')
  if (!(await clickSidebar(page, '剧集制作'))) {
    console.log('  侧边栏点击失败，退化为 hash 路由（非 IPC）')
    await ev(() => { window.location.hash = '#/episode-production' })
    await sleep(1500)
  }
  await page.locator('.episode-home').waitFor({ timeout: 15000 })
  await installMsgObserver(page)

  let projectId = await ev(async (name) => {
    const r = await window.electronAPI.episodeProduction.listProjects()
    const p = (r?.data || []).find((x) => x.name === name)
    return p ? p.id : null
  }, PROJECT_NAME)

  if (projectId) {
    console.log('  项目已存在，复用:', projectId)
  } else {
    await page.locator('.recent-projects .add-btn').click()
    const dlg = page.locator('.el-dialog', { hasText: '新建剧集项目' })
    await dlg.waitFor({ timeout: 10000 })
    await dlg.locator('.el-form-item', { hasText: '项目名称' }).locator('input').fill(PROJECT_NAME)
    await shot(page, '01-new-project-dialog')
    await dlg.locator('.el-dialog__footer button', { hasText: '创建' }).click()
    const created = await poll(async () => {
      const id = await ev(async (name) => {
        const r = await window.electronAPI.episodeProduction.listProjects()
        const p = (r?.data || []).find((x) => x.name === name)
        return p ? p.id : null
      }, PROJECT_NAME)
      return id
    }, { timeout: 15000 })
    if (!created) throw new Error('项目创建失败（列表未出现新项目）')
    projectId = created
    console.log('  ✅ 项目已创建:', projectId)
  }
  RESULT.projectId = projectId
  RESULT.steps['1_create_project'] = '✅'
  await shot(page, '02-project-created')

  // ─────────────────────────── Step 2：建第 1 集（IPC 降级） ───────────────────────────
  console.log('\n=== Step 2: 创建第 1 集 ===')
  let episodeId = await ev(async (pid) => {
    const r = await window.electronAPI.episodeProduction.listEpisodes(pid)
    return r?.data?.[0]?.id || null
  }, projectId)
  if (episodeId) {
    console.log('  剧集已存在，复用:', episodeId)
  } else {
    DEGRADE('create-episode', '工作室资产/剧本/分镜各 tab 都必须已有剧集才能进入；而 UI 唯一建集入口（剧本创建页）建集会立刻连带 AI 剧本生成，无法满足"先做资产、后出剧本"的演示顺序')
    const ep = await ev(({ pid, title, story }) => window.electronAPI.episodeProduction.createEpisode(pid, {
      sourceType: 'uploaded', uploadedContent: story, episodeNumber: 1, title,
      storyEra: '现代都市', storyRegion: '中国城市',
    }).catch((e) => ({ success: false, error: String(e && e.message || e) })), { pid: projectId, title: EPISODE_TITLE, story: STORY })
    if (!ep.success) throw new Error('建集失败: ' + JSON.stringify(ep.error))
    episodeId = ep.data.id
    console.log('  ✅ 剧集已创建:', episodeId)
  }
  RESULT.episodeId = episodeId
  RESULT.steps['2_create_episode'] = '✅(IPC)'

  // ─────────────────────────── Step 3：进工作室资产 tab，建资产 ───────────────────────────
  console.log('\n=== Step 3: 工作室 → 资产 tab → 创建角色/物品/场景资产 ===')
  await openStudio(page)
  await clickStudioTab(page, '资产')
  await page.locator('.asset-tree').waitFor({ timeout: 15000 })

  const hasAsset = (name) => ev(async ({ pid, name }) => {
    const r = await window.electronAPI.episodeProduction.asset.projectSummary(pid)
    if (!r?.success) return null
    for (const kind of ['characters', 'locations', 'items']) {
      const hit = (r.data[kind] || []).find((a) => a.name === name)
      if (hit) return { kind, id: hit.bindingId || hit.id, hasMain: !!hit.hasMain }
    }
    return null
  }, { pid: projectId, name })

  // 角色：UI 新建（新建按钮按当前选中类型创建，默认 character ✓）
  let charAsset = await hasAsset(CHAR_NAME)
  if (!charAsset) {
    await page.locator('.asset-tree .tree-toolbar button', { hasText: '新建' }).click()
    const box = page.locator('.el-message-box')
    await box.waitFor({ timeout: 8000 })
    await box.locator('input').fill(CHAR_NAME)
    await box.locator('button', { hasText: '创建' }).click()
    charAsset = await poll(() => hasAsset(CHAR_NAME), { timeout: 10000 })
    if (!charAsset) throw new Error('UI 新建角色失败')
    console.log('  ✅ 角色资产「苏晚」已通过 UI 创建:', charAsset.id)
  } else console.log('  角色资产已存在，复用')

  // 地点/物品：UI 新建按钮只会按当前选中类型创建（空项目选不中地点/物品）→ IPC 补建
  for (const [kind, name, api] of [['location', LOC_NAME, 'location'], ['item', ITEM_NAME, 'item']]) {
    let a = await hasAsset(name)
    if (!a) {
      DEGRADE(`create-${kind}-asset`, `资产树「新建」按钮只按当前选中类型创建（StageAssetView.onCreate 用 selected.kind，默认 character）；空项目下树里没有地点/物品可选中，UI 无法创建第一个${kind === 'location' ? '地点' : '物品'}资产`)
      const r = await ev(({ pid, name, api }) => window.electronAPI.episodeProduction.asset[api].createStandalone({ projectId: pid, name })
        .catch((e) => ({ success: false, error: String(e && e.message || e) })), { pid: projectId, name, api })
      if (!r?.success) throw new Error(`创建${name}失败: ` + JSON.stringify(r?.error))
      console.log(`  ✅ ${name} 已创建(IPC):`, r.data.id)
    } else console.log(`  ${name} 已存在，复用`)
  }
  RESULT.steps['3_create_assets'] = '✅(角色UI, 地点/物品IPC)'
  DEFECT('asset-create-kind', '工作室资产 tab 的「新建」按钮只能创建"当前选中类型"的资产（默认角色）；项目还没有地点/物品时无法通过 UI 创建第一个地点/物品资产，缺少类型选择')

  // 刷新资产树（切走再切回）
  await clickStudioTab(page, '剧本')
  await clickStudioTab(page, '资产')
  await page.locator('.asset-tree .tree-item', { hasText: CHAR_NAME }).first().waitFor({ timeout: 10000 })
  await shot(page, '03-assets-created')

  // ─────────────────────────── Step 4：UI 生成三张主图（火山 Seedream） ───────────────────────────
  console.log('\n=== Step 4: 逐资产填提示词 → 点「生成图片」(UI，约30-60s/张) ===')
  for (const name of [CHAR_NAME, ITEM_NAME, LOC_NAME]) {
    const info = await hasAsset(name)
    if (!info) throw new Error(`资产 ${name} 不存在`)
    if (info.hasMain) { console.log(`  ${name} 已有主图，跳过`); RESULT.images[name] = '已存在(跳过)'; continue }

    await page.locator('.asset-tree .tree-item', { hasText: name }).first().click()
    await page.locator('.asset-gallery .preview-bottom textarea').waitFor({ timeout: 10000 })
    await sleep(800)
    await page.locator('.asset-gallery .preview-bottom textarea').fill(PROMPTS[name])
    await sleep(300)

    let okImg = false
    for (let attempt = 1; attempt <= 3 && !okImg; attempt++) {
      const t0 = Date.now()
      await page.locator('.asset-gallery .preview-bottom button.el-button--primary').first().click()
      console.log(`  ${name}: 第${attempt}次生成中...`)
      const r = await poll(async () => {
        if ((await page.locator('.asset-gallery .preview-area img').count()) > 0) return { ok: true }
        const msgs = await msgsSince(page, t0)
        const err = msgs.find((m) => m.kind.includes('error'))
        if (err) return { ok: false, err: err.text }
        // 生成覆盖层消失且无图 → 失败
        const overlay = await page.locator('.asset-gallery .preview-area .gen-overlay').count()
        if (!overlay && Date.now() - t0 > 40000) return { ok: false, err: '生成结束但无图片' }
        return null
      }, { timeout: 180000, interval: 2500 })
      if (r?.ok) {
        okImg = true
        console.log(`  ✅ ${name} 主图已生成（${(Date.now() - t0) / 1000 | 0}s）`)
      } else {
        console.warn(`  ❌ ${name} 第${attempt}次失败:`, r?.err || '超时180s')
      }
    }
    RESULT.images[name] = okImg ? '✅' : '❌'
    if (!okImg) throw new Error(`${name} 主图生成 3 次均失败`)
    await shot(page, `04-image-${name === CHAR_NAME ? 'character' : name === ITEM_NAME ? 'item' : 'location'}`)
  }
  RESULT.steps['4_asset_images'] = '✅'

  // ─────────────────────────── Step 5：设置默认文本 provider（UI） ───────────────────────────
  console.log('\n=== Step 5: 设置 → 把「阿里百炼平台-tokenplan」设为默认(UI) ===')
  RESULT.notes.push('UI 剧本/分镜生成不传 provider，后端回落 getDefault()/getEnabled()[0]；enabled[0] 是 embedding-only 配置必失败，故先把百炼 tokenplan 设为默认（图像生成已完成，不受影响）')
  await setDefaultProvider(page, TEXT_PROVIDER_NAME)
  RESULT.steps['5_set_text_provider'] = '✅'
  await shot(page, '05-settings-default-text')

  // ─────────────────────────── Step 6：剧本 tab 生成剧本（UI + 重试） ───────────────────────────
  console.log('\n=== Step 6: 剧本 tab →「生成剧本」(UI，AI 文本重试≤3) ===')
  const hasScript = () => ev(async (eid) => {
    const ep = await window.electronAPI.episodeProduction.getEpisode(eid)
    return !!ep?.data?.scriptId
  }, episodeId)

  // 无论是否已有剧本，先回到工作室剧本 tab（Step 5 停留在设置页）
  await clickSidebar(page, '剧集制作')
  await openStudio(page) // 默认剧本 tab
  if (await hasScript()) {
    console.log('  剧本已存在，跳过')
  } else {
    await page.locator('.script-empty button', { hasText: '生成剧本' }).waitFor({ timeout: 15000 })
    let okScript = false
    for (let attempt = 1; attempt <= 3 && !okScript; attempt++) {
      const t0 = Date.now()
      await page.locator('.script-empty button', { hasText: '生成剧本' }).click()
      console.log(`  第${attempt}次生成剧本...（AI 文本，可能1-3分钟）`)
      const r = await poll(async () => {
        if (await hasScript()) return { ok: true }
        const msgs = await msgsSince(page, t0)
        const err = msgs.find((m) => m.kind.includes('error'))
        if (err) return { ok: false, err: err.text }
        // 空态按钮 loading 结束但仍无剧本 → 失败
        const loading = await page.locator('.script-empty button.is-loading').count()
        if (!loading && Date.now() - t0 > 30000) return { ok: false, err: '生成结束但无剧本' }
        return null
      }, { timeout: 360000, interval: 3000 })
      if (r?.ok) { okScript = true; console.log(`  ✅ 剧本已生成（${(Date.now() - t0) / 1000 | 0}s）`) }
      else console.warn(`  ❌ 第${attempt}次失败:`, r?.err || '超时360s')
    }
    if (!okScript) throw new Error('剧本生成 3 次均失败（AI 网关持续超时？）')
  }
  RESULT.steps['6_script'] = '✅'
  await shot(page, '06-script-generated')

  // ─────────────────────────── Step 7：分镜 tab 批量生成分镜（UI + 重试） ───────────────────────────
  console.log('\n=== Step 7: 分镜 tab →「批量生成分镜」(UI，重试≤3) ===')
  const shotCount = () => page.locator('.stage-storyboard .shot-tile .tile-meta').count()
  await clickStudioTab(page, '分镜')
  await page.locator('.stage-storyboard').waitFor({ timeout: 15000 })
  await sleep(1500)

  if ((await shotCount()) > 0) {
    console.log('  已有分镜，跳过批量生成')
  } else {
    let okSb = false
    // 先走 UI 试一次（验证按钮链路）
    {
      const t0 = Date.now()
      await page.locator('.stage-storyboard .sb-toolbar button', { hasText: '批量生成分镜' }).click()
      console.log('  UI「批量生成分镜」第1次...')
      const r = await poll(async () => {
        if ((await shotCount()) > 0) return { ok: true }
        const msgs = await msgsSince(page, t0)
        const err = msgs.find((m) => m.kind.includes('error'))
        if (err) return { ok: false, err: err.text }
        const loading = await page.locator('.stage-storyboard .sb-toolbar button.is-loading').count()
        if (!loading && Date.now() - t0 > 30000) return { ok: false, err: '生成结束但无分镜' }
        return null
      }, { timeout: 300000, interval: 4000 })
      if (r?.ok) { okSb = true; console.log(`  ✅ 分镜已生成（${(Date.now() - t0) / 1000 | 0}s）`) }
      else console.warn('  ❌ UI 批量生成分镜失败:', r?.err || '超时300s')
    }
    if (!okSb) {
      DEFECT('storyboard-gen-wrong-scriptid', '分镜列表页「批量生成分镜」把 episode.id 当 scriptId 传给 ep:generate-storyboards —— StageStoryboardView.load() 把 script.value 赋成 getEpisode 的剧集对象（script.value = ep.data），onGenerateAll 又用 script.value.id；后端按 episodeScriptId=episodeId 查场景必然为空，报"没有场景，请先生成场景"，UI 按钮永远失败')
      DEGRADE('generate-storyboards', '上述 UI 缺陷导致「批量生成分镜」必失败，改用 IPC 传正确 scriptId（getEpisode().scriptId）批量生成')
      const scriptId = await ev(async (eid) => {
        const ep = await window.electronAPI.episodeProduction.getEpisode(eid)
        return ep?.data?.scriptId || null
      }, episodeId)
      for (let attempt = 1; attempt <= 3 && !okSb; attempt++) {
        console.log(`  IPC 批量生成分镜第${attempt}次（scriptId=${scriptId}）...`)
        const r = await ev(({ sid, pc, m }) => window.electronAPI.episodeProduction.generateStoryboards(sid, pc, m)
          .catch((e) => ({ success: false, error: String(e && e.message || e) })), { sid: scriptId, pc: PC_TEXT, m: 'deepseek-v4-flash-0731' })
        if (r?.success) {
          // 切 tab 刷新列表
          await clickStudioTab(page, '剧本')
          await clickStudioTab(page, '分镜')
          await sleep(1500)
          if ((await shotCount()) > 0) { okSb = true; console.log('  ✅ 分镜已生成(IPC)') }
        } else {
          console.warn('  ❌ IPC 分镜失败:', JSON.stringify(r?.error).slice(0, 200))
        }
      }
    }
    if (!okSb) throw new Error('分镜生成失败（UI×1 + IPC×3）')
  }
  RESULT.steps['7_storyboards'] = '✅'
  await shot(page, '07-storyboards')

  // ─────────────────────────── Step 8：分镜制作 → @引用资产 → 生成视频（UI） ───────────────────────────
  console.log('\n=== Step 8: 进入分镜制作 → @引用资产 → 生成视频(UI) ===')
  // 选第一个有分镜的场次进入
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
  if (sceneIdx < 0) throw new Error('没有任何场次有分镜')
  console.log('  进入场次 index=', sceneIdx)
  await page.locator('.stage-sb-editor .pk-line').first().waitFor({ timeout: 15000 })
  await sleep(1500)

  // 视频 provider / 模型（默认应已是火山 + ep-20260511121109-hchqf，校验并显式选择）
  const provText = (await page.locator('.stage-sb-editor .provider-select').textContent()) || ''
  if (!provText.includes('火山')) {
    await selectDropdownOption(page, '.stage-sb-editor .provider-select', VOLC_PROVIDER_NAME)
  }
  const modelText = (await page.locator('.stage-sb-editor .model-select').textContent()) || ''
  if (!modelText.includes('Seedance') && !modelText.includes('hchqf')) {
    await selectDropdownOption(page, '.stage-sb-editor .model-select', 'Seedance')
  }
  console.log('  视频模型:', ((await page.locator('.stage-sb-editor .model-select').textContent()) || '').trim())

  // 拿到当前镜头 1 对应的分镜 id（只读查询，用于后续校验/参考图模式）
  const sbInfo = await ev(async (idx) => {
    const hash = location.hash
    const m = hash.match(/episode-production\/([^/]+)\/studio\/([^/?]+)/)
    const api = window.electronAPI.episodeProduction
    const ep = await api.getEpisode(m[2])
    const scenes = (await api.listScenes(ep.data.scriptId)).data || []
    const scene = scenes[idx]
    const sbs = (await api.listStoryboards(scene.id)).data || []
    return { sceneId: scene.id, storyboardId: sbs[0]?.id, frameDescription: sbs[0]?.frameDescription || '' }
  }, sceneIdx)
  RESULT.storyboardId = sbInfo.storyboardId
  console.log('  分镜 id:', sbInfo.storyboardId)

  // @ 引用三个资产到当前选中镜头（列表第一个 .pk-line，即编辑器默认选中的 shots[0]）的提示词
  const firstLineNo = await page.locator('.stage-sb-editor .pk-line').first().getAttribute('data-no')
  const lineSel = `.pk-line[data-no="${firstLineNo}"]`
  console.log('  目标镜头行 data-no =', firstLineNo)
  const existingRefs = await page.locator(`${lineSel} .pk-token.entity`).count()
  if (existingRefs >= 3) {
    console.log('  镜头已有 ≥3 个资产引用，跳过插入')
  } else {
    for (const name of [CHAR_NAME, ITEM_NAME, LOC_NAME]) {
      const desc = page.locator(`${lineSel} .pk-desc`)
      // 点击描述框右下角（多行折行时也能把光标落到行尾），再按 End 兜底
      const box = await desc.boundingBox()
      if (box) {
        await page.mouse.click(box.x + box.width - 4, box.y + box.height - 4)
      } else {
        await desc.click()
      }
      await page.keyboard.press('End')
      await page.keyboard.type('@', { delay: 120 })
      const item = page.locator('.rich-popup .popup-item .pi-name', { hasText: name }).first()
      await item.waitFor({ timeout: 8000 })
      await item.click()
      await sleep(500)
      const refs = await page.locator(`${lineSel} .pk-token.entity`).count()
      console.log(`  @引用 ${name} → 当前镜头引用数=${refs}`)
    }
  }
  await shot(page, '08-prompt-asset-refs')

  // 保存（保存按钮变 disabled 即成功）
  const saveBtn = page.locator('.stage-sb-editor .edit-actions button', { hasText: '保存' })
  if (await saveBtn.isEnabled()) {
    await saveBtn.click()
    await poll(async () => (!(await saveBtn.isEnabled())) || null, { timeout: 15000 })
  }
  const savedDesc = await ev(async (id) => {
    const r = await window.electronAPI.episodeProduction.getStoryboard(id)
    return r?.data?.frameDescription || ''
  }, sbInfo.storyboardId)
  const refHits = [CHAR_NAME, ITEM_NAME, LOC_NAME].filter((n) => savedDesc.includes(`@[${n}`))
  console.log('  保存后 frameDescription 引用命中:', refHits.join(',') || '无', '| 长度', savedDesc.length)
  RESULT.notes.push(`分镜提示词引用资产: ${refHits.join(',')}`)

  // UI 生成视频（工作室编辑器硬编码 forceMode=text2video —— 记录缺陷）
  DEFECT('studio-video-text2video-only', '工作室分镜制作页「生成视频」按钮硬编码 forceMode=text2video（StageStoryboardEditor.onGenerate），提示词里的 @ 资产引用不会作为参考图喂给视频模型；图生视频/参考图模式在新工作室 UI 没有入口（关键帧面板只在旧版制作页）')
  let uiVideoOk = false
  for (let attempt = 1; attempt <= 2 && !uiVideoOk; attempt++) {
    const t0 = Date.now()
    await page.locator('.stage-sb-editor .edit-actions button', { hasText: '生成视频' }).click()
    console.log(`  UI 生成视频第${attempt}次（火山 Seedance，可能3-4分钟）...`)
    const r = await poll(async () => {
      if ((await page.locator('.stage-sb-editor video.preview-video').count()) > 0) return { ok: true }
      const msgs = await msgsSince(page, t0)
      const err = msgs.find((m) => m.kind.includes('error'))
      if (err) return { ok: false, err: err.text }
      const overlay = await page.locator('.stage-sb-editor .preview-area .gen-overlay').count()
      if (!overlay && Date.now() - t0 > 60000) return { ok: false, err: '生成结束但无视频' }
      return null
    }, { timeout: 720000, interval: 5000 })
    if (r?.ok) { uiVideoOk = true; console.log(`  ✅ UI 视频已生成（${(Date.now() - t0) / 1000 | 0}s）`) }
    else console.warn(`  ❌ UI 视频第${attempt}次失败:`, r?.err || '超时720s')
  }
  RESULT.videos.ui_text2video = uiVideoOk ? '✅' : '❌'
  await shot(page, '09-video-ui')

  // ─────────────────────────── Step 9：参考图模式视频（IPC 降级） ───────────────────────────
  console.log('\n=== Step 9: 参考图模式（关键帧吃@引用 → 图生视频）===')
  DEGRADE('reference-mode-video', '新工作室 UI 无关键帧面板且「生成视频」硬编码 text2video，参考图/图生视频模式无 UI 入口；此处 IPC 补：火山设为默认(关键帧生图走 Seedream) → 生成1帧关键帧（@引用图作参考） → image2video')
  DEFECT('volc-i2v-upload-chain', '火山 i2v 本地图片上传链路疑似断裂：uploadViaTempPolicy 成功时返回 file://<fileId>，随后被 generateVideo 以"Files API 的 File ID 不被视频任务接口接受"拒绝；失败时回落 OSS，而本机未配置 OSS 图床 —— i2v 大概率无法出片（实测见运行结果）')
  await setDefaultProvider(page, VOLC_PROVIDER_NAME)
  await shot(page, '10-settings-default-volc')

  // 关键帧（只在还没有关键帧时生成，1 帧即可）
  const kfList = await ev((id) => window.electronAPI.episodeProduction.listKeyframes(id).catch(() => null), sbInfo.storyboardId)
  const kfWithImage = (kfList?.data || []).filter((k) => k.imagePath || k.imageAssetId)
  if (kfWithImage.length > 0) {
    console.log('  已有关键帧，跳过生成')
  } else {
    console.log('  生成 1 帧关键帧（参考图=资产主图，约30-60s）...')
    const kf = await ev((id) => window.electronAPI.episodeProduction.generateKeyframes(id, undefined, 1)
      .catch((e) => ({ success: false, error: String(e && e.message || e) })), sbInfo.storyboardId)
    if (!kf?.success) {
      console.error('  ❌ 关键帧生成失败:', JSON.stringify(kf?.error).slice(0, 300))
      RESULT.videos.keyframe = '❌'
    } else {
      console.log('  ✅ 关键帧已生成')
      RESULT.videos.keyframe = '✅'
    }
  }

  // image2video
  console.log('  图生视频（image2video，首帧=关键帧，5s，可能3-4分钟）...')
  const tv = Date.now()
  const i2v = await ev(({ id, pc, m }) => window.electronAPI.episodeProduction.generateVideoSegment(id, {
    providerConfigId: pc, modelId: m, durationSec: 5, forceMode: 'image2video',
  }).catch((e) => ({ success: false, error: String(e && e.message || e) })), { id: sbInfo.storyboardId, pc: PC_VOLC, m: MODEL_VIDEO })
  const i2vDur = (Date.now() - tv) / 1000 | 0
  if (!i2v?.success) {
    console.error(`  ❌ 图生视频失败(${i2vDur}s):`, JSON.stringify(i2v?.error).slice(0, 400))
    RESULT.videos.image2video = '❌ ' + String(i2v?.error).slice(0, 200)
  } else {
    console.log(`  ✅ 图生视频完成(${i2vDur}s)`)
    RESULT.videos.image2video = '✅'
  }

  // ─────────────────────────── Step 10：校验产物 + 界面回看 ───────────────────────────
  console.log('\n=== Step 10: 校验视频文件 + 界面回看 ===')
  const finalSb = await ev((id) => window.electronAPI.episodeProduction.getStoryboard(id), sbInfo.storyboardId)
  const vpath = finalSb?.data?.videoPath
  const abs = vpath && (path.isAbsolute(vpath) ? vpath : path.join(DATA_PATH, vpath))
  let videoFileOk = false
  if (abs && fs.existsSync(abs)) {
    const size = fs.statSync(abs).size
    const buf = fs.readFileSync(abs).subarray(0, 16)
    const magic = buf.subarray(4, 8).toString('ascii') === 'ftyp'
    videoFileOk = size > 0 && magic
    console.log(`  视频文件: ${abs} size=${size} ftyp=${magic}`)
    RESULT.videos.finalVideoPath = abs
    RESULT.videos.finalVideoSize = size
    RESULT.videos.finalVideoMode = finalSb.data.videoMode
  } else {
    console.error('  ❌ 视频文件不存在:', abs)
  }

  // 界面回看：切回工作室分镜制作，视频应能播放（videoPath 已是最新 i2v 结果）
  await clickSidebar(page, '剧集制作')
  await openStudio(page)
  await clickStudioTab(page, '分镜')
  await sleep(1500)
  const groups2 = page.locator('.sb-scene-group')
  if ((await groups2.count()) > sceneIdx) {
    await groups2.nth(sceneIdx).locator('.group-head').click()
    await sleep(2500)
  }
  const hasVideoEl = (await page.locator('.stage-sb-editor video.preview-video').count()) > 0
  console.log('  工作室分镜制作页视频播放元素:', hasVideoEl ? '✅ 可见' : '❌ 未见')
  await shot(page, '11-final-studio-video')
  await clickStudioTab(page, '资产')
  await sleep(1500)
  await shot(page, '12-final-assets')

  RESULT.steps['8_ui_video'] = RESULT.videos.ui_text2video
  RESULT.steps['9_reference_video'] = RESULT.videos.image2video || '❌'
  RESULT.steps['10_verify'] = videoFileOk ? '✅' : '❌'
  RESULT.ok = videoFileOk

  console.log('\n========== 结果汇总 ==========')
  console.log(JSON.stringify(RESULT, null, 2))
  console.log('EP_UI_RESULT=' + JSON.stringify(RESULT))
  process.exit(videoFileOk ? 0 : 1)
})().catch((e) => {
  console.error('\n脚本中断:', e.message)
  RESULT.error = e.message
  console.log('EP_UI_RESULT=' + JSON.stringify(RESULT))
  process.exit(1)
})
