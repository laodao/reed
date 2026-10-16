/**
 * Web 端 E2E - TabBar 始终显示 + 持久化
 */

import { test, expect } from '@playwright/test'
import { loginViaApi, gotoApp, WEB_FRONT_BASE } from './helpers/auth'

test.describe('Web 端 - TabBar', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
  })

  test('登录后 TabBar 始终显示，初始仅「首页」一个 tab', async ({ page }) => {
    await page.goto(WEB_FRONT_BASE)
    await expect(page.getByText('AI 对话').first()).toBeVisible({ timeout: 15_000 })

    // .tab-bar 容器存在
    const tabBar = page.locator('.tab-bar')
    await expect(tabBar).toBeVisible()

    // 初始仅一个 tab，title 为「首页」
    const tabs = tabBar.locator('.tab-item')
    await expect(tabs).toHaveCount(1)
    await expect(tabs.first().locator('.tab-title')).toHaveText('首页')
  })

  test('点击侧边栏菜单后 tab 增加，刷新页面后 tab 仍在', async ({ page }) => {
    await page.goto(WEB_FRONT_BASE)
    await expect(page.getByText('AI 对话').first()).toBeVisible({ timeout: 15_000 })

    // 进 AI 对话
    await page.getByText('AI 对话', { exact: true }).first().click()
    const tabBar = page.locator('.tab-bar')
    const tabs = tabBar.locator('.tab-item')
    await expect(tabs).toHaveCount(2)
    await expect(tabs.nth(1).locator('.tab-title')).toHaveText('AI 对话')

    // 再进图像生成
    await page.getByText('图像生成', { exact: true }).first().click()
    await expect(tabs).toHaveCount(3)

    // 刷新页面
    await page.reload()
    await expect(page.getByText('AI 对话').first()).toBeVisible({ timeout: 15_000 })

    // tab 应仍是 3 个，且激活的是「图像生成」
    await expect(tabBar.locator('.tab-item')).toHaveCount(3)
    await expect(tabBar.locator('.tab-item.active .tab-title')).toHaveText('图像生成')
  })

  test('关闭 tab 后 sessionStorage 同步更新', async ({ page }) => {
    await gotoApp(page, '/chat')
    const tabBar = page.locator('.tab-bar')
    await expect(tabBar.locator('.tab-item')).toHaveCount(2)

    // 关闭 AI 对话 tab
    const chatTab = tabBar.locator('.tab-item', { hasText: 'AI 对话' })
    await chatTab.locator('.tab-close').click()

    // 刷新后只剩首页
    await page.reload()
    await expect(page.getByText('AI 对话').first()).toBeVisible({ timeout: 15_000 })
    await expect(tabBar.locator('.tab-item')).toHaveCount(1)
    await expect(tabBar.locator('.tab-item').first().locator('.tab-title')).toHaveText('首页')
  })
})
