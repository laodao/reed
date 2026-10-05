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
import { checkLessonDifficulty } from '../rules/learning-difficulty.rules'
import { checkLessonProgression } from '../rules/learning-progression.rules'
import {
  matchPrereqName,
  normalizeConceptPrereqs,
  normalizeSpacePrereqs,
  wouldCreatePrereqCycle,
} from '../rules/learning-prerequisites.rules'
import {
  getConfirmedLessonSpec,
  getConfirmedSyllabus,
  proposeDlLessonPlan,
  proposeDlSyllabus,
  proposeDlUnderstanding,
} from './dl-plan.service'
import { checkNumericStatements } from '@shared/utils/lesson-numeric-check'
import {
  checkLessonDepth,
  checkLessonSectionsShape,
  canonicalSectionKey,
  normalizeCardSections,
} from '@shared/utils/lesson-template'
import {
  canonicalLessonLayout,
  checkLessonVisualQuality,
  defaultLayoutForSection,
  lessonLayoutName,
  type LessonQualityIssue,
} from '@shared/utils/lesson-layout'
import { checkLessonSpecAgreement } from '@shared/utils/lesson-spec'
import type { DlCardEvidenceDto, DlCardSectionDto, DlCardWorkDto } from '@core/database/repositories/dl-card.repository'
import type { DlAgentActionSummary, DlAgentExecutionContext } from './dl-agent.types'
import type { DlBookSuggestion, DlEssenceType } from '@shared/types/domain-learning.types'

/** 动作类型（与工具名一致，便于频控与审计） */
export type DlAgentActionType =
  | 'dl_save_concept'
  | 'dl_save_relation'
  | 'dl_save_card'
  | 'dl_save_space_prereqs'
  | 'dl_save_book_suggestions'
  | 'dl_answer_question'
  | 'dl_propose_understanding'
  | 'dl_propose_syllabus'
  | 'dl_propose_lesson_plan'

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
    /** 学习本知识点前必须先掌握的概念名（2026-09-12：生成知识点时即声明前置） */
    prerequisites?: string[]
    /** 学习层级（2026-09-25 D4：来自已确认方案时传入，写 attrs.layer） */
    layer?: number
  }
  /** save_space_prereqs：主题学习前置要求（整个领域的学习门槛） */
  spacePrereqs?: {
    items?: unknown[]
    /** 可选说明（如"以下为学本领域前的门槛，空间内会教其中两项"） */
    note?: string
  }
  /** save_book_suggestions：书籍建议（知识体系规划后的书籍内容提示；2026-10-04） */
  books?: {
    items?: unknown[]
    /** 可选说明（如"前两本是体系主干，建议先读"） */
    note?: string
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
    /** 知识本质类型（工具 schema 已限定为 K-* 六选一；决定讲义模板区集） */
    essenceType: DlEssenceType
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
  /** propose_understanding：诉求理解草案（流程第 1 步；2026-09-13） */
  understanding?: Record<string, unknown>
  /** propose_syllabus：知识体系草案（流程第 2 步；需先确认诉求理解） */
  syllabus?: Record<string, unknown>
  /**
   * propose_lesson_plan：讲义设计规格与区级计划草案（讲义流水线 Plan 阶段；2026-09-14）。
   * 形状 `{ conceptId, essenceType, spec:{ audience, outcomes, roster… } }`。
   */
  lesson?: Record<string, unknown>
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

  // 未解问题研究：模型可省 questionId，从宿主 runtimeContext（ctx.questionId）兜底回填
  let params = action.params
  if (action.type === 'dl_answer_question') {
    const q = (action.params.question ?? {}) as Record<string, unknown>
    if (!q.questionId && ctx.questionId) {
      params = { ...action.params, question: { ...q, questionId: ctx.questionId } }
    }
  }

  switch (action.type) {
    case 'dl_save_concept':
      return saveConcept(db, spaceId, params, ctx)
    case 'dl_save_relation':
      return saveRelation(db, spaceId, params)
    case 'dl_save_card':
      return saveCard(db, spaceId, params, ctx.conceptId ?? null)
    case 'dl_save_space_prereqs':
      return saveSpacePrereqs(db, spaceId, params)
    case 'dl_save_book_suggestions':
      return saveBookSuggestions(db, spaceId, params)
    case 'dl_answer_question':
      return answerQuestion(db, spaceId, params)
    case 'dl_propose_understanding': {
      const r = await proposeDlUnderstanding(db, spaceId, params.understanding)
      return {
        summary: {
          tool: 'dl_propose_understanding',
          status: 'ok',
          message: r.message,
          data: { planId: r.planId, revision: r.revision },
        },
      }
    }
    case 'dl_propose_syllabus': {
      const r = await proposeDlSyllabus(db, spaceId, params.syllabus)
      return {
        summary: {
          tool: 'dl_propose_syllabus',
          status: 'ok',
          message: r.message,
          data: { planId: r.planId, revision: r.revision },
        },
      }
    }
    case 'dl_propose_lesson_plan': {
      // 讲义方案按概念写：概念 id 优先用载荷里的，其次用本轮研究概念（runtimeContext）
      const raw = (params.lesson ?? {}) as Record<string, unknown>
      const conceptId = String(raw.conceptId ?? ctx.conceptId ?? '').trim()
      if (!conceptId) {
        throw new Error(
          'dl_propose_lesson_plan：缺 conceptId——讲义是按概念写的，请指定给哪个知识点做讲义方案。',
        )
      }
      const r = await proposeDlLessonPlan(db, spaceId, conceptId, raw)
      return {
        summary: {
          tool: 'dl_propose_lesson_plan',
          status: 'ok',
          message: r.message,
          data: { planId: r.planId, revision: r.revision, conceptId },
        },
      }
    }
    default:
      throw new Error(`未知 dl 动作：${String(action.type)}`)
  }
}

