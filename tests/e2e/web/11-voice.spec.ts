/**
 * Web 端 E2E - 语音助手
 */

import { test, expect } from '@playwright/test'
import { gotoApp, invokeIpcUnwrap, loginViaApi } from './helpers/auth'

test.describe('Web 端 - 语音助手', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await gotoApp(page, '/voice')
  })

  test('页面应正常加载', async ({ page }) => {
    await expect(page.locator('main').first()).toBeVisible()
    await expect(page).toHaveTitle(/语音助手/)
  })

  test('IPC voice:providers 返回提供商列表', async ({ page }) => {
    const data = await invokeIpcUnwrap<unknown[]>(
      page.context().request,
      'voice:providers',
    )
    expect(Array.isArray(data)).toBe(true)
  })

  test('IPC voice:history 可调用', async ({ page }) => {
    const data = await invokeIpcUnwrap<unknown>(
      page.context().request,
      'voice:history',
      [{ page: 1, pageSize: 10 }],
    )
    expect(data).toBeDefined()
  })
})
