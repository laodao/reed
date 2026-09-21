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
 * 把伴生数据的章号整体搬到映射后的新号上（事务内两阶段更新）。
 * lw_entity_state_snapshots 上有 UNIQUE(project, entity_type, entity_id, chapter_number)
 * （实测踩中）：交换式移动（5↔6）或顺序不当的逐行更新会撞即时唯一约束。
 * 两阶段：先把所有待搬行置为负目标值（负数域恒空闲且互异），再把全部目标位
 * 腾空后一次性归位。映射的像集只含被腾空/新增的章号，第二阶段无碰撞。
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

  /** 单行章号字段的负数化补丁（仅列变化的字段；目标值相同视为无变化） */
  const negate = (current: number | null | undefined): number | null | undefined => {
    const next = remapChapterNo(current, mapping)
    if (next === current) return current
    return next === null || next === undefined ? next : -Math.abs(next)
  }

  await db.dataSource.transaction(async (em: any) => {
    // ---- 阶段1：全部待搬行负数化；阶段2：归位 ----
    const events = await em.getRepository(LwEventEntity).find({ where: { projectId } })
    const moveEvents = events.filter((r: any) => remapChapterNo(r.chapterNumber, mapping) !== r.chapterNumber)
    for (const r of moveEvents) await em.update(LwEventEntity, { id: r.id }, { chapterNumber: negate(r.chapterNumber) })
    for (const r of moveEvents) {
      await em.update(LwEventEntity, { id: r.id }, { chapterNumber: remapChapterNo(r.chapterNumber, mapping) })
      report.events++
    }

    const states = await em.getRepository(LwEntityStateEntity).find({ where: { projectId } })
    const moveStates = states.filter((r: any) => remapChapterNo(r.chapterNumber, mapping) !== r.chapterNumber)
    for (const r of moveStates) await em.update(LwEntityStateEntity, { id: r.id }, { chapterNumber: negate(r.chapterNumber) })
    for (const r of moveStates) {
      await em.update(LwEntityStateEntity, { id: r.id }, { chapterNumber: remapChapterNo(r.chapterNumber, mapping) })
      report.entityStates++
    }

    const foreshadows = await em.getRepository(LwForeshadowEntity).find({ where: { projectId } })
    const foreshadowPatch = (r: any, sign: 1 | -1): Record<string, unknown> | null => {
      const patch: Record<string, unknown> = {}
      const planted = remapChapterNo(r.plantedChapter, mapping)
      const payoff = remapChapterNo(r.payoffChapter, mapping)
      const rolledTo = remapChapterNo(r.rolledTo, mapping)
      const developRaw = remapChapterNoJsonArray(r.developChapters, mapping)
      if (planted !== r.plantedChapter) patch.plantedChapter = sign === -1 ? -Math.abs(planted as number) : planted
      if (payoff !== r.payoffChapter) patch.payoffChapter = sign === -1 && payoff != null ? -Math.abs(payoff) : payoff
      if (rolledTo !== r.rolledTo) patch.rolledTo = sign === -1 && rolledTo != null ? -Math.abs(rolledTo) : rolledTo
      if (developRaw !== r.developChapters) {
        patch.developChapters = sign === -1
          ? String(developRaw ?? '').replace(/\d+/g, (d) => `-${d}`)
          : developRaw
      }
      return Object.keys(patch).length > 0 ? patch : null
    }
    const moveForeshadows = foreshadows.filter((r: any) => foreshadowPatch(r, -1) !== null)
    for (const r of moveForeshadows) await em.update(LwForeshadowEntity, { id: r.id }, foreshadowPatch(r, -1)!)
    for (const r of moveForeshadows) {
      await em.update(LwForeshadowEntity, { id: r.id }, foreshadowPatch(r, 1)!)
      report.foreshadows++
    }

    const edges = await em.getRepository(LwGraphEdgeEntity).find({ where: { projectId } })
    const edgePatch = (r: any, sign: 1 | -1): Record<string, unknown> | null => {
      const patch: Record<string, unknown> = {}
      const from = remapChapterNo(r.validFromChapter, mapping)
      const until = remapChapterNo(r.validUntilChapter, mapping)
      if (from !== r.validFromChapter) patch.validFromChapter = sign === -1 && from != null ? -Math.abs(from) : from
      if (until !== r.validUntilChapter) patch.validUntilChapter = sign === -1 && until != null ? -Math.abs(until) : until
      return Object.keys(patch).length > 0 ? patch : null
    }
    const moveEdges = edges.filter((r: any) => edgePatch(r, -1) !== null)
    for (const r of moveEdges) await em.update(LwGraphEdgeEntity, { id: r.id }, edgePatch(r, -1)!)
    for (const r of moveEdges) {
      await em.update(LwGraphEdgeEntity, { id: r.id }, edgePatch(r, 1)!)
      report.graphEdges++
    }

    const summaries = await em.getRepository(LwChapterStateSummaryEntity).find({ where: { projectId } })
    const moveSummaries = summaries.filter((r: any) => remapChapterNo(r.chapterNumber, mapping) !== r.chapterNumber)
    for (const r of moveSummaries) await em.update(LwChapterStateSummaryEntity, { id: r.id }, { chapterNumber: negate(r.chapterNumber) })
    for (const r of moveSummaries) {
      await em.update(LwChapterStateSummaryEntity, { id: r.id }, { chapterNumber: remapChapterNo(r.chapterNumber, mapping) })
      report.stateSummaries++
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
