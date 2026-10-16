/**
 * Personalized PageRank（平台层通用图算法，详细设计 §5.2）
 * @module platform/services/graph/ppr
 *
 * 消费者：知识大脑图多跳（kb-brain）、长文图谱（lw，后续自愿接入）。
 * 纯函数、无依赖、幂迭代（iterations 上限 + eps 收敛）；毫秒级本地计算、零 LLM。
 */

export interface PPRGraph {
  nodes: string[]
  /** [source, target, weight≥0]——有向边；PPR 扩散按出边正向走 */
  edges: Array<[string, string, number]>
}

export interface PPROptions {
  damping?: number
  iterations?: number
  eps?: number
}

/**
 * Personalized PageRank：seeds 为初始概率分布（节点→权重，自动归一化）。
 * 返回全图节点的 PPR 分数 Map（含 seeds 自身——重启项保底）。
 * 孤立节点得分为 damping * seedShare（无出边时概率全部走重启）。
 */
export function personalizedPageRank(
  graph: PPRGraph,
  seeds: Map<string, number>,
  opts?: PPROptions,
): Map<string, number> {
  const damping = opts?.damping ?? 0.85
  const maxIterations = opts?.iterations ?? 20
  const eps = opts?.eps ?? 1e-6

  const seedTotal = [...seeds.values()].reduce((s, v) => s + Math.max(0, v), 0)
  const scores = new Map<string, number>()
  if (graph.nodes.length === 0 || seedTotal <= 0) return scores

  // 归一化种子
  const seedProbs = new Map<string, number>()
  for (const [node, w] of seeds) {
    if (w > 0) seedProbs.set(node, w / seedTotal)
  }

  // 出边表（按权重归一：节点出边权重和为 1）
  const outEdges = new Map<string, Array<{ to: string; w: number }>>()
  const outWeight = new Map<string, number>()
  for (const [from, to, w] of graph.edges) {
    if (w <= 0) continue
    outWeight.set(from, (outWeight.get(from) ?? 0) + w)
    if (!outEdges.has(from)) outEdges.set(from, [])
    outEdges.get(from)!.push({ to, w })
  }
  for (const [from, edges] of outEdges) {
    const total = outWeight.get(from) ?? 1
    for (const e of edges) e.w = e.w / total
  }

  // 初始分布 = 种子
  let current = new Map(seedProbs)

  for (let iter = 0; iter < maxIterations; iter++) {
    const next = new Map<string, number>()
    // 重启项
    for (const [node, p] of seedProbs) {
      next.set(node, (next.get(node) ?? 0) + damping * p)
    }
    // 沿边扩散
    for (const [from, p] of current) {
      const edges = outEdges.get(from)
      if (!edges || edges.length === 0) continue
      for (const { to, w } of edges) {
        next.set(to, (next.get(to) ?? 0) + damping * p * w)
      }
    }
    // L1 归一化（悬挂质量的概率经重启项回流，残余按 1-damping 归一）
    let sum = 0
    for (const v of next.values()) sum += v
    if (sum > 0) {
      for (const [node, v] of next) next.set(node, v / sum)
    }

    // 收敛判定
    let delta = 0
    for (const [node, v] of next) delta += Math.abs(v - (current.get(node) ?? 0))
    for (const [node, v] of current) delta += Math.abs(v - (next.get(node) ?? 0))
    current = next
    if (delta < eps) break
  }

  for (const [node, v] of current) scores.set(node, v)
  return scores
}
