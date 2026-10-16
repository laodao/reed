/**
 * Web 端 E2E - 人像设计
 */

import { test, expect } from '@playwright/test'
import { gotoApp, invokeIpcUnwrap, loginViaApi } from './helpers/auth'

test.describe('Web 端 - 人像设计', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await gotoApp(page, '/portrait')
  })

  test('页面应正常加载', async ({ page }) => {
    await expect(page.locator('main').first()).toBeVisible()
    await expect(page).toHaveTitle(/人像设计/)
  })

  test('IPC portrait:list-projects 返回项目分页结构', async ({ page }) => {
    // handler 返回 { success, data: { projects, total } }
    const data = await invokeIpcUnwrap<{ projects: unknown[]; total: number }>(
      page.context().request,
      'portrait:list-projects',
    )
    expect(Array.isArray(data?.projects)).toBe(true)
    expect(typeof data?.total).toBe('number')
  })
})
