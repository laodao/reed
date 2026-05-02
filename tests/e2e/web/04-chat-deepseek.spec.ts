/**
 * Web 端 E2E - AI 对话（DeepSeek）
 * @description 真实调用 DeepSeek 提供商发送一条消息，验证有 AI 回复。
 *              依赖 settings 中已配置 DeepSeek（templateId='deepseek' 且启用）。
 */

import { test, expect } from '@playwright/test'
import { gotoApp, invokeIpcUnwrap, loginViaApi } from './helpers/auth'

const PROMPT = '请仅用中文回复"测试通过"四个字，不要任何其他内容。'

async function ensureProviderEnabled(
  request: import('@playwright/test').APIRequestContext,
  templateId: string,
): Promise<void> {
  type Provider = { id: string; templateId: string; isEnabled?: number }
  const list = await invokeIpcUnwrap<Provider[]>(request, 'provider-config:list')
  const found = list.find((p) => p.templateId === templateId)
  expect(found, `未找到 ${templateId} 提供商配置`).toBeDefined()
}

test.describe('Web 端 - AI 对话 (DeepSeek)', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
    await ensureProviderEnabled(page.context().request, 'deepseek')
  })

  test('打开 /chat，新建对话，发送消息，应收到 DeepSeek 回复', async ({ page }) => {
    test.setTimeout(120_000) // 真实调用网络，留够时间

    await gotoApp(page, '/chat')

    // 入口可能停留在「无对话」启动页，点击「新建对话」（如有）
    const startNew = page.getByRole('button', { name: '新建对话' })
    if (await startNew.count()) {
      await startNew.first().click()
    }

    // 显式切到 DeepSeek/deepseek-v4-flash（避免上次测试残留的模型）
    const modelCombo = page.locator('.model-select').first()
    await expect(modelCombo).toBeVisible({ timeout: 10_000 })
    await modelCombo.click()
    const dsOption = page.locator('.el-select-dropdown__item').filter({
      hasText: /DeepSeek\/deepseek-v4-flash/,
    })
    await expect(dsOption.first()).toBeVisible({ timeout: 5000 })
    await dsOption.first().click()
    // 关闭 dropdown 后当前选中模型可见
    await expect(page.getByText(/DeepSeek\/deepseek-v4-flash/).first()).toBeVisible()

    const input = page.getByRole('textbox', { name: '输入消息' })
    await expect(input).toBeVisible()

    // 发送前的消息数量（每条消息都有 .message-item DOM）
    const messages = page.locator('.message-item')
    const baseCount = await messages.count()

    await input.fill(PROMPT)

    const sendBtn = page.getByRole('button', { name: '发送', exact: true })
    if (await sendBtn.isEnabled().catch(() => false)) {
      await sendBtn.click()
    } else {
      await input.press('Control+Enter')
    }

    // 期望：消息数量增加 ≥ 2（用户消息 + 助手消息），最长等 90s
    await expect
      .poll(async () => await messages.count(), {
        timeout: 90_000,
        intervals: [500, 1000, 2000],
      })
      .toBeGreaterThanOrEqual(baseCount + 2)

    // 助手最后一条消息应有非空文本
    const lastAssistant = page.locator('.message-item.assistant').last()
    await expect(lastAssistant).toBeVisible()
    const replyText = (await lastAssistant.innerText()).trim()
    expect(replyText.length).toBeGreaterThan(0)
  })
})
