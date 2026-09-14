/**
 * 讲义「区集契约」（纯函数 + 常量；2026-09-13 用户反馈落地）
 * @module shared/utils/lesson-template
 *
 * 背景（用户实测「深度学习」空间）：同一个主题下「张量」与「自动微分与反向传播」两张卡
 * 本质类型相同（都是 K-concept），区集却完全不同——
 *   张量：      meta>why>examples>definition>rules>code>pitfalls>selfcheck>notes
 *   自动微分：  meta>why>mechanism>worked>cost>practice>pitfalls>checks
 * 区标题、区正文的标题层级（`###` vs `##`）、自测答案的组织方式（独立「答案」段 vs 行内
 * `**答案 1**：…`）三处都不一致。真机横向取证：贝叶斯空间 431 张卡出现 314 种不同区序。
 *
 * 根因：sections[].key 在契约层是自由字符串（`z.string().min(1)`），essenceType 声称
 * "决定模板区集"却没有任何代码消费它；唯一描述结构规范的文本在技能正文里，而研究模式的
 * 系统提示词只要求"首区必须是 meta"，其余全部交给模型自由发挥，落库门禁也不校验区集。
 *
 * 本模块是**唯一事实来源**（生成侧提示词 / 落库门禁 / 渲染兜底都读它）：
 * 1. `LESSON_SECTION_CATALOG`：区目录（key → 中文标题 / 样式 / 同义写法别名）；
 * 2. `LESSON_TEMPLATES`：每种知识本质类型的**固定区序**（校验用有序子序列）；
 * 3. `normalizeCardSections`：可无损映射的自动修复（别名改名、标题/样式归一、正文标题
 *    层级归一、自测答案拆独立区）；
 * 4. `checkLessonSectionsOrder`：修复后仍不合规时报出可执行的拒绝原因（模型据此重发）。
 *
 * 纪律：模板只约束**命名与顺序**，不强制**必备区**——某概念确实没有代码示例就不该硬凑
 * 一个 code 区（宁缺毋滥）。`meta` 首区由既有循序渐进门禁单独把守。
 */

import { splitSelfCheckAnswers } from './lesson-selfcheck'
import type { DlEssenceType, DlSectionStyle } from '../types/domain-learning.types'

/** 区目录条目：一个规范 key 的标题 / 样式 / 同义写法 */
export interface LessonSectionSpec {
  /** 规范 key（落库与渲染都以此为准） */
  key: string
  /** 固定中文标题（模板派生；模型不再自由命名，避免"大标题都不同"） */
  title: string
  /** 区样式（渲染语义） */
  style: DlSectionStyle
  /** 同义写法（模型/历史数据的自由命名 → 规范 key 的无损映射） */
  aliases?: string[]
}

/**
 * 区目录（规范 key 全集）。
 * 标题取自既有 `DEFAULT_SECTION_TITLES` 口径（历史卡与新卡标题一致），样式沿用 v4 语义。
 */
