/**
 * 讲义「设计规格」契约（纯函数；2026-09-14 用户反馈落地）
 * @module shared/utils/lesson-spec
 *
 * 背景（用户原话：「生成讲义功能太简陋……纯粹的堆砌文字，没有对文字做精炼归纳，没有配图，
 * 布局单调简陋」）。现状是**一次调用直接产整篇正文**，没有任何"先想清楚再写"的环节。
 *
 * 参考 ppt-master 的 Plan 阶段（`design_spec.md` + `spec_lock.md` + §IX 页级 roster）：
 * 生成讲义前先把下面这份规格写出来、给用户确认，确认后它成为**写作锁**——
 * 每写几个区就回读一次，落库时按它校验（区集/版式/载体一致），
 * 从而保证「规划（Plan）」与「落库（Do）」不是两张皮。
 *
 * 规格包含：读者画像 / 学完能做到 / 深度 / 篇幅预算 / 语气 / 术语表 / 记号表 /
 * 示例参数表（全讲复用同一套数字，防跨区漂移）/ 视觉计划 / 区级计划（每区：版式 + 读者动作 +
 * 载体 + 一句话结论）。
 *
 * 纪律：规格**只约束讲法**，不代替研究取数——`dl_save_card` 仍然要求证据来源非空。
 */

import {
  DL_ESSENCE_TYPES,
  LESSON_SECTION_ROLE_LABELS,
  canonicalSectionKey,
  isSectionAllowed,
  lessonTemplateKeys,
  sectionBriefOf,
  sectionRoleOf,
  sectionSpecOf,
} from './lesson-template'
import {
  canonicalLessonLayout,
  defaultLayoutForSection,
  lessonLayoutSpecOf,
  type LessonQualityIssue,
} from './lesson-layout'
import type {
  DlEssenceType,
  DlGoal,
  DlLessonPlanEntry,
  DlLessonPlanPayload,
  DlLessonSpec,
} from '../types/domain-learning.types'

/** 篇幅预算的合法区间（畸形值收到边界，不静默接受） */
export const LESSON_SPEC_BUDGET_LIMITS = {
  minSections: 3,
  maxSections: 20,
  minCharsPerSection: 120,
  maxCharsPerSection: 1200,
} as const

/** 默认篇幅（模型没写时） */
export const DEFAULT_LESSON_BUDGET = { sections: 6, charsPerSection: 400 } as const

const DEPTHS: DlGoal[] = ['入门', '工作应用', '前沿']

export type LessonSpecNormalizeResult =
  | { ok: true; value: DlLessonSpec; changes: string[] }
  | { ok: false; reason: string }

function str(v: unknown): string {
  return String(v ?? '').trim()
}

/**
 * 载体词归一：把「图/表/公式/代码/要点/数据/引文/清单」的中英文写法收成规范词。
 * 认不出的写法**原样保留**（质检按文本匹配，不因词表不全而悄悄放行）。
 */
export function normalizeCarrier(raw: unknown): string | null {
  const text = str(raw)
  if (!text) return null
  const key = text.toLowerCase().replace(/\s+/g, '')
  const table: Array<[RegExp, string]> = [
    [/^(figure|fig|chart|plot|diagram|matrix|shape|network|mermaid|图|图解|图表|示意图|图表示意|关系图|形状图|曲线图|柱状图)$/, 'figure'],
    [/^(table|grid|表|表格|对比表|数据表)$/, 'table'],
    [/^(formula|math|equation|公式|推导|证明)$/, 'formula'],
    [/^(code|js|javascript|snippet|代码|代码块|可运行示例)$/, 'code'],
    [/^(points?|bullets?|list|要点|要点卡|列表|条目)$/, 'points'],
    [/^(stats?|metrics?|kpi|数据|数据看点|指标)$/, 'stats'],
    [/^(quote|citation|引文|引文块|条文|原文)$/, 'quote'],
    [/^(checklist|todo|清单|勾选清单|待办)$/, 'checklist'],
  ]
  for (const [re, canonical] of table) if (re.test(key)) return canonical
  return text
}

