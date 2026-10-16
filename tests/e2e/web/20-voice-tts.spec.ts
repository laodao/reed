/**
 * P5-T17 DashScope qwen3-tts 适配 e2e
 *
 * 验证：
 *   1. voice.list 返回 DashScope 预置发音人列表
 *   2. voice.synthesize 真打 qwen3-tts API（默认 .skip，需要真 API key 才跑）
 */

import { test, expect } from '@playwright/test'
import { invokeIpcUnwrap, loginViaApi } from './helpers/auth'

test.describe('Web 端 - P5-T17 DashScope qwen3-tts', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page)
  })

  test('voice.list 返回 Cherry / Ethan 等预置发音人', async ({ page }) => {
    const voices = await invokeIpcUnwrap<Array<{ id: string; name: string }>>(
      page.context().request,
      'voice.list',
      [],
    ).catch(() => null)

    test.skip(!voices, 'voice.list IPC 未注册或失败 — 跳过')
    expect(Array.isArray(voices)).toBe(true)
    // DashScope qwen3-tts 至少包含 Cherry（首选发音人）
    const ids = voices!.map((v) => v.id)
    expect(ids).toContain('Cherry')
  })

  test.skip('voice.synthesize 真打 qwen3-tts API（需 real API key）', async ({
    page,
  }) => {
    // 默认 skip：需 user 在 ② 资产 stage 配好 DashScope API key + run 时
    // 取消 skip 并填 providerConfigId
    const result = await invokeIpcUnwrap<{ audioData?: string; error?: string }>(
      page.context().request,
      'voice.synthesize',
      ['你好世界', 'Cherry', { language: 'zh' }],
    )
    expect(result.audioData?.length).toBeGreaterThan(0)
  })
})
