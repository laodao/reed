/**
 * 长文写作一致性校验服务（阶段 2）
 * @module core/platform/services/longwriting/graph/consistency.service
 *
 * 把 generateChapter systemPrompt 里的"禁止"文案升级为数据驱动检测：
 * - validateBeforeGeneration：章节生成前，检查本章大纲涉及实体的时间线冲突
 * - scanContradictions：全项目矛盾扫描（规则 R1-R6）
 *
 * 规则：
 * - R1 死亡后出场（确定性）：角色最新切片含死亡语义，且后续章节大纲仍 involved 该角色
 * - R2 关系失效后仍同框（确定性）：关系边 valid_until < 章节，后续大纲仍同时涉及两端角色
 * - R3 物品易主（半确定性）：物品切片 keyChanges 含易主语义，后续大纲仍涉及该物品
 * - R4 技能时间线（半确定性）：人物→技能 masters 边 valid_from > 引用章节
 * - R5 回忆冲突（标记检测）：大纲节点标记"回忆/闪回"，其涉及实体的历史与当前状态差异显著
 * - R6 状态回退（确定性）：实体切片序列出现"死亡/覆灭"后状态又恢复非终态
 */

import { getCoreDatabaseManager, type ICoreDatabaseManager } from '@core/database/database-manager.interface'
import type { GraphEntityType } from '@shared/types/longwriting.types'

export type ConflictSeverity = 'error' | 'warning'

export interface ConflictItem {
  rule: string
  severity: ConflictSeverity
  message: string
  entityType?: GraphEntityType
  entityId?: string
  entityName?: string
  chapterNumber?: number
}

/** 死亡语义关键词（状态切片文本命中即视为"已死亡"） */
const DEATH_KEYWORDS = ['死亡', '牺牲', '阵亡', '遇害', '战死', '陨落', '离世', '被杀', '丧生', '身亡']
/** 物品易主语义关键词 */
const TRANSFER_KEYWORDS = ['易主', '转手', '交出', '夺得', '夺走', '落入', '赠予', '获得', '易手', '失窃']
/** 回忆/闪回标记 */
const RECALL_KEYWORDS = ['回忆', '闪回', '回想', '往事', '记忆深处']

export class ConsistencyService {
  private static instance: ConsistencyService | null = null

  private readonly db: ICoreDatabaseManager | null

  constructor(db?: ICoreDatabaseManager | null) {
    this.db = db ?? null
  }

  static getInstance(): ConsistencyService {
    if (!ConsistencyService.instance) {
      ConsistencyService.instance = new ConsistencyService()
    }
    return ConsistencyService.instance
  }

  static resetInstance(): void {
    ConsistencyService.instance = null
  }

  private manager(): ICoreDatabaseManager | null {
    return this.db ?? getCoreDatabaseManager()
  }

