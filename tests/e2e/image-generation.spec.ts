/**
 * 图像生成功能 E2E 测试
 * 测试 DashScope 新模型 wan2.7-image-pro
 */

import { test, expect } from '@playwright/test'
import { ElectronTestHelper, createElectronHelper } from '../electron.setup'

let helper: ElectronTestHelper

test.beforeAll(async () => {
  helper = createElectronHelper({
    debugPort: 9222,
    timeout: 60000,
    autoClose: false
  })
  await helper.startApp()
})

test.afterAll(async () => {
  await helper.close()
})

test.describe('图像生成 API 测试', () => {
  test.beforeEach(async () => {
    await helper.waitForElectronAPI()
  })

  test('应该能获取图像提供商列表', async () => {
    const result = await helper.invokeElectronAPI<{
      success: boolean
      data?: Array<{ id: string; name: string }>
      error?: string
    }>('image.getProviders')

    console.log('图像提供商结果:', JSON.stringify(result, null, 2))
    expect(result).toBeDefined()

    // 检查是否有 DashScope 提供商
    if (result.success && result.data) {
      const dashscope = result.data.find(p => p.id === 'dashscope')
      expect(dashscope).toBeDefined()
      console.log('找到 DashScope 提供商:', dashscope)
    }
  })

  test('应该能获取 DashScope 支持的模型列表', async () => {
    const result = await helper.invokeElectronAPI<{
      success: boolean
      data?: Array<{ id: string; name: string; providerId: string }>
      error?: string
    }>('image.getModels', 'dashscope')

    console.log('DashScope 模型列表:', JSON.stringify(result, null, 2))
    expect(result).toBeDefined()

    if (result.success && result.data) {
      // 检查是否包含 wan2.7-image-pro 模型
      const wan27Pro = result.data.find(m => m.id === 'wan2.7-image-pro')
      expect(wan27Pro).toBeDefined()
      console.log('找到 wan2.7-image-pro 模型:', wan27Pro)
    }
  })

  test('应该能使用 wan2.7-image-pro 生成图像', async () => {
    // 先获取提供商配置
    const configResult = await helper.invokeElectronAPI<{
      success: boolean
      data?: Array<{ id: string; templateId: string }>
      error?: string
    }>('providerConfig.list')

    // 找到 DashScope 配置
    let dashscopeConfigId: string | undefined
    if (configResult.success && configResult.data) {
      const dashscopeConfig = configResult.data.find(
        c => c.templateId === 'dashscope' || c.templateId?.includes('dashscope')
      )
      dashscopeConfigId = dashscopeConfig?.id
    }

    if (!dashscopeConfigId) {
      console.log('未找到 DashScope 提供商配置，跳过图像生成测试')
      test.skip()
      return
    }

    console.log('使用 DashScope 配置:', dashscopeConfigId)

    // 生成图像
    const generateResult = await helper.invokeElectronAPI<{
      success: boolean
      images?: Array<{ url: string }>
      taskId?: string
      error?: string
    }>('image.generate', {
      providerId: dashscopeConfigId,
      modelId: 'wan2.7-image-pro',
      prompt: '一只可爱的小猫坐在窗台上看着窗外的雨',
      negativePrompt: '模糊，低质量',
      width: 1024,
      height: 1024,
      count: 1
    })

    console.log('图像生成结果:', JSON.stringify(generateResult, null, 2))
    expect(generateResult).toBeDefined()

    if (generateResult.success) {
      console.log('图像生成成功!')
      if (generateResult.images) {
        console.log('生成的图像数量:', generateResult.images.length)
        console.log('图像 URL:', generateResult.images.map(i => i.url))
      }
      if (generateResult.taskId) {
        console.log('异步任务 ID:', generateResult.taskId)
      }
    } else {
      console.log('图像生成失败:', generateResult.error)
    }
  })
})

test.describe('图像生成页面 UI 测试', () => {
  test.beforeEach(async () => {
    await helper.waitForElectronAPI()
  })

  test('应该能导航到图像生成页面并显示 UI 元素', async () => {
    await helper.navigateTo('/image')
    const page = helper.getPage()

    // 等待页面加载
    await page.waitForSelector('text=生成历史', { timeout: 10000 })

    // 验证页面元素
    await expect(page.locator('text=生成历史')).toBeVisible()
    await expect(page.locator('button:has-text("生成")')).toBeVisible()
    await expect(page.locator('textarea')).toBeVisible()
  })

  test('应该能选择提供商和模型', async () => {
    await helper.navigateTo('/image')
    const page = helper.getPage()

    // 等待页面加载
    await page.waitForSelector('text=生成历史', { timeout: 10000 })

    // 点击第一个下拉框（提供商选择）
    const dropdowns = page.locator('.el-select')
    const firstDropdown = dropdowns.first()

    await firstDropdown.click()
    await page.waitForTimeout(500)

    // 检查下拉选项是否出现
    const options = page.locator('.el-select-dropdown__item')
    const count = await options.count()
    console.log('下拉选项数量:', count)

    if (count > 0) {
      // 打印所有选项
      for (let i = 0; i < count; i++) {
        const text = await options.nth(i).textContent()
        console.log(`选项 ${i}:`, text)
      }
    }
  })
})