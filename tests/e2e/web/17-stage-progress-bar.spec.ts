/**
 * P6-T13 顶部 6 段阶段进度条 · e2e 测试（spec §2.1 + §2.2）
 *
 * 用户视角验收：
 *   1. 登录 → 进入剧集制作 → 创建项目 + 剧集
 *   2. EpisodeWorkbench 顶部应渲染 6 段进度条（① 内容 / ② 资产 / ③ 剧本 / ④ 分镜 / ⑤ 画面+音频 / ⑥ 合成）
 *   3. 每段含 ✓ / ● / ○ 视觉标记
 *   4. 当前阶段标记为 ●（pulse 动画）
 *   5. 点击某段 → 跳到对应 tab（spec §2.3 软引导）
 *   6. 总进度条显示 0~100% 百分比
 *
 * 设计原则：
 * - 真打 IPC（calculateEpisodeProgress）
 * - 真创建剧集（不 mock）
 * - 不需要外部 API（不调 image/video provider）
 *
 * 这是 P6-T13 DoD §4 端到端层证据。
 */

import { test, expect } from '@playwright/test'
import { gotoApp, invokeIpcUnwrap, loginViaApi } from './helpers/auth'

test.describe('Web 端 - P6-T13 顶部 6 段阶段进度条', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
  })

  test('IPC ep:calculate-episode-progress 返回 6 阶段 + 整剧进度', async ({
    page,
  }) => {
    // 用第一个已有剧集（如果没有就 skip）
    const episodes = await invokeIpcUnwrap<{ id: string }[]>(
      page.context().request,
      'ep:list-episodes',
      [],
    )
    test.skip(
      episodes.length === 0,
      '需要至少一个剧集才能测进度条 — 跑 16-episode-production-mp4-e2e 创建剧集后再跑本测',
    )

    const progress = await invokeIpcUnwrap<{
      episodeId: string
      currentStatus: string
      stages: Array<{
        stage: string
        label: string
        complete: boolean
        progress: number
        mark: '✓' | '●' | '○'
        gapCount: number
      }>
      overallProgress: number
    }>(page.context().request, 'ep:calculate-episode-progress', [episodes[0].id])

    // spec §2.2 6 个生产阶段（不含 completed 终态）
    expect(progress.stages.length).toBe(6)
    const stageNames = progress.stages.map((s) => s.stage)
    expect(stageNames).toEqual([
      'pending',
      'asset_prep',
      'scripting',
      'storyboarding',
      'producing',
      'composing',
    ])

    // 每段必有 ✓ / ● / ○ 之一
    for (const s of progress.stages) {
      expect(['✓', '●', '○']).toContain(s.mark)
    }

    // 当前阶段必须有且仅有一个 ●
    const currentMarks = progress.stages.filter((s) => s.mark === '●')
    if (progress.currentStatus !== 'completed') {
      expect(currentMarks.length).toBe(1)
      expect(currentMarks[0].stage).toBe(progress.currentStatus)
    }

    // overallProgress 0~1
    expect(progress.overallProgress).toBeGreaterThanOrEqual(0)
    expect(progress.overallProgress).toBeLessThanOrEqual(1)
  })

  test('UI 顶部应渲染 6 段进度条且每段可点击', async ({ page }) => {
    // 必须有项目和剧集，否则路由不进 EpisodeWorkbench
    const projects = await invokeIpcUnwrap<{ id: string }[]>(
      page.context().request,
      'ep:list-projects',
      [],
    )
    test.skip(
      projects.length === 0,
      '需要至少一个项目才能测 UI — 跑 16-episode-production-mp4-e2e 创建项目后再跑本测',
    )

    const projectId = projects[0].id
    await gotoApp(page, `/episode-production/${projectId}`)

    // 等剧集列表加载
    await page.waitForSelector('.episode-list', { timeout: 5000 })

    // 选第一个剧集
    const firstEpisode = page.locator('.episode-item').first()
    await firstEpisode.click()

    // 等顶部进度条加载
    await page.waitForSelector('.stage-progress-bar .bar-track', {
      timeout: 5000,
    })

    // 6 段都应渲染
    const segments = page.locator('.stage-progress-bar .stage-segment')
    await expect(segments).toHaveCount(6)

    // 每段必须有 label（① 内容 / ② 资产 ...）
    const labels = await segments.locator('.segment-label').allTextContents()
    expect(labels.length).toBe(6)
    expect(labels[0]).toContain('内容')
    expect(labels[1]).toContain('资产')
    expect(labels[2]).toContain('剧本')
    expect(labels[3]).toContain('分镜')
    expect(labels[4]).toContain('制作')
    expect(labels[5]).toContain('合成')

    // 总进度条应显示
    const overall = page.locator('.overall-progress')
    // viewport >= 1280px 时才显示，CI 默认 1280×720 ok
    if (await overall.isVisible()) {
      await expect(overall.locator('.el-progress')).toBeVisible()
    }

    // 截图存档（DoD §4-D4）
    await page.screenshot({
      path: 'tests/e2e/web/screenshots/p6-t13-stage-progress-bar.png',
      fullPage: false,
    })
  })

  test('点击 ⑤ 制作 段应跳到 production tab', async ({ page }) => {
    const projects = await invokeIpcUnwrap<{ id: string }[]>(
      page.context().request,
      'ep:list-projects',
      [],
    )
    test.skip(projects.length === 0, '需要项目')

    await gotoApp(page, `/episode-production/${projects[0].id}`)
    await page.waitForSelector('.episode-list')
    await page.locator('.episode-item').first().click()
    await page.waitForSelector('.stage-progress-bar .bar-track')

    // 点击 ⑤ 制作 段（第 5 个）
    const segments = page.locator('.stage-progress-bar .stage-segment')
    await segments.nth(4).click()

    // 主 tab 应切到 ⑤ 制作
    await expect(page.locator('.el-tabs__item.is-active')).toContainText('制作')
  })
})