/** 对象数组归一：丢空条目、按 key 去重、字段裁剪 */
function normalizePairs<T extends Record<string, unknown>>(
  raw: unknown,
  required: string[],
  optional: string[] = [],
): T[] {
  if (!Array.isArray(raw)) return []
  const out: T[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    if (required.some((f) => !str(rec[f]))) continue
    const dedupeKey = str(rec[required[0]]).toLowerCase()
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    const entry: Record<string, unknown> = {}
    for (const f of required) entry[f] = str(rec[f])
    for (const f of optional) entry[f] = str(rec[f]) || null
    out.push(entry as T)
  }
  return out
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.round(n)))
}

/**
 * 归一化讲义规格（宽松入参 → 规范规格）。
 * 能无损修的（别名版式、越界预算、缺读者动作）自动修并记入 changes；
 * 结构性缺失（没有读者画像/目标/区级计划、区名不在模板里、roster 乱序）直接拒绝并说明怎么改。
 */
export function normalizeLessonSpec(raw: unknown, essenceType: DlEssenceType): LessonSpecNormalizeResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: '讲义规格必须是对象（含 audience/outcomes/roster 等字段）。' }
  }
  const input = raw as Record<string, unknown>
  const changes: string[] = []

  const audience = str(input.audience)
  if (!audience) {
    return {
      ok: false,
      reason:
        '讲义规格缺 audience（读者画像）——要先说清"这张卡写给谁看：从哪出发、不是什么水平"，' +
        '它决定类比密度与记号教学到哪一步（例：「会 Python、没学过线性代数的后端工程师」）。',
    }
  }

  const outcomes = (Array.isArray(input.outcomes) ? input.outcomes : [])
    .map((o) => str(o))
    .filter(Boolean)
    .slice(0, 5)
  if (outcomes.length === 0) {
    return {
      ok: false,
      reason:
        '讲义规格缺 outcomes（学完能做到什么）——至少给 2 条**可测**的动词句' +
        '（例：「能算出 (4,1)+(1,3) 广播后的形状」），禁用「了解/认识」这类不可测说法。',
    }
  }

  const depthRaw = str(input.depth)
  const depth: DlGoal = (DEPTHS as string[]).includes(depthRaw) ? (depthRaw as DlGoal) : '入门'
  if (depthRaw && depthRaw !== depth) changes.push(`深度「${depthRaw}」不在刻度内，按「${depth}」处理`)

  const budgetRaw = (input.budget && typeof input.budget === 'object' ? input.budget : {}) as Record<string, unknown>
  const sectionsCount = clamp(
    Number(budgetRaw.sections ?? DEFAULT_LESSON_BUDGET.sections),
    LESSON_SPEC_BUDGET_LIMITS.minSections,
    LESSON_SPEC_BUDGET_LIMITS.maxSections,
  )
  const charsPerSection = clamp(
    Number(budgetRaw.charsPerSection ?? DEFAULT_LESSON_BUDGET.charsPerSection),
    LESSON_SPEC_BUDGET_LIMITS.minCharsPerSection,
    LESSON_SPEC_BUDGET_LIMITS.maxCharsPerSection,
  )
  const askedSections = Number(budgetRaw.sections)
  const askedChars = Number(budgetRaw.charsPerSection)
  if (
    (Number.isFinite(askedSections) && askedSections !== sectionsCount) ||
    (Number.isFinite(askedChars) && askedChars !== charsPerSection)
  ) {
    changes.push(
      `篇幅预算收到合法区间：区数 ${sectionsCount}（${LESSON_SPEC_BUDGET_LIMITS.minSections}~${LESSON_SPEC_BUDGET_LIMITS.maxSections}）、` +
        `每区 ≤${charsPerSection} 字（${LESSON_SPEC_BUDGET_LIMITS.minCharsPerSection}~${LESSON_SPEC_BUDGET_LIMITS.maxCharsPerSection}）`,
    )
  }

  const glossary = normalizePairs<{ term: string; plain: string }>(input.glossary, ['term', 'plain'])
  const notation = normalizePairs<{ symbol: string; read: string; example: string | null }>(
    input.notation,
    ['symbol', 'read'],
    ['example'],
  )
  const exampleParams = normalizePairs<{ name: string; value: string }>(input.exampleParams, ['name', 'value'])

  const rosterRaw = Array.isArray(input.roster) ? input.roster : []
  if (rosterRaw.length === 0) {
    return {
      ok: false,
      reason:
        '讲义规格缺 roster（区级计划）——要逐区列出：key（模板区名）、layout（版式设备）、' +
        'job（这一区替读者做什么）、carrier（用什么载体承载：figure/table/formula/code/points/stats/quote/checklist）、' +
        'takeaway（一句话结论）。没有它就只能一次写一大段散文，正是要解决的问题。',
    }
  }

  const template = lessonTemplateKeys(essenceType)
  const roster: DlLessonPlanEntry[] = []
  const seenKeys = new Set<string>()
  let cursor = -1
  for (const item of rosterRaw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const rawKey = str(rec.key)
    if (!rawKey) return { ok: false, reason: 'roster 里有条目没写 key（区名）——每个区都要给 key。' }
    const key = canonicalSectionKey(rawKey)
    if (!isSectionAllowed(essenceType, key)) {
      return {
        ok: false,
        reason:
          `roster 里的区「${rawKey}」不在 ${essenceType} 的模板区集内。` +
          `可用区名（固定顺序）：${template.join(' → ')}。请把内容并进最贴近的区，或删掉该区。`,
      }
    }
    if (seenKeys.has(key)) return { ok: false, reason: `roster 里区「${key}」重复了——每个区只能出现一次。` }
    const at = template.indexOf(key)
    if (at < cursor) {
      return {
        ok: false,
        reason:
          `roster 顺序不符合 ${essenceType} 模板（「${key}」出现在它该在的位置之前）。` +
          `要求顺序：${template.join(' → ')}（可跳过不用的区，但不能乱序）。` +
          '请按该顺序重排区级计划后重发（顺序本身就是教学法：先例后律、自测收尾）。',
      }
    }
    cursor = at
    seenKeys.add(key)

    const rawLayout = str(rec.layout)
    const spec = lessonLayoutSpecOf(rawLayout)
    const layout = canonicalLessonLayout(rawLayout) || defaultLayoutForSection(key)
    if (rawLayout && rawLayout.toLowerCase() !== layout) {
      changes.push(`区「${key}」版式写法「${rawLayout}」归一为「${layout}」`)
    }
    if (!spec && rawLayout) changes.push(`区「${key}」版式「${rawLayout}」未收录，按「${layout}」处理`)
    const job = str(rec.job)
    if (!job) changes.push(`区「${key}」缺 job（读者动作），按区写作说明兜底`)
    roster.push({
      key,
      layout,
      // 读者动作优先用大纲给的；缺省用区集契约（v6）里该区的写作说明——一份口径，两处消费
      job: job || sectionBriefOf(key) || lessonLayoutSpecOf(layout)?.purpose || '把这一区讲清楚',
      carrier: normalizeCarrier(rec.carrier),
      takeaway: str(rec.takeaway) || null,
    })
  }

  if (roster.length === 0) return { ok: false, reason: 'roster 里的条目都不合法（缺 key 或区名不在模板内）。' }

  const value: DlLessonSpec = {
    audience,
    outcomes,
    depth,
    budget: { sections: sectionsCount, charsPerSection },
    tone: str(input.tone) || null,
    glossary,
    notation,
    exampleParams,
    roster,
    visualPlan: str(input.visualPlan) || null,
  }
  return { ok: true, value, changes }
}

