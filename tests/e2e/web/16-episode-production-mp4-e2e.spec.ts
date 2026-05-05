/**
 * Web 端 E2E - 整剧 MP4 端到端制作（P7-T2）
 * @module tests/e2e/web/16-episode-production-mp4-e2e
 * @description 走完 ① 内容 → ② 资产 → ③ 剧本 → ④ 分镜 → ⑤ 制作 → ⑥ 合成 全流程，
 *              拿到真实可播放的 MP4。
 *
 *              测试源数据：docs/superpowers/test-fixtures/2026-05-05-tea-house-encounter.md
 *              "江湖传 · 茶馆相遇" 1500 字 mock 故事
 *
 * 默认 .skip 跳过 — 因为：
 *   1. 真实 AI provider 调用（image / video / TTS），需 API key + 配额
 *   2. 视频生成异步轮询 30-90 秒/分镜，整流程 5-15 分钟
 *   3. 不适合 CI 自动跑，仅供手动验证 / 本地实测
 *
 * 启用方式：把 test.describe.skip 改 test.describe，并确保：
 *   - PostgreSQL `the_bot_test` 已有 test@local.dev 账号
 *   - 已配置一个 ready 的 video provider（含 type=video model）
 *   - 已配置一个 ready 的 image provider（含 type=image model）
 *   - 已配置一个 ready 的 TTS provider
 *
 * 跑：
 *   PGDATABASE=the_bot_test npx playwright test tests/e2e/web/16-episode-production-mp4-e2e.spec.ts --headed
 */

import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { loginViaUI, WEB_FRONT_BASE } from './helpers/auth'

/** 测试长文路径 */
const TEST_FIXTURE_PATH = path.resolve(
  __dirname,
  '../../../docs/superpowers/test-fixtures/2026-05-05-tea-house-encounter.md',
)

/** 项目级超时：单个分镜视频生成 + 关键帧 + 整剧合成可能很慢 */
const LONG_TIMEOUT = 15 * 60 * 1000 // 15 分钟整剧

