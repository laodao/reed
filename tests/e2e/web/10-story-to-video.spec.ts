/**
 * Web 端 E2E - 剧集制作
 */

import { test, expect } from '@playwright/test'
import { gotoApp, invokeIpcUnwrap, loginViaApi } from './helpers/auth'

test.describe('Web 端 - 剧集制作', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await gotoApp(page, '/story-to-video')
  })

  test('页面应正常加载', async ({ page }) => {
    await expect(page.locator('main').first()).toBeVisible()
    await expect(page).toHaveTitle(/剧集制作/)
  })

  test('IPC stv:list-projects 返回项目数组', async ({ page }) => {
    const data = await invokeIpcUnwrap<unknown[]>(
      page.context().request,
      'stv:list-projects',
    )
    expect(Array.isArray(data)).toBe(true)
  })
})
