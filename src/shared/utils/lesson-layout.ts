/**
 * 讲义「版式设备」契约（纯函数 + 常量；2026-09-14 用户反馈落地）
 * @module shared/utils/lesson-layout
 *
 * 背景（用户原话：「生成讲义功能太简陋……不美观，纯粹的堆砌文字，没有对文字做精炼归纳，
 * 没有配图，布局单调简陋」）。实测现状：区集契约（lesson-template）只管**区名与区序**，
 * 区正文交模型自由发挥——于是每区都是一大段散文，标题之外没有任何视觉载体，
 * 同一空间里每张卡长得一模一样。
 *
 * 参考开源项目 ppt-master 的做法（Plan→Do·Check·Act / §IX 页级 roster / device menu /
 * `svg_quality_checker` 的两级门禁），本模块把「这一区长什么样」也变成契约：
 *
 * 1. `LESSON_LAYOUT_CATALOG`：15 个**版式设备**（prose/keypoints/compare/steps/figure/worked/
 *    formula/stats/quote/timeline/pitfall/checklist/code/qa/callout）——提示词里的"设备菜单"、
 *    落库门禁的判据、渲染层的分发、大纲弹窗的可选项，读的都是这一份；
 * 2. `defaultLayoutForSection`：模板语义区 → 默认设备（老卡也有合理版式，不靠模型补）；
 * 3. `analyzeLessonMd`：正文形状分析（图/表/公式/代码/引用/列表/勾选/数据看点 + 字数）；
 * 4. `checkLessonVisualQuality`：**两级质检**——阻断（文字墙、通篇无图、声明版式与正文不符、
 *    大纲要求的载体缺失、空区）与警告（长区未归纳、纯文字连排、版式单调、要点没精炼、缺结论）；
 * 5. 设备条目解析（要点卡/步骤条/数据看点/勾选清单/时间线）与渲染展示计划。
 *
 * 纪律：设备只约束**形状**，不生成内容——解析不出条目时返回空数组，渲染层退回整段 markdown，
 * 绝不静默吞掉模型写的内容。质检的阻断项都必须给出**可执行的修复**（哪一区、补什么、怎么写）。
 */

import { canonicalSectionKey, lessonBodyChars } from './lesson-template'

// ==================== 设备目录 ====================

/** 讲义版式设备（区正文的呈现形态） */
export type DlLessonLayout =
  | 'prose'
  | 'keypoints'
  | 'compare'
  | 'steps'
  | 'figure'
  | 'worked'
  | 'formula'
  | 'stats'
  | 'quote'
  | 'timeline'
  | 'pitfall'
  | 'checklist'
  | 'code'
  | 'qa'
  | 'callout'

/** 正文主形状（质检判据；渲染分发也用得到） */
export type DlContentShape =
  | 'empty'
  | 'prose'
  | 'list'
  | 'table'
  | 'figure'
  | 'formula'
  | 'code'
  | 'quote'

export interface DlLessonLayoutSpec {
  key: DlLessonLayout
  /** 中文名（渲染徽标与提示词共用，避免两处起名） */
  name: string
  /** 这一版式替读者做什么（生成侧据此选设备） */
  purpose: string
  /** 正文必须有的形状（提示词纪律 + 质检判据的可读文案） */
  shapeHint: string
  /** 是否把内容渲染成"视觉块"（而非纯段落）——节奏统计用 */
  visual: boolean
  /** 同义写法（模型/历史数据的自由命名 → 规范设备） */
  aliases?: string[]
}

/**
 * 设备目录（规范全集）。顺序即提示词里的展示顺序：先"讲清楚"、再"看得见"、最后"检验"。
 */