test.describe.skip('Web 端 E2E - 整剧 MP4 端到端制作（P7-T2）', () => {
  test.setTimeout(LONG_TIMEOUT)

  test('从登录到导出 MP4 全流程', async ({ page }) => {
    // ═══════════════════════════════════════
    // Step 0：登录
    // ═══════════════════════════════════════
    await loginViaUI(page)
    await expect(page).toHaveURL(new RegExp(`${WEB_FRONT_BASE}/#/.*`))

    // ═══════════════════════════════════════
    // Step 1：进入剧集制作模块 → 创建项目 + 剧集
    // ═══════════════════════════════════════
    // 从主菜单/侧栏进入剧集制作
    await page.getByRole('link', { name: /剧集制作|episode/i }).click().catch(() => {})

    // 创建项目
    await page.getByRole('button', { name: /新建项目|创建项目/ }).click()
    await page.getByRole('textbox', { name: /项目名/ }).fill('e2e-茶馆相遇')
    await page.getByRole('button', { name: /确定|创建/, exact: true }).click()

    // 创建剧集（source_type='uploaded'）
    await page.getByRole('button', { name: /新建剧集|添加剧集/ }).click()
    // 选 uploaded 模式
    await page.getByText(/上传长文|uploaded/i).click()

    // 上传测试长文
    const longText = fs.readFileSync(TEST_FIXTURE_PATH, 'utf8')
    // 截取"长文正文"段（## 长文正文 之后的部分）
    const bodyStart = longText.indexOf('## 长文正文')
    const body = longText.slice(bodyStart)
    await page.getByRole('textbox', { name: /长文内容|正文/ }).fill(body)
    await page.getByRole('button', { name: /保存|确定/ }).click()

    // ═══════════════════════════════════════
    // Step 2：① 内容 - AI 识别要素
    // ═══════════════════════════════════════
    await page.getByRole('button', { name: /识别要素|AI 识别/ }).click()
    await expect(page.getByText(/老者|少年/)).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: /确认要素/ }).click()

    // ═══════════════════════════════════════
    // Step 3：② 资产 - 创建 binding + 生成主图
    // ═══════════════════════════════════════
    await page.getByRole('tab', { name: /② 资产|asset-v2/ }).click()
    // 对每个要素点"创建资产"+"生成主图"
    // 注：UI 选择器需根据 AssetStageView 的实际实现调整
    const assetCards = page.locator('.asset-card, [data-test="asset-card"]')
    const count = await assetCards.count()
    for (let i = 0; i < count; i++) {
      const card = assetCards.nth(i)
      const createBtn = card.getByRole('button', { name: /创建|生成主图/ }).first()
      if (await createBtn.isVisible()) await createBtn.click()
      // 等主图生成（约 30 秒）
      await expect(card.locator('img')).toBeVisible({ timeout: 90_000 })
    }

    // ═══════════════════════════════════════
    // Step 4：③ 剧本 - AI 生成剧本 + 完整性校验
    // ═══════════════════════════════════════
    await page.getByRole('tab', { name: /剧本|script/ }).click()
    await page.getByRole('button', { name: /AI 生成剧本|生成完整剧本/ }).click()
    await expect(page.getByText(/场景 1|sceneNumber/)).toBeVisible({ timeout: 90_000 })

    // ScriptCompletenessPanel 应显示绿色"全部就绪"
    await page.getByRole('button', { name: /校验完整性|重新校验/ }).click()
    await expect(
      page.getByText(/全部就绪|0 项必须处理/),
    ).toBeVisible({ timeout: 30_000 })

    // ═══════════════════════════════════════
    // Step 5：④ 分镜 - AI 拆分镜
    // ═══════════════════════════════════════
    // 进入第一个场景，生成分镜
    await page.locator('.scene-nav-item').first().click()
    await page.getByRole('button', { name: /生成分镜/ }).click()
    await expect(page.getByText(/镜头 1|shot/)).toBeVisible({ timeout: 90_000 })

    // ═══════════════════════════════════════
    // Step 6：⑤ 制作 - 关键帧 + 视频片段
    // ═══════════════════════════════════════
    await page.getByRole('tab', { name: /⑤ 制作|production/ }).click()
    // 选第一个分镜
    await page.locator('.storyboard-pill').first().click()
    // 生成关键帧
    await page.getByRole('button', { name: /生成关键帧/ }).click()
    await expect(
      page.locator('.keyframe-cell img').first(),
    ).toBeVisible({ timeout: 5 * 60_000 }) // 多帧约 90s × 3

    // 生成视频片段
    await page.getByRole('button', { name: /生成视频片段/ }).click()
    await expect(
      page.getByText(/已生成视频|videoPath/),
    ).toBeVisible({ timeout: 5 * 60_000 })

    // ═══════════════════════════════════════
    // Step 7：⑥ 合成 - 导出 MP4
    // ═══════════════════════════════════════
    await page.getByRole('tab', { name: /⑥ 合成|compose/ }).click()
    await page.getByRole('button', { name: /导出 MP4/ }).click()
    // ExportDialog 时间线概要 + outputPath 留空（自动落 user data）
    await page.getByRole('button', { name: /开始导出/ }).click()
    await expect(page.getByText(/导出成功/)).toBeVisible({
      timeout: 5 * 60_000,
    })

    // 提取输出路径并断言文件存在
    const pathLocator = page.locator('.result-path')
    const outputPath = await pathLocator.textContent()
    expect(outputPath?.trim()).toBeTruthy()
    if (outputPath?.trim()) {
      expect(fs.existsSync(outputPath.trim())).toBe(true)
      const stat = fs.statSync(outputPath.trim())
      expect(stat.size).toBeGreaterThan(1024) // 至少 > 1KB（avoid 空文件）
    }
  })
})
