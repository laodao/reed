/**
 * 领域学习 Agent 动作实现层
 * @module packs/domain-learning/services/dl-agent-actions
 *
 * 动作 = 工具 execute 的落库实现（EP 同构：工具 def 只做 schema + 上下文还原，
 * 真正校验/落库在这里集中，便于 TDD 直测与未来复用）。
 *
 * 人机分工（design-v3 §8）：agent 产出一律落「草稿态」——concept/relation 建议
 * 由地图人审确认（UI/IPC confirmRelation），card 草稿由用户在界面确认发布；
 * 硬校验：card 无 evidence 不落库；先验内容经 attrs.needs_verification 标记。
 */

import { randomUUID } from 'crypto'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { PREREQUISITE_TYPE } from '@core/database/repositories/dl-relation.repository'
import type { DlCardEvidenceDto, DlCardSectionDto, DlCardWorkDto } from '@core/database/repositories/dl-card.repository'
import type { DlAgentActionSummary, DlAgentExecutionContext } from './dl-agent.types'

/** 动作类型（与工具名一致，便于频控与审计） */
export type DlAgentActionType = 'dl_save_concept' | 'dl_save_relation' | 'dl_save_card' | 'dl_answer_question'

/** 动作参数（工具 schema 约束后透传） */
export interface DlAgentActionParams {
  /** save_concept：概念节点（含子概念拆解——D9 入队语义） */
  concept?: {
    name: string
    nodeType?: string
    en?: string
    parentId?: string | null
    definitionShort?: string
    researchState?: string
    attrs?: Record<string, unknown>
  }
  /** save_relation：关系边建议（前置依赖须 source→target） */
  relation?: {
    sourceId: string
    targetId: string
    relationType?: string
    evidence?: string
  }
  /** save_card：讲义卡片（evidence 硬校验） */
  card?: {
    conceptId: string
    essenceType: string
    sections: DlCardSectionDto[]
    works?: DlCardWorkDto[]
    evidenceSources: DlCardEvidenceDto[]
    needsVerification?: boolean
  }
  /** answer_question：答疑存档 */
  question?: {
    questionId?: string
    conceptId?: string | null
    question: string
    answerMd?: string | null
    answerSource?: string
    /** true = 答不上登记未解（保持 open，不写答案） */
    unresolved?: boolean
  }
}

/**
 * 执行单个动作并落库。
 * @returns summary 供事件汇总（{status,message,data}）
 * @throws 校验失败/落库失败（loop 捕获转 error，模型可见失败原因）
 */
export async function executeDlAction(
  ctx: DlAgentExecutionContext,
  action: { type: DlAgentActionType; params: Record<string, unknown> },
): Promise<{ summary: DlAgentActionSummary }> {
  // 优先用调用方注入的 db（工具层由 dlCtxFrom 注入宿主 db；测试可直接传）
  const db = ctx.db ?? getCoreDatabaseManager()
  const spaceId = ctx.spaceId
  if (!spaceId) throw new Error('缺少空间上下文（spaceId 未注入）——dl 工具只能在领域学习宿主内调用')

  switch (action.type) {
    case 'dl_save_concept':
      return saveConcept(db, spaceId, action.params)
    case 'dl_save_relation':
      return saveRelation(db, spaceId, action.params)
    case 'dl_save_card':
      return saveCard(db, spaceId, action.params)
    case 'dl_answer_question':
      return answerQuestion(db, spaceId, action.params)
    default:
      throw new Error(`未知 dl 动作：${String(action.type)}`)
  }
}

// ==================== save_concept ====================

async function saveConcept(
  db: ReturnType<typeof getCoreDatabaseManager>,
  spaceId: string,
  raw: Record<string, unknown>,
): Promise<{ summary: DlAgentActionSummary }> {
  const c = (raw.concept ?? {}) as NonNullable<DlAgentActionParams['concept']>
  if (!c.name?.trim()) throw new Error('dl_save_concept：概念 name 必填')

  const rows = await db.dlConcepts!.listByProject(spaceId)
  const existing = rows.find((r) => r.name === c.name.trim() && r.parentId === (c.parentId ?? null))
  if (existing) {
    // 幂等：已存在（同父同名）→ 补 definitionShort/研究态
    await db.dlConcepts!.patch(existing.id, {
      definitionShort: c.definitionShort ?? existing.definitionShort,
      researchState: (c.researchState as string) ?? existing.researchState,
    })
    return { summary: { tool: 'dl_save_concept', status: 'ok', message: `概念「${existing.name}」已存在，已更新描述`, data: { conceptId: existing.id, created: false } } }
  }

  const id = randomUUID()
  await db.dlConcepts!.create({
    id,
    projectId: spaceId,
    nodeType: c.nodeType ?? 'concept',
    name: c.name.trim(),
    en: c.en ?? null,
    parentId: c.parentId ?? null,
    definitionShort: c.definitionShort ?? null,
    researchState: c.researchState ?? 'extracted',
    source: 'ai_verified',
    attrs: c.attrs ?? null,
  })
  return { summary: { tool: 'dl_save_concept', status: 'ok', message: `概念「${c.name}」已落库（草稿）`, data: { conceptId: id, created: true } } }
}

// ==================== save_relation ====================

