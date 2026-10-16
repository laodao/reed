/**
 * executeHttpFetch 重定向逐跳 SSRF 校验（总收口 review P2-3 回归）
 * @module tests/core/platform/workflow/http-fetch-redirect.spec
 *
 * fetch 默认 follow 且 Location 不再过闸门——公网域名 302 跳内网/环回可绕
 * validateOutboundUrl（agent 的 http_get 把 URL 来源放宽到模型输出后被放大）。
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { executeHttpFetch } from '@core/platform/workflow/nodes/http-fetch'

const signal = new AbortController().signal
const textResponse = (body = 'ok', status = 200): Response =>
  new Response(body, { status, headers: { 'content-type': 'text/plain' } })
const redirectResponse = (location: string, status = 302): Response =>
  new Response(null, { status, headers: { location } })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('重定向逐跳 SSRF 闸门', () => {
  it('公网 → 内网地址 302：拒绝（不跟随）', async () => {
    const fetchMock = vi.fn(async (url: unknown) => {
      expect(String(url)).toBe('https://public.example.com/redirect')
      return redirectResponse('http://169.254.169.254/latest/meta-data')
    })
    vi.stubGlobal('fetch', fetchMock)
    const r = await executeHttpFetch(
      { method: 'GET', url: 'https://public.example.com/redirect', responseType: 'auto' },
      signal,
    )
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toContain('SSRF')
    expect(fetchMock).toHaveBeenCalledTimes(1) // 内网跳未发起
  })

  it('公网 → 环回 302：拒绝', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => redirectResponse('http://127.0.0.1:8080/admin')))
    const r = await executeHttpFetch(
      { method: 'GET', url: 'https://public.example.com/x', responseType: 'auto' },
      signal,
    )
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toContain('SSRF')
  })

  it('公网 → 公网 302：跟随并取最终内容（相对路径解析）', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(redirectResponse('/final'))
      .mockResolvedValueOnce(textResponse('最终内容'))
    vi.stubGlobal('fetch', fetchMock)
    const r = await executeHttpFetch(
      { method: 'GET', url: 'https://public.example.com/a', responseType: 'auto' },
      signal,
    )
    expect(r.ok).toBe(true)
    expect((r as { output: { body: string; status: number } }).output.body).toBe('最终内容')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://public.example.com/final')
  })

  it('重定向环 / 超跳数：达上限拒绝', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => redirectResponse('/loop-forever')))
    const r = await executeHttpFetch(
      { method: 'GET', url: 'https://public.example.com/a', responseType: 'auto' },
      signal,
    )
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toContain('重定向超过')
  })
})