// ==================== save_concept ====================

/**
 * 规划轮落库门禁（2026-09-13 用户需求：用户确认后才允许生成知识点体系）。
 *
 * 只拦**规划轮**（起步研究 / 补全知识地图）——那两类入口正是"一次性批量建点"的场景；
 * 单个概念的普通研究轮（pace 自动推进"研究此概念"）不受影响，它本来就只产出讲义。
 * 无已确认方案时拒绝，并把"下一步点哪里"写进错误信息（模型转述给用户也清楚）。
 */
async function assertPlanConfirmedForSave(
  db: ReturnType<typeof getCoreDatabaseManager>,
  spaceId: string,
): Promise<void> {
  const syllabus = await getConfirmedSyllabus(db, spaceId)
  if (syllabus) return
  throw new Error(
    'dl_save_concept：本空间还没有**已确认的知识体系方案**——按固定流程，首批知识点必须先在弹窗里' +
      '「对齐诉求（dl_propose_understanding）→ 确认 → 提交知识体系（dl_propose_syllabus）→ 用户确认」之后才能落库。' +
      '请先提交方案并等用户确认，不要直接建点。',
  )
}

/** researchState 合法流转白名单（types DlResearchState；防模型任意改写） */
const DL_RESEARCH_STATES = new Set(['unresearched', 'researching', 'extracted', 'needs_verification', 'disputed'])

