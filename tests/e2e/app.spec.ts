/**
 * Electron 应用 E2E 测试示例
 */

import { test, expect } from '@playwright/test'
import { ElectronTestHelper, createElectronHelper } from '../electron.setup'

let helper: ElectronTestHelper

test.beforeAll(async () => {
  helper = createElectronHelper({
    debugPort: 9222,
    timeout: 60000,
    autoClose: false // 不自动关闭，便于调试
  })
  await helper.startApp()
})

test.afterAll(async () => {
  await helper.close()
})

test.describe('Electron 应用基础测试', () => {
  test('应用应成功启动并显示标题', async () => {
    const page = helper.getPage()
    const title = await page.title()
    expect(title).toContain('The Bot')
  })

  test('electronAPI 应该可用', async () => {
    await helper.waitForElectronAPI()
    const ready = await helper.isElectronAPIReady()
    expect(ready).toBe(true)
  })
})

test.describe('设置功能测试', () => {
  test('应该能获取设置', async () => {
    await helper.waitForElectronAPI()
    const settings = await helper.invokeElectronAPI('settings.get')
    expect(settings).toBeDefined()
  })
})

test.describe('提供商配置测试', () => {
  test('应该能获取提供商配置列表', async () => {
    await helper.waitForElectronAPI()
    const configs = await helper.invokeElectronAPI<{ id: string; name: string }[]>('providerConfig.list')
    expect(Array.isArray(configs)).toBe(true)
    console.log('提供商配置数量:', configs?.length || 0)
  })

  test('应该能获取提供商模板列表', async () => {
    await helper.waitForElectronAPI()
    const templates = await helper.invokeElectronAPI<{ id: string; name: string }[]>('providerTemplate.list')
    expect(Array.isArray(templates)).toBe(true)
    console.log('提供商模板数量:', templates?.length || 0)
  })
})

test.describe('图像生成测试', () => {
  test('应该能获取图像提供商列表', async () => {
    await helper.waitForElectronAPI()
    const result = await helper.invokeElectronAPI<{ success: boolean; data?: unknown; error?: string }>('image.getProviders')
    expect(result).toBeDefined()
    console.log('图像提供商结果:', JSON.stringify(result, null, 2))
  })

  test('应该能获取图像列表', async () => {
    await helper.waitForElectronAPI()
    const result = await helper.invokeElectronAPI<{ success: boolean; data?: unknown; error?: string }>('image.list', 1, 10)
    expect(result).toBeDefined()
    console.log('图像列表结果:', JSON.stringify(result, null, 2))
  })
})

test.describe('页面导航测试', () => {
  test('应该能导航到图像生成页面', async () => {
    await helper.navigateTo('/image')
    const page = helper.getPage()

    // 等待页面加载
    await page.waitForSelector('text=生成历史', { timeout: 10000 })

    // 验证页面元素
    await expect(page.locator('text=生成历史')).toBeVisible()
  })

  test('应该能导航到剧集制作页面', async () => {
    await helper.navigateTo('/episode-production')
    const page = helper.getPage()

    // 等待页面加载
    await page.waitForSelector('text=剧集制作', { timeout: 10000 })

    // 验证页面元素
    await expect(page.locator('h1:has-text("剧集制作")')).toBeVisible()
  })
})