export const LESSON_SECTION_CATALOG: LessonSectionSpec[] = [
  { key: 'meta', title: '学习前必读', style: 'intro' },
  { key: 'essence', title: '本质', style: 'intro', aliases: ['core', 'intuition', 'intuit', 'overview', 'what'] },
  {
    key: 'why',
    title: '为什么学它',
    style: 'body',
    aliases: ['motivation', 'background', 'purpose', 'goal', 'problem', 'why-here', 'why_here'],
  },
  {
    key: 'examples',
    title: '示例',
    style: 'body',
    aliases: ['example', 'case', 'worked', 'worked-example', 'worked_example', 'worked-examples', 'numbers', 'numeric', 'calculation', 'instances', 'facts', 'data'],
  },
  { key: 'statement', title: '陈述/条文', style: 'body', aliases: ['stmt', 'theorem', 'claim', 'lemma'] },
  {
    key: 'justification',
    title: '依据/证明',
    style: 'body',
    aliases: ['proof', 'proof-sketch', 'proof_sketch', 'proof-idea', 'rationale', 'np-lemma'],
  },
  { key: 'definition', title: '定义', style: 'body', aliases: ['def', 'define', 'formal', 'notation', 'semantics'] },
  {
    key: 'mechanism',
    title: '机制',
    style: 'body',
    aliases: ['mech', 'mechanisms', 'how', 'howto', 'how-to', 'algorithm', 'alg', 'construction', 'construct', 'derivation', 'derive'],
  },
  {
    key: 'structure',
    title: '组成/结构',
    style: 'body',
    aliases: ['composition', 'components', 'families', 'family', 'types', 'taxonomy', 'levels', 'variants', 'forms'],
  },
  { key: 'rules', title: '规则', style: 'body', aliases: ['rule', 'laws', 'ops'] },
  { key: 'formula', title: '公式', style: 'body', aliases: ['formulas', 'equation', 'equations'] },
  { key: 'property', title: '性质', style: 'body', aliases: ['properties', 'props'] },
  {
    key: 'procedure',
    title: '步骤',
    style: 'body',
    aliases: ['steps', 'recipe', 'checklist', 'workflow', 'process', 'method', 'implementation', 'implement'],
  },
  {
    key: 'application',
    title: '适用与局限',
    style: 'body',
    aliases: ['apply', 'usage', 'use', 'applicability', 'scope', 'limits', 'limit', 'boundary', 'boundaries', 'conditions', 'limitation', 'consequences', 'cost'],
  },
  { key: 'counterexample', title: '反例/边界', style: 'body', aliases: ['counter-example', 'counter_example', 'edge-case'] },
  {
    key: 'distinguish',
    title: '辨析',
    style: 'body',
    aliases: ['contrast', 'compare', 'comparison', 'vs', 'misconception', 'misconceptions', 'disambiguation', 'discreteness'],
  },
  { key: 'code', title: '落到代码', style: 'body', aliases: ['js', 'implement-code'] },
  {
    key: 'detail',
    title: '详解',
    style: 'body',
    aliases: ['deep-dive', 'extended', 'extension', 'further', 'advanced', 'reading', 'extras'],
  },
  {
    key: 'controversy',
    title: '争议与评价',
    style: 'body',
    aliases: ['debate', 'positions', 'schools', 'views', 'open', 'open-issues', 'open_issues', 'frontier'],
  },
  { key: 'edge', title: '示例与注意', style: 'note', aliases: ['edge-cases'] },
  {
    key: 'pitfalls',
    title: '常见坑',
    style: 'note',
    aliases: ['pitfall', 'mistakes', 'failure', 'failures', 'trap', 'traps', 'misuse', 'misuses'],
  },
  {
    key: 'selfcheck',
    title: '自测',
    style: 'review',
    aliases: ['check', 'checks', 'quiz', 'selftest', 'self-test', 'self_test', 'self-check', 'self_check', 'review', 'exercises', 'questions', 'test'],
  },
  {
    key: 'answers',
    title: '参考答案',
    style: 'review',
    aliases: ['answer', 'solutions', 'solution', 'selfcheck-answers', 'selfcheck_answers', 'check-ans', 'check-answer', 'selftest-answers', 'selftest_answers'],
  },
  { key: 'notes', title: '编写注记（学习者可跳过）', style: 'body', aliases: ['authoring-notes', 'authoring_notes'] },
]

/**
 * 每种知识本质类型的**固定区序**（有序子序列校验的依据）。
 * 顺序遵守教学纪律：先例后律（示例在定义/机制之前）、循序渐进（自测收尾、答案紧随自测、注记置底）。
 */