// ==================== 讲义方案载荷（dl_plan lesson 步） ====================

export type LessonPlanPayloadNormalizeResult =
  | { ok: true; value: DlLessonPlanPayload; changes: string[] }
  | { ok: false; reason: string }

/**
 * 归一化「讲义方案」载荷：本质类型（决定模板区集）+ 设计规格。
 * essenceType 是这份规格的骨架来源——它决定 roster 能用哪些区、按什么顺序，
 * 因此**必须在规划阶段定死**，落库时按它校验（不许落库时换类型）。
 */
export function normalizeLessonPlanPayload(raw: unknown): LessonPlanPayloadNormalizeResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: '讲义方案必须是对象（含 essenceType 与 spec）。' }
  }
  const input = raw as Record<string, unknown>
  const essenceType = str(input.essenceType) as DlEssenceType
  if (!DL_ESSENCE_TYPES.includes(essenceType)) {
    return {
      ok: false,
      reason:
        `讲义方案缺合法的 essenceType（知识本质类型）——它决定模板区集与区序，` +
        `必须六选一：${DL_ESSENCE_TYPES.join(' / ')}。`,
    }
  }
  const normalized = normalizeLessonSpec(input.spec, essenceType)
  if (!normalized.ok) return { ok: false, reason: normalized.reason }
  return { ok: true, value: { essenceType, spec: normalized.value }, changes: normalized.changes }
}