async function saveConcept(
  db: ReturnType<typeof getCoreDatabaseManager>,
  spaceId: string,
  raw: Record<string, unknown>,
  ctx?: DlAgentExecutionContext,
): Promise<{ summary: DlAgentActionSummary }> {
  const c = (raw.concept ?? {}) as NonNullable<DlAgentActionParams['concept']>
  if (!c.name?.trim()) throw new Error('dl_save_concept：概念 name 必填')

  // 规划轮门禁：没确认过知识体系方案就不许批量建点
  if (ctx?.planningRound) await assertPlanConfirmedForSave(db, spaceId)

  // 学习前置声明（2026-09-12 用户需求）：显式 prerequisites 参数优先，兼容 attrs.prerequisites；
  // 一律规范化后写回 attrs.prerequisites（去空/去重/去自己/限条数）
  const declared = normalizeConceptPrereqs(c.prerequisites ?? c.attrs?.prerequisites, c.name)
  // layer 持久化（2026-09-25 D4）：方案里的学习层级随概念落 attrs.layer（图层级仍由前置边计算，
  // attrs.layer 仅作展示参考，防止方案声明与图漂移时无从比对）
  const layerNum =
    typeof c.layer === 'number' && Number.isFinite(c.layer) && c.layer >= 0 ? Math.floor(c.layer) : null
  const extraAttrs: Record<string, unknown> = { ...(c.attrs ?? {}) }
  if (declared.length) extraAttrs.prerequisites = declared
  if (layerNum != null) extraAttrs.layer = layerNum

  // 归属校验（2026-09-09 复盘）：parentId 必须存在且属于本空间（不落跨空间/孤儿父）
  if (c.parentId) {
    const parent = await db.dlConcepts!.getById(c.parentId)
    if (!parent || parent.projectId !== spaceId) {
      throw new Error(`dl_save_concept：parentId 不存在或不属于本空间（${c.parentId}）`)
    }
  }

  const rows = await db.dlConcepts!.listByProject(spaceId)
  const existing = rows.find((r) => r.name === c.name.trim() && r.parentId === (c.parentId ?? null))
  if (existing) {
    // 幂等：已存在（同父同名）→ 补 definitionShort/研究态/前置声明。
    // attrs 走合并（2026-09-25 P1-6 复盘：整体覆盖会把旧 prerequisites/confusedCount/
    // confusedSections 一次清零——用户的"没懂"历史不能被一次重存抹掉；同文件 saveCard 早已是合并写法）
    await db.dlConcepts!.patch(existing.id, {
      definitionShort: c.definitionShort ?? existing.definitionShort,
      // 白名单（2026-09-25 P2-9）：模型给的非法 researchState 一律忽略，保持原值
      researchState:
        typeof c.researchState === 'string' && DL_RESEARCH_STATES.has(c.researchState)
          ? c.researchState
          : existing.researchState,
      attrs: { ...(existing.attrs ?? {}), ...extraAttrs },
    })
    return {
      summary: {
        tool: 'dl_save_concept',
        status: 'ok',
        message: `概念「${existing.name}」已存在，已更新描述`,
        data: { conceptId: existing.id, created: false, ...(declared.length ? { prerequisites: declared } : {}) },
      },
    }
  }
  // 2026-09-09 复盘：空间内已存在同名概念（其他父/根层，如"先验概率"根层+目录双份的冗余来源）
  // → skipped 不重复建、不动他人归属；模型应改用其 id 更新或换名
  const sameNameElsewhere = rows.find((r) => r.name === c.name.trim())
  if (sameNameElsewhere) {
    const at = sameNameElsewhere.parentId ? '目录下' : '根层'
    return {
      summary: {
        tool: 'dl_save_concept',
        status: 'skipped',
        message: `空间内已存在同名概念「${sameNameElsewhere.name}」（id=${sameNameElsewhere.id}，位于${at}）——未重复创建也未改动其归属；若你指的是同一概念请继续基于该概念研究，若确为不同含义请用不同名称`,
        data: { conceptId: sameNameElsewhere.id, created: false, skipped: true },
      },
    }
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
    researchState:
      typeof c.researchState === 'string' && DL_RESEARCH_STATES.has(c.researchState) ? c.researchState : 'extracted',
    // source 语义修正（2026-09-25 P2-5）：agent 建点默认"资料提炼"；ai_verified（先验经确认）
    // 留给 verify 流水线核验通过后升级，不在建点时自封
    source: 'material',
    attrs: Object.keys(extraAttrs).length ? extraAttrs : null,
  })

  // 前置声明落库后的跟进建议：哪个前置已在图上可建关系、哪个还没落点需要补
  const prereqHint = declared.length ? await describePrereqFollowUp(db, spaceId, c.name.trim(), declared) : null
  return {
    summary: {
      tool: 'dl_save_concept',
      status: 'ok',
      message: `概念「${c.name}」已落库（草稿）${prereqHint?.message ?? ''}`,
      data: {
        conceptId: id,
        created: true,
        ...(declared.length ? { prerequisites: declared } : {}),
        ...(prereqHint?.data ?? {}),
      },
    },
  }
}

/**
 * 前置声明的跟进提示（纯读）：
 * - 已在图上（同名知识点）→ 建议 dl_save_relation 建前置边；
 * - 在主题前置清单里 → 属"需自备/空间内会教"的门槛，不要求建边；
 * - 都没有落点 → 要求补概念/补关系或列入主题前置要求。
 */
async function describePrereqFollowUp(
  db: ReturnType<typeof getCoreDatabaseManager>,
  spaceId: string,
  selfName: string,
  declared: string[],
): Promise<{ message: string; data: Record<string, unknown> }> {
  const [concepts, project] = await Promise.all([
    db.dlConcepts!.listByProject(spaceId),
    db.dlProjects!.getById(spaceId),
  ])
  const spacePrereqs = normalizeSpacePrereqs(project?.prerequisites)
  const linkable: Array<{ name: string; conceptId: string }> = []
  const missing: string[] = []
  for (const name of declared) {
    const hit = concepts.find((x) => x.nodeType !== 'group' && x.name === name)
    const kind = matchPrereqName(name, concepts, spacePrereqs)
    if (hit) linkable.push({ name, conceptId: hit.id })
    else if (kind === 'missing') missing.push(name)
  }
  const parts: string[] = []
  if (linkable.length) {
    parts.push(
      `；前置「${linkable.map((l) => l.name).join('、')}」已在图上，请 dl_save_relation 建前置关系（source=该前置 id → target=本概念 id）`,
    )
  }
  if (missing.length) {
    parts.push(
      `；⚠️ 前置「${missing.join('、')}」在空间里没有落点——请 dl_save_concept 建成知识点并排在本概念（${selfName}）之前，` +
        `若属领域外必备能力则用 dl_save_space_prereqs 列入主题前置要求`,
    )
  }
  return {
    message: parts.join(''),
    data: {
      ...(linkable.length ? { linkablePrereqs: linkable } : {}),
      ...(missing.length ? { missingPrerequisites: missing } : {}),
    },
  }
}

