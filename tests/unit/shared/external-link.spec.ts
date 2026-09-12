/**
 * 外链打开工具测试（tested: isSafeExternalUrl / externalHostLabel / openExternalUrl）
 * @module tests/unit/shared/external-link.spec
 *
 * 用户需求（2026-09-12）：讲义「证据来源」要给出可点击的 URL。
 * 钉死：只放行 http(s)；javascript:/data:/file:/相对路径一律拒绝；host 标签去掉 www.。
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  externalHostLabel,
  isSafeExternalUrl,
  openExternalUrl,
} from '@shared/utils/external-link'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isSafeExternalUrl', () => {
  it('放行 http/https（含带查询串与端口）', () => {
    expect(isSafeExternalUrl('https://www.deeplearningbook.org/contents/linear_algebra.html')).toBe(true)
    expect(isSafeExternalUrl('http://arxiv.org/abs/2106.02475')).toBe(true)
    expect(isSafeExternalUrl('https://example.org:8443/a?b=1#c')).toBe(true)
    expect(isSafeExternalUrl('  https://example.org/x  ')).toBe(true)
  })

  it('拒绝脚本/数据/本地协议与相对路径', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'file:///C:/secret.txt',
      'chrome://settings',
      '/local/path.md',
      './relative.md',
      'example.org',
      '',
      '   ',
      null,
      undefined,
    ]) {
      expect(isSafeExternalUrl(bad), String(bad)).toBe(false)
    }
  })
})

describe('externalHostLabel', () => {
  it('取 host 并去掉 www.', () => {
    expect(externalHostLabel('https://www.deeplearningbook.org/contents/x.html')).toBe('deeplearningbook.org')
    expect(externalHostLabel('https://arxiv.org/abs/2106.02475')).toBe('arxiv.org')
  })

  it('非法 URL → 空串', () => {
    expect(externalHostLabel('javascript:alert(1)')).toBe('')
    expect(externalHostLabel('')).toBe('')
  })
})

describe('openExternalUrl', () => {
  it('合法 URL → window.open(_blank, noopener) 且返回 true', () => {
    const open = vi.fn()
    vi.stubGlobal('window', { open })
    expect(openExternalUrl('https://arxiv.org/abs/2106.02475')).toBe(true)
    expect(open).toHaveBeenCalledWith('https://arxiv.org/abs/2106.02475', '_blank', 'noopener,noreferrer')
  })

  it('非法 URL → 不调用 window.open 且返回 false（不弹出、不落外链）', () => {
    const open = vi.fn()
    vi.stubGlobal('window', { open })
    expect(openExternalUrl('javascript:alert(1)')).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })
})