// ==================== 规格 ↔ 落库区集 一致性 ====================

/** 一致性检查用的区最小形状 */
export interface LessonSpecSectionLike {
  key: string
  md: string
  layout?: string | null
  takeaway?: string | null
}

export interface LessonSpecAgreementResult {
  ok: boolean
  blocking: LessonQualityIssue[]
  warnings: LessonQualityIssue[]
}

/**
 * 校验落库区集是否照已确认规格写：
 * - **区集/区序不一致 → 阻断**（Plan 与 Do 必须同一份；否则先改大纲再落卡）；
 * - 版式偏离、大纲 takeaway 没写、示例参数没用上 → 警告（渲染会按大纲纠正，不必打断）。
 */
export function checkLessonSpecAgreement(input: {
  essenceType: DlEssenceType
  spec: DlLessonSpec
  sections: LessonSpecSectionLike[]
}): LessonSpecAgreementResult {
  const blocking: LessonQualityIssue[] = []
  const warnings: LessonQualityIssue[] = []
  const planKeys = input.spec.roster.map((r) => canonicalSectionKey(r.key))
  const actualKeys = (input.sections ?? []).map((s) => canonicalSectionKey(s.key))

  if (planKeys.join('>') !== actualKeys.join('>')) {
    const missing = planKeys.filter((k) => !actualKeys.includes(k))
    const extra = actualKeys.filter((k) => !planKeys.includes(k))
    const diff = [
      missing.length ? `大纲有、正文没有：${missing.join('、')}` : '',
      extra.length ? `正文有、大纲没有：${extra.join('、')}` : '',
      !missing.length && !extra.length ? '区序与大纲不同' : '',
    ]
      .filter(Boolean)
      .join('；')
    blocking.push({
      code: 'roster-mismatch',
      level: 'blocking',
      sectionKey: null,
      message:
        `落库区集与已确认的讲义大纲不一致（${diff}）。\n` +
        `大纲区序：${planKeys.join(' → ')}\n实际区序：${actualKeys.join(' → ')}`,
      fix:
        '二选一：① 按已确认大纲的区集与顺序重发本卡；② 若你觉得大纲本身该改（增删区/换序），' +
        '先用 dl_propose_lesson_plan 提交新大纲并等用户确认，再据此落卡。',
    })
  }

  const rosterByKey = new Map(input.spec.roster.map((r) => [canonicalSectionKey(r.key), r]))
  for (const sec of input.sections ?? []) {
    const entry = rosterByKey.get(canonicalSectionKey(sec.key))
    if (!entry) continue
    const plannedLayout = canonicalLessonLayout(entry.layout) || entry.layout
    const actualLayout = canonicalLessonLayout(sec.layout) || defaultLayoutForSection(sec.key)
    if (plannedLayout !== actualLayout) {
      warnings.push({
        code: 'roster-layout-drift',
        level: 'warning',
        sectionKey: sec.key,
        message: `区「${sec.key}」大纲定的版式是「${plannedLayout}」，正文写成了「${actualLayout}」。`,
        fix: '按大纲版式改写这一区（渲染按大纲出图/出卡），或先改大纲。',
      })
    }
    const planned = str(entry.takeaway)
    if (planned && !str(sec.takeaway)) {
      warnings.push({
        code: 'roster-takeaway-missing',
        level: 'warning',
        sectionKey: sec.key,
        message: `区「${sec.key}」大纲写了结论条「${planned}」，但正文没给 takeaway。`,
        fix: `把 takeaway 字段补成大纲里那句结论（或按大纲改一版）。`,
      })
    }
  }

  const params = (input.spec.exampleParams ?? []).filter((p) => str(p.value))
  if (params.length) {
    const all = (input.sections ?? []).map((s) => String(s.md ?? '')).join('\n')
    const unused = params.filter((p) => !all.includes(str(p.value)))
    if (unused.length) {
      warnings.push({
        code: 'example-param-unused',
        level: 'warning',
        sectionKey: null,
        message:
          `大纲里的示例参数有 ${unused.length} 个没在正文出现：` +
          unused.map((p) => `${p.name}=${p.value}`).join('、') +
          '——同一算例要全讲复用同一套数字。',
        fix: '把正文里的算例数字统一成大纲参数表里的值（跨区保持一致），或从大纲删掉不用的参数。',
      })
    }
  }

  return { ok: blocking.length === 0, blocking, warnings }
}

