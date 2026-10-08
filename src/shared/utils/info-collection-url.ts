/**
 * 信息搜集：URL 规范化（纯函数，双端可用）
 * @module shared/utils/info-collection-url
 *
 * 背景（主设计 §3 阶段 2）：同一页面常带不同 tracking 参数被重复采集，
 * ic_sources 以 url_normalized 为增量跳过与去重的键——规范化必须确定性：
 * 同一 URL 永远得到同一结果。
 *
 * 纪律：只做无损归一（协议/主机大小写/默认端口/hash/tracking 参数/查询排序/尾斜杠），
 * 不做"可能改变资源"的重写（不去 path 参数、不合并编码形态）。
 */

/** 常见 tracking 参数（前缀匹配 utm_*；白名单外常见统计参数显式列举） */
const TRACKING_PARAM_RE = /^(utm_[a-z]*|spm|from|vd_source|vd_share|share_token|share_id|fbclid|gclid|msclkid|igshid|ref|referrer|campaignid|_t|_s)$/i

/** 规范化失败（无法解析）时返回空串，由调用方决定丢弃。 */
export function normalizeUrl(rawUrl: string): string {
  const trimmed = (rawUrl ?? '').trim()
  if (!trimmed) return ''
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return ''
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''

  parsed.protocol = parsed.protocol.toLowerCase()
  parsed.hostname = parsed.hostname.toLowerCase()
  // 默认端口归一（:80 http / :443 https）
  if (
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443')
  ) {
    parsed.port = ''
  }
  // hash 是页面内锚点，不属于资源身份
  parsed.hash = ''

  // 剔除 tracking 参数（保持其余参数原值，按名排序保证确定性）
  const kept: Array<[string, string]> = []
  const seen = new Map<string, string[]>()
  for (const [k, v] of parsed.searchParams.entries()) {
    if (TRACKING_PARAM_RE.test(k)) continue
    const list = seen.get(k) ?? []
    list.push(v)
    seen.set(k, list)
  }
  const names = [...seen.keys()].sort()
  for (const name of names) {
    for (const v of seen.get(name)!) kept.push([encodeURIComponent(name), encodeURIComponent(v)])
  }
  const search = kept.length > 0 ? `?${kept.map(([k, v]) => `${k}=${v}`).join('&')}` : ''

  // 尾斜杠归一：空 path 与 "/" 等价；其余 path 保留原样（去一个尾斜杠）
  let path = parsed.pathname || '/'
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)

  return `${parsed.protocol}//${parsed.host}${path}${search}`
}