export const LESSON_LAYOUT_CATALOG: DlLessonLayoutSpec[] = [
  {
    key: 'prose',
    name: '正文叙述',
    purpose: '把一段因果/机制顺读讲完（读者能一口气读完）',
    shapeHint: '段落 + 可选 ### 小标题；超过 420 字必须归纳出小标题或列表',
    visual: false,
    aliases: ['text', 'paragraph', 'narrative', 'body'],
  },
  {
    key: 'keypoints',
    name: '要点卡',
    purpose: '把一整段话压成几条能扫读的要点（精炼归纳）',
    shapeHint: '2~6 条 `- **要点名**：一句话说明`',
    visual: true,
    aliases: ['points', '要点', '要点卡', 'bullets', 'highlights', 'takeaways'],
  },
  {
    key: 'compare',
    name: '对比表',
    purpose: '把并列/异同/取舍关系摆成表，读者一眼比出来',
    shapeHint: '一张 markdown 表（表头 + 分隔行 + ≥2 行数据）',
    visual: true,
    aliases: ['table', '对比', '对比表', 'comparison', 'matrix', 'grid', 'vs'],
  },
  {
    key: 'steps',
    name: '步骤条',
    purpose: '把"怎么做"排成有先后的一串动作，读者照着能走一遍',
    shapeHint: '≥2 步有序列表 `1. **步骤名**：做什么`',
    visual: true,
    aliases: ['procedure', '步骤', '流程', 'recipe', 'workflow', 'howto'],
  },
  {
    key: 'figure',
    name: '图解',
    purpose: '用一张（代码画出来的）图把结构/形状/曲线讲明白',
    shapeHint: '至少一个 ```figure 规格块（合法 JSON；matrix/plot/bar/shape/network）或 mermaid',
    visual: true,
    aliases: ['diagram', 'chart', '图解', '图', 'plot', 'visual'],
  },
  {
    key: 'worked',
    name: '算例推演',
    purpose: '用一个带真实数字的例子把抽象规则落地，并回算验证',
    shapeHint: '≥60 字的算例：写清中间量与最终答案（可与 figure/公式混排）',
    visual: true,
    aliases: ['example', '算例', '例子', 'worked-example', 'walkthrough', 'demo'],
  },
  {
    key: 'formula',
    name: '公式/推导',
    purpose: '把式子与推导过程摆清楚（记号首现要教学）',
    shapeHint: '≥1 个块级公式：`$$` 独立成行；推导写清每步依据',
    visual: true,
    aliases: ['math', '公式', '推导', 'equation', 'derivation', 'proof'],
  },
  {
    key: 'stats',
    name: '数据看点',
    purpose: '把关键数字做成"大字 + 说明"，一眼看到量级与结论',
    shapeHint: '≥2 条 `- 68% | 命中率 | 补充说明`',
    visual: true,
    aliases: ['metrics', '数据', '数据看点', 'numbers', 'kpi', 'figures-stats'],
  },
  {
    key: 'quote',
    name: '引文/条文',
    purpose: '原文照录（法条/定义/权威表述），不掺自己的转述',
    shapeHint: '≥1 个引用块 `> 原文`，后接一句出处',
    visual: true,
    aliases: ['citation', '引文', '条文', 'quote-block', 'excerpt'],
  },
  {
    key: 'timeline',
    name: '时间线',
    purpose: '把脉络/演化/阶段按时间摆出来，读者看到"从哪来、到哪去"',
    shapeHint: '≥2 条 `- 2012：发生了什么`',
    visual: true,
    aliases: ['history', '脉络', '时间线', 'evolution', 'milestones'],
  },
  {
    key: 'pitfall',
    name: '误区警示',
    purpose: '把常见坑与边界条件摆到读者眼前，防止用错',
    shapeHint: '≥2 条短句误区（`- **坑**：为什么会踩`），或一段带明确边界的说明',
    visual: true,
    aliases: ['pitfalls', '误区', '坑', 'warning', 'caveat', 'boundary'],
  },
  {
    key: 'checklist',
    name: '上手清单',
    purpose: '给出可逐条打勾的动作清单，读者能立刻动手',
    shapeHint: '≥2 条 `- [ ] 事项`（已完成的写 `- [x]`）',
    visual: true,
    aliases: ['todo', '清单', 'checklist-items', 'action-items'],
  },
  {
    key: 'code',
    name: '可运行示例',
    purpose: '给一段能直接跑、能改数字重跑的代码，读者动手看结果',
    shapeHint: '≥1 个 ```js 代码块（只用 console.log 输出，原生 JS，无外部库）',
    visual: true,
    aliases: ['js', '代码', '代码示例', 'snippet', 'runnable'],
  },
  {
    key: 'qa',
    name: '自测题卡',
    purpose: '让读者先自己做，再对答案（检索练习）',
    shapeHint: '≥1 道题（有序列表或题面段落）；答案放独立 answers 区，默认折叠',
    visual: true,
    aliases: ['quiz', 'selfcheck', '自测', 'exercise', 'questions', 'test'],
  },
  {
    key: 'callout',
    name: '结论条',
    purpose: '把这一区的结论/前提单独拎出来，读者不读全文也能拿到',
    shapeHint: '一句话结论（可带 1~2 个前提/限定条件）',
    visual: true,
    aliases: ['note', '结论', '提示', 'tip', 'summary', 'conclusion'],
  },
]

/** 别名 → 规范设备 */
const LAYOUT_BY_NAME: Record<string, DlLessonLayout> = (() => {
  const map: Record<string, DlLessonLayout> = {}
  for (const d of LESSON_LAYOUT_CATALOG) {
    map[d.key] = d.key
    for (const a of d.aliases ?? []) map[a.toLowerCase()] = d.key
  }
  return map
})()

const SPEC_BY_LAYOUT: Record<string, DlLessonLayoutSpec> = (() => {
  const map: Record<string, DlLessonLayoutSpec> = {}
  for (const d of LESSON_LAYOUT_CATALOG) map[d.key] = d
  return map
})()

