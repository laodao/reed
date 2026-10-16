/**
 * 讲义「循序渐进」门禁（纯函数；2026-09-12 用户反馈「知识点要循序渐进」落地）
 * @module packs/domain-learning/rules/learning-progression.rules
 *
 * 背景（用户实测「深度学习」空间）：领域图里只有 7 个概念（张量 → 自动微分与反向传播 →
 * 多层感知机 → …），张量之后直接跳到自动微分/反向传播；而 2026-09-09 落地的
 * `learning-difficulty.rules` 只对**入门**目标设门禁，工作应用/前沿目标不设——
 * 于是"学完张量就能学自动微分吗？"这类跳步在图上无人拦。
 *
 * 口径（与既有难度门禁同源，用户拍板「遇超纲先补前置基础卡」的推广）：
 * 1. **结构**：讲义首区必须是 `meta`（读者画像/前置声明/记号热身/可测目标），
 *    没有 meta 就没有"读者站在哪"的说明；
 * 2. **前置声明**：meta 必须交代前置（"已掌握 X / 无需前置"），读者才知道门槛；
 * 3. **前置能力**：讲义用到某类前置能力（线性代数/导数与链式法则/极限/积分/概率/
 *    随机变量/期望方差/测度）时，必须**二选一**：
 *    a) 领域图里有对应前置概念（名称命中），且它已有讲义或已是本概念的前置祖先；
 *    b) 本卡 meta 区把它当作记号/前置讲清楚（记号热身 / 读法 / 符号表）。
 *    两者都不满足 → 拒绝落卡，并把「先建哪些概念、建什么关系、先给谁出讲义」写进错误信息。
 *
 * 说明：门禁只看"能不能落卡"，不看历史数据；既有讲义照常展示，不回改。
 */

import { hasNotationTeaching } from './learning-difficulty.rules'
import { coveredBySpacePrereqs, isPrerequisiteAncestor } from './learning-prerequisites.rules'
import type { DlSpacePrereq } from '@shared/types/domain-learning.types'

/** 前置能力：正文命中信号 + 领域图里算作"已具备该能力"的概念名关键词 */
export interface PrereqSkill {
  id: string
  /** 给人看的能力名 */
  label: string
  /** 正文命中信号（命中即视为需要该前置能力） */
  re: RegExp
  /**
   * 领域图里满足该能力的概念名关键词（子串匹配）。
   * 同一条也用于**自指豁免**：当前概念名本身包含这些关键词时，说明本卡讲的就是这个
   * 前置能力（如「梯度下降与优化器」之于「梯度」），不再要求另有一个同名前置概念。
   */
  conceptNames: string[]
}

/**
 * 前置能力清单。
 * 只收"公认是前置、且缺了必然学不动"的能力；不收本概念自身的内容
 * （例如「计算图」属于反向传播自身，不作为前置要求，避免自指死锁）。
 */