// ==================== 摘要与写作锁 ====================

/** 规格摘要（动作回执与界面提示用） */
export function summarizeLessonSpec(spec: DlLessonSpec): string {
  const devices = spec.roster.map((r) => canonicalLessonLayout(r.layout) || r.layout)
  return (
    `${spec.budget.sections} 区 · 每区 ≤${spec.budget.charsPerSection} 字 · ${spec.depth} · ` +
    `术语 ${spec.glossary.length} / 记号 ${spec.notation.length} / 示例参数 ${spec.exampleParams.length} · ` +
    `版式：${devices.join('→')}`
  )
}

/**
 * 写作锁文本（随轮注入；对应 ppt-master 的 `spec_lock.md` 回读）。
 * 这是模型逐区精写时唯一该看的规格口径，也是"每 3 区回读一次"防漂移的抓手。
 */
export function lessonSpecLock(spec: DlLessonSpec, essenceType: DlEssenceType): string {
  const lines: string[] = []
  lines.push('【讲义规格锁（已确认；逐区照它写，每写完 3 个区回读一次本锁，防术语/记号/算例漂移）】')
  lines.push(`读者：${spec.audience}`)
  if (spec.outcomes.length) {
    lines.push(`学完能做到：${spec.outcomes.map((o, i) => `${i + 1}) ${o}`).join('；')}`)
  }
  lines.push(
    `深度/篇幅：${spec.depth} · 目标 ${spec.budget.sections} 区 · 每区正文 ≤${spec.budget.charsPerSection} 字`,
  )
  if (spec.tone) lines.push(`语气：${spec.tone}`)
  if (spec.glossary.length) {
    lines.push(`术语表（首现必须给一句人话解释，之后统一用这个词）：${spec.glossary.map((g) => `${g.term}=${g.plain}`).join('；')}`)
  }
  if (spec.notation.length) {
    lines.push(
      `记号表（首现必须给"读法 + 最小例子"，正文出现未教学的记号会被门禁拒绝）：` +
        spec.notation.map((n) => `${n.symbol} 读作「${n.read}」${n.example ? `，例：${n.example}` : ''}`).join('；'),
    )
  }
  if (spec.exampleParams.length) {
    lines.push(
      `示例参数（全讲复用同一套数字，禁止中途换数）：` +
        spec.exampleParams.map((p) => `${p.name}=${p.value}`).join('；'),
    )
  }
  lines.push('区级计划（严格按此顺序与版式写，用不到的区已在规划时省掉，不要再加区）：')
  spec.roster.forEach((r, i) => {
    const specOfSection = sectionSpecOf(r.key)
    const role = LESSON_SECTION_ROLE_LABELS[sectionRoleOf(r.key)]
    const need = specOfSection?.minChars ? `至少 ${specOfSection.minChars} 字；` : ''
    const parts = [
      `  ${i + 1}. ${r.key}${specOfSection ? `（${specOfSection.title}）` : ''}[${role}]`,
      `版式 ${r.layout}（${lessonLayoutSpecOf(r.layout)?.name ?? r.layout}）`,
      `读者动作：${r.job}`,
    ]
    if (r.carrier) parts.push(`载体：${r.carrier}`)
    if (r.takeaway) parts.push(`结论条：${r.takeaway}`)
    lines.push(parts.join('｜'))
    // 写作要求与区集契约（v6 的 role/brief/minChars）同源：roster 的版式/载体要与它对齐
    if (specOfSection) lines.push(`      写作要求：${need}${specOfSection.brief}`)
  })
  lines.push(`区集契约仍以 ${essenceType} 模板为准（区名与顺序不得自造）。`)
  if (spec.visualPlan) lines.push(`视觉计划：${spec.visualPlan}`)
  lines.push(
    '写作纪律：① 每区先按版式把内容做成"看得见"的形状（要点卡/对比表/步骤条/图解/数据看点…），' +
      '不要写成长段散文；② 每区长段信息要归纳成要点或小标题；③ 大纲声明要配图的区必须真给 ```figure 规格块；' +
      '④ 重点在「核心 + 案例」区（定义/机制/构成/规则/案例）要写透，导学与自测从简（v6 区集契约）。',
  )
  return lines.join('\n')
}