/**
 * crawl-news 新闻采集节点测试（内置应用 C1 早报 / C2 周报数据层）
 * @module tests/core/modules/workflow/crawl-news
 * @description 验证 resolveSourceUrls（预置主题/自定义 URL/去重/非法过滤）与
 *              节点校验（主题与 URL 至少其一）。
 */
import { describe, it, expect } from 'vitest'
import { resolveSourceUrls } from '@core/modules/workflow/nodes/news-nodes'
import { NEWS_TOPICS, getNewsTopicSources, NEWS_TOPIC_LABELS } from '@shared/types/news-topics'
import { NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'

describe('NEWS_TOPICS 预置主题目录', () => {
  it('5 个主题且每主题源数 >= 8', () => {
    expect(NEWS_TOPICS.length).toBe(5)
    for (const t of NEWS_TOPICS) {
      expect(t.sources.length, `${t.label} 源数`).toBeGreaterThanOrEqual(8)
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

describe('resolveSourceUrls', () => {
  it('按主题取预置源', () => {
    const urls = resolveSourceUrls('ai', undefined)
    expect(urls.length).toBe(getNewsTopicSources('ai').length)
    expect(urls[0].url).toMatch(/^https?:\/\//)
  })

  it('自定义 URL：JSON 字符串数组', () => {
    const urls = resolveSourceUrls(undefined, '["https://a.com","https://b.com"]')
    expect(urls.map(u => u.url)).toEqual(['https://a.com', 'https://b.com'])
  })

  it('自定义 URL：JSON 对象数组（name+url）', () => {
    const urls = resolveSourceUrls(undefined, '[{"name":"A","url":"https://a.com"}]')
    expect(urls).toEqual([{ name: 'A', url: 'https://a.com' }])
  })

  it('自定义 URL：逗号/换行分隔的普通文本', () => {
    const urls = resolveSourceUrls(undefined, 'https://a.com,\nhttps://b.com')
    expect(urls.map(u => u.url)).toEqual(['https://a.com', 'https://b.com'])
  })

  it('预置主题与自定义 URL 合并且跨源去重', () => {
    const first = getNewsTopicSources('ai')[0].url
    const urls = resolveSourceUrls('ai', `["${first}","https://custom.com"]`)
    const all = urls.map(u => u.url)
    expect(new Set(all).size).toBe(all.length)
    expect(all).toContain('https://custom.com')
    expect(all).toContain(first)
  })

  it('过滤非 http(s) 与空', () => {
    const urls = resolveSourceUrls(undefined, '["ftp://x.com","","javascript:void(0)","https://ok.com"]')
    expect(urls.map(u => u.url)).toEqual(['https://ok.com'])
  })

  it('无主题无自定义 URL → 空数组', () => {
    expect(resolveSourceUrls(undefined, undefined)).toEqual([])
    expect(resolveSourceUrls('', '')).toEqual([])
  })
})

describe('crawl-news 目录注册', () => {
  it('crawl-news 存在于节点目录', () => {
    expect(NODE_TYPE_CATALOG_MAP['crawl-news']).toBeDefined()
  })
})