// ==================== save_space_prereqs（主题学习前置要求；2026-09-12） ====================

/**
 * 落库「主题学习前置要求」——整个领域的学习门槛（含领域外需自备能力）。
 * 全量替换语义：模型每次给出完整的门槛清单；空数组 = 明确"无需前置"。
 */
async function saveSpacePrereqs(
  db: ReturnType<typeof getCoreDatabaseManager>,
  spaceId: string,
  raw: Record<string, unknown>,
): Promise<{ summary: DlAgentActionSummary }> {
  const p = (raw.spacePrereqs ?? {}) as NonNullable<DlAgentActionParams['spacePrereqs']>
  if (!Array.isArray(p.items)) {
    throw new Error('dl_save_space_prereqs：items 必填且必须是数组（每条 {name, why?, level?, inSpace?}；确无需前置就传空数组）')
  }
  const project = await db.dlProjects!.getById(spaceId)
  if (!project) throw new Error(`dl_save_space_prereqs：学习空间不存在（${spaceId}）`)

  const concepts = await db.dlConcepts!.listByProject(spaceId)
  const declared = normalizeSpacePrereqs(p.items)
  // inSpace 由数据反推（不信模型自报）：空间里存在同名/包含关系知识点才算"空间内会教"
  const items = declared.map((item) => {
    const hit = concepts.find((c) => c.nodeType !== 'group' && (c.name.includes(item.name) || item.name.includes(c.name)))
    return hit ? { ...item, inSpace: true } : { ...item, inSpace: false }
  })
  await db.dlProjects!.patch(spaceId, { prerequisites: items })

  const inSpaceNames = items.filter((i) => i.inSpace).map((i) => i.name)
  const externalNames = items.filter((i) => !i.inSpace).map((i) => i.name)
  const detail = items.length
    ? `（${items.length} 条：空间内会教 ${inSpaceNames.length} 条${inSpaceNames.length ? ` [${inSpaceNames.join('、')}]` : ''}，需自备 ${externalNames.length} 条${externalNames.length ? ` [${externalNames.join('、')}]` : ''}）`
    : '（已清空：明确本领域无需前置）'
  return {
    summary: {
      tool: 'dl_save_space_prereqs',
      status: 'ok',
      message:
        `主题学习前置要求已更新${detail}` +
        `${externalNames.length ? '；需自备的能力会展示给学习者，建议在讲第一张讲义时提醒从哪补' : ''}`,
      data: { items, inSpace: inSpaceNames, external: externalNames, note: p.note ?? null },
    },
  }
}

// ==================== save_book_suggestions（书籍建议；2026-10-04） ====================

/** 书籍建议条数上限（体系化领域经典著作有限，超过说明在堆砌） */
const BOOK_SUGGESTIONS_MAX = 10
const BOOK_PRIORITIES = ['essential', 'recommended', 'reference'] as const

/**
 * 落库「书籍建议」——知识体系规划后给用户的书籍内容提示（用户据此获取书籍上传绑定知识库）。
 * 全量替换语义（与主题前置同款）：模型每次给出完整清单；空数组 = 明确"本领域无需书籍"。
 * 校验口径：title 必填去重；priority 只收三档枚举（模型乱写按缺省处理，不拒绝）；条数封顶。
 */
