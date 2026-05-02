/**
 * Web 端 E2E - 知识库
 */

import { test, expect } from '@playwright/test'
import { gotoApp, invokeIpcUnwrap, loginViaApi } from './helpers/auth'

test.describe('Web 端 - 知识库', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await gotoApp(page, '/knowledge-base')
  })

  test('页面应正常加载', async ({ page }) => {
    await expect(page.locator('main').first()).toBeVisible()
    await expect(page).toHaveTitle(/知识库/)
  })

  test('IPC knowledge-base:list 返回知识库数组', async ({ page }) => {
    const data = await invokeIpcUnwrap<unknown[]>(
      page.context().request,
      'knowledge-base:list',
    )
    expect(Array.isArray(data)).toBe(true)
  })
})