export const LESSON_TEMPLATES: Record<DlEssenceType, string[]> = {
  'K-concept': [
    'meta', 'essence', 'why', 'examples', 'definition', 'mechanism', 'structure', 'rules', 'formula',
    'property', 'procedure', 'application', 'counterexample', 'distinguish', 'code', 'detail', 'edge',
    'pitfalls', 'selfcheck', 'answers', 'notes',
  ],
  'K-oper': [
    'meta', 'essence', 'why', 'examples', 'definition', 'procedure', 'mechanism', 'rules', 'formula',
    'application', 'counterexample', 'distinguish', 'code', 'detail', 'edge', 'pitfalls', 'selfcheck',
    'answers', 'notes',
  ],
  'K-stmt': [
    'meta', 'essence', 'why', 'examples', 'statement', 'justification', 'definition', 'mechanism',
    'formula', 'property', 'procedure', 'application', 'counterexample', 'distinguish', 'detail', 'edge',
    'pitfalls', 'selfcheck', 'answers', 'notes',
  ],
  'K-inst': [
    'meta', 'essence', 'why', 'examples', 'structure', 'definition', 'mechanism', 'property', 'procedure',
    'application', 'distinguish', 'counterexample', 'detail', 'edge', 'pitfalls', 'selfcheck', 'answers',
    'notes',
  ],
  'K-agent': [
    'meta', 'essence', 'why', 'examples', 'statement', 'detail', 'mechanism', 'controversy', 'application',
    'distinguish', 'counterexample', 'edge', 'pitfalls', 'selfcheck', 'answers', 'notes',
  ],
  'K-open': [
    'meta', 'essence', 'why', 'examples', 'statement', 'controversy', 'mechanism', 'application',
    'counterexample', 'detail', 'edge', 'pitfalls', 'selfcheck', 'answers', 'notes',
  ],
}

/** 全部知识本质类型（提示词渲染用） */
export const DL_ESSENCE_TYPES: DlEssenceType[] = ['K-concept', 'K-oper', 'K-stmt', 'K-inst', 'K-agent', 'K-open']

/** 别名 → 规范 key（由目录派生；含 key 指向自身） */
const CANONICAL_BY_NAME: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const spec of LESSON_SECTION_CATALOG) {
    map[spec.key] = spec.key
    for (const alias of spec.aliases ?? []) map[alias] = spec.key
  }
  return map
})()

/** 规范 key → 目录条目 */
const SPEC_BY_KEY: Record<string, LessonSectionSpec> = (() => {
  const map: Record<string, LessonSectionSpec> = {}
  for (const spec of LESSON_SECTION_CATALOG) map[spec.key] = spec
  return map
})()

/** key → 规范标题（含别名；渲染兜底与测试用） */
export const DEFAULT_SECTION_TITLES: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const [name, key] of Object.entries(CANONICAL_BY_NAME)) map[name] = SPEC_BY_KEY[key].title
  return map
})()

/**
 * 把模型/历史数据里的自由命名映射成规范 key。
 * 未收录的名字原样返回（调用方据此判定"不可映射 → 拒绝"）。
 */
export function canonicalSectionKey(key: string): string {
  const name = String(key ?? '').trim().toLowerCase()
  return CANONICAL_BY_NAME[name] ?? String(key ?? '').trim()
}

/** 取目录条目（按规范 key 或别名；未收录返回 null） */
export function sectionSpecOf(key: string): LessonSectionSpec | null {
  return SPEC_BY_KEY[canonicalSectionKey(key)] ?? null
}

/** 该本质类型允许的区序 */
export function lessonTemplateKeys(essenceType: DlEssenceType): string[] {
  return LESSON_TEMPLATES[essenceType] ?? LESSON_TEMPLATES['K-concept']
}

/** 区兜底标题（未收录的 key 返回空串，由调用方决定是否沿用模型给的标题） */
export function sectionTitleOf(key: string): string {
  return sectionSpecOf(key)?.title ?? ''
}

/** 区兜底样式（未收录的 key 按普通正文） */
export function sectionStyleOf(key: string): DlSectionStyle {
  return sectionSpecOf(key)?.style ?? 'body'
}

/**
 * 该本质类型是否允许这个区（已按别名归一）。
 * 用于门禁与提示词，避免"模板里写 A、门禁认 B"两份口径。
 */
