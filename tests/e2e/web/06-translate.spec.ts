/**
 * Web 端 E2E - 文档翻译
 */

import { test, expect } from '@playwright/test'
import { gotoApp, invokeIpcUnwrap, loginViaApi } from './helpers/auth'

test.describe('Web 端 - 文档翻译', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await gotoApp(page, '/translate')
  })

  test('页面应正常加载，主区域可见', async ({ page }) => {
    await expect(page.locator('main').first()).toBeVisible()
    await expect(page).toHaveTitle(/文档翻译/)
  })

  test('IPC translation:providers 返回提供商列表', async ({ page }) => {
    const data = await invokeIpcUnwrap<unknown[]>(
      page.context().request,
      'translation:providers',
    )
    expect(Array.isArray(data)).toBe(true)
  })

  test('IPC translation:history 返回历史记录分页结构', async ({ page }) => {
    // handler 返回 { success, data: { list, total } }，invokeIpcUnwrap 解到 data
    const data = await invokeIpcUnwrap<{ list: unknown[]; total: number }>(
      page.context().request,
      'translation:history',
      [{ page: 1, pageSize: 10 }],
    )
    expect(Array.isArray(data?.list)).toBe(true)
    expect(typeof data?.total).toBe('number')
  })
})
