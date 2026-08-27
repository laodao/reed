/**
 * 出向 URL 安全校验（防 SSRF）
 * @module core/utils/outbound-url
 * @description 工作流 http 类节点（http-request / web-extract / crawl-news / oas-tool）、
 *              视觉模式图片拉取、资产下载等"用户可控 URL → 服务端 fetch"的统一入口校验：
 *              只允许 http/https，且拒绝内网 / 环回 / 链路本地 / 保留地址。
 *
 *              Web 端是多租户服务器，未拦截时任意登录用户（或分享链访客）可借工作流
 *              访问 169.254.169.254 云元数据、127.0.0.1 本机服务、192.168.x.x 内网，
 *              结果还能经节点输出回读。本工具是共同防线；部署侧仍建议配只读/出向代理兜底。
 *
 *              注意：本校验基于 hostname 文本与 IP 字面量判断（不解析 DNS），
 *              对"公网域名解析到内网"的 DNS rebinding 类攻击不构成完整防御——
 *              如需强防护应在连接层校验实际 IP（fetch 无此钩子，属已知边界）。
 */

import * as net from 'net'

/** 私网 / 环回 / 链路本地 / 保留地址段判定（IPv4 按前缀、IPv6 按前缀模式） */
const PRIVATE_IP_RULES: Array<{ name: string; test: (ip: string) => boolean }> = [
  { name: '环回', test: (ip) => ip === '127.0.0.1' || /^127\./.test(ip) || ip === '::1' },
  { name: '链路本地 IPv4', test: (ip) => /^169\.254\./.test(ip) },
  { name: '链路本地 IPv6', test: (ip) => /^fe80:/i.test(ip) },
  { name: '私网 A', test: (ip) => /^10\./.test(ip) },
  { name: '私网 B', test: (ip) => /^172\.(1[6-9]|2\d|3[01])\./.test(ip) },
  { name: '私网 C', test: (ip) => /^192\.168\./.test(ip) },
  { name: '保留/测试（0.0.0.0/8、100.64/10、文档段、240/4）', test: (ip) =>
    /^0\./.test(ip) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip) ||
    /^192\.0\.2\./.test(ip) ||
    /^198\.51\.100\./.test(ip) ||
    /^203\.0\.113\./.test(ip) ||
    /^240\./.test(ip) ||
    /^255\./.test(ip) },
  { name: 'IPv6 唯一本地 / 站点本地', test: (ip) => /^f[cd][0-9a-f]{2}:/i.test(ip) },
  { name: 'IPv6 链路本地/站点本地前缀', test: (ip) => /^fe[89ab]/.test(ip) },
]

/** 判断 hostname 是否指向内网/保留地址（含 localhost 与单标签主机名） */
export function isPrivateHostname(hostname: string): boolean {
  const h = (hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (!h) return true
  if (h === 'localhost') return true
  const ip = net.isIP(h)
  if (ip !== 0) {
    return PRIVATE_IP_RULES.some((r) => r.test(h))
  }
  // 常见内网后缀
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan') || h.endsWith('.home')) {
    return true
  }
  // 无点单标签主机名（内网服务名，如 mysql / redis）
  if (!h.includes('.')) return true
  return false
}

/**
 * 校验一个出向 URL：
 * - scheme 白名单 http/https
 * - hostname 拒绝内网/保留地址（见 isPrivateHostname）
 *
 * @returns ok=true 时附带解析后的 URL；否则返回拒绝原因
 */
export function validateOutboundUrl(
  rawUrl: string,
): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { ok: false, reason: 'URL 格式非法' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `仅允许 http/https 协议，当前：${url.protocol}` }
  }
  const hostname = url.hostname
  if (!hostname) return { ok: false, reason: '缺少主机名' }
  if (isPrivateHostname(hostname)) {
    return { ok: false, reason: `目标地址是内网/保留地址（${hostname}），已拦截（防 SSRF）` }
  }
  return { ok: true, url }
}