/** 版式节奏与密度阈值（质检判据；一处定义、提示词与门禁共用） */
export const LESSON_LAYOUT_RHYTHM = {
  /** 单区超过这个字数算"长区"（未归纳则警告） */
  longSectionChars: 420,
  /** 纯文字且无任何结构化载体、超过这个字数 = 文字墙（阻断） */
  proseWallChars: 700,
  /** 连续这么多个纯文字区 = 布局单调（警告） */
  maxConsecutivePlain: 3,
  /** 要点卡单条最长字数（超过 = 没精炼） */
  maxPointChars: 64,
  /** 要点卡条数上限 */
  maxPointItems: 8,
  /** 要点卡/步骤条最少条数（少于 = 形状不符） */
  minPoints: 2,
  /** 区数达到这个数就必须至少有一个图/表/公式/代码载体（否则阻断） */
  minSectionsForGraphicCarrier: 4,
  /** 区数达到这个数才检查"版式单调"（短讲义不苛求） */
  minSectionsForDeviceVariety: 4,
} as const

/** 别名归一；未收录写法返回空串（调用方据此决定兜底） */
export function canonicalLessonLayout(name: unknown): DlLessonLayout | '' {
  const key = String(name ?? '')
    .trim()
    .toLowerCase()
  if (!key) return ''
  return LAYOUT_BY_NAME[key] ?? ''
}

/** 设备中文名（未收录返回空串） */
export function lessonLayoutName(name: unknown): string {
  const key = canonicalLessonLayout(name)
  return key ? SPEC_BY_LAYOUT[key].name : ''
}

/** 设备条目（按规范 key 或别名；未收录返回 null） */
export function lessonLayoutSpecOf(name: unknown): DlLessonLayoutSpec | null {
  const key = canonicalLessonLayout(name)
  return key ? SPEC_BY_LAYOUT[key] : null
}

/**
 * 该区 key 的默认设备。
 *
 * **2026-09-15 用户口径「不要卡片样式」**：讲义默认一律按**文档段落式**（`prose`）呈现——
 * 不再自动把某一区套成要点卡/引言卡/数据看点这类"卡片"。设备本身保留
 * （`LESSON_LAYOUT_CATALOG` 与显式声明 `layout` 的路径不变），只在**明确声明**时才使用；
 * 质量检查里"版式单调/要点没精炼"这类判据对 prose 区自然不适用。
 */
export function defaultLayoutForSection(_sectionKey: unknown): DlLessonLayout {
  return 'prose'
}

/** 解析区版式：显式 layout > 大纲 roster > 模板默认（渲染兜底与落库归一都走这里） */
export function resolveSectionLayout(input: {
  key: unknown
  layout?: unknown
  rosterLayout?: unknown
}): DlLessonLayout {
  const explicit = canonicalLessonLayout(input.layout)
  if (explicit) return explicit
  const fromRoster = canonicalLessonLayout(input.rosterLayout)
  if (fromRoster) return fromRoster
  return defaultLayoutForSection(input.key)
}

/** 提示词用：完整设备菜单（生成侧与门禁同源，杜绝两套口径） */
export function lessonLayoutHint(): string {
  return LESSON_LAYOUT_CATALOG.map((d) => `${d.key}（${d.name}）：${d.purpose}｜写法：${d.shapeHint}`).join('\n')
}

// ==================== 正文形状分析 ====================

/** 正文形状统计（质检与展示计划的数据源） */
export interface LessonMdStats {
  /** 围栏外的非空白字符数（不含代码/规格文本；"文字墙"判据用它） */
  chars: number
  headings: number
  bullets: number
  ordered: number
  checkboxes: number
  /** 表格数（≥2 行管道行才算一张） */
  tables: number
  quotes: number
  figures: number
  mermaid: number
  /** 块级公式（`$$` 独立成行）数 */
  formulas: number
  /** 行内公式（`$...$`）数 */
  inlineFormulas: number
  /** 代码围栏数（figure/mermaid 除外——它们是图形载体，不是代码） */
  codeBlocks: number
  /** 可运行的 js 围栏数 */
  jsBlocks: number
  /** 数据看点条目（`- 值 | 说明`） */
  statsItems: number
  /** 有图/表/公式/代码（真正的"看得见的数据载体"） */
  graphic: boolean
  /** 有任一结构化载体（小标题/列表/表/图/公式/代码/引用/勾选） */
  structured: boolean
  /** 主形状（展示与提示词用；质检用各项计数） */
  shape: DlContentShape
}

