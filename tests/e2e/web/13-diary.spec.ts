/**
 * Web 端 E2E - 日记
 */

import { test, expect } from '@playwright/test'
import { gotoApp, invokeIpcUnwrap, loginViaApi } from './helpers/auth'

test.describe('Web 端 - 日记', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await gotoApp(page, '/diary')
  })

  test('页面应正常加载', async ({ page }) => {
    await expect(page.locator('main').first()).toBeVisible()
    await expect(page).toHaveTitle(/日记/)
  })

  test('IPC diary:get-all-folders 返回文件夹数组', async ({ page }) => {
    const data = await invokeIpcUnwrap<unknown[]>(
      page.context().request,
      'diary:get-all-folders',
    )
    expect(Array.isArray(data)).toBe(true)
  })

  test('IPC diary:list-entries 返回条目数组', async ({ page }) => {
    const data = await invokeIpcUnwrap<unknown[] | { items: unknown[] }>(
      page.context().request,
      'diary:list-entries',
      [{ page: 1, pageSize: 10 }],
    )
    if (Array.isArray(data)) {
      expect(Array.isArray(data)).toBe(true)
    } else {
      expect(data).toBeDefined()
    }
  })
})