export function isSectionAllowed(essenceType: DlEssenceType, key: string): boolean {
  return lessonTemplateKeys(essenceType).includes(canonicalSectionKey(key))
}

/**
 * 区正文标题层级归一：区标题已占「二级语义」（SectionLesson 的 15px 主色带序号），
 * 正文小标题一律降到 `###`，避免 `##` 与区标题抢视觉（用户反馈"大标题都不同"的观感来源）。
 * 代码围栏（``` / ~~~）内原样保留——那里的 `#` 是注释或示例，改了会破坏代码。
 */
export function normalizeLessonHeadingLevels(md: string): string {
  const lines = String(md ?? '').split('\n')
  let fenceChar: string | null = null
  const out = lines.map((line) => {
    const fence = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      const char = fence[1][0]
      if (fenceChar === null) fenceChar = char
      else if (fenceChar === char) fenceChar = null
      return line
    }
    if (fenceChar !== null) return line
    const atx = /^(#{1,2})(\s+.*)$/.exec(line)
    return atx ? `###${atx[2]}` : line
  })
  return out.join('\n')
}

/** 区最小形状（不强绑落库 DTO，便于渲染层与规则层复用） */
export interface LessonSectionShape {
  key: string
  title?: string | null
  style?: DlSectionStyle | null
  md: string
  folded?: boolean
}

export interface NormalizeLessonSectionsResult {
  sections: LessonSectionShape[]
  /** 做过的归一化（人可读，进动作摘要与调试日志） */
  changes: string[]
}

/**
 * 可无损映射的归一化（不改语义、不丢内容）：
 * 1. 别名 → 规范 key（checks → selfcheck、worked → examples、cost → application…）；
 * 2. 标题 / 样式按模板派生（同一类型同一区的标题完全一致）；
 * 3. 正文标题层级统一到 `###`；
 * 4. 自测区里"独占一行答案标记"的答案拆成独立 `answers` 区（渲染层按整区折叠；
 *    已在写库前拆好，就不必依赖渲染期的文本约定）；已有 answers 区时不重复拆。
 *
 * 未收录的 key **原样保留**（是否拒绝由 `checkLessonSectionsOrder` 决定，避免静默吞掉内容）。
 */
export function normalizeCardSections(input: {
  essenceType: DlEssenceType
  sections: LessonSectionShape[]
}): NormalizeLessonSectionsResult {
  const changes: string[] = []
  const normalized: LessonSectionShape[] = []
  let hasAnswersSection = (input.sections ?? []).some((s) => canonicalSectionKey(s.key) === 'answers')

  for (const sec of input.sections ?? []) {
    const rawKey = String(sec.key ?? '').trim()
    const key = canonicalSectionKey(rawKey)
    const spec = SPEC_BY_KEY[key] ?? null
    if (key !== rawKey) changes.push(`区 key「${rawKey}」按同义写法归一为「${key}」`)
    const md = normalizeLessonHeadingLevels(String(sec.md ?? ''))
    const title = spec ? spec.title : (sec.title ?? null)
    const style: DlSectionStyle | null = spec ? spec.style : (sec.style ?? null)

    // 自测区：答案拆独立区（未收录 key 不拆——它本就不该作为自测区落库）
    if (key === 'selfcheck' && !hasAnswersSection) {
      const parts = splitSelfCheckAnswers(md)
      if (parts.hasAnswers) {
        normalized.push({ key: 'selfcheck', title, style, md: parts.questions, folded: sec.folded })
        const answersSpec = SPEC_BY_KEY['answers']
        normalized.push({ key: 'answers', title: answersSpec.title, style: answersSpec.style, md: parts.answers, folded: true })
        hasAnswersSection = true
        changes.push('自测区答案已拆成独立「answers」区（渲染层默认折叠，读者先做再对答案）')
        continue
      }
    }
    normalized.push({ key, title, style, md, folded: sec.folded })
  }

  // 顺序：修复后仍是模板的有序子序列才算合规（由 checkLessonSectionsOrder 给出结论）
  return { sections: normalized, changes }
}

