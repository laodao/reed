/**
 * buildUrl 版本段去重（vLLM baseUrl 带 /v1 + 模板 /v1/models → 404 修复）
 */
import { describe, it, expect } from 'vitest'
import { BaseProvider } from '@core/platform/providers/llm/base-provider'

describe('BaseProvider.joinUrl 版本段规整', () => {
  it('baseUrl 带 /v1 + endpoint 带 /v1/ → 去重一份', () => {
    expect(BaseProvider.joinUrl('http://h:8000/v1', '/v1/models')).toBe('http://h:8000/v1/models')
    expect(BaseProvider.joinUrl('https://api.x.com/v1/', '/v1/chat/completions')).toBe('https://api.x.com/v1/chat/completions')
  })
  it('baseUrl 不带版本段 → 原样拼接（尾部斜杠清理）', () => {
    expect(BaseProvider.joinUrl('http://h:8000', '/v1/models')).toBe('http://h:8000/v1/models')
    expect(BaseProvider.joinUrl('http://h:8000//', '/v1/models')).toBe('http://h:8000/v1/models')
  })
  it('/v1beta 等其它前缀不受影响', () => {
    expect(BaseProvider.joinUrl('https://x', '/v1beta/models')).toBe('https://x/v1beta/models')
    expect(BaseProvider.joinUrl('https://x/v1', '/v1beta/models')).toBe('https://x/v1/v1beta/models')
  })
})