const FENCE_LINE = /^\s{0,3}(`{3,}|~{3,})(.*)$/
const HEADING_LINE = /^\s{0,3}#{1,6}\s+\S/
const CHECKBOX_LINE = /^\s{0,3}[-*+]\s+\[[ xX]\]\s+/
const BULLET_LINE = /^\s{0,3}[-*+]\s+\S/
const ORDERED_LINE = /^\s{0,3}\d+[.)]\s+\S/
const QUOTE_LINE = /^\s{0,3}>\s?/
const TABLE_ROW = /^\s*\|.*\|\s*$/
const BLOCK_MATH_LINE = /^\s*\$\$\s*$/
const INLINE_MATH = /\$[^$\n]+\$/g
const STAT_ITEM = /\|\s*\S/

/**
 * 分析一段区正文（围栏状态机：代码里的 `#`、`|`、`$$` 一律不算正文形状）。
 */
export function analyzeLessonMd(md: string): LessonMdStats {
  const lines = String(md ?? '').split(/\r?\n/)
  // 正文字数口径与区集契约（v6）的 lessonBodyChars 完全一致：围栏外非空白字符
  const chars = lessonBodyChars(String(md ?? ''))
  let fence: string | null = null
  let fenceLang = ''
  let headings = 0
  let bullets = 0
  let ordered = 0
  let checkboxes = 0
  let tableRows = 0
  let quotes = 0
  let figures = 0
  let mermaid = 0
  let formulas = 0
  let inlineFormulas = 0
  let codeBlocks = 0
  let jsBlocks = 0
  let statsItems = 0
  let blockMathOpen = false

  for (const line of lines) {
    const fenceMatch = FENCE_LINE.exec(line)
    if (fenceMatch) {
      const char = fenceMatch[1][0]
      if (fence === null) {
        fence = char
        fenceLang = fenceMatch[2].trim().toLowerCase().split(/[\s{]/)[0] ?? ''
        // figure / mermaid 是"图形载体"，不算代码块（否则声明 code 版式的区塞一张 mermaid 也能过）
        if (fenceLang === 'figure') figures++
        else if (fenceLang === 'mermaid') mermaid++
        else {
          codeBlocks++
          if (fenceLang === 'js' || fenceLang === 'javascript' || fenceLang === 'mjs') jsBlocks++
        }
        continue
      }
      if (fence === char) {
        fence = null
        fenceLang = ''
        continue
      }
      // 围栏内的同类短标记（少于 3 个反引号不会到这里）
      continue
    }
    if (fence !== null) continue

    if (BLOCK_MATH_LINE.test(line)) {
      if (blockMathOpen) {
        formulas++
        blockMathOpen = false
      } else {
        blockMathOpen = true
      }
      continue
    }
    if (blockMathOpen) continue

    if (HEADING_LINE.test(line)) {
      headings++
      continue
    }
    if (QUOTE_LINE.test(line)) {
      quotes++
      continue
    }
    if (TABLE_ROW.test(line)) {
      tableRows++
      continue
    }
    if (CHECKBOX_LINE.test(line)) {
      checkboxes++
      bullets++
      continue
    }
    if (BULLET_LINE.test(line)) {
      bullets++
      if (STAT_ITEM.test(line.replace(BULLET_LINE, ''))) statsItems++
      continue
    }
    if (ORDERED_LINE.test(line)) {
      ordered++
      if (STAT_ITEM.test(line.replace(ORDERED_LINE, ''))) statsItems++
      continue
    }
    inlineFormulas += (line.match(INLINE_MATH) ?? []).length
  }

  const tables = tableRows >= 2 ? 1 : 0
  const graphic = figures + mermaid + tables + formulas + codeBlocks > 0
  const structured =
    graphic ||
    headings + bullets + ordered + quotes + checkboxes > 0

  const shape: DlContentShape =
    figures + mermaid > 0
      ? 'figure'
      : tables > 0
        ? 'table'
        : formulas > 0
          ? 'formula'
          : codeBlocks > 0
            ? 'code'
            : quotes > 0
              ? 'quote'
              : bullets + ordered + checkboxes > 0
                ? 'list'
                : chars > 0
                  ? 'prose'
                  : 'empty'

  return {
    chars,
    headings,
    bullets,
    ordered,
    checkboxes,
    tables,
    quotes,
    figures,
    mermaid,
    formulas,
    inlineFormulas,
    codeBlocks,
    jsBlocks,
    statsItems,
    graphic,
    structured,
    shape,
  }
}

/** 区最小形状（不强绑落库 DTO） */
export interface LessonLayoutSectionLike {
  key: string
  title?: string | null
  md: string
  layout?: string | null
  takeaway?: string | null
  folded?: boolean
}

/** 大纲条目最小形状（roster；完整定义在 lesson-spec） */
export interface LessonRosterLike {
  key: string
  layout?: string | null
  carrier?: string | null
}

// ==================== 视觉质检 ====================

export interface LessonQualityIssue {
  /** 机器可读的问题码（门禁/测试/前端提示共用） */
  code: string
  level: 'blocking' | 'warning'
  /** 定位到的区（全文级问题为 null） */
  sectionKey: string | null
  /** 人可读的问题描述（会展示给用户与模型） */
  message: string
  /** 可执行的修复动作（模型据此重发，不照抄重发） */
  fix: string
}

export interface LessonQualityReport {
  blocking: LessonQualityIssue[]
  warnings: LessonQualityIssue[]
  stats: {
    sections: number
    chars: number
    /** 有图/表/公式/代码的区数 */
    graphicSections: number
    /** 实际用到的版式种类 */
    devices: DlLessonLayout[]
  }
}

/** 版式 → 正文形状是否达标（不达标给出"需要什么"） */
function layoutShapeSatisfied(
  layout: DlLessonLayout,
  st: LessonMdStats,
): { ok: boolean; need: string } {
  const need = SPEC_BY_LAYOUT[layout]?.shapeHint ?? ''
  switch (layout) {
    case 'keypoints':
      return { ok: st.bullets + st.ordered >= LESSON_LAYOUT_RHYTHM.minPoints, need }
    case 'pitfall':
    case 'timeline':
      return { ok: st.bullets + st.ordered >= 2 || st.chars >= 40, need }
    case 'compare':
      return { ok: st.tables >= 1, need }
    case 'steps':
      return { ok: st.ordered >= 2, need }
    case 'figure':
      return { ok: st.figures + st.mermaid >= 1, need }
    case 'worked':
      return { ok: st.structured || st.chars >= 60, need }
    case 'formula':
      return { ok: st.formulas >= 1 || st.inlineFormulas >= 2, need }
    case 'stats':
      return { ok: st.statsItems >= 2, need }
    case 'quote':
      return { ok: st.quotes >= 1, need }
    case 'checklist':
      return { ok: st.checkboxes >= 2 || st.bullets >= 3, need }
    case 'code':
      return { ok: st.codeBlocks >= 1, need }
    case 'qa':
      return { ok: st.bullets + st.ordered >= 1 || st.chars >= 40, need }
    case 'callout':
      return { ok: st.chars >= 8, need }
    default:
      // prose / detail：形状不限（密度由文字墙判据把守）
      return { ok: true, need }
  }
}

/** 纯文字区（无任何结构化载体）——用于"连排/单调"判定 */
function isPlainLayout(layout: DlLessonLayout): boolean {
  return layout === 'prose' || layout === 'callout'
}

/**
 * 讲义视觉质检（两级）。
 *
 * 阻塞口径（重要，避免"顺手拦死"）：
 * - **声明即义务**：区**显式**给了 `layout`（或大纲 roster 定了版式）时，正文形状必须兑现 → 不符即阻断；
 *   没声明时按区 key 推导的版式只是**渲染兜底**，不符降级为警告（老卡/快速模式不被误伤）。
 * - **走完规划才严判**：`strict=true`（该概念有已确认讲义方案 = 走完 Plan 流程）时，
 *   文字墙与"通篇无图"才阻断；否则只警告（自动推进/起步轮等快速模式不会因此卡死产不出讲义）。
 * - 大纲声明的载体缺失、空区：与 strict 无关，一律阻断（前者是 Plan↔Do 不一致，后者是空壳）。
 */
export function checkLessonVisualQuality(input: {
  essenceType?: string | null
  sections: LessonLayoutSectionLike[]
  roster?: LessonRosterLike[] | null
  /** 是否走完规划流程（有已确认讲义方案）——决定全文级问题是否阻断 */
  strict?: boolean
}): LessonQualityReport {
  const blocking: LessonQualityIssue[] = []
  const warnings: LessonQualityIssue[] = []
  const sections = input.sections ?? []
  const strict = input.strict === true

  if (sections.length === 0) {
    blocking.push({
      code: 'empty-sections',
      level: 'blocking',
      sectionKey: null,
      message: '讲义没有任何区。',
      fix: '按该本质类型的模板区集至少给出 meta + 主体区 + 自测区。',
    })
    return { blocking, warnings, stats: { sections: 0, chars: 0, graphicSections: 0, devices: [] } }
  }

  const rosterByKey = new Map<string, LessonRosterLike>()
  for (const r of input.roster ?? []) rosterByKey.set(canonicalSectionKey(r.key), r)

  const statsList: LessonMdStats[] = []
  const layouts: DlLessonLayout[] = []

  for (const sec of sections) {
    const st = analyzeLessonMd(sec.md)
    statsList.push(st)
    const roster = rosterByKey.get(canonicalSectionKey(sec.key))
    // 「声明的版式」= 区自己写的 layout，或大纲为该区定的版式；两者都没有才是模板兜底
    const declared = canonicalLessonLayout(sec.layout) || canonicalLessonLayout(roster?.layout)
    const layout: DlLessonLayout = declared || defaultLayoutForSection(sec.key)
    layouts.push(layout)
    const label = sectionLabel(sec)

    if (!String(sec.md ?? '').trim()) {
      blocking.push({
        code: 'empty-section',
        level: 'blocking',
        sectionKey: sec.key,
        message: `${label}是空的。`,
        fix: '要么把内容写进这一区，要么整区删掉（用不到的区可以跳过，不要留空壳）。',
      })
      continue
    }

    const shape = layoutShapeSatisfied(layout, st)
    if (!shape.ok) {
      // 声明了版式却没兑现 → 阻断；只是模板兜底 → 提醒（换版式或补形状都行）
      const issue: LessonQualityIssue = {
        code: declared ? 'layout-shape-mismatch' : 'layout-shape-suggestion',
        level: declared ? 'blocking' : 'warning',
        sectionKey: sec.key,
        message: `${label}声明版式为「${lessonLayoutName(layout)}」，但正文不是这个形状——需要：${shape.need}`,
        fix: `二选一：① 把这一区改写成「${lessonLayoutName(layout)}」要求的形状（${shape.need}）；② 换成与现有正文相符的版式（纯文字用 prose、要点用 keypoints）。改好后重发本卡。`,
      }
      if (declared) blocking.push(issue)
      else warnings.push(issue)
    }

    // 文字墙：纯文字长段、且没有任何可扫读的结构（走完规划才阻断）
    if (st.chars > LESSON_LAYOUT_RHYTHM.proseWallChars && !st.structured) {
      const issue: LessonQualityIssue = {
        code: 'prose-wall',
        level: strict ? 'blocking' : 'warning',
        sectionKey: sec.key,
        message: `${label}是一堵 ${st.chars} 字的文字墙（没有任何小标题、列表、表格或图）。`,
        fix: '把这区拆开归纳：① 用 `### ` 小标题分段；② 把并列信息改成要点卡（`- **要点**：一句话`）或对比表；③ 需要看形状/趋势的地方补一个 ```figure 规格图。',
      }
      if (strict) blocking.push(issue)
      else warnings.push(issue)
    } else if (st.chars > LESSON_LAYOUT_RHYTHM.longSectionChars) {
      warnings.push({
        code: 'long-section',
        level: 'warning',
        sectionKey: sec.key,
        message: `${label}有 ${st.chars} 字（超过 ${LESSON_LAYOUT_RHYTHM.longSectionChars} 字建议值），读者容易跳读。`,
        fix: '把其中并列的信息改成要点卡/对比表，或拆成两区。',
      })
    }

    // 要点没精炼
    if (layout === 'keypoints' || layout === 'pitfall') {
      const points = parseLessonPoints(sec.md)
      const tooLong = points.filter((p) => (p.title + p.desc).length > LESSON_LAYOUT_RHYTHM.maxPointChars)
      if (tooLong.length) {
        warnings.push({
          code: 'unrefined-points',
          level: 'warning',
          sectionKey: sec.key,
          message: `${label}有 ${tooLong.length} 条要点超过 ${LESSON_LAYOUT_RHYTHM.maxPointChars} 字，等于没精炼。`,
          fix: '每条要点压到一句话（用 `- **要点名**：一句话`），细节放正文区或折叠区。',
        })
      }
      if (points.length > LESSON_LAYOUT_RHYTHM.maxPointItems) {
        warnings.push({
          code: 'too-many-points',
          level: 'warning',
          sectionKey: sec.key,
          message: `${label}有 ${points.length} 条要点（超过 ${LESSON_LAYOUT_RHYTHM.maxPointItems} 条），读者记不住。`,
          fix: '合并同类项，或拆成两个要点区。',
        })
      }
    }

    // 长正文缺一句话结论（takeaway）
    const takeaway = String(sec.takeaway ?? '').trim()
    if (layout === 'prose' && st.chars > 200 && !takeaway) {
      warnings.push({
        code: 'missing-takeaway',
        level: 'warning',
        sectionKey: sec.key,
        message: `${label}较长但没有一句话结论（takeaway），读者读完抓不到重点。`,
        fix: '给这一区补 `takeaway`：一句话说清"这区讲完读者该记住什么"。',
      })
    }

    // 大纲要求了载体，正文没有 → 阻断（Plan 与 Do 不一致）
    const carrier = String(roster?.carrier ?? '').trim()
    if (carrier && !carrierSatisfied(carrier, st)) {
      blocking.push({
        code: 'roster-carrier-missing',
        level: 'blocking',
        sectionKey: sec.key,
        message: `${label}在大纲里声明要用「${carrier}」承载，但正文里没有。`,
        fix: `补上声明的载体（${carrierHint(carrier)}），或先改大纲（调整区级计划后再落卡）——不要让大纲与正文两张皮。`,
      })
    }
  }

  // 全文：有没有"看得见的东西"
  const graphicSections = statsList.filter((s) => s.graphic).length
  const totalChars = statsList.reduce((sum, s) => sum + s.chars, 0)
  if (graphicSections === 0) {
    // 走完规划（strict）且区数足够 → 阻断；否则只警告（快速模式不因"没图"卡死产出）
    const level =
      strict && sections.length >= LESSON_LAYOUT_RHYTHM.minSectionsForGraphicCarrier
        ? 'blocking'
        : 'warning'
    const issue: LessonQualityIssue = {
      code: 'no-graphic-carrier',
      level,
      sectionKey: null,
      message:
        `整篇讲义没有任何图、表、公式或代码——${sections.length} 个区全是文字（共 ${totalChars} 字），` +
        '读者只能读字，看不到结构。',
      fix:
        '至少给一个区补上"看得见"的载体：结构/形状用 ```figure 的 shape|matrix|network，' +
        '趋势/对比用 plot|bar，并列关系用对比表，公式用 $$ 块级公式，能跑的东西用 ```js。' +
        `建议优先改这几区：${(sections.slice(0, 3).map((s) => `「${s.key}」`).join('、') || '主体区')}。`,
    }
    if (level === 'blocking') blocking.push(issue)
    else warnings.push(issue)
  }

  // 全文：版式单调（读者审美与节奏）
  const devices = [...new Set(layouts)]
  if (sections.length >= LESSON_LAYOUT_RHYTHM.minSectionsForDeviceVariety && devices.length === 1) {
    warnings.push({
      code: 'device-monotony',
      level: 'warning',
      sectionKey: null,
      message: `全部 ${sections.length} 个区都用了同一种版式「${lessonLayoutName(devices[0])}」，通篇一个样子。`,
      fix: '按内容换设备：定义/机制用正文或图解，并列关系用对比表，步骤用步骤条，数据用数据看点，误区用误区卡，收尾用结论条。',
    })
  }

  // 全文：连续纯文字区（读者会疲劳）
  let run = 0
  let runStart: string | null = null
  for (let i = 0; i < layouts.length; i++) {
    if (isPlainLayout(layouts[i])) {
      if (run === 0) runStart = sections[i].key
      run++
      if (run === LESSON_LAYOUT_RHYTHM.maxConsecutivePlain) {
        const names = sections
          .slice(i - run + 1, i + 1)
          .map((s) => `「${s.title ?? s.key}」`)
          .join('、')
        warnings.push({
          code: 'consecutive-plain',
          level: 'warning',
          sectionKey: runStart,
          message: `连续 ${run} 个区都是纯文字（${names}），中间没有图/表/卡。`,
          fix: '把其中一区改成要点卡、对比表或补一张 figure 图，让读者的眼睛有落点。',
        })
        break
      }
    } else {
      run = 0
      runStart = null
    }
  }

  return { blocking, warnings, stats: { sections: sections.length, chars: totalChars, graphicSections, devices } }
}

/** 大纲声明的载体是否在正文里出现 */
function carrierSatisfied(carrier: string, st: LessonMdStats): boolean {
  const c = carrier.trim().toLowerCase()
  if (!c) return true
  if (/figure|图|diagram|chart|plot|matrix|shape|network|mermaid/.test(c)) return st.figures + st.mermaid > 0
  if (/table|表|compare|matrix-grid/.test(c)) return st.tables > 0
  if (/formula|公式|math|equation/.test(c)) return st.formulas > 0 || st.inlineFormulas >= 2
  if (/code|js|代码|runnable/.test(c)) return st.codeBlocks > 0
  if (/point|要点|list|列表|bullet/.test(c)) return st.bullets + st.ordered >= 2
  if (/stats|数据|metric/.test(c)) return st.statsItems >= 2
  if (/quote|引文|条文/.test(c)) return st.quotes > 0
  if (/checklist|清单/.test(c)) return st.checkboxes >= 2 || st.bullets >= 3
  // 未知载体词：不判定（宁可放行，也不误拦）
  return true
}

/** 载体词 → 可执行提示 */
function carrierHint(carrier: string): string {
  const c = carrier.trim().toLowerCase()
  if (/figure|图|diagram|chart|plot|matrix|shape|network|mermaid/.test(c)) {
    return '如 ```figure\\n{"type":"shape","dims":[4,3],"labels":["行","列"]}\\n```，或 mermaid 关系图'
  }
  if (/table|表|compare/.test(c)) return '如一张 markdown 对比表（表头 + 分隔行 + ≥2 行数据）'
  if (/formula|公式|math/.test(c)) return '如 `$$` 独立成行的块级公式'
  if (/code|js|代码/.test(c)) return '如 ```js 可运行代码块（只用 console.log）'
  if (/stats|数据/.test(c)) return '如 `- 68% | 命中率 | 补充说明`'
  if (/quote|引文|条文/.test(c)) return '如 `> 原文` 引用块 + 出处'
  return `补齐「${carrier}」对应的内容形状`
}

function sectionLabel(sec: LessonLayoutSectionLike): string {
  const title = String(sec.title ?? '').trim()
  return title ? `「${title}」区（key=${sec.key}）` : `区「${sec.key}」`
}

// ==================== 设备条目解析（渲染层二次拆解） ====================

export interface LessonPointItem {
  title: string
  desc: string
}

export interface LessonStepItem {
  no: number
  title: string
  desc: string
}

export interface LessonStatItem {
  value: string
  label: string
  note: string
}

export interface LessonChecklistItem {
  text: string
  done: boolean
}

export interface LessonTimelineItem {
  marker: string
  title: string
  desc: string
}

const LIST_ITEM = /^\s{0,3}(?:[-*+]|\d+[.)])\s+(.*)$/

/** 列表项 → { title, desc }（`**加粗**` 或「：」前的部分作标题） */
function splitItem(text: string): LessonPointItem {
  const raw = String(text ?? '').trim()
  const bold = /^\*\*(.+?)\*\*\s*[:：]?\s*(.*)$/.exec(raw)
  if (bold) return { title: bold[1].trim(), desc: bold[2].trim() }
  const colon = /^([^:：]{1,24})\s*[:：]\s*(.+)$/.exec(raw)
  if (colon) return { title: colon[1].trim(), desc: colon[2].trim() }
  return { title: raw, desc: '' }
}

/** 要点卡/误区卡条目（只认列表行；解析不出返回空数组） */
export function parseLessonPoints(md: string): LessonPointItem[] {
  const out: LessonPointItem[] = []
  for (const line of String(md ?? '').split(/\r?\n/)) {
    const m = LIST_ITEM.exec(line)
    if (!m) continue
    const item = splitItem(m[1].replace(CHECKBOX_LINE, ''))
    if (item.title) out.push(item)
  }
  return out
}

/** 步骤条条目（有序列表优先；没有有序列表时退回列表行） */
export function parseLessonSteps(md: string): LessonStepItem[] {
  const out: LessonStepItem[] = []
  for (const line of String(md ?? '').split(/\r?\n/)) {
    const m = /^\s{0,3}\d+[.)]\s+(.*)$/.exec(line)
    if (!m) continue
    const item = splitItem(m[1])
    out.push({ no: out.length + 1, title: item.title, desc: item.desc })
  }
  return out
}