  /**
   * 写前校验：生成章节 N 前，检查本章大纲节点涉及实体的时间线冲突。
   * @param projectId 项目
   * @param outlineId 目标章节大纲节点
   * @param chapterNumber 目标章节号（默认由 outline 推算）
   */
  async validateBeforeGeneration(projectId: string, outlineId: string, chapterNumber?: number): Promise<ConflictItem[]> {
    const m = this.manager()
    if (!m) return []

    const outline = await m.lwOutlines?.getById(outlineId)
    if (!outline) return []

    const chapterNo = chapterNumber ?? this.calcChapterNumber(projectId, outlineId)
    const conflicts: ConflictItem[] = []

    // 涉及角色：查"目标章节时间点"的状态切片（而非最新），检测死亡后出场
    const involvedCharIds = outline.involvedCharacters || []
    if (involvedCharIds.length > 0) {
      const characters = (await m.lwCharacters?.getByProjectId(projectId)) || []
      for (const charId of involvedCharIds) {
        const char = characters.find(c => c.id === charId)
        const state = await m.lwEntityStates?.getEntityStateAtChapter(projectId, 'character', charId, chapterNo)
        if (state && this.hasDeathSemantics(state.stateSummary)) {
          conflicts.push({
            rule: 'R1',
            severity: 'error',
            message: `角色「${char?.name || charId}」在该时间点已死亡（第 ${state.chapterNumber} 章确认），本章大纲仍安排其出场`,
            entityType: 'character',
            entityId: charId,
            entityName: char?.name || charId,
            chapterNumber: chapterNo,
          })
        }
      }
    }

    // 涉及地点：检测被毁/覆灭（目标章节时间点）
    const involvedLocIds = outline.involvedLocations || []
    if (involvedLocIds.length > 0) {
      const locations = (await m.lwLocations?.getByProjectId(projectId)) || []
      for (const locId of involvedLocIds) {
        const loc = locations.find(l => l.id === locId)
        const state = await m.lwEntityStates?.getEntityStateAtChapter(projectId, 'location', locId, chapterNo)
        if (state && /被毁|毁灭|夷为平地|覆灭/.test(state.stateSummary)) {
          conflicts.push({
            rule: 'R1',
            severity: 'warning',
            message: `地点「${loc?.name || locId}」在该时间点已被毁（第 ${state.chapterNumber} 章确认），本章仍安排在此发生`,
            entityType: 'location',
            entityId: locId,
            entityName: loc?.name || locId,
            chapterNumber: chapterNo,
          })
        }
      }
    }

    return conflicts
  }

  /**
   * 全项目矛盾扫描。
   */
  async scanContradictions(projectId: string): Promise<ConflictItem[]> {
    const m = this.manager()
    if (!m) return []
    const conflicts: ConflictItem[] = []
    conflicts.push(...await this.scanR1DeathAppearance(projectId))
    conflicts.push(...await this.scanR2ExpiredRelation(projectId))
    conflicts.push(...await this.scanR3ItemTransfer(projectId))
    conflicts.push(...await this.scanR4SkillTimeline(projectId))
    conflicts.push(...await this.scanR5Recall(projectId))
    conflicts.push(...await this.scanR6StateRegression(projectId))
    return conflicts
  }

  // ==================== R1：死亡/覆灭后仍出场 ====================

  private async scanR1DeathAppearance(projectId: string): Promise<ConflictItem[]> {
    const m = this.manager()
    if (!m) return []
    const conflicts: ConflictItem[] = []
    const characters = (await m.lwCharacters?.getByProjectId(projectId)) || []
    const outlines = await this.sortedOutlines(projectId)

    for (const char of characters) {
      const latest = await m.lwEntityStates?.getLatestEntityState(projectId, 'character', char.id)
      if (!latest || !this.hasDeathSemantics(latest.stateSummary)) continue
      // 死亡章节之后仍被大纲涉及
      for (const o of outlines) {
        const chapterNo = await this.calcChapterNumber(projectId, o.id)
        if (chapterNo > latest.chapterNumber && (o.involvedCharacters || []).includes(char.id)) {
          conflicts.push({
            rule: 'R1',
            severity: 'error',
            message: `角色「${char.name}」已于第 ${latest.chapterNumber} 章死亡，但第 ${chapterNo} 章大纲仍涉及`,
            entityType: 'character',
            entityId: char.id,
            entityName: char.name,
            chapterNumber: chapterNo,
          })
        }
      }
    }
    return conflicts
  }

  // ==================== R2：关系失效后仍同框 ====================

