/**
 * Web 端 E2E - 长文写作
 */

import { test, expect } from '@playwright/test'
import { gotoApp, invokeIpcUnwrap, loginViaApi } from './helpers/auth'

test.describe('Web 端 - 长文写作', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await gotoApp(page, '/longwriting')
  })

  test('页面应正常加载', async ({ page }) => {
    await expect(page.locator('main').first()).toBeVisible()
    await expect(page).toHaveTitle(/长文写作/)
  })

  test('IPC longwriting:getProjects 返回项目数组', async ({ page }) => {
    const data = await invokeIpcUnwrap<unknown[]>(
      page.context().request,
      'longwriting:getProjects',
    )
    expect(Array.isArray(data)).toBe(true)
  })

  test('Web 端 CSP 应允许 unsafe-eval（长文写作依赖 markdown / 模板渲染）', async ({
    page,
  }) => {
    // meta CSP 必须含 unsafe-eval / wasm-unsafe-eval（vite.config.web.ts 注入）
    const cspContent = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .first()
      .getAttribute('content')
    expect(cspContent, 'CSP meta 必须存在').toBeTruthy()
    expect(cspContent!).toContain("'unsafe-eval'")
    expect(cspContent!).toContain("'wasm-unsafe-eval'")
  })
})