/** 数据看点条目：`- 值 | 说明 | 备注` */
export function parseLessonStats(md: string): LessonStatItem[] {
  const out: LessonStatItem[] = []
  for (const line of String(md ?? '').split(/\r?\n/)) {
    const m = LIST_ITEM.exec(line)
    if (!m) continue
    const parts = m[1].split('|').map((p) => p.trim())
    if (parts.length < 2 || !parts[0] || !parts[1]) continue
    out.push({ value: stripMark(parts[0]), label: stripMark(parts[1]), note: stripMark(parts[2] ?? '') })
  }
  return out
}

/** 勾选清单条目 */
export function parseLessonChecklist(md: string): LessonChecklistItem[] {
  const out: LessonChecklistItem[] = []
  for (const line of String(md ?? '').split(/\r?\n/)) {
    const m = /^\s{0,3}[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line)
    if (!m) continue
    out.push({ text: stripMark(m[2]), done: m[1].toLowerCase() === 'x' })
  }
  return out
}

/** 时间线条目：`- 2012：事件` / `- 阶段一：事件` */
export function parseLessonTimeline(md: string): LessonTimelineItem[] {
  const out: LessonTimelineItem[] = []
  for (const line of String(md ?? '').split(/\r?\n/)) {
    const m = LIST_ITEM.exec(line)
    if (!m) continue
    const raw = m[1].trim()
    const colon = /^([^:：]{1,20})\s*[:：]\s*(.+)$/.exec(raw)
    if (!colon) continue
    const item = splitItem(colon[2])
    out.push({ marker: stripMark(colon[1]), title: item.title, desc: item.desc })
  }
  return out
}