  private async scanR2ExpiredRelation(projectId: string): Promise<ConflictItem[]> {
    const m = this.manager()
    if (!m) return []
    const conflicts: ConflictItem[] = []
    const edges = (await m.lwGraphEdges?.getByProjectId(projectId)) || []
    const outlines = await this.sortedOutlines(projectId)
    const characters = (await m.lwCharacters?.getByProjectId(projectId)) || []

    for (const edge of edges) {
      if (edge.validUntilChapter === undefined) continue
      // 只检查人物间关系
      if (edge.sourceType !== 'character' || edge.targetType !== 'character') continue
      const srcName = characters.find(c => c.id === edge.sourceId)?.name || edge.sourceId
      const tgtName = characters.find(c => c.id === edge.targetId)?.name || edge.targetId
      for (const o of outlines) {
        const chapterNo = await this.calcChapterNumber(projectId, o.id)
        const involved = o.involvedCharacters || []
        if (chapterNo > edge.validUntilChapter && involved.includes(edge.sourceId) && involved.includes(edge.targetId)) {
          conflicts.push({
            rule: 'R2',
            severity: 'warning',
            message: `关系「${srcName}↔${tgtName}（${edge.relationType}）」已于第 ${edge.validUntilChapter} 章失效，但第 ${chapterNo} 章大纲仍同时涉及双方（若非敌对互动请忽略）`,
            entityType: 'character',
            entityId: edge.sourceId,
            entityName: srcName,
            chapterNumber: chapterNo,
          })
        }
      }
    }
    return conflicts
  }

  // ==================== R3：物品易主后仍按旧持有引用 ====================

  private async scanR3ItemTransfer(projectId: string): Promise<ConflictItem[]> {
    const m = this.manager()
    if (!m) return []
    const conflicts: ConflictItem[] = []
    const items = (await m.lwItems?.getByProjectId(projectId)) || []
    const outlines = await this.sortedOutlines(projectId)

    for (const item of items) {
      const latest = await m.lwEntityStates?.getLatestEntityState(projectId, 'item', item.id)
      if (!latest) continue
      const changed = (latest.keyChanges || []).some(k => TRANSFER_KEYWORDS.some(kw => k.includes(kw)))
      if (!changed) continue
      for (const o of outlines) {
        const chapterNo = await this.calcChapterNumber(projectId, o.id)
        if (chapterNo > latest.chapterNumber && (o.involvedItems || []).includes(item.id)) {
          conflicts.push({
            rule: 'R3',
            severity: 'warning',
            message: `物品「${item.name}」在第 ${latest.chapterNumber} 章发生持有权变化，第 ${chapterNo} 章大纲仍涉及（请确认持有者一致）`,
            entityType: 'item',
            entityId: item.id,
            entityName: item.name,
            chapterNumber: chapterNo,
          })
        }
      }
    }
    return conflicts
  }

  // ==================== R4：技能时间线（学会前使用） ====================

  private async scanR4SkillTimeline(projectId: string): Promise<ConflictItem[]> {
    const m = this.manager()
    if (!m) return []
    const conflicts: ConflictItem[] = []
    const edges = (await m.lwGraphEdges?.getByProjectId(projectId)) || []
    const outlines = await this.sortedOutlines(projectId)
    const characters = (await m.lwCharacters?.getByProjectId(projectId)) || []
    const skills = (await m.lwSkills?.getByProjectId(projectId)) || []

    for (const edge of edges) {
      if (edge.sourceType !== 'character' || edge.targetType !== 'skill') continue
      if (edge.validFromChapter === undefined) continue
      const charName = characters.find(c => c.id === edge.sourceId)?.name || edge.sourceId
      const skillName = skills.find(s => s.id === edge.targetId)?.name || edge.targetId
      for (const o of outlines) {
        const chapterNo = await this.calcChapterNumber(projectId, o.id)
        const involved = o.involvedCharacters || []
        if (chapterNo > 0 && chapterNo < edge.validFromChapter && involved.includes(edge.sourceId)) {
          conflicts.push({
            rule: 'R4',
            severity: 'warning',
            message: `角色「${charName}」在第 ${edge.validFromChapter} 章才学会「${skillName}」，但第 ${chapterNo} 章大纲已涉及该角色（若本章未使用该技能可忽略）`,
            entityType: 'character',
            entityId: edge.sourceId,
            entityName: charName,
            chapterNumber: chapterNo,
          })
        }
      }
    }
    return conflicts
  }

  // ==================== R5：回忆/闪回标记检测 ====================

