/**
 * 提供商配置 BaseURL 校验单测
 * @module tests/unit/electron/ipc/provider-config-base-url
 *
 * 背景：`validateBaseUrl` 要求自定义 BaseURL 以版本段结尾（如 /v1）。
 * 但 Anthropic 协议根地址天然不带版本段（SDK 自行拼 /v1/messages），
 * 例如阿里百炼 Token Plan 的 https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic、
 * 官方 Anthropic 的 https://api.anthropic.com。用户把官方文档地址粘进输入框会被误拒。
 *
 * 规则：等于模板缺省端点 → 放行（模板值是权威）；其余自定义地址仍按原规则校验。
 */
import { describe, it, expect } from 'vitest'
import { validateBaseUrl } from '@electron/ipc/handlers/provider-config.handler'
import { PROVIDER_TEMPLATES } from '@core/platform/services/provider-template.service'

const tokenPlanAnthropic = PROVIDER_TEMPLATES.find((t) => t.id === 'bailian-token-plan-anthropic')!
const tokenPlanOpenai = PROVIDER_TEMPLATES.find((t) => t.id === 'bailian-token-plan')!
const anthropicOfficial = PROVIDER_TEMPLATES.find((t) => t.id === 'anthropic')!

describe('validateBaseUrl', () => {
  it('留空 → 放行（使用模板默认端点）', () => {
    expect(validateBaseUrl(undefined, tokenPlanAnthropic)).toBeNull()
    expect(validateBaseUrl('', tokenPlanAnthropic)).toBeNull()
    expect(validateBaseUrl('   ', tokenPlanAnthropic)).toBeNull()
  })

  it('等于模板缺省端点 → 放行（含尾部斜杠）', () => {
    expect(validateBaseUrl(tokenPlanAnthropic.apiConfig.baseUrl, tokenPlanAnthropic)).toBeNull()
    expect(validateBaseUrl(`${tokenPlanAnthropic.apiConfig.baseUrl}/`, tokenPlanAnthropic)).toBeNull()
    expect(validateBaseUrl(anthropicOfficial.apiConfig.baseUrl, anthropicOfficial)).toBeNull()
    expect(validateBaseUrl(tokenPlanOpenai.apiConfig.baseUrl, tokenPlanOpenai)).toBeNull()
  })

  it('带版本段的自定义地址 → 放行', () => {
    expect(validateBaseUrl('https://proxy.example.com/v1', tokenPlanOpenai)).toBeNull()
    expect(validateBaseUrl('http://127.0.0.1:8000/v1/', tokenPlanOpenai)).toBeNull()
    expect(validateBaseUrl('https://api.example.com/api/paas/v4', tokenPlanOpenai)).toBeNull()
  })

  it('不带版本段的其它自定义地址 → 拒绝（保留既有约定）', () => {
    expect(validateBaseUrl('https://proxy.example.com/anthropic', tokenPlanAnthropic)).not.toBeNull()
    expect(validateBaseUrl('https://api.anthropic.com', tokenPlanOpenai)).not.toBeNull()
    expect(validateBaseUrl('ftp://x/v1', tokenPlanOpenai)).not.toBeNull()
  })
})