/** 去掉行内 markdown 标记（加粗/反引号），渲染纯文本条目用 */
function stripMark(text: string): string {
  return String(text ?? '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

/**
 * 按设备拆分区正文：**已被解析成条目的列表行**从正文里摘掉，其余原样留在 `residual`。
 * 渲染层用「条目卡片 + 残余 markdown」两段渲染——结构化设备不会吞掉夹在列表之外的正文
 * （宁可多渲染一段，也不静默丢模型写的内容）。
 */
export function splitLessonDeviceMd(md: string, layout: DlLessonLayout): { residual: string } {
  const lines = String(md ?? '').split(/\r?\n/)
  const consumed = (line: string): boolean => {
    if (!LIST_ITEM.test(line)) return false
    switch (layout) {
      case 'keypoints':
      case 'pitfall':
      case 'qa':
        return parseLessonPoints(line).length > 0
      case 'steps':
        return parseLessonSteps(line).length > 0
      case 'stats':
        return parseLessonStats(line).length > 0
      case 'checklist':
        return parseLessonChecklist(line).length > 0
      case 'timeline':
        return parseLessonTimeline(line).length > 0
      default:
        return false
    }
  }
  return { residual: lines.filter((line) => !consumed(line)).join('\n').trim() }
}

// ==================== 展示计划 ====================

export interface LessonSectionPresentation {
  layout: DlLessonLayout
  layoutName: string
  /** 版式徽标文案（正文叙述不挂徽标，返回空串） */
  badge: string
  /** 一句话结论（takeaway；空串=没有） */
  takeaway: string
  stats: LessonMdStats
}

/**
 * 区 → 展示计划（渲染层数据源）。
 * 只做「解析与派发」，不改内容：模型写什么就渲染什么。
 */
export function presentLessonSections(input: {
  essenceType?: string | null
  sections: LessonLayoutSectionLike[]
}): LessonSectionPresentation[] {
  return (input.sections ?? []).map((sec) => {
    const layout = resolveSectionLayout({ key: sec.key, layout: sec.layout })
    const stats = analyzeLessonMd(sec.md)
    return {
      layout,
      layoutName: lessonLayoutName(layout),
      badge: layout === 'prose' ? '' : lessonLayoutName(layout),
      takeaway: String(sec.takeaway ?? '').trim(),
      stats,
    }
  })
}