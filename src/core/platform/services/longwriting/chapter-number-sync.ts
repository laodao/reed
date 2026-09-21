/**
 * 章节号级联同步（天下捕快实跑修复 2026-09-21）
 * @module core/platform/services/longwriting/chapter-number-sync
 *
 * 实测背景（天下捕快）：先按旧编号写完 8 章再插入新第 1 章，插入路径只改了
 * 大纲名与状态摘要，events / 实体状态快照 / 伏笔台账 / 关系边有效期 / 预写卡
 * 头部章号全部留在旧号上——伏笔逾期、前情事实表、"最新状态"等按章号查询的
 * 检查从此系统性错位（差 1 甚至差几十章）。
 *
 * 本模块是章号级联的唯一实现：结构变更（增/删/移/改父）前后各取一次文档序，
 * 产出旧号→新号映射，把所有"按章号键挂的伴生数据"整体搬到新号上。
 * - 幂等：映射为空（编号没变）时是纯 no-op，updateOutline 高频调用无代价。
 * - 逐行按主键更新 + 事务包裹：避免交换式移动（5↔6）时的瞬时覆盖。
 * - 手工数据一并搬移：语义统一为"伴生数据里的章号跟随大纲结构"——用户手工
 *   写的伏笔章号在插章后同样会失准，与其区分不如一致搬移。
 */

import type { OutlineDocOrder } from './outline-order'

/** 旧章号 → 新章号；只含有变化的键 */
export type ChapterNoMapping = Map<number, number>

export interface ChapterNoDiff {
  mapping: ChapterNoMapping
  /** 新出现的章号（新节点，无伴生数据需要搬） */
  added: number[]
  /** 消失的章号（被删节点；伴生数据由删除级联清理，不在此处理） */
  removed: number[]
}

/**
 * 对比结构变更前后的文档序，产出章号搬移映射。
 * 两个 docOrder 必须来自同一个项目（before 缺失的节点=新增，after 缺失的=被删）。
 */
export function diffChapterNumbers(before: OutlineDocOrder, after: OutlineDocOrder): ChapterNoDiff {
  const oldByNode = new Map<string, number>()
  for (const [nodeId, no] of before.leafNumbers) oldByNode.set(nodeId, no)
  const mapping: ChapterNoMapping = new Map()
  const added: number[] = []
  const removedIds = new Set(oldByNode.keys())
  for (const [nodeId, newNo] of after.leafNumbers) {
    const oldNo = oldByNode.get(nodeId)
    if (oldNo === undefined) {
      added.push(newNo)
      continue
    }
    removedIds.delete(nodeId)
    if (oldNo !== newNo) mapping.set(oldNo, newNo)
  }
  const removed = [...removedIds].map((id) => before.leafNumbers.get(id)!).filter((n) => n > 0)
  return { mapping, added, removed }
}

export interface ChapterNoSyncReport {
  /** 各表搬移行数 */
  events: number
  entityStates: number
  foreshadows: number
  graphEdges: number
  stateSummaries: number
  prewriteHeaders: number
}

/** 把一行里的章号字段按映射搬移（保持未命中字段原样） */
function remapChapterNo(value: number | null | undefined, mapping: ChapterNoMapping): number | null | undefined {
  if (value === null || value === undefined) return value
  return mapping.get(value) ?? value
}

/** develop_chapters 之类的 JSON 数组字段：逐元素搬移 */
function remapChapterNoJsonArray(text: string | null | undefined, mapping: ChapterNoMapping): string | null | undefined {
  if (!text) return text
  try {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return text
    const next = parsed.map((n: unknown) => (typeof n === 'number' ? (mapping.get(n) ?? n) : n))
    return JSON.stringify(next)
  } catch {
    return text
  }
}

/**
 * 把伴生数据的章号整体搬到映射后的新号上（事务内逐行按主键更新）。
 * 这些表在章号列上均无唯一约束，逐行更新不会瞬时不一致。
 */
