/**
 * 信息搜集：转载簇识别与主源选择（纯函数，双端可用）
 * @module shared/utils/info-collection-cluster
 *
 * 背景（主设计 §3 阶段 3）：同一篇内容常被多处转载——同簇内按"发布时间最早 +
 * 等级最高"选主源，其余为佐证源。簇判定只影响主源选择与去重，**不删内容**
 * （宁漏勿杀：指纹不足 100 有效字符不参与聚类）。
 *
 * 一手优先原则的执行点：后续发现更高级一手源时主源**升级**而非并排堆放
 * （重新运行 adjudicateProject 即可，主源是派生结论不是存储事实）。
 */

import { fingerprintSimilarity, type IcFingerprint } from './info-collection-fingerprint'

export interface IcClusterInput {
  sourceId: string
  /** IcFingerprint JSON 字符串（ic_sources.text_fingerprint）或已解析对象；无效 → 不参与聚类 */
  fingerprint: string | IcFingerprint | null
  /** 信源分级（1 最高） */
  tier: number | null
  /** 发布时间（越早越可能是首发） */
  publishedAt: string | Date | null
}

export interface IcSourceCluster {
  clusterId: string
  primaryId: string
  memberIds: string[]
}

export interface IcClusterResult {
  clusters: IcSourceCluster[]
  /** sourceId → clusterId（未聚簇 → 自身单例 id） */
  clusterOf: Map<string, string>
  /** sourceId → 所在簇主源（单例 → 自身） */
  primaryOf: Map<string, string>
}

const CLUSTER_SIMILARITY = 0.8

function parseFingerprint(fp: IcClusterInput['fingerprint']): IcFingerprint | null {
  if (!fp) return null
  if (typeof fp !== 'string') return fp.chars >= 100 && fp.sampled ? fp : null
  try {
    const parsed = JSON.parse(fp) as IcFingerprint
    return parsed && typeof parsed === 'object' && parsed.chars >= 100 && parsed.sampled ? parsed : null
  } catch {
    return null
  }
}

function timeOf(v: IcClusterInput['publishedAt']): number {
  if (!v) return Number.POSITIVE_INFINITY // 无发布时间视为最晚（time-unknown 不得当首发）
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime()
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
}

/** 聚类 + 主源选择。确定性：同输入永远同输出（主源平局按 sourceId 兜底）。 */
export function clusterSources(inputs: IcClusterInput[]): IcClusterResult {
  const items = inputs
    .map(i => ({ ...i, fp: parseFingerprint(i.fingerprint) }))
    .filter(i => !!i.sourceId)

  // 并查集聚类（O(n²) 两两比对；量级为单项目源数（数十），足够）
  const parent = items.map((_, i) => i)
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])))
  const union = (a: number, b: number): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb)
  }
  for (let i = 0; i < items.length; i++) {
    if (!items[i].fp) continue
    for (let j = i + 1; j < items.length; j++) {
      if (!items[j].fp) continue
      if (fingerprintSimilarity(items[i].fp!, items[j].fp!) >= CLUSTER_SIMILARITY) union(i, j)
    }
  }

  const groups = new Map<number, number[]>()
  items.forEach((_, i) => {
    const root = find(i)
    const list = groups.get(root) ?? []
    list.push(i)
    groups.set(root, list)
  })

  const clusterOf = new Map<string, string>()
  const primaryOf = new Map<string, string>()
  const clusters: IcSourceCluster[] = []

  for (const members of groups.values()) {
    const sorted = members
      .map(i => items[i])
      .sort((a, b) => {
        const t = timeOf(a.publishedAt) - timeOf(b.publishedAt)
        if (t !== 0) return t
        const tierA = a.tier ?? 99
        const tierB = b.tier ?? 99
        if (tierA !== tierB) return tierA - tierB
        return a.sourceId < b.sourceId ? -1 : 1
      })
    const primary = sorted[0]
    const isMulti = sorted.length > 1
    const clusterId = isMulti ? `cl-${primary.sourceId}` : primary.sourceId
    for (const m of sorted) {
      clusterOf.set(m.sourceId, clusterId)
      primaryOf.set(m.sourceId, primary.sourceId)
    }
    if (isMulti) {
      clusters.push({ clusterId, primaryId: primary.sourceId, memberIds: sorted.map(m => m.sourceId) })
    }
  }

  return { clusters, clusterOf, primaryOf }
}