  private async scanR5Recall(projectId: string): Promise<ConflictItem[]> {
    const m = this.manager()
    if (!m) return []
    const conflicts: ConflictItem[] = []
    const outlines = await this.sortedOutlines(projectId)

    for (const o of outlines) {
      const summary = o.summary || ''
      if (!RECALL_KEYWORDS.some(kw => summary.includes(kw))) continue
      // 回忆章节：涉及实体若当前状态与历史差异大（如已死亡角色被回忆为活着），提示作者确认时间点
      const involvedCharIds = o.involvedCharacters || []
      if (involvedCharIds.length === 0) continue
      const characters = (await m.lwCharacters?.getByProjectId(projectId)) || []
      for (const charId of involvedCharIds) {
        const latest = await m.lwEntityStates?.getLatestEntityState(projectId, 'character', charId)
        const charName = characters.find(c => c.id === charId)?.name || charId
        if (latest && this.hasDeathSemantics(latest.stateSummary)) {
          conflicts.push({
            rule: 'R5',
            severity: 'warning',
            message: `本章标记为回忆（${summary.slice(0, 30)}…），角色「${charName}」当前已死亡（第 ${latest.chapterNumber} 章）；回忆内容须与回忆时间点一致`,
            entityType: 'character',
            entityId: charId,
            entityName: charName,
            chapterNumber: await this.calcChapterNumber(projectId, o.id),
          })
        }
      }
    }
    return conflicts
  }

  // ==================== R6：状态回退（死亡/覆灭后恢复） ====================

  private async scanR6StateRegression(projectId: string): Promise<ConflictItem[]> {
    const m = this.manager()
    if (!m) return []
    const conflicts: ConflictItem[] = []
    const snapshots = (await m.lwEntityStates?.getByProjectId(projectId)) || []

    // 按实体分组，按章节排序
    const byEntity = new Map<string, typeof snapshots>()
    for (const s of snapshots) {
      const key = `${s.entityType}:${s.entityId}`
      if (!byEntity.has(key)) byEntity.set(key, [])
      byEntity.get(key)!.push(s)
    }

    for (const [, list] of byEntity) {
      const sorted = [...list].sort((a, b) => a.chapterNumber - b.chapterNumber)
      let terminal = false
      for (const s of sorted) {
        const isTerminal = s.entityType === 'character'
          ? this.hasDeathSemantics(s.stateSummary)
          : /被毁|毁灭|覆灭/.test(s.stateSummary)
        if (terminal && !isTerminal) {
          conflicts.push({
            rule: 'R6',
            severity: 'warning',
            message: `实体「${s.entityName}」在章节 ${sorted.find(x => x.chapterNumber < s.chapterNumber && (x.entityType === 'character' ? this.hasDeathSemantics(x.stateSummary) : /被毁|毁灭|覆灭/.test(x.stateSummary)))?.chapterNumber ?? '?'} 章已进入终态（死亡/覆灭），第 ${s.chapterNumber} 章状态又恢复为非终态（若非重生/复活设定请检查）`,
            entityType: s.entityType as GraphEntityType,
            entityId: s.entityId,
            entityName: s.entityName,
            chapterNumber: s.chapterNumber,
          })
          terminal = false
        } else {
          terminal = isTerminal
        }
      }
    }
    return conflicts
  }

  // ==================== 内部工具 ====================

  private hasDeathSemantics(text: string): boolean {
    return DEATH_KEYWORDS.some(kw => text.includes(kw))
  }

  private async sortedOutlines(projectId: string): Promise<Array<{ id: string; nodeType?: string; level?: number; involvedCharacters?: string[]; involvedLocations?: string[]; involvedItems?: string[]; summary?: string }>> {
    const m = this.manager()
    if (!m) return []
    const all = (await m.lwOutlines?.getByProjectId(projectId)) || []
    return [...all].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
  }

  private async calcChapterNumber(projectId: string, outlineId: string): Promise<number> {
    const m = this.manager()
    if (!m) return 1
    const outlines = await this.sortedOutlines(projectId)
    let count = 0
    for (const o of outlines) {
      if (o.nodeType === 'chapter') count++
      if (o.id === outlineId) return count
    }
    return count || 1
  }
}