async function saveRelation(
  db: ReturnType<typeof getCoreDatabaseManager>,
  spaceId: string,
  raw: Record<string, unknown>,
): Promise<{ summary: DlAgentActionSummary }> {
  const r = (raw.relation ?? {}) as NonNullable<DlAgentActionParams['relation']>
  if (!r.sourceId || !r.targetId) throw new Error('dl_save_relation：sourceId/targetId 必填')
  if (r.sourceId === r.targetId) throw new Error('dl_save_relation：不能建立自环')

  const relationType = r.relationType ?? PREREQUISITE_TYPE
  const row = await db.dlRelations!.create({
    id: randomUUID(),
    projectId: spaceId,
    sourceId: r.sourceId,
    targetId: r.targetId,
    relationType,
    evidence: r.evidence ?? null,
    verified: false, // 建议态，需地图人审确认
  })
  const msg = row.verified
    ? `关系 ${r.sourceId} → ${r.targetId}（${relationType}）已确认`
    : `关系建议 ${r.sourceId} → ${r.targetId}（${relationType}）已落库，待地图人审`
  return { summary: { tool: 'dl_save_relation', status: 'ok', message: msg, data: { relationId: row.id } } }
}

// ==================== save_card（讲义：evidence 硬校验） ====================

async function saveCard(
  db: ReturnType<typeof getCoreDatabaseManager>,
  spaceId: string,
  raw: Record<string, unknown>,
): Promise<{ summary: DlAgentActionSummary }> {
  const card = (raw.card ?? {}) as NonNullable<DlAgentActionParams['card']>
  if (!card.conceptId) throw new Error('dl_save_card：conceptId 必填')
  if (!card.essenceType) throw new Error('dl_save_card：essenceType 必填（K-concept/K-oper/K-stmt/K-inst/K-agent/K-open）')
  if (!Array.isArray(card.sections) || card.sections.length === 0) throw new Error('dl_save_card：sections 至少一个区')
  // 硬校验（design-v3 §13）：讲义必须带证据来源，否则不落库（宁缺毋滥）
  if (!Array.isArray(card.evidenceSources) || card.evidenceSources.length === 0) {
    throw new Error('dl_save_card：evidenceSources 为空——讲义无出处不落库；请先研究获取资料再产讲义')
  }

  const existingCard = await db.dlCards!.getCurrentByConcept(spaceId, card.conceptId)
  const version = (existingCard?.version ?? 0) + 1
  const cardId = existingCard?.id ?? randomUUID()
  const attrs: Record<string, unknown> = {}
  if (card.needsVerification) attrs.needsVerification = true

  if (existingCard) {
    await db.dlCards!.patch(existingCard.id, {
      essenceType: card.essenceType,
      sections: card.sections,
      works: card.works ?? null,
      evidenceSources: card.evidenceSources,
      status: 'draft', // 新研究覆盖旧稿 → 回草稿待用户确认发布
    })
  } else {
    await db.dlCards!.create({
      id: cardId,
      projectId: spaceId,
      conceptId: card.conceptId,
      essenceType: card.essenceType,
      sections: card.sections,
      works: card.works ?? null,
      evidenceSources: card.evidenceSources,
      version,
      status: 'draft',
    })
  }
  // 概念挂 card（研究态 → 已提炼）
  const concept = await db.dlConcepts!.getById(card.conceptId)
  if (concept && concept.projectId === spaceId) {
    await db.dlConcepts!.patch(concept.id, {
      cardId,
      researchState: 'extracted',
      attrs: { ...(concept.attrs ?? {}), ...attrs },
    })
  }
  return {
    summary: {
      tool: 'dl_save_card',
      status: 'ok',
      message: `讲义已落库（v${version} 草稿，${card.sections.length} 区，证据 ${card.evidenceSources.length} 条）`,
      data: { cardId, version },
    },
  }
}

// ==================== answer_question（答疑存档） ====================

async function answerQuestion(
  db: ReturnType<typeof getCoreDatabaseManager>,
  spaceId: string,
  raw: Record<string, unknown>,
): Promise<{ summary: DlAgentActionSummary }> {
  const q = (raw.question ?? {}) as NonNullable<DlAgentActionParams['question']>
  if (!q.question) throw new Error('dl_answer_question：question 必填')
  const questionId = q.questionId ?? randomUUID()

  const existing = q.questionId ? await db.dlQuestions!.getById(q.questionId) : null
  if (q.unresolved) {
    // 答不上：保持 open（未解队列）；首次登记时创建
    if (!existing) {
      await db.dlQuestions!.create({ id: questionId, projectId: spaceId, conceptId: q.conceptId ?? null, question: q.question })
    }
    return {
      summary: {
        tool: 'dl_answer_question',
        status: 'ok',
        message: '已登记为未解问题（在队列中，可触发新研究）',
        data: { questionId, status: 'open' },
      },
    }
  }

  const answerMd = q.answerMd?.trim()
  if (!answerMd) throw new Error('dl_answer_question：answered 模式必须提供 answerMd')
  const answerSource = q.answerSource ?? 'lesson'
  if (existing) {
    await db.dlQuestions!.patch(existing.id, {
      answerMd,
      answerSource,
      status: 'answered',
      answeredAt: new Date(),
    })
  } else {
    await db.dlQuestions!.create({ id: questionId, projectId: spaceId, conceptId: q.conceptId ?? null, question: q.question })
    await db.dlQuestions!.patch(questionId, {
      answerMd,
      answerSource,
      status: 'answered',
      answeredAt: new Date(),
    })
  }
  return {
    summary: {
      tool: 'dl_answer_question',
      status: 'ok',
      message: `已存档（来源：${answerSource}）`,
      data: { questionId, status: 'answered' },
    },
  }
}
