/**
 * 出向 URL 安全校验（SSRF 防护）单测
 * @module tests/core/utils/outbound-url
 */
import { describe, it, expect } from 'vitest'
import { validateOutboundUrl, isPrivateHostname } from '@core/utils/outbound-url'

describe('isPrivateHostname', () => {
  it('公网主机名 → 非私网', () => {
    expect(isPrivateHostname('example.com')).toBe(false)
    expect(isPrivateHostname('www.baidu.com')).toBe(false)
    expect(isPrivateHostname('api.openai.com')).toBe(false)
  })

  it('环回 / localhost → 私网', () => {
    expect(isPrivateHostname('localhost')).toBe(true)
    expect(isPrivateHostname('127.0.0.1')).toBe(true)
    expect(isPrivateHostname('127.8.8.8')).toBe(true)
    expect(isPrivateHostname('::1')).toBe(true)
  })

  it('私网 / 链路本地 / 保留段 → 私网', () => {
    expect(isPrivateHostname('10.0.0.5')).toBe(true)
    expect(isPrivateHostname('172.16.1.1')).toBe(true)
    expect(isPrivateHostname('172.31.255.255')).toBe(true)
    expect(isPrivateHostname('172.32.0.1')).toBe(false) // 172.32 不是私网段
    expect(isPrivateHostname('192.168.1.10')).toBe(true)
    expect(isPrivateHostname('169.254.169.254')).toBe(true) // 云元数据
    expect(isPrivateHostname('fe80::1')).toBe(true)
    expect(isPrivateHostname('fc00::1')).toBe(true)
  })

  it('单标签主机名 / 内网后缀 → 私网', () => {
    expect(isPrivateHostname('mysql')).toBe(true)
    expect(isPrivateHostname('redis')).toBe(true)
    expect(isPrivateHostname('nas.local')).toBe(true)
    expect(isPrivateHostname('srv.internal')).toBe(true)
  })
})

describe('validateOutboundUrl', () => {
  it('合法公网 http/https → ok', () => {
    const r = validateOutboundUrl('https://example.com/page?a=1')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.url.hostname).toBe('example.com')
    expect(validateOutboundUrl('http://example.com').ok).toBe(true)
  })

  it('拒绝非 http/https 协议', () => {
    expect(validateOutboundUrl('file:///etc/passwd').ok).toBe(false)
    expect(validateOutboundUrl('ftp://example.com/x').ok).toBe(false)
    expect(validateOutboundUrl('javascript:alert(1)').ok).toBe(false)
  })

  it('拒绝 URL 格式非法', () => {
    expect(validateOutboundUrl('not a url').ok).toBe(false)
    expect(validateOutboundUrl('').ok).toBe(false)
  })

  it('拒绝内网/环回/保留地址', () => {
    expect(validateOutboundUrl('http://127.0.0.1:3000/admin').ok).toBe(false)
    expect(validateOutboundUrl('http://169.254.169.254/latest/meta-data/').ok).toBe(false)
    expect(validateOutboundUrl('http://192.168.1.1/').ok).toBe(false)
    expect(validateOutboundUrl('http://10.0.0.2/').ok).toBe(false)
    expect(validateOutboundUrl('http://localhost:8080/').ok).toBe(false)
  })
})