export async function syncCompanionChapterNumbers(
  db: any,
  projectId: string,
  diff: ChapterNoDiff,
): Promise<ChapterNoSyncReport> {
  const report: ChapterNoSyncReport = { events: 0, entityStates: 0, foreshadows: 0, graphEdges: 0, stateSummaries: 0, prewriteHeaders: 0 }
  if (diff.mapping.size === 0 || !db?.dataSource) return report
  const mapping = diff.mapping
  const { LwEventEntity } = await import('@core/database/entities/lw-event.entity')
  const { LwEntityStateEntity } = await import('@core/database/entities/lw-entity-state.entity')
  const { LwForeshadowEntity } = await import('@core/database/entities/lw-foreshadow.entity')
  const { LwGraphEdgeEntity } = await import('@core/database/entities/lw-graph-edge.entity')
  const { LwChapterStateSummaryEntity } = await import('@core/database/entities/lw-chapter-state-summary.entity')

  await db.dataSource.transaction(async (em: any) => {
    const events = await em.getRepository(LwEventEntity).find({ where: { projectId } })
    for (const row of events) {
      const next = remapChapterNo(row.chapterNumber, mapping)
      if (next !== row.chapterNumber) {
        await em.update(LwEventEntity, { id: row.id }, { chapterNumber: next })
        report.events++
      }
    }

    const states = await em.getRepository(LwEntityStateEntity).find({ where: { projectId } })
    for (const row of states) {
      const next = remapChapterNo(row.chapterNumber, mapping)
      if (next !== row.chapterNumber) {
        await em.update(LwEntityStateEntity, { id: row.id }, { chapterNumber: next })
        report.entityStates++
      }
    }

    const foreshadows = await em.getRepository(LwForeshadowEntity).find({ where: { projectId } })
    for (const row of foreshadows) {
      const patch: Record<string, unknown> = {}
      const planted = remapChapterNo(row.plantedChapter, mapping)
      const payoff = remapChapterNo(row.payoffChapter, mapping)
      const rolledTo = remapChapterNo(row.rolledTo, mapping)
      const develop = remapChapterNoJsonArray(row.developChapters, mapping)
      if (planted !== row.plantedChapter) patch.plantedChapter = planted
      if (payoff !== row.payoffChapter) patch.payoffChapter = payoff
      if (rolledTo !== row.rolledTo) patch.rolledTo = rolledTo
      if (develop !== row.developChapters) patch.developChapters = develop
      if (Object.keys(patch).length > 0) {
        await em.update(LwForeshadowEntity, { id: row.id }, patch)
        report.foreshadows++
      }
    }

    const edges = await em.getRepository(LwGraphEdgeEntity).find({ where: { projectId } })
    for (const row of edges) {
      const patch: Record<string, unknown> = {}
      const from = remapChapterNo(row.validFromChapter, mapping)
      const until = remapChapterNo(row.validUntilChapter, mapping)
      if (from !== row.validFromChapter) patch.validFromChapter = from
      if (until !== row.validUntilChapter) patch.validUntilChapter = until
      if (Object.keys(patch).length > 0) {
        await em.update(LwGraphEdgeEntity, { id: row.id }, patch)
        report.graphEdges++
      }
    }

    const summaries = await em.getRepository(LwChapterStateSummaryEntity).find({ where: { projectId } })
    for (const row of summaries) {
      const next = remapChapterNo(row.chapterNumber, mapping)
      if (next !== row.chapterNumber) {
        await em.update(LwChapterStateSummaryEntity, { id: row.id }, { chapterNumber: next })
        report.stateSummaries++
      }
    }
  })

  return report
}

/**
 * 同步预写卡头部章号：把 `## 本章设计卡（…）` 首行重写为当前章号与大纲名。
 * 只有头部是代码生成的确定性片段，卡片正文不动。
 */
export async function syncPrewriteCardHeaders(
  db: any,
  outlinesById: Map<string, { name: string; no: number }>,
): Promise<number> {
  if (!db?.lwPrewrites) return 0
  let fixed = 0
  for (const [outlineId, meta] of outlinesById) {
    const pre = await db.lwPrewrites.getByOutlineId(outlineId)
    const content: string | undefined = pre?.content
    if (!content) continue
    const m = content.match(/^## 本章设计卡（[^）]*）/)
    if (!m) continue
    const expect = `## 本章设计卡（第${meta.no}章 ${meta.name}）`
    if (m[0] === expect) continue
    await db.lwPrewrites.update(outlineId, { content: expect + content.slice(m[0].length) })
    fixed++
  }
  return fixed
}

/**
 * 结构变更后的一站式级联：搬移伴生数据章号 + 修正受影响章节的预写卡头。
 * 调用方需传入变更前后的 docOrder 与全量节点列表（name 用于重写卡头）。
 */
export async function cascadeChapterNumberChange(
  db: any,
  projectId: string,
  before: OutlineDocOrder,
  after: OutlineDocOrder,
  allNodes: Array<{ id: string; name?: string }>,
): Promise<ChapterNoSyncReport> {
  const diff = diffChapterNumbers(before, after)
  const report = await syncCompanionChapterNumbers(db, projectId, diff)

  if (diff.mapping.size > 0 && db?.lwPrewrites) {
    const changedNos = new Set(diff.mapping.values())
    const byId = new Map<string, { name: string; no: number }>()
    for (const [nodeId, no] of after.leafNumbers) {
      if (!changedNos.has(no)) continue
      const node = allNodes.find((n) => n.id === nodeId)
      if (node?.name) byId.set(nodeId, { name: node.name, no })
    }
    report.prewriteHeaders = await syncPrewriteCardHeaders(db, byId)
  }
  return report
}
