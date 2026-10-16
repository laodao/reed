/**
 * Web 端 E2E - AI 对话（阿里百炼 / Qwen）
 * @description 通过 UI 切换模型到 bailian/qwen3.6-27b，发送一条消息验证有 AI 回复。
 */

import { test, expect } from '@playwright/test'
import { gotoApp, invokeIpcUnwrap, loginViaApi } from './helpers/auth'

const PROMPT = '请仅用中文回复"百炼通过"四个字，不要任何其他内容。'

test.describe('Web 端 - AI 对话 (百炼/Qwen)', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)

    // 前置：百炼配置存在
    type Provider = { templateId: string }
    const list = await invokeIpcUnwrap<Provider[]>(
      page.context().request,
      'provider-config:list',
    )
    const bailian = list.find((p) => p.templateId === 'bailian')
    expect(bailian, '百炼提供商未配置').toBeDefined()
  })

  test('切到 bailian 模型并发送消息，应收到回复', async ({ page }) => {
    test.setTimeout(120_000)

    await gotoApp(page, '/chat')

    const startNew = page.getByRole('button', { name: '新建对话' })
    if (await startNew.count()) {
      await startNew.first().click()
    }

    // 打开模型下拉。Element Plus 的 el-select 用 combobox role
    const modelCombo = page.locator('.model-select').first()
    await expect(modelCombo).toBeVisible({ timeout: 10_000 })
    await modelCombo.click()

    // 等待 dropdown 出现：选 bailian/qwen 文本模型
    const bailianOption = page.locator('.el-select-dropdown__item').filter({
      hasText: /bailian\/qwen3\.6-27b/,
    })
    await expect(bailianOption.first()).toBeVisible({ timeout: 5000 })
    await bailianOption.first().click()

    // 验证当前选中模型已切换
    await expect(page.getByText(/bailian\/qwen3\.6-27b/).first()).toBeVisible()

    const input = page.getByRole('textbox', { name: '输入消息' })
    await expect(input).toBeVisible()

    const messages = page.locator('.message-item')
    const baseCount = await messages.count()

    await input.fill(PROMPT)

    const sendBtn = page.getByRole('button', { name: '发送', exact: true })
    if (await sendBtn.isEnabled().catch(() => false)) {
      await sendBtn.click()
    } else {
      await input.press('Control+Enter')
    }

    await expect
      .poll(async () => await messages.count(), {
        timeout: 90_000,
        intervals: [500, 1000, 2000],
      })
      .toBeGreaterThanOrEqual(baseCount + 2)

    const lastAssistant = page.locator('.message-item.assistant').last()
    await expect(lastAssistant).toBeVisible()
    const replyText = (await lastAssistant.innerText()).trim()
    expect(replyText.length).toBeGreaterThan(0)
  })
})
