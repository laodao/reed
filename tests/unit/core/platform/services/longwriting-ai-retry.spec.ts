/**
 * W1.3 生成重试：可重试错误判定纯函数单测
 * @module tests/unit/core/platform/services/longwriting-ai-retry
 */
import { describe, expect, it } from 'vitest'
import { isRetryableAiError } from '@core/platform/services/longwriting-ai.service'

describe('isRetryableAiError（W1.3 生成重试判定）', () => {
  it('网络抖动/限流/5xx 可重试', () => {
    expect(isRetryableAiError(new Error('fetch failed'))).toBe(true)
    expect(isRetryableAiError(new Error('socket hang up'))).toBe(true)
    expect(isRetryableAiError(new Error('HTTP 429 Too Many Requests'))).toBe(true)
    expect(isRetryableAiError(new Error('HTTP 502 Bad Gateway'))).toBe(true)
    expect(isRetryableAiError(Object.assign(new Error('server error'), { status: 503 }))).toBe(true)
  })

  it('用户取消不可重试', () => {
    expect(isRetryableAiError(new Error('已取消'))).toBe(false)
  })

  it('4xx 客户端错误不可重试（status 字段）', () => {
    expect(isRetryableAiError(Object.assign(new Error('bad request'), { status: 400 }))).toBe(false)
    expect(isRetryableAiError(Object.assign(new Error('unauthorized'), { status: 401 }))).toBe(false)
    expect(isRetryableAiError(Object.assign(new Error('forbidden'), { statusCode: 403 }))).toBe(false)
  })

  it('4xx 语义（消息文本）不可重试', () => {
    expect(isRetryableAiError(new Error('HTTP 401 Unauthorized'))).toBe(false)
    expect(isRetryableAiError(new Error('Invalid API key provided'))).toBe(false)
    expect(isRetryableAiError(new Error('Request contains an invalid argument'))).toBe(false)
  })

  it('无消息的未知错误按可重试处理（fail-safe 保守）', () => {
    expect(isRetryableAiError(undefined)).toBe(true)
    expect(isRetryableAiError({})).toBe(true)
  })
})