async function saveBookSuggestions(
  db: ReturnType<typeof getCoreDatabaseManager>,
  spaceId: string,
  raw: Record<string, unknown>,
): Promise<{ summary: DlAgentActionSummary }> {
  const p = (raw.books ?? {}) as NonNullable<DlAgentActionParams['books']>
  if (!Array.isArray(p.items)) {
    throw new Error(
      'dl_save_book_suggestions：items 必填且必须是数组（每条 {title, author?, why?, priority?}；' +
        '确无值得推荐的书籍就传空数组显式说明）',
    )
  }
  const project = await db.dlProjects!.getById(spaceId)
  if (!project) throw new Error(`dl_save_book_suggestions：学习空间不存在（${spaceId}）`)

  const seen = new Set<string>()
  const items: DlBookSuggestion[] = []
  let dropped = 0
  for (const rawItem of p.items) {
    const item = (rawItem ?? {}) as Record<string, unknown>
    const title = typeof item.title === 'string' ? item.title.replace(/\s+/g, ' ').trim().slice(0, 200) : ''
    if (!title) {
      dropped++
      continue
    }
    const key = title.toLowerCase()
    if (seen.has(key)) {
      dropped++
      continue
    }
    seen.add(key)
    const priority = BOOK_PRIORITIES.find((x) => x === item.priority) as DlBookSuggestion['priority'] | undefined
    items.push({
      title,
      ...(typeof item.author === 'string' && item.author.trim()
        ? { author: item.author.replace(/\s+/g, ' ').trim().slice(0, 120) }
        : {}),
      ...(typeof item.why === 'string' && item.why.trim() ? { why: item.why.trim().slice(0, 400) } : {}),
      ...(priority ? { priority } : {}),
    })
    if (items.length >= BOOK_SUGGESTIONS_MAX) break
  }
  await db.dlProjects!.patch(spaceId, { bookSuggestions: items })

  const byPriority = (x: DlBookSuggestion['priority']): number => items.filter((b) => b.priority === x).length
  const detail = items.length
    ? `（共 ${items.length} 本：essential ${byPriority('essential')} / recommended ${byPriority('recommended')} / reference ${byPriority('reference')}${dropped ? `；丢弃无效/重复 ${dropped} 条` : ''}）`
    : '（已清空：明确本领域无需书籍，官方文档/在线资料已足够）'
  return {
    summary: {
      tool: 'dl_save_book_suggestions',
      status: 'ok',
      message:
        `书籍建议已更新${detail}` +
        `${items.length && project.kbId ? '；用户会把书籍上传到绑定知识库，后续研究可直接 wf_kb_retrieve 引用' : ''}` +
        `${items.length && !project.kbId ? '；本空间尚未绑定知识库，建议提醒用户先绑定再上传' : ''}`,
      data: { items, count: items.length, note: p.note ?? null },
    },
  }
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

  // 归属校验（2026-09-09 复盘）：两端必须存在且属于本空间（不落孤儿/跨界边）
  const src = await db.dlConcepts!.getById(r.sourceId)
  if (!src || src.projectId !== spaceId) throw new Error(`dl_save_relation：sourceId 不存在或不属于本空间（${r.sourceId}）`)
  const tgt = await db.dlConcepts!.getById(r.targetId)
  if (!tgt || tgt.projectId !== spaceId) throw new Error(`dl_save_relation：targetId 不存在或不属于本空间（${r.targetId}）`)

  const relationType = r.relationType ?? PREREQUISITE_TYPE
  // 环防护（2026-09-25 P0-1）：前置环会让环上所有概念永远无法标记掌握（ackMastered 死锁），
  // 建议态边确认后同样成环，故建议态就拦
  if (relationType === PREREQUISITE_TYPE) {
    const existing = await db.dlRelations!.listByProject(spaceId)
    if (
      wouldCreatePrereqCycle(
        existing.map((e) => ({ source: e.sourceId, target: e.targetId, type: e.relationType })),
        r.sourceId,
        r.targetId,
      )
    ) {
      throw new Error(
        `dl_save_relation：这条边会构成前置环（${tgt.name} →…→ ${src.name} → ${tgt.name}）——学习路径不允许循环依赖。` +
          `请检查方向是否写反（source 应是更基础的一方）；若两个概念实际互为前置，说明其中一个该拆细或合并，` +
          `不要硬连。已存在的那条链上的边可用地图人审里的「删除关系」移除。`,
      )
    }
  }
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
  expectedConceptId?: string | null,
): Promise<{ summary: DlAgentActionSummary }> {
  const card = (raw.card ?? {}) as NonNullable<DlAgentActionParams['card']>
  if (!card.conceptId) throw new Error('dl_save_card：conceptId 必填')
  if (!card.essenceType) throw new Error('dl_save_card：essenceType 必填（K-concept/K-oper/K-stmt/K-inst/K-agent/K-open）')
  if (!Array.isArray(card.sections) || card.sections.length === 0) throw new Error('dl_save_card：sections 至少一个区')
  // 证据口径（design-v3 §13；2026-10-06 用户口径修订：是否检索/联网由模型按知识点判断，
  // 简单稳定的概念可直接用先验产出）：
  // - 有真实来源 → evidenceSources 必须给（照旧，不得编造）；
  // - 纯先验产出 → 必须显式 needsVerification=true（落 attrs，自动核验会交叉补证、界面可见"待核验"），
  //   两者都不给则拒绝——防止"偷懒不检索又不声明"，把先验伪装成有据内容。
  const hasEvidence = Array.isArray(card.evidenceSources) && card.evidenceSources.length > 0
  if (!hasEvidence && !card.needsVerification) {
    throw new Error(
      'dl_save_card：evidenceSources 为空且未声明 needsVerification——二选一：补充真实来源（检索/联网后引用），或显式传 needsVerification=true 声明本卡为模型先验产出（将标注待核验）。不得编造来源。',
    )
  }

  // 归属校验（2026-09-09 复盘）：conceptId 必须存在且属于本空间；
  // 研究/概念级任务（runtimeContext 注入 conceptId）只能写当前研究概念，防跨界写
  const targetConcept = await db.dlConcepts!.getById(card.conceptId)
  if (!targetConcept || targetConcept.projectId !== spaceId) {
    throw new Error(`dl_save_card：概念不存在或不属于本空间（${card.conceptId}）`)
  }
  if (expectedConceptId && expectedConceptId !== card.conceptId) {
    throw new Error(`dl_save_card：目标概念（${card.conceptId}）与当前研究概念（${expectedConceptId}）不一致——请先切到该概念再研究它`)
  }

  // 讲义区集契约（2026-09-13 用户反馈「同一主题下不同知识点的结构/标题/答案形态各不相同」）：
  // 先把**能无损映射**的部分归一化——同义区名改规范名（checks→selfcheck、worked→examples…）、
  // 区标题与样式按本质类型模板派生、区正文小标题层级统一到 ###、自测答案拆成独立 answers 区；
  // 再校验区序（自造区名/乱序会被拒绝，拒绝信息里带上该类型的模板区序，模型据此重发）。
  // 归一化发生在下面的难度/渐进/数值门禁之前，好让后续门禁与落库看到同一份规范区集。
  const normalized = normalizeCardSections({
    essenceType: card.essenceType,
    sections: card.sections.map((s) => ({
      key: s.key,
      title: s.title ?? null,
      style: s.style ?? null,
      md: s.md,
      folded: s.folded,
      layout: s.layout ?? null,
      takeaway: s.takeaway ?? null,
    })),
  })
  const shape = checkLessonSectionsShape({ essenceType: card.essenceType, sections: normalized.sections })
  if (!shape.ok) throw new Error(`dl_save_card：${shape.reason}`)

  // 重点深度提醒（2026-09-15 用户反馈「重点不突出」；**非阻断**）：
  // 与数值自检同一模式——重点区（定义/详解/案例）写得太少、或导学把篇幅占了，就随落库结果
  // 把"哪一区、要补什么、补到多少字"回给模型，由模型补写后重发一版。
  // 不做硬门禁的理由：区是可选的（宁缺毋滥），硬拦"字数不够"会诱导模型**删区**而不是补写。
  const depth = checkLessonDepth({ essenceType: card.essenceType, sections: normalized.sections })

  // 讲义方案（Plan）一致性门禁（2026-09-14 讲义流水线）：
  // 有**已确认规格**时，落库区集必须与大纲一致（区名/区序/声明的载体）——Plan 与 Do 不能两张皮；
  // 没有大纲=快速模式（模型直接写），不阻断，但下面的视觉质检照样生效。
  const lessonPlan = await getConfirmedLessonSpec(db, spaceId, card.conceptId)
  if (lessonPlan && lessonPlan.essenceType !== card.essenceType) {
    throw new Error(
      `dl_save_card：本卡声明 essenceType=${card.essenceType}，而已确认的讲义方案是 ${lessonPlan.essenceType}——` +
        '本质类型决定模板区集，改类型等于换大纲：请按方案的类型落卡，或先 dl_propose_lesson_plan 提交新方案并等用户确认。',
    )
  }
  const plannedByKey = new Map(
    (lessonPlan?.spec.roster ?? []).map((r) => [canonicalSectionKey(r.key), r]),
  )

  // 版式设备（2026-09-14 用户反馈「纯文字堆砌、布局单调」）：
  // 模型给的 layout 优先（别名归一），其次大纲定的，最后按区 key 推导模板默认——
  // 保证**每一区都有确定的版式**，渲染层据此出要点卡/对比表/图解…而不是一律段落。
  const sections: DlCardSectionDto[] = normalized.sections.map((s) => {
    const planned = plannedByKey.get(canonicalSectionKey(s.key))
    const layout =
      canonicalLessonLayout(s.layout) ||
      canonicalLessonLayout(planned?.layout) ||
      defaultLayoutForSection(s.key)
    return {
      key: s.key,
      title: s.title ?? undefined,
      style: s.style ?? undefined,
      md: s.md,
      folded: s.folded,
      layout,
      takeaway: (s.takeaway ?? '').trim() || undefined,
    }
  })

  const planWarnings: LessonQualityIssue[] = []
  if (lessonPlan) {
    const agreement = checkLessonSpecAgreement({
      essenceType: lessonPlan.essenceType,
      spec: lessonPlan.spec,
      sections,
    })
    if (!agreement.ok) throw new Error(`dl_save_card：${formatQualityIssues(agreement.blocking)}`)
    planWarnings.push(...agreement.warnings)
  }

  // 视觉质检（2026-09-14）：**走完规划流程（有已确认讲义方案）时**，文字墙 / 通篇无图 / 声明版式与正文不符
  // 一律拒绝落卡；快速模式（自动推进、起步轮）同类问题降级为警告随结果回给模型——避免质检把讲义卡死产不出来。
  // 大纲声明的载体缺失与空区与模式无关（前者是 Plan↔Do 不一致，后者是空壳），始终阻断。
  const visual = checkLessonVisualQuality({
    essenceType: card.essenceType,
    // 用**归一化后的原始区集**（layout 仍是模型声明的那个，没声明就是 undefined）——
    // 下面落库用的 `sections` 里每区都已填好解析后的版式，若直接喂给它，
    // 模板兜底也会被当成"声明"，把老卡/快速模式误伤成阻断。
    sections: normalized.sections,
    roster: lessonPlan?.spec.roster ?? null,
    strict: !!lessonPlan,
  })
  if (visual.blocking.length) throw new Error(`dl_save_card：${formatQualityIssues(visual.blocking)}`)

  // 难度门禁（2026-09-09 复盘 + 用户拍板「遇超纲先补前置基础卡」）：
  // 目标=入门 且 讲义使用未做教学的进阶记号（∫/∂/iid/分布族…）→ 拒绝直接落卡并给出补前置路径
  const project = await db.dlProjects!.getById(spaceId)
  const spaceConcepts = await db.dlConcepts!.listByProject(spaceId)
  const gate = checkLessonDifficulty({
    goal: project?.goal ?? null,
    sections: sections.map((s) => ({ key: s.key, title: s.title ?? null, md: s.md })),
    knownConceptNames: spaceConcepts.map((c) => c.name),
  })
  if (gate.gated) throw new Error(`dl_save_card：${gate.reason}`)

  // 循序渐进门禁（2026-09-12 用户反馈「知识点要循序渐进」）：
  // 结构（meta 首区 + 前置声明）+ 前置能力（图里有对应前置概念，或本卡 meta 已教学）。
  // 与难度门禁的区别：**所有目标都生效**（此前只有「入门」被拦，工作应用下"张量→自动微分"
  // 这类跳步无人管）。
  const spaceRelations = await db.dlRelations!.listByProject(spaceId)
  const progression = checkLessonProgression({
    goal: project?.goal ?? null,
    conceptName: targetConcept.name,
    conceptId: card.conceptId,
    sections: sections.map((s) => ({ key: s.key, title: s.title ?? null, md: s.md })),
    concepts: spaceConcepts.map((c) => ({ id: c.id, name: c.name, nodeType: c.nodeType, hasLesson: !!c.cardId })),
    relations: spaceRelations.map((r) => ({ source: r.sourceId, target: r.targetId, type: r.relationType })),
    // 主题前置要求（2026-09-12）：门槛已在空间级明示 → 不强制图上有对应知识点
    spacePrerequisites: normalizeSpacePrereqs(project?.prerequisites),
  })
  if (progression.gated) throw new Error(`dl_save_card：${progression.reason}`)

  // 数值自检（2026-09-09 复盘）：回算正文里写出的算式，发现自相矛盾就提示（不阻断，交 verify 复核）
  const numericIssues = checkNumericStatements(sections.map((s) => s.md).join('\n\n'))

  // 升版留档（2026-09-09 复盘）：一律新建 version=旧+1 行，旧稿/旧核验保留；
  // 新稿 verification 置空（核验需针对新内容重跑，不继承旧判定）
  const existingCard = await db.dlCards!.getCurrentByConcept(spaceId, card.conceptId)
  const version = (existingCard?.version ?? 0) + 1
  const cardId = randomUUID()
  const attrs: Record<string, unknown> = {}
  if (card.needsVerification) attrs.needsVerification = true
  // 证据级别标注（与补图任务同口径）：零证据的先验卡显式标记，界面/核验可识别
  if (!hasEvidence) attrs.evidenceLevel = 'prior_needs_verification'

  await db.dlCards!.create({
    id: cardId,
    projectId: spaceId,
    conceptId: card.conceptId,
    essenceType: card.essenceType,
    sections,
    works: card.works ?? null,
    evidenceSources: card.evidenceSources,
    // 讲义规格随卡留档（渲染层出规格条/区导航；区级重写据此重发规格锁）
    spec: lessonPlan?.spec ?? null,
    version,
    status: 'draft',
  })
  // 概念挂最新 card（研究态 → 已提炼）
  await db.dlConcepts!.patch(targetConcept.id, {
    cardId,
    researchState: 'extracted',
    attrs: { ...(targetConcept.attrs ?? {}), ...attrs },
  })
  const qualityWarnings: LessonQualityIssue[] = [...planWarnings, ...visual.warnings]
  const deviceSummary = visual.stats.devices.map((d) => lessonLayoutName(d) || d).join('/')
  return {
    summary: {
      tool: 'dl_save_card',
      status: 'ok',
      message:
        `讲义已落库（v${version} 草稿，${sections.length} 区，证据 ${card.evidenceSources.length} 条` +
        `${visual.stats.graphicSections ? `，含图/表/公式/代码的区 ${visual.stats.graphicSections} 个` : ''}` +
        `${deviceSummary ? `，版式：${deviceSummary}` : ''}）` +
        `${lessonPlan ? '（按已确认讲义方案落库）' : '（快速模式：未走讲义方案确认）'}` +
        `${existingCard ? '，旧稿 v' + existingCard.version + ' 留档' : ''}` +
        `${normalized.changes.length ? `；结构已按 ${card.essenceType} 模板归一：${normalized.changes.join('；')}` : ''}` +
        `${shape.note ? `；${shape.note}` : ''}` +
        `${numericIssues.length ? `；⚠️ 数值自检发现 ${numericIssues.length} 处疑似不一致，请核对中间量后重发修订版` : ''}` +
        `${progression.warnings.length ? `；提示：${progression.warnings.join(' ')}` : ''}` +
        `${depth.issues.length ? `；⚠️ 重点提醒（${depth.summary}）：${depth.issues.map((i) => `${i.message}${i.fix}`).join(' ')}` : ''}` +
        `${qualityWarnings.length ? `；⚠️ 呈现提醒 ${qualityWarnings.length} 条：${qualityWarnings.map((i) => `${i.message}（${i.fix}）`).join(' ')}` : ''}`,
      data: {
        cardId,
        version,
        conceptId: card.conceptId,
        ...(numericIssues.length ? { numericIssues: numericIssues.map((i) => i.message) } : {}),
        ...(progression.warnings.length ? { progressionWarnings: progression.warnings } : {}),
        ...(shape.note ? { shapeNote: shape.note } : {}),
        ...(depth.issues.length ? { depthIssues: depth.issues.map((i) => i.message) } : {}),
        ...(qualityWarnings.length
          ? { layoutWarnings: qualityWarnings.map((i) => ({ code: i.code, sectionKey: i.sectionKey, message: i.message, fix: i.fix })) }
          : {}),
        layoutStats: {
          sections: visual.stats.sections,
          graphicSections: visual.stats.graphicSections,
          devices: visual.stats.devices,
        },
      },
    },
  }
}

/**
 * 质检问题 → 可执行的拒绝原因（模型据此重发，不照抄重发）。
 * 每条给出：哪一区、问题是什么、怎么改。
 */
function formatQualityIssues(issues: LessonQualityIssue[]): string {
  const lines = issues.map((i, idx) => {
    const where = i.sectionKey ? `[${i.sectionKey}]` : '[全文]'
    return `${idx + 1}. ${where} ${i.message}\n   → ${i.fix}`
  })
  return (
    `讲义未通过质检（${issues.length} 项，须先改好再落卡，读者体验不达标不落库）：\n` +
    lines.join('\n') +
    '\n改好后重发本卡（不要只删内容凑格式：要按建议把内容做成该有的形状）。'
  )
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
