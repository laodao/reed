/**
 * 提供商配置 BaseURL 校验单测
 * @module tests/unit/electron/ipc/provider-config-base-url
 *
 * 规则：只做 http(s) 基本校验，不强制版本段结尾。
 * DeepSeek 等官方 BaseURL 本就不带 /v1（https://api.deepseek.com），
 * Anthropic 协议根地址同样天然不带版本段（SDK 自行拼 /v1/messages），
 * 用户把官方文档地址粘进输入框不应被误拒。
 */
import { describe, it, expect } from 'vitest'
import { validateBaseUrl } from '@electron/ipc/handlers/provider-config.handler'

describe('validateBaseUrl', () => {
  it('留空 → 放行（使用模板默认端点）', () => {
    expect(validateBaseUrl(undefined)).toBeNull()
    expect(validateBaseUrl('')).toBeNull()
    expect(validateBaseUrl('   ')).toBeNull()
  })

  it('带版本段的地址 → 放行', () => {
    expect(validateBaseUrl('https://api.deepseek.com/v1')).toBeNull()
    expect(validateBaseUrl('https://proxy.example.com/v1')).toBeNull()
    expect(validateBaseUrl('http://127.0.0.1:8000/v1/')).toBeNull()
    expect(validateBaseUrl('https://api.example.com/api/paas/v4')).toBeNull()
  })

  it('不带版本段的地址 → 放行（DeepSeek/Anthropic 官方根地址）', () => {
    expect(validateBaseUrl('https://api.deepseek.com')).toBeNull()
    expect(validateBaseUrl('https://api.anthropic.com')).toBeNull()
    expect(
      validateBaseUrl('https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic')
    ).toBeNull()
    expect(validateBaseUrl('http://127.0.0.1:8080')).toBeNull()
  })

  it('非 http(s) 开头 → 拒绝', () => {
    expect(validateBaseUrl('ftp://x/v1')).not.toBeNull()
    expect(validateBaseUrl('api.deepseek.com')).not.toBeNull()
    expect(validateBaseUrl('deepseek')).not.toBeNull()
  })
})
