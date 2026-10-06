/**
 * 知识大脑产物·删文档级联清理（v2 P0，深审 B5 修复）
 * @module platform/services/kb-brain/artifact-cleanup
 *
 * deleteDocument 原本只清 chunk/向量/倒排/章节——大脑产物（论断/场面/台账）
 * 与跨文档产物（卡片的 evidence/pattern_instances 引用）全部残留，多书品类库
 * 删 1/20 本会让冶炼池与频率统计永久变脏。本模块按「per-document 产物删除、
 * 跨文档产物剔引用」的语义清理，每阶段独立 fail-soft（旧库缺表不阻塞删文档）。
 */
import { createLogger } from '@core/utils/logger'

const logger = createLogger('KbBrainCleanup')

/** 结构化依赖（测试可注入内存仓储；生产由调用方从 dbManager 取） */
export interface ArtifactCleanupDeps {
  atoms?: {
    deleteByDocument(documentId: string): Promise<Array<{ id: string }>>
  } | null
  events?: {
    deleteByDocument(documentId: string): Promise<void>
    findByDocument?(documentId: string): Promise<Array<{ id: string }>>
  } | null
  edges?: {
    deleteBySourceIds(sourceKind: 'atom', ids: string[]): Promise<void>
    deleteByTargetIds(targetKind: 'atom', ids: string[]): Promise<void>
  } | null
  passes?: { deleteByDocument(documentId: string): Promise<void> } | null
  notes?: { pruneDocumentReferences(kbId: string, documentId: string): Promise<number> } | null
  vectors?: { deleteByChunkIds(chunkIds: string[]): Promise<void> } | null
}

export interface ArtifactCleanupResult {
  atoms: number
  events: number
  edges: boolean
  passes: boolean
  notesPruned: number
}

/** 单阶段 fail-soft 执行器 */
async function soft(stage: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn()
    return true
  } catch (e) {
    logger.warn(`[kb-brain-cleanup] ${stage} 失败（不阻塞删文档）: ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}

export async function cleanupBrainArtifactsForDocument(
  kbId: string,
  documentId: string,
  deps: ArtifactCleanupDeps,
): Promise<ArtifactCleanupResult> {
  const out: ArtifactCleanupResult = { atoms: 0, events: 0, edges: false, passes: false, notesPruned: 0 }

  // 1. 论断（per-document）：删除前收集 id——边与向量级联要用
  const atomIds: string[] = []
  await soft('atoms', async () => {
    const removed = (await deps.atoms?.deleteByDocument(documentId)) ?? []
    atomIds.push(...removed.map((r) => r.id))
    out.atoms = removed.length
  })

  // 2. 场面事件（per-document）+ 向量 id 收集（event: 命名空间行）
  const eventIds: string[] = []
  await soft('events', async () => {
    const found = await deps.events?.findByDocument?.(documentId)
    if (found) eventIds.push(...found.map((r) => r.id))
    await deps.events?.deleteByDocument(documentId)
    out.events = eventIds.length
  })

  // 3. 语义边：以被删论断为端点（source 或 target）的边一并删除
  await soft('edges', async () => {
    if (!deps.edges || atomIds.length === 0) return
    await deps.edges.deleteBySourceIds('atom', atomIds)
    await deps.edges.deleteByTargetIds('atom', atomIds)
    out.edges = true
  })

  // 4. 消化台账（per-document）
  await soft('passes', async () => {
    await deps.passes?.deleteByDocument(documentId)
    out.passes = true
  })

  // 5. 卡片引用剔除（跨文档产物：evidence 锚点 + pattern_instances 实例条目）
  await soft('notes', async () => {
    out.notesPruned = (await deps.notes?.pruneDocumentReferences(kbId, documentId)) ?? 0
  })

  // 6. 命名空间向量（atom:/event: 伪 chunkId 行——deleteByDocumentId 只认 chunk 自身 id）
  await soft('vectors', async () => {
    const ids = [...atomIds.map((id) => `atom:${id}`), ...eventIds.map((id) => `event:${id}`)]
    if (ids.length > 0) await deps.vectors?.deleteByChunkIds(ids)
  })

  if (out.atoms > 0 || out.events > 0 || out.notesPruned > 0) {
    logger.info(
      `[kb-brain-cleanup] doc=${documentId} 级联完成: 论断=${out.atoms} 场面=${out.events} 卡片剔引用=${out.notesPruned}`,
    )
  }
  return out
}
