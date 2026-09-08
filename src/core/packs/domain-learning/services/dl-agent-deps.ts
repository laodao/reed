/**
 * 领域学习 Agent 依赖：状态快照 / 建议 / 系统提示词
 * @module packs/domain-learning/services/dl-agent-deps
 *
 * 快照 = 从 dl_* 业务表重建的领域状态文本（F9：库是权威源，不用 AI 复述）。
 * research 模式：给空间概览 + 目标概念现状 + 知识库命中提示；tutor 模式：
 * 给当前讲义全文摘要 + 相关概念定义 + 图关系（引证基础）。
 */

import { pickNextToLearn } from '../rules/learning-sequence.rules'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'

/** 快照信息（宿主每轮装配时调用） */
export interface DlSpaceSnapshot {
  text: string
  /** 下一步建议（"继续学习"目标概念） */
  nextConceptId: string | null
}

export async function computeDlSpaceSnapshot(
  db: ICoreDatabaseManager,
  spaceId: string,
  conceptId?: string | null,
): Promise<DlSpaceSnapshot> {
  const project = (await db.dlProjects?.getById(spaceId)) ?? null
  const concepts = (await db.dlConcepts?.listByProject(spaceId)) ?? []
  const relations = (await db.dlRelations?.listByProject(spaceId)) ?? []
  const cardRepo = db.dlCards

  const concept = conceptId ? concepts.find((c) => c.id === conceptId) : null
  const conceptText: string[] = []
  if (concept) {
    const card = concept.cardId
      ? await cardRepo?.getById(concept.cardId)
      : await cardRepo?.getCurrentByConcept(spaceId, concept.id)
    conceptText.push(`当前概念：${concept.name}（${concept.nodeType}，掌握度 ${concept.mastery}，研究态 ${concept.researchState}）`)
    if (concept.definitionShort) conceptText.push(`一句话定义：${concept.definitionShort}`)
    if (card) {
      const heads = card.sections.slice(0, 6).map((s) => `[${s.title ?? s.key}] ${s.md.slice(0, 300)}`)
      conceptText.push(`讲义（${card.sections.length} 区）：\n${heads.join('\n')}`)
    } else {
      conceptText.push('（尚无讲义——需研究产出后教学）')
    }
    const relLines = relations
      .filter((r) => r.sourceId === concept.id || r.targetId === concept.id)
      .map((r) => {
        const other = concepts.find((c) => c.id === (r.sourceId === concept!.id ? r.targetId : r.sourceId))
        return `${r.sourceId === concept!.id ? '→' : '←'} ${r.relationType} ${other?.name ?? (r.sourceId === concept!.id ? r.targetId : r.sourceId)}`
      })
    if (relLines.length) conceptText.push(`相关概念：${relLines.join('；')}`)
  } else {
    conceptText.push('（当前未聚焦具体概念——回答空间层面的泛问）')
  }

  const leafCount = concepts.filter((c) => c.nodeType !== 'group').length
  const masteredCount = concepts.filter((c) => c.mastery === 'mastered').length
  const ready = pickNextToLearn(
    concepts.map((c) => ({ id: c.id, mastery: c.mastery, nodeType: c.nodeType })),
    relations.map((r) => ({ source: r.sourceId, target: r.targetId, type: r.relationType })),
  )

  const head = [
    `学习空间：${project?.name ?? spaceId}（目标：${project?.goal ?? '—'}）`,
    `掌握度：${masteredCount}/${leafCount} 个知识概念已理解`,
    ready ? `推荐下一个待学概念：${concepts.find((c) => c.id === ready)?.name ?? ready}` : '（全部已理解）',
  ]

  return {
    text: [...head, ...conceptText].join('\n'),
    nextConceptId: ready,
  }
}

/** 轮次结束建议（前端"继续学习/查看概念"入口） */
export function buildDlSuggestions(snapshot: DlSpaceSnapshot): string[] {
  const out: string[] = []
  if (snapshot.nextConceptId) out.push(`继续学习：${snapshot.nextConceptId}`)
  return out
}

/** 系统提示词：研究模式（会研究教到用户；产出落草稿交人审） */
export function dlResearchSystemPrompt(): string {
  return `你是「领域共学空间」的研究助手：对某个领域的知识点做研究，并产出可供用户学习的结构化讲义。

你的工作纪律：
1. 需要研究概念时，先调用 discover_capabilities 查看可用技能，再用 invoke_skill 调用 learning-domain-map（建骨架）或 learning-concept-explainer（单概念讲义）；
2. 研究产出经 dl_save_concept / dl_save_relation 把概念与关系建议落为草稿（用户会在地图人审中确认），经 dl_save_card 把讲义卡片落为草稿；
3. 讲义必须带 evidence：dl_save_card 的 evidenceSources 至少一条，否则工具会拒绝——宁可少产出一条，也不落无出处的断言；
4. 模型先验与资料要区分：先验内容在卡片 attrs 或注释里标 needs_verification；
5. 不要重复执行刚成功的同一动作；动作失败可换参数重试一次；
6. 全部完成后用一段话总结：研究了什么、产出哪些草稿、下一步建议（等用户人审/继续学习）。`
}

/** 系统提示词：答疑模式（从已有知识有据回答，答不上登记未解问题） */
export function dlTutorSystemPrompt(): string {
  return `你是「领域共学空间」的私人学习辅导，陪用户搞懂当前概念，耐心、直接、有据。

回答纪律：
1. 先给直接答案，再给理由；引用来源（当前讲义区 / 相关概念定义 / 图内关系）——引用内容已随快照注入，不要编造讲义没有的内容；
2. 能答上时调用 dl_answer_question 把"问题+答案+来源"存档（answerSource 用 lesson/graph/kb）；
3. 分不清或现有资料答不上时：如实告诉用户"这个我不确定"，并调用 dl_answer_question 仅登记未解（不写答案）——该问题会留在队列，可开启新研究；
4. 用户没懂时，换角度用类比/反例重讲，可建议去讲义对应区再看；
5. 绝不替用户宣称"懂了"：掌握度由用户在界面上确认，你只负责讲清楚。`
}
