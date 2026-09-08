/**
 * Web 端 E2E - 故事研讨室（v2.1 M3 smoke）
 * 房间通道契约：state/history/初始默认值；页面路由可加载。
 */

import { test, expect } from '@playwright/test'
import { gotoApp, invokeIpcUnwrap, loginViaApi } from './helpers/auth'

test.describe('Web 端 - 故事研讨室', () => {
  test('room 通道可用：创建项目 → state → history → 页面加载 → 清理', async ({ page }) => {
    await loginViaApi(page)
    const request = page.context().request

    // 建项目（story）
    const created = await invokeIpcUnwrap<{ id: string }>(request, 'longwriting:createProject', [
      { name: `e2e-研讨室-${Date.now()}`, type: 'story' },
    ])
    expect(created?.id).toBeTruthy()
    const projectId = created.id
    expect(projectId).toContain('lw_')

    // 房间状态：初始默认值
    const state = await invokeIpcUnwrap<{ phase: string; turnNo: number; ledger: unknown[]; contentTarget: string }>(
      request,
      'longwriting:room:state',
      [projectId],
    )
    expect(state.phase).toBe('story-core')
    expect(state.turnNo).toBe(0)
    expect(state.contentTarget).toBe('novel')
    expect(Array.isArray(state.ledger)).toBe(true)

    // 历史：空消息 + 状态
    const history = await invokeIpcUnwrap<{ messages: unknown[]; state: { phase: string } }>(
      request,
      'longwriting:room:history',
      [projectId],
    )
    expect(Array.isArray(history.messages)).toBe(true)
    expect(history.state.phase).toBe('story-core')

    // 页面路由可加载（欢迎态）
    await gotoApp(page, `/longwriting/room/${projectId}`)
    await expect(page.locator('main').first()).toBeVisible()

    // 清理
    const del = await invokeIpcUnwrap<boolean>(request, 'longwriting:deleteProject', [projectId])
    expect(del).toBeTruthy()
  })

  test('卡片采纳闭环（UI 主链路）：种子概要卡 → 采纳 → 圣经落库', async ({ page }) => {
    await loginViaApi(page)
    const request = page.context().request

    const created = await invokeIpcUnwrap<{ id: string }>(request, 'longwriting:createProject', [
      { name: `e2e-采纳闭环-${Date.now()}`, type: 'story' },
    ])
    const projectId = created.id

    // 种子：房间状态预置一张 pending 概要卡（绕过 LLM——提炼逻辑由单测覆盖）
    const card = {
      id: 'card_e2e_1', kind: 'overview', title: '概要卡 · 洗冤录',
      data: { title: '洗冤录', summary: '被冤逐出的弟子洗冤复仇', coreConflict: '个人与宗门', estimatedChapters: 100 },
      status: 'pending', sourceTurns: [1], createdAt: Date.now(),
    }
    await invokeIpcUnwrap(request, 'longwriting:updateProject', [
      projectId,
      {
        wizardState: {
          room: {
            ledger: [], summary: '', summarizedTurn: 0, turnNo: 1,
            phase: 'story-core', contentTarget: 'novel', pendingCards: [card], cardSeq: 1,
          },
        },
      },
    ])

    // UI：进入研讨室，卡片渲染 + 采纳
    await gotoApp(page, `/longwriting/room/${projectId}`)
    await page.locator('.artifact', { hasText: '概要卡 · 洗冤录' }).waitFor({ timeout: 10_000 })
    await page.locator('.artifact .el-button', { hasText: '采纳入库' }).first().click()

    // 落库断言：概要入库
    const overview = await invokeIpcUnwrap<{ title: string }>(request, 'longwriting:getStoryOverview', [projectId])
    expect(overview?.title).toBe('洗冤录')

    // 卡片转 adopted（重新拉 state）
    const state = await invokeIpcUnwrap<{ pendingCards: Array<{ id: string; status: string }> }>(
      request, 'longwriting:room:state', [projectId],
    )
    expect(state.pendingCards.find((c) => c.id === 'card_e2e_1')?.status).toBe('adopted')

    await invokeIpcUnwrap(request, 'longwriting:deleteProject', [projectId])
  })
})
