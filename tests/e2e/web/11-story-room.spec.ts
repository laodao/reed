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
})
