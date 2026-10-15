/**
 * 领域学习排程/门控纯规则（D9：依赖拓扑 + 掌握度门控）
 * @module packs/domain-learning/rules/learning-sequence.rules
 *
 * 纯函数、零依赖（不碰 DB/agent），供 learning-graph 服务、dl 宿主与前端
 * 派生同一套选课/门控语义。关系方向约定：前置依赖边 source→target =
 * 学 target 前需掌握 source。入参用最小形状（字符串字段），不强绑 shared 类型。
 */

/** 概念最小形状（rules 只读 id/mastery/nodeType） */
export interface RuleConcept {
  id: string
  mastery: string
  nodeType: string
}

/** 关系最小形状（rules 只读 source/target/type） */
export interface RuleRelation {
  source: string
  target: string
  type: string
}

/** 门控只看「已理解」；需复习视为未掌握（要回访） */
export function isMastered(mastery: string): boolean {
  return mastery === 'mastered'
}

/** 概念 c 的全部前置概念 id（relation type=prerequisite 且 target=c） */
export function prerequisiteIdsOf(
  relations: RuleRelation[],
  conceptId: string,
): string[] {
  const out: string[] = []
  for (const e of relations) {
    if (e.type === 'prerequisite' && e.target === conceptId) out.push(e.source)
  }
  return out
}

/** 前置是否全部就绪（无前置 = 就绪） */
export function prereqsReady(
  conceptId: string,
  relations: RuleRelation[],
  masteredIds: ReadonlySet<string>,
): boolean {
  return prerequisiteIdsOf(relations, conceptId).every((p) => masteredIds.has(p))
}

/** 某概念当前是否可学：未掌握 ∧ 前置全就绪 */
export function isLearnable(
  concept: RuleConcept,
  relations: RuleRelation[],
  masteredIds: ReadonlySet<string>,
): boolean {
  if (concept.nodeType === 'group') return false // 目录不可学
  if (isMastered(concept.mastery)) return false
  return prereqsReady(concept.id, relations, masteredIds)
}

/**
 * 取「下一个待学概念」：按给定顺序扫描第一个可学的；
 * 全不可学时回退到第一个未掌握概念（原型同语义，允许插队）。
 * 返回 null = 全部已掌握。
 */
export function pickNextToLearn(
  concepts: RuleConcept[],
  relations: RuleRelation[],
): string | null {
  const masteredIds = new Set(concepts.filter((c) => isMastered(c.mastery)).map((c) => c.id))
  const learnable = concepts.find((c) => isLearnable(c, relations, masteredIds))
  if (learnable) return learnable.id
  const fallback = concepts.find((c) => !isMastered(c.mastery) && c.nodeType !== 'group')
  return fallback?.id ?? null
}

/**
 * 「没懂」拆解规则（D9）：同概念没懂计数达到阈值 → 建议拆成子概念入队。
 * 阈值来自设计（§7.1 交互要点：如 2 次）。
 */
export const CONFUSED_SPLIT_THRESHOLD = 2

export function shouldSuggestSplit(confusedCount: number, threshold = CONFUSED_SPLIT_THRESHOLD): boolean {
  return confusedCount >= threshold
}
