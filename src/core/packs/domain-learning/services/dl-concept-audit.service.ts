/**
 * 知识点节点字段变更审计服务（2026-09-15 版本管理 B4）
 * @module packs/domain-learning/services/dl-concept-audit
 *
 * 把"改了什么"沉淀到 dl_concept_log，让 AI / 用户事后能追溯每次改动。
 * mastery 变更仍走 dl_mastery_log（不重复）。
 *
 * 设计取向：
 *  - diffAndLog(before, after) 自动对比受监控字段，调用方无需手写每个字段的 from/to；
 *  - 值相等（含 JSON 深比较）跳过，避免无意义日志；
 *  - attrs 作为整体记录（JSON.stringify），不做深层 diff（attrs 结构多变，深 diff 易误报）。
 */

import { randomUUID } from 'crypto'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import type { DlConceptRow } from '@core/database/repositories/dl-concept.repository'

const logger = createLogger('DlConceptAudit')

/** 受监控的字段清单（mastery/researchState/cardId/source 不在内——它们有专门审计或语义不同） */
const MONITORED_FIELDS = ['name', 'en', 'definitionShort', 'parentId', 'attrs', 'note'] as const
type MonitoredField = (typeof MONITORED_FIELDS)[number]

export type ConceptAuditTrigger = 'agent' | 'manual' | 'map_completion' | 'restore'

export interface ConceptAuditDiffInput {
  projectId: string
  conceptId: string
  before: Partial<Pick<DlConceptRow, MonitoredField>>
  after: Partial<Pick<DlConceptRow, MonitoredField>>
  trigger: ConceptAuditTrigger
  /** 仅对比这些字段（缺省=全部受监控字段） */
  fields?: MonitoredField[]
}

/** 序列化值用于存储与比较（undefined → null；对象 → JSON） */
function serialize(v: unknown): string | null {
  if (v === undefined || v === null) return null
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

export class DlConceptAuditService {
  constructor(private readonly db: ICoreDatabaseManager) {}

  /** 直接记一条变更（已知 from/to 时用） */
  async logChange(input: {
    projectId: string
    conceptId: string
    field: string
    from: unknown
    to: unknown
    trigger: ConceptAuditTrigger
  }): Promise<void> {
    const repo = this.db.dlConceptLogs
    if (!repo) {
      logger.warn('[audit] dlConceptLogs 未注册，跳过记录')
      return
    }
    await repo.create({
      id: randomUUID(),
      projectId: input.projectId,
      conceptId: input.conceptId,
      field: input.field,
      fromValue: serialize(input.from),
      toValue: serialize(input.to),
      trigger: input.trigger,
    })
  }

  /**
   * 自动对比 before/after 的受监控字段，差异项逐条记日志。
   * 值相等（字符串直接比、对象 JSON 比）跳过。
   */
  async diffAndLog(input: ConceptAuditDiffInput): Promise<number> {
    const repo = this.db.dlConceptLogs
    if (!repo) {
      logger.warn('[audit] dlConceptLogs 未注册，跳过 diff')
      return 0
    }
    const fields = input.fields ?? [...MONITORED_FIELDS]
    let count = 0
    for (const f of fields) {
      const a = serialize((input.after as Record<string, unknown>)[f])
      const b = serialize((input.before as Record<string, unknown>)[f])
      if (a === b) continue
      await repo.create({
        id: randomUUID(),
        projectId: input.projectId,
        conceptId: input.conceptId,
        field: f,
        fromValue: b,
        toValue: a,
        trigger: input.trigger,
      })
      count++
    }
    if (count) {
      logger.info(
        `[audit] concept=${input.conceptId} trigger=${input.trigger} fields=${count} (${fields.join(',')})`,
      )
    }
    return count
  }
}