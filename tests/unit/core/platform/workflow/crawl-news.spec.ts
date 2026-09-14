/**
 * crawl-news 信息采集节点测试（信息来源库 → 链接清单）
 * @module tests/unit/core/platform/workflow/crawl-news
 * @description 验证 resolveSourceUrls（来源分组/来源库 sourceIds/自定义 URL/去重/非法过滤）与
 *              节点校验（来源至少其一）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveSourceUrls, parseUrlList } from '@core/platform/workflow/nodes/news-nodes'
import { NEWS_TOPICS, getNewsTopicSources, NEWS_TOPIC_LABELS } from '@shared/types/news-topics'
import { NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'

/** mock 信息来源库（避免依赖真实数据库） */
const mockRows: Array<{ id: string; topicId: string; name: string; url: string; enabled: boolean }> = []
/** mock 分组整组来源（topicId → 行）；空 = 走内置新闻源目录兜底 */
const mockTopicRows: Array<{ id: string; topicId: string; name: string; url: string; enabled: boolean }> = []
vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => ({
    infoSources: {
      listByIds: async (ids: string[]) => mockRows.filter(r => ids.includes(r.id) && r.enabled),
      listByTopic: async (topicId: string) => mockTopicRows.filter(r => r.topicId === topicId && r.enabled),
    },
  }),
}))

function setMockNewsSources(rows: Array<{ id: string; topicId: string; name: string; url: string; enabled: boolean }>) {
  mockRows.length = 0
  mockRows.push(...rows)
}

function setMockTopicSources(rows: Array<{ id: string; topicId: string; name: string; url: string; enabled: boolean }>) {
  mockTopicRows.length = 0
  mockTopicRows.push(...rows)
}

