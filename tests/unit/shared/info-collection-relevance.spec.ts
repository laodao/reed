/**
 * 候选相关性过滤单测（info-collection-relevance）
 * @module tests/unit/shared/info-collection-relevance.spec
 *
 * 来源：2026-10-08 真实联网验收——bing-web 只搜首词返回"中国"百科/门户，
 * 候选级相关性闸把跑题源挡在抓取预算外。
 */
import { describe, it, expect } from 'vitest'
import { isCandidateRelevant, querySegments } from '@shared/utils/info-collection-relevance'

describe('querySegments', () => {
  it('按空白/标点拆分，保留 ≥2 字片段', () => {
    expect(querySegments('中国高铁 营业里程 4.8万公里')).toEqual(['中国高铁', '营业里程', '4.8万公里'])
    expect(querySegments('a b 高铁')).toEqual(['高铁'])
    expect(querySegments('')).toEqual([])
  })
})

describe('isCandidateRelevant', () => {
  const query = '中国高铁 营业里程 4.8万公里'

  it('标题含查询片段 → 相关（baidu 实测的好结果）', () => {
    expect(isCandidateRelevant('4.8万公里!我国高铁运营里程再创新纪录__中国政府网', '', query)).toBe(true)
  })

  it('标题跑题但摘含有片段 → 相关（不误杀）', () => {
    expect(isCandidateRelevant('国务院新闻办发布会', '截至2024年底高铁营业里程达4.8万公里', query)).toBe(true)
  })

  it('标题摘含全无片段（bing 的"中国"百科噪音）→ 跑题剔除', () => {
    expect(isCandidateRelevant('中华人民共和国_百度百科', '', query)).toBe(false)
    expect(isCandidateRelevant('中国政府网_中央人民政府门户网站', '中国政府网', query)).toBe(false)
  })

  it('查询无可拆片段 → 不设闸（全放行）', () => {
    expect(isCandidateRelevant('任意标题', '', 'a')).toBe(true)
  })
})
