/**
 * 转载簇引擎单测（info-collection-cluster）
 * @module tests/unit/shared/info-collection-cluster.spec
 *
 * 钉死：同文聚簇（相似度 ≥0.8）、主源选择（发布最早 > 等级最高 > id 兜底）、
 * 单例不成簇、无指纹不参与、确定性。
 */
import { describe, it, expect } from 'vitest'
import { clusterSources, type IcClusterInput } from '@shared/utils/info-collection-cluster'
import { fingerprintText } from '@shared/utils/info-collection-fingerprint'

/** 造足够长的正文（>100 有效字符） */
function longText(seed: string): string {
  return (
    `${seed}：根据官方统计部门公布的数据，本年度经济运行总体平稳。` +
    '全年出生人口954万人，人口出生率为6.77‰；死亡人口1093万人，人口死亡率为7.76‰。' +
    '从性别构成看，男性人口71909万人，女性人口68919万人，总人口性别比为104.34。'.repeat(3)
  )
}

function fp(text: string): string {
  return JSON.stringify(fingerprintText(text))
}

function input(over: Partial<IcClusterInput> & { sourceId: string }): IcClusterInput {
  return { fingerprint: null, tier: null, publishedAt: null, ...over }
}

describe('clusterSources', () => {
  it('同文不同站点 → 聚为一簇；发布最早且等级最高者为主源', () => {
    const text = longText('A')
    const repost = text.replace('总体平稳', '总体平稳') // 同文（转载常带排版差异）
    const result = clusterSources([
      input({ sourceId: 's-late-official', fingerprint: fp(text), tier: 1, publishedAt: '2025-03-01' }),
      input({ sourceId: 's-early-media', fingerprint: fp(repost), tier: 3, publishedAt: '2025-01-01' }),
    ])
    expect(result.clusters).toHaveLength(1)
    const c = result.clusters[0]
    // 发布时间最早的当主源（首发判定优先于等级）
    expect(c.primaryId).toBe('s-early-media')
    expect(c.memberIds).toContain('s-late-official')
    expect(result.clusterOf.get('s-late-official')).toBe(c.clusterId)
    expect(result.primaryOf.get('s-early-media')).toBe('s-early-media')
  })

  it('同时间发布 → 等级高者为主源', () => {
    const text = longText('B')
    const result = clusterSources([
      input({ sourceId: 's-media', fingerprint: fp(text), tier: 3, publishedAt: '2025-01-01' }),
      input({ sourceId: 's-official', fingerprint: fp(text), tier: 1, publishedAt: '2025-01-01' }),
    ])
    expect(result.clusters[0].primaryId).toBe('s-official')
  })

  it('不同正文 → 各自单例，不成簇', () => {
    const a = longText('甲主题 completely different one')
    const b = longText('乙主题 totally another piece').replace(/954|1093|71909|68919/g, m => String(Number(m) + 5)) + '乙主题独有的补充段落，内容与另一篇完全不同。'
    const result = clusterSources([
      input({ sourceId: 's-a', fingerprint: fp(a), publishedAt: '2025-01-01' }),
      input({ sourceId: 's-b', fingerprint: fp(b), publishedAt: '2025-01-02' }),
    ])
    expect(result.clusters).toHaveLength(0)
    expect(result.clusterOf.get('s-a')).toBe('s-a')
    expect(result.primaryOf.get('s-b')).toBe('s-b')
  })

  it('无指纹/短指纹 → 不参与聚类（宁漏勿杀）', () => {
    const result = clusterSources([
      input({ sourceId: 's-1', fingerprint: null }),
      input({ sourceId: 's-2', fingerprint: JSON.stringify({ version: 'fp1', sampled: '', chars: 3 }) }),
      input({ sourceId: 's-3', fingerprint: '坏 JSON' }),
    ])
    expect(result.clusters).toHaveLength(0)
    expect(result.clusterOf.get('s-1')).toBe('s-1')
    expect(result.clusterOf.get('s-2')).toBe('s-2')
    expect(result.clusterOf.get('s-3')).toBe('s-3')
  })

  it('确定性：同输入两次运行结果一致', () => {
    const inputs = [
      input({ sourceId: 's-1', fingerprint: fp(longText('C')), tier: 2, publishedAt: '2025-02-01' }),
      input({ sourceId: 's-2', fingerprint: fp(longText('C')), tier: 3, publishedAt: '2025-01-01' }),
    ]
    expect(clusterSources(inputs)).toEqual(clusterSources(inputs))
  })
})
