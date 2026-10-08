/**
 * 冶炼层公共件（v2 P1）
 * @module platform/services/kb-brain/smelt-common
 *
 * 聚类（与 distill 同口径的贪心种子聚类/余弦阈值）、成卡门槛、卡实例合并、
 * published 直发（A3 决策：冶炼产物带验证门槛，不走人审队列）、默认嵌入绑定。
 */
import type { KbNoteRepository, KbNoteInput, KbNoteRecord } from '@core/database/repositories/kb-note.repository'

/** 聚类余弦阈值（与 distill 同款） */
export const SMELT_COSINE_THRESHOLD = 0.72

/** 冶炼成品卡类型（检索加权与 brain-pack 取材的口径：成品知识优先于裸论断碎片） */
export const SMELT_CARD_NOTE_TYPES = [
  'plot-pattern',
  'setting-pattern',
  'principle',
  'craft-case',
  'genre-insight',
  'anti-pattern',
] as const

/** 簇内实例上限（送 LLM 的样本上限；实例登记另计） */
export const SMELT_CLUSTER_MAX = 30

/** 套路成卡门槛（v2 设计 §9：max(8, 该类事件数 × 2%)——绝对下限 + 大库相对门槛） */
export function cardThreshold(bucketSize: number): number {
  return Math.max(8, Math.ceil(bucketSize * 0.02))
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / Math.sqrt(na * nb)
}

/** 贪心种子聚类（泛型版；簇超上限起新簇） */
export function clusterSimilar<T>(items: T[], vectors: number[][], threshold = SMELT_COSINE_THRESHOLD, maxPerCluster = SMELT_CLUSTER_MAX): T[][] {
  const clusters: Array<{ items: T[]; centroid: number[] }> = []
  const dim = vectors[0]?.length ?? 0
  for (let i = 0; i < items.length; i++) {
    const v = vectors[i]!
    let best: { idx: number; sim: number } | null = null
    for (let c = 0; c < clusters.length; c++) {
      const sim = cosine(v, clusters[c]!.centroid)
      if (sim >= threshold && (!best || sim > best.sim)) best = { idx: c, sim }
    }
    if (best && clusters[best.idx]!.items.length < maxPerCluster) {
      const cl = clusters[best.idx]!
      cl.items.push(items[i]!)
      const n = cl.items.length
      for (let d = 0; d < dim; d++) cl.centroid[d] = (cl.centroid[d]! * (n - 1) + v[d]!) / n
    } else {
      clusters.push({ items: [items[i]!], centroid: [...v] })
    }
  }
  return clusters.map((c) => c.items)
}

/** 与质心最相似的 top-k（案例选样用；无向量时返回前 k） */
export function topByCentrality<T>(items: T[], vectors: number[][], k: number): T[] {
  if (items.length === 0) return []
  if (vectors.length !== items.length) return items.slice(0, k)
  const dim = vectors[0]!.length
  const centroid = new Array<number>(dim).fill(0)
  vectors.forEach((v) => {
    for (let d = 0; d < dim; d++) centroid[d]! += v[d]!
  })
  for (let d = 0; d < dim; d++) centroid[d] = centroid[d]! / vectors.length
  return items
    .map((item, i) => ({ item, sim: cosine(vectors[i]!, centroid) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k)
    .map((x) => x.item)
}

/**
 * 冶炼卡直发（A3 决策）：propose 起步随即 publish（无改写 → version 保持 1）。
 * 与 distill 人审产线的差异由 tags['smelt'] 标记。
 * P4 质量门回接：review 模式下只 propose（进待审队列）——滚动抽检均分低于阈值时
 * 自动降级，恢复后回到直发；返回 record 供动作日志登记 noteIds。
 */
export async function publishSmeltCard(
  notes: KbNoteRepository,
  kbId: string,
  input: KbNoteInput,
  opts?: { review?: boolean },
): Promise<KbNoteRecord> {
  const tags = input.tags ?? '["smelt"]'
  const proposed = await notes.propose(kbId, { ...input, tags })
  if (opts?.review) return proposed
  const published = await notes.publish(proposed.id)
  return published ?? proposed
}

/**
 * 实例登记合并（重跑演进）：旧 entries + 新 entries 按 eventId（无 eventId 按 quote）
 * 去重——套路卡随原料增长吸收新实例，不重复计数。
 */
export function mergeInstanceEntries(existingJson: string | null, incoming: Array<Record<string, unknown>>): {
  merged: Array<Record<string, unknown>>
  added: number
} {
  let existing: Array<Record<string, unknown>> = []
  try {
    existing = existingJson ? (JSON.parse(existingJson) as Array<Record<string, unknown>>) : []
  } catch {
    existing = []
  }
  const keyOf = (e: Record<string, unknown>): string => String(e.eventId ?? e.noteId ?? e.quote ?? JSON.stringify(e).slice(0, 80))
  const seen = new Set(existing.map(keyOf))
  const merged = [...existing]
  let added = 0
  for (const e of incoming) {
    const k = keyOf(e)
    if (seen.has(k)) continue
    seen.add(k)
    merged.push(e)
    added += 1
  }
  return { merged, added }
}

/**
 * 生产默认嵌入：宿主 KB 服务的嵌入调用（动态 import 防 import 环）。
 *
 * brain 侧是**降级型**消费（嵌入失败 → 按 type 分组 / 空向量中心度），因此这里保留
 * 「返回 null 走降级」的契约；但真实原因必须打进日志——此前 `catch {}` 静默吞掉，
 * 检索/聚类质量下降时完全无从排查（与 KB 文档处理「只报向量生成失败」同源）。
 */
export async function defaultBrainEmbed(texts: string[], kb: { id: string; embeddingConfig: string | null }): Promise<number[][] | null> {
  try {
    const { KnowledgeBaseService } = await import('@core/platform/services/knowledge-base.service')
    const svc = new KnowledgeBaseService()
    return await svc.getEmbeddingVectors(texts, kb.embeddingConfig ? (JSON.parse(kb.embeddingConfig) as Record<string, unknown>) : {})
  } catch (e: unknown) {
    console.warn(
      `[BrainEmbed] 嵌入失败，走降级路径: ${e instanceof Error ? e.message : String(e)}`,
    )
    return null
  }
}

/**
 * 降级型嵌入调用的安全包装：失败返回 null 并记录真实原因。
 * 供 distill / entity-summary 等「无向量也能继续」的 brain 服务复用，
 * 避免各处重复 `catch {}` 吞掉原因。
 */
export async function safeBrainEmbed(
  embedFn: (texts: string[], kb: { id: string; embeddingConfig: string | null }) => Promise<number[][]>,
  texts: string[],
  kb: { id: string; embeddingConfig: string | null },
  context: string,
): Promise<number[][] | null> {
  try {
    return await embedFn(texts, kb)
  } catch (e: unknown) {
    console.warn(
      `[BrainEmbed] ${context} 嵌入失败，走降级路径: ${e instanceof Error ? e.message : String(e)}`,
    )
    return null
  }
}
