/**
 * Web 端 E2E - 设置页 / 提供商配置
 */

import { test, expect } from '@playwright/test'
import { gotoApp, invokeIpcUnwrap, loginViaApi, WEB_API_BASE } from './helpers/auth'

test.describe('Web 端 - 设置页', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await gotoApp(page, '/settings')
  })

  test('应显示外观/AI模型配置/数据路径/搜索引擎/图床/关于 6 个 tab', async ({ page }) => {
    const tabs = ['外观设置', 'AI 模型配置', '数据路径', '搜索引擎', '图床设置', '关于']
    for (const tab of tabs) {
      await expect(page.getByRole('tab', { name: tab })).toBeVisible()
    }
  })

  test('AI 模型配置 tab 应展示 DeepSeek 与 阿里百炼平台', async ({ page }) => {
    await page.getByRole('tab', { name: 'AI 模型配置' }).click()
    await expect(page.getByRole('heading', { name: '提供商配置' })).toBeVisible()
    await expect(page.getByText('DeepSeek').first()).toBeVisible()
    await expect(page.getByText('阿里百炼平台').first()).toBeVisible()
    // 每个 provider 行有 编辑/设为默认/删除 按钮
    const editButtons = page.getByRole('button', { name: '编辑' })
    expect(await editButtons.count()).toBeGreaterThanOrEqual(2)
  })

  test('「添加提供商」按钮应可见', async ({ page }) => {
    await page.getByRole('tab', { name: 'AI 模型配置' }).click()
    await expect(page.getByRole('button', { name: '添加提供商' })).toBeVisible()
  })

  test('IPC 桥 provider-config:list 至少返回 2 个 provider', async ({ page }) => {
    type Provider = { id: string; templateId: string; name: string }
    const list = await invokeIpcUnwrap<Provider[]>(
      page.context().request,
      'provider-config:list',
    )
    const ids = list.map((p) => p.templateId)
    expect(ids).toContain('deepseek')
    expect(ids).toContain('bailian')
  })

  test('IPC 桥 provider-template:list 返回模板列表', async ({ page }) => {
    const list = await invokeIpcUnwrap<Array<{ id: string; name: string }>>(
      page.context().request,
      'provider-template:list',
    )
    expect(Array.isArray(list)).toBe(true)
    expect(list.length).toBeGreaterThan(0)
  })

  test('IPC 桥 settings:get 应返回对象', async ({ page }) => {
    const data = await invokeIpcUnwrap<unknown>(page.context().request, 'settings:get')
    expect(data).toBeDefined()
  })

  test('未登录直接调用 IPC 桥应被拒绝', async ({ request }) => {
    const resp = await request.post(`${WEB_API_BASE}/api/ipc/settings:get`, {
      headers: { 'Content-Type': 'application/json', Cookie: '' },
      data: { args: [] },
    })
    // 401 / 403 都视为正确（取决于 attachUser 中间件实现）
    expect([401, 403]).toContain(resp.status())
  })
})