beforeEach(() => {
  mockRows.length = 0
  mockTopicRows.length = 0
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NEWS_TOPICS 预置主题目录', () => {
  it('5 个主题且每主题源数 = 15（国外 10 + 国内 5）', () => {
    expect(NEWS_TOPICS.length).toBe(5)
    for (const t of NEWS_TOPICS) {
      expect(t.sources.length, `${t.label} 源数`).toBe(15)
    }
  })

  it('所有源 URL 为 http(s) 且不重复', () => {
    const all = NEWS_TOPICS.flatMap(t => t.sources)
    const urls = all.map(s => s.url)
    expect(new Set(urls).size).toBe(urls.length)
    for (const s of all) {
      expect(s.url, s.name).toMatch(/^https?:\/\//)
    }
  })

  it('主题标签列表可用于前端 select（label/value 配对）', () => {
    expect(NEWS_TOPIC_LABELS.length).toBe(5)
    for (const l of NEWS_TOPIC_LABELS) {
      expect(getNewsTopicSources(l.value).length).toBeGreaterThan(0)
    }
  })

  it('未知主题返回空数组', () => {
    expect(getNewsTopicSources('not-exist')).toEqual([])
  })
})

describe('resolveSourceUrls（async）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('@core/database/database-manager.interface')
  })

  it('按分组取来源：库内分组优先（任意类别）', async () => {
    const urls = await resolveSourceUrls('ai', undefined, undefined)
    expect(urls.length).toBe(getNewsTopicSources('ai').length)
    expect(urls[0].url).toMatch(/^https?:\/\//)
  })

  it('库内分组有来源时以库为准（覆盖内置目录兜底）', async () => {
    setMockTopicSources([
      { id: 'is_x', topicId: 'finance_kb', name: '金融站点', url: 'https://fin.example.com', enabled: true },
    ])
    const urls = await resolveSourceUrls('finance_kb', undefined, undefined)
    expect(urls).toEqual([{ name: '金融站点', url: 'https://fin.example.com' }])
  })

  it('库内分组为空 → 回落到内置新闻源目录', async () => {
    const urls = await resolveSourceUrls('ai', undefined, undefined)
    expect(urls.map(u => u.url)).toEqual(getNewsTopicSources('ai').map(s => s.url))
  })

  it('自定义 URL：JSON 字符串数组', async () => {
    const urls = await resolveSourceUrls(undefined, undefined, '["https://a.com","https://b.com"]')
    expect(urls.map(u => u.url)).toEqual(['https://a.com', 'https://b.com'])
  })

  it('自定义 URL：JSON 对象数组（name+url）', async () => {
    const urls = await resolveSourceUrls(undefined, undefined, '[{"name":"A","url":"https://a.com"}]')
    expect(urls).toEqual([{ name: 'A', url: 'https://a.com' }])
  })

  it('自定义 URL：逗号/换行分隔的普通文本', async () => {
    const urls = await resolveSourceUrls(undefined, undefined, 'https://a.com,\nhttps://b.com')
    expect(urls.map(u => u.url)).toEqual(['https://a.com', 'https://b.com'])
  })

  it('预置主题与自定义 URL 合并且跨源去重', async () => {
    const first = getNewsTopicSources('ai')[0].url
    const urls = await resolveSourceUrls('ai', undefined, `["${first}","https://custom.com"]`)
    const all = urls.map(u => u.url)
    expect(new Set(all).size).toBe(all.length)
    expect(all).toContain('https://custom.com')
    expect(all).toContain(first)
  })

  it('过滤非 http(s) 与空', async () => {
    const urls = await resolveSourceUrls(undefined, undefined, '["ftp://x.com","","javascript:void(0)","https://ok.com"]')
    expect(urls.map(u => u.url)).toEqual(['https://ok.com'])
  })

  it('无主题无来源无自定义 URL → 空数组', async () => {
    expect(await resolveSourceUrls(undefined, undefined, undefined)).toEqual([])
    expect(await resolveSourceUrls('', '', '')).toEqual([])
  })

  it('sourceIds：从新闻来源库取（JSON 数组）', async () => {
    setMockNewsSources([
      { id: 'ns_a', topicId: 'ai', name: '源A', url: 'https://a.com', enabled: true },
      { id: 'ns_b', topicId: 'ai', name: '源B', url: 'https://b.com', enabled: true },
    ])
    const urls = await resolveSourceUrls(undefined, '["ns_a","ns_b"]', undefined)
    expect(urls.map(u => u.url).sort()).toEqual(['https://a.com', 'https://b.com'])
    expect(urls.map(u => u.name).sort()).toEqual(['源A', '源B'])
  })

  it('sourceIds：逗号分隔 + 禁用源过滤', async () => {
    setMockNewsSources([
      { id: 'ns_a', topicId: 'ai', name: '源A', url: 'https://a.com', enabled: true },
      { id: 'ns_b', topicId: 'ai', name: '源B', url: 'https://b.com', enabled: false },
    ])
    const urls = await resolveSourceUrls(undefined, 'ns_a,ns_b', undefined)
    expect(urls.map(u => u.url)).toEqual(['https://a.com'])
  })

  it('sourceIds + 预置主题合并去重', async () => {
    setMockNewsSources([
      { id: 'ns_a', topicId: 'ai', name: '源A', url: 'https://a.com', enabled: true },
    ])
    const first = getNewsTopicSources('ai')[0].url
    const urls = await resolveSourceUrls('ai', '["ns_a"]', `["${first}"]`)
    const all = urls.map(u => u.url)
    expect(new Set(all).size).toBe(all.length)
    expect(all).toContain('https://a.com')
    expect(all).toContain(first)
  })
})

describe('crawl-news 目录注册', () => {
  it('crawl-news 存在于节点目录', () => {
    expect(NODE_TYPE_CATALOG_MAP['crawl-news']).toBeDefined()
  })
})

describe('parseUrlList（crawl-links 输入解析——防 SSRF）', () => {
  it('过滤内网/环回/保留地址 URL（与 crawl-news 同款出向校验）', () => {
    const urls = parseUrlList(
      '["https://public.com","http://127.0.0.1/x","http://169.254.169.254/latest/meta-data/","http://localhost/y","http://192.168.1.1/"]'
    )
    expect(urls.map(u => u.url)).toEqual(['https://public.com'])
  })

  it('仅允许 http(s)，过滤其它协议与空串', () => {
    const urls = parseUrlList('["ftp://x.com","javascript:alert(1)","","https://ok.com"]')
    expect(urls.map(u => u.url)).toEqual(['https://ok.com'])
  })

  it('支持对象数组与嵌套 items 展平（LLM 分组输出场景）', () => {
    const urls = parseUrlList(
      '[{"source":"A","items":[{"title":"t","url":"https://a.com"}]},"https://b.com"]'
    )
    expect(urls.map(u => u.url)).toEqual(['https://a.com', 'https://b.com'])
  })

  it('过滤嵌套/对象数组窗体中的内网地址', () => {
    const urls = parseUrlList('[{"name":"内网","url":"http://10.0.0.5/"},"https://ok.com"]')
    expect(urls.map(u => u.url)).toEqual(['https://ok.com'])
  })
})
