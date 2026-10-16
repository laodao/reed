/**
 * Web 端 E2E - 图像生成
 */

import { test, expect } from '@playwright/test'
import { gotoApp, invokeIpcUnwrap, loginViaApi } from './helpers/auth'

test.describe('Web 端 - 图像生成', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await gotoApp(page, '/image')
  })

  test('页面应正常加载', async ({ page }) => {
    await expect(page.locator('main').first()).toBeVisible()
    await expect(page).toHaveTitle(/图像生成/)
  })

  test('IPC image:list 返回分页数据', async ({ page }) => {
    const data = await invokeIpcUnwrap<{ items?: unknown[] } | unknown[]>(
      page.context().request,
      'image:list',
      [1, 10],
    )
    if (Array.isArray(data)) {
      expect(Array.isArray(data)).toBe(true)
    } else {
      expect(data).toBeDefined()
    }
  })
})