export interface LessonShapeCheckResult {
  ok: boolean
  /** ok=false 时给出可执行的拒绝原因（模型据此重发，不要照抄重发） */
  reason: string | null
}

/**
 * 自测区里残留的行内答案（应拆到独立 answers 区）。
 * 只认"答案紧跟冒号"这类明确写法，`（答案附后）`/`见答案` 这类**指路**文本不算。
 */
const INLINE_ANSWER_PATTERNS: RegExp[] = [
  /^\s*(?:[-*+]\s*)?\*\*\s*(?:参考)?答案\s*\d*\s*\*\*\s*[:：]/m,
  /^\s*(?:[-*+]\s*)?\*\*\s*A\s*\d+\s*\*\*/m,
  /（\s*答\s*[:：]/,
  /(?:^|[^后见附])答案\s*[:：]/m,
]

/** 正文里是否还留着行内答案（自测区用） */
export function hasInlineAnswers(md: string): boolean {
  const text = String(md ?? '')
  return INLINE_ANSWER_PATTERNS.some((re) => re.test(text))
}

/**
 * 校验区集形状是否合规（在 `normalizeCardSections` 修复之后调用）：
 * - 未收录的 key → 拒绝，并列出该类型可用区名；
 * - 顺序不符 → 拒绝，并给出该类型要求的区序；
 * - 自测区里还留着行内答案 → 拒绝（答案必须拆到独立 answers 区，渲染层默认折叠）。
 */
export function checkLessonSectionsShape(input: {
  essenceType: DlEssenceType
  sections: LessonSectionShape[]
}): LessonShapeCheckResult {
  const template = lessonTemplateKeys(input.essenceType)
  const keys = (input.sections ?? []).map((s) => canonicalSectionKey(s.key))

  const unknown = keys.filter((k) => !template.includes(k))
  if (unknown.length) {
    return {
      ok: false,
      reason:
        `区 key ${unknown.map((k) => `「${k}」`).join('、')} 不在 ${input.essenceType} 的模板区集内。` +
        `本类型可用区名（固定顺序）：${template.join(' → ')}。` +
        `同义写法会自动归一（checks→selfcheck、worked→examples 等），但自造区名（如 practice/cost）不行：` +
        `请把内容并入上表中最贴近的区，再重发本卡。`,
    }
  }

  let cursor = -1
  for (const key of keys) {
    const at = template.indexOf(key)
    if (at < cursor) {
      return {
        ok: false,
        reason:
          `区序不符合 ${input.essenceType} 模板（「${key}」出现在它该在的位置之前）。` +
          `要求顺序：${template.join(' → ')}（可跳过不用的区，但不能乱序）。` +
          `请按该顺序重排各区的 md 内容（区与区之间的"承上启下"过渡句要跟着改），再重发本卡。`,
      }
    }
    cursor = at
  }

  const leaking = (input.sections ?? []).find(
    (s) => canonicalSectionKey(s.key) === 'selfcheck' && hasInlineAnswers(s.md)
  )
  if (leaking) {
    return {
      ok: false,
      reason:
        '自测区里还留着行内答案（如 `**答案 1**：…` 或 `（答：…）`）——读者会一眼看到答案，失去"先自己做再对答案"的效果。' +
        '请二选一：① 所有题目写完，用**独占一行**的「答案」/「参考答案」小标题引出答案（系统会自动拆成独立区）；' +
        '② 直接拆成两个区：selfcheck（只有题面）→ answers（参考答案）。改好后重发本卡。',
    }
  }

  return { ok: true, reason: null }
}

/** 提示词用：某类型的「key 标题」区序摘要（生成侧与门禁共用同一份契约，避免口径漂移） */
export function lessonTemplateHint(essenceType: DlEssenceType): string {
  return lessonTemplateKeys(essenceType)
    .map((key) => `${key}（${SPEC_BY_KEY[key].title}）`)
    .join(' → ')
}
