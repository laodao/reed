/**
 * Web 端 E2E - 首页与侧边栏导航
 */

import { test, expect } from '@playwright/test'
import { gotoApp, loginViaApi, WEB_FRONT_BASE } from './helpers/auth'

const SIDEBAR_ITEMS = [
  { name: '首页', hash: '/' },
  { name: 'AI 对话', hash: '/chat' },
  { name: '图像生成', hash: '/image' },
  { name: '人像设计', hash: '/portrait' },
  { name: '长文写作', hash: '/longwriting' },
  { name: '剧集制作', hash: '/episode-production' },
  { name: '文档翻译', hash: '/translate' },
  { name: '语音助手', hash: '/voice' },
  { name: '知识库', hash: '/knowledge-base' },
  { name: '日记', hash: '/diary' },
  { name: '设置', hash: '/settings' },
] as const

test.describe('Web 端 - 首页 / 侧边栏', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
  })

  test('首页应显示欢迎语和功能卡片', async ({ page }) => {
    await page.goto(WEB_FRONT_BASE)
    await expect(page.getByRole('heading', { name: '欢迎使用 The Bot' })).toBeVisible({
      timeout: 15_000,
    })
    // 至少几个核心功能卡片
    await expect(page.getByRole('heading', { name: 'AI 对话', level: 3 })).toBeVisible()
    await expect(page.getByRole('heading', { name: '图像生成', level: 3 })).toBeVisible()
    await expect(page.getByRole('heading', { name: '文档翻译', level: 3 })).toBeVisible()
  })

  test('侧边栏应包含全部菜单项', async ({ page }) => {
    await gotoApp(page, '/')
    for (const item of SIDEBAR_ITEMS) {
      await expect(page.getByText(item.name, { exact: true }).first()).toBeVisible()
    }
  })

  for (const item of SIDEBAR_ITEMS) {
    test(`点击侧边栏「${item.name}」应跳转到 ${item.hash}`, async ({ page }) => {
      await gotoApp(page, '/')
      await page.getByText(item.name, { exact: true }).first().click()
      await expect(page).toHaveURL(new RegExp(`#${item.hash.replace(/\//g, '\\/')}$`))
      // 主区域可见，没有空白崩溃页
      await expect(page.locator('main').first()).toBeVisible()
    })
  }
})
