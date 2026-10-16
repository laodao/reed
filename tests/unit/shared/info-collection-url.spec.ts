/**
 * URL 规范化单测（info-collection-url）
 * @module tests/unit/shared/info-collection-url.spec
 *
 * 钉死确定性契约：同一 URL 永远同一结果；tracking 参数剔除；默认端口/尾斜杠/hash 归一。
 */
import { describe, it, expect } from 'vitest'
import { normalizeUrl } from '@shared/utils/info-collection-url'

describe('normalizeUrl', () => {
  it('同 URL 不同 tracking 参数 → 归一为同一结果', () => {
    const a = normalizeUrl('https://www.stats.gov.cn/sj/zxfb/202401/t20240117_1946624.html')
    const b = normalizeUrl('https://www.stats.gov.cn/sj/zxfb/202401/t20240117_1946624.html?utm_source=x&spm=1&from=timeline')
    expect(b).toBe(a)
    expect(a).toBe('https://www.stats.gov.cn/sj/zxfb/202401/t20240117_1946624.html')
  })

  it('协议与主机大小写、默认端口、hash、尾斜杠归一', () => {
    expect(normalizeUrl('HTTP://Example.COM:80/a/b/')).toBe('http://example.com/a/b')
    expect(normalizeUrl('https://example.com:443/x?utm_term=1#section-2')).toBe('https://example.com/x')
  })

  it('查询参数按名排序（确定性），非 tracking 参数保留原值', () => {
    expect(normalizeUrl('https://e.com/p?b=2&a=1&b=1')).toBe('https://e.com/p?a=1&b=2&b=1')
    expect(normalizeUrl('https://e.com/p?id=42&utm_medium=s')).toBe('https://e.com/p?id=42')
  })

  it('utm_ 前缀族整体剔除', () => {
    expect(normalizeUrl('https://e.com/p?utm_campaign=q4&utm_content=v9&keep=1')).toBe('https://e.com/p?keep=1')
  })

  it('非法输入返回空串（调用方丢弃）', () => {
    expect(normalizeUrl('')).toBe('')
    expect(normalizeUrl('   ')).toBe('')
    expect(normalizeUrl('not a url')).toBe('')
    expect(normalizeUrl('ftp://example.com/file')).toBe('')
    expect(normalizeUrl('javascript:alert(1)')).toBe('')
  })

  it('根路径保持 "/"，不再剥尾斜杠', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com/')
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/')
  })
})