export const PREREQ_SKILLS: PrereqSkill[] = [
  {
    id: 'linear-algebra',
    label: '线性代数（矩阵/向量运算）',
    re: /矩阵乘法|矩阵乘|转置|\\top\b|⊤|线性代数|特征值|特征向量/,
    conceptNames: ['线性代数', '矩阵', '向量空间'],
  },
  {
    id: 'derivative',
    label: '导数与链式法则',
    re: /导数|求导|微分|链式法则|链式求导|∂|\\partial\b|梯度|∇|\\nabla\b/,
    conceptNames: ['导数', '链式法则', '微积分', '梯度'],
  },
  {
    id: 'limit',
    label: '极限',
    re: /极限|\blim\b|\\lim\b/,
    conceptNames: ['极限'],
  },
  {
    id: 'integral',
    label: '积分',
    re: /∫|\\int\b|积分/,
    conceptNames: ['积分'],
  },
  {
    id: 'probability',
    label: '概率基础（条件概率/贝叶斯）',
    re: /条件概率|贝叶斯|先验概率|后验概率|全概率/,
    conceptNames: ['概率'],
  },
  {
    id: 'random-variable',
    label: '随机变量与分布',
    re: /随机变量|分布族|\\mathcal\{N\}|N\(\\mu|iid|独立同分布|正态分布/,
    conceptNames: ['随机变量', '分布'],
  },
  {
    id: 'expectation',
    label: '期望与方差',
    re: /\\mathbb\{E\}|\\operatorname\{Var\}|\bE\[|\bVar\(|期望|方差/,
    conceptNames: ['期望', '方差'],
  },
  {
    id: 'measure',
    label: '测度/σ-代数',
    re: /σ-?代数|测度/,
    conceptNames: ['测度'],
  },
]

/** 前置声明标识（meta 区必须交代门槛） */
const PREREQ_DECLARATION_MARKERS = ['前置', '已掌握', '假设你已', '无需', '不需要', '零基础']

/** 讲义区最小形状 */
export interface ProgressionSection {
  key: string
  title?: string | null
  md: string
}

/** 空间概念最小形状 */
export interface ProgressionConcept {
  id: string
  name: string
  nodeType?: string
  /** 是否已有讲义（渲染/教学可用） */
  hasLesson?: boolean
}

/** 关系边最小形状（type=prerequisite 时 source 是 target 的前置） */
export interface ProgressionRelation {
  source: string
  target: string
  type: string
}

export interface ProgressionGateInput {
  goal?: string | null
  /** 概念名（错误信息里回显，便于模型定位） */
  conceptName?: string | null
  conceptId?: string | null
  sections: ProgressionSection[]
  concepts?: ProgressionConcept[]
  relations?: ProgressionRelation[]
  /**
   * 主题学习前置要求（dl_project.prerequisites；2026-09-12）。
   * 门槛已在空间级明示给学习者时，不再强制图上有对应前置知识点。
   */
  spacePrerequisites?: DlSpacePrereq[]
}

export interface ProgressionGateResult {
  /** true = 拒绝落卡（先补前置/补 meta，再重试） */
  gated: boolean
  /** 命中的前置能力 label（诊断用） */
  requiredSkills: string[]
  /** 缺失（图中无对应概念且未在卡内教学）的前置能力 label */
  missingSkills: string[]
  /** 非阻断提醒（如"前置概念还没有讲义"） */
  warnings: string[]
  /** 给人/模型看的理由（未 gated 时为空串） */
  reason: string
}


/** 前置声明是否已交代（meta 区文本） */
export function hasPrerequisiteDeclaration(text: string): boolean {
  const src = String(text ?? '')
  return PREREQ_DECLARATION_MARKERS.some((m) => src.includes(m))
}

/** 正文命中的前置能力（去重） */
export function detectRequiredSkills(text: string): PrereqSkill[] {
  const src = String(text ?? '')
  return PREREQ_SKILLS.filter((s) => s.re.test(src))
}

/** 合并区集为诊断文本（含标题，避免标题里的信号漏检） */
function mergeSections(sections: ProgressionSection[]): string {
  return (sections ?? []).map((s) => `## ${s.title ?? s.key}\n${s.md}`).join('\n\n')
}

/** meta 区文本（首区为 meta 时取首区，否则取 key=meta 的区） */
function metaTextOf(sections: ProgressionSection[]): string {
  const head = sections?.[0]
  if (head?.key === 'meta') return head.md ?? ''
  return sections?.find((s) => s.key === 'meta')?.md ?? ''
}

/**
 * 循序渐进门禁判定。
 * 详见模块头注释的三条口径。
 */
export function checkLessonProgression(input: ProgressionGateInput): ProgressionGateResult {
  const sections = input.sections ?? []
  const concepts = (input.concepts ?? []).filter((c) => c.nodeType !== 'group')
  const relations = input.relations ?? []
  const spacePrereqs = input.spacePrerequisites ?? []
  const conceptId = input.conceptId ?? ''
  const merged = mergeSections(sections)
  const metaText = metaTextOf(sections)

  const empty: Pick<ProgressionGateResult, 'requiredSkills' | 'missingSkills' | 'warnings'> = {
    requiredSkills: [],
    missingSkills: [],
    warnings: [],
  }

  // G1 结构：首区必须是 meta
  if (sections.length === 0 || sections[0].key !== 'meta') {
    return {
      ...empty,
      gated: true,
      reason:
        '讲义首区必须是 key=meta 的「学习前必读」区（读者画像 + 前置声明 + 记号热身 + 可测学习目标）——' +
        '没有它读者不知道自己站在哪、这一讲假设你已会什么。请把 meta 区放到 sections 首位后重发。',
    }
  }

  // G2 前置声明：meta 必须交代门槛
  if (!hasPrerequisiteDeclaration(metaText)) {
    return {
      ...empty,
      gated: true,
      reason:
        'meta 区缺少「前置声明」：请写明本讲假设读者已掌握的前置（如"已掌握：张量、矩阵乘法"），' +
        '确无前置也要明说（如"无需前置，会四则运算即可"）。知识点要循序渐进，读者必须先知道门槛在哪。',
    }
  }

  // G3 前置能力：图中要有对应概念，或本卡 meta 已教学
  const required = detectRequiredSkills(merged)
  const missing: PrereqSkill[] = []
  const warnings: string[] = []
  const selfName = String(input.conceptName ?? '')
  /** 自指豁免：当前概念本身就是该前置能力（如「梯度下降」之于「梯度」） */
  const isSelf = (skill: PrereqSkill): boolean => !!selfName && skill.conceptNames.some((n) => selfName.includes(n))

  for (const skill of required) {
    if (isSelf(skill)) continue
    // a) 领域图里有对应前置概念
    const matched = concepts.filter(
      (c) => c.id !== conceptId && skill.conceptNames.some((n) => c.name.includes(n)),
    )
    if (matched.length > 0) {
      const usable = matched.filter((c) => c.hasLesson || isPrerequisiteAncestor(relations, conceptId, c.id))
      if (usable.length > 0) continue
      // 概念在图上但还没讲义、也没排在本概念之前 → 先补讲义/补顺序
      missing.push(skill)
      warnings.push(
        `前置概念「${matched[0].name}」还没有讲义、也没排在本概念之前——建议先为它出讲义并建 prerequisite（${matched[0].name} → 本概念）。`,
      )
      continue
    }
    // b) 主题前置要求里已声明该能力（门槛已明示：需自备/另行补课）
    if (coveredBySpacePrereqs(skill.label, skill.conceptNames, spacePrereqs)) continue
    // c) 本卡 meta 区把它当记号/前置讲清楚了
    const taughtInMeta = hasNotationTeaching(metaText) && skill.re.test(metaText)
    if (taughtInMeta) continue
    missing.push(skill)
  }

  if (missing.length > 0) {
    const labels = missing.map((s) => s.label).join('、')
    const conceptHints = missing.map((s) => s.conceptNames[0]).join('」「')
    return {
      gated: true,
      requiredSkills: required.map((s) => s.label),
      missingSkills: missing.map((s) => s.label),
      warnings: [
        ...warnings,
        '也可以选择在 meta 区把它们当记号讲清楚（给读法 + 最小例子）后重发——但知识点顺序仍建议在图上补齐。',
      ],
      reason:
        `本讲义用到前置能力（${labels}），但领域图里没有对应的前置概念，本卡 meta 也没教——` +
        `学完当前前置直接学它会跳步。请先补前置：用 dl_save_concept 建立「${conceptHints}」等基础概念，` +
        `用 dl_save_relation 建 prerequisite 关系（基础 → 本概念）并让它们排在本概念之前，` +
        `再为其中最基础的那个先 dl_save_card 出讲义，然后回来重发本卡；` +
        `或在 meta 区以「记号热身」逐条给出读法与最小例子。`,
    }
  }

  // 非阻断提醒：图中已有前置概念但尚无讲义（学习者点开会是空的）
  for (const skill of required) {
    if (isSelf(skill)) continue
    for (const c of concepts) {
      if (c.id === conceptId) continue
      if (!skill.conceptNames.some((n) => c.name.includes(n))) continue
      if (!c.hasLesson && !warnings.some((w) => w.includes(`「${c.name}」`))) {
        warnings.push(`前置概念「${c.name}」尚无讲义，建议先为它出讲义再学本概念。`)
      }
    }
  }

  return {
    gated: false,
    requiredSkills: required.map((s) => s.label),
    missingSkills: [],
    warnings,
    reason: '',
  }
}
