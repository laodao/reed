/**
 * 浏览器渲染模块守卫测试（纯 node 环境，不进 Electron）
 * @module tests/unit/core/platform/workflow/browser-render
 * @description renderPageHtml：SSRF 闸门在 electron 之前生效（file:/内网地址直接拒绝）；
 *              非 Electron 运行时调用返回"仅桌面端可用"而非抛错。
 */
import { describe, it, expect } from 'vitest'
import { renderPageHtml } from '@core/platform/workflow/nodes/browser-render'

describe('renderPageHtml 纯守卫', () => {
  it('file:// 协议直接拒绝（SSRF 闸门在 electron 之前）', async () => {
    const r = await renderPageHtml('file:///C:/windows/win.ini')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('URL 校验失败')
  })

  it('内网/环回地址拒绝', async () => {
    for (const url of ['http://127.0.0.1:8080/admin', 'http://192.168.1.1/', 'http://169.254.169.254/latest/meta-data']) {
      const r = await renderPageHtml(url)
      expect(r.ok, url).toBe(false)
      if (!r.ok) expect(r.error, url).toContain('URL 校验失败')
    }
  })

  it('公网 URL 在非 Electron 运行时返回可用性错误（不抛错）', async () => {
    const r = await renderPageHtml('https://example.com/article/1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('浏览器渲染')
  })
})
