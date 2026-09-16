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
 * 1. `LESSON_SECTION_CATALOG`：区目录（key → 中文标题 / 样式 / 职责 role / 写作说明 brief /
 *    重点区最少字数 minChars / 同义写法别名）；
 * 2. `LESSON_TEMPLATES`：每种知识本质类型的**固定区序**（校验用有序子序列）；
 * 3. `normalizeCardSections`：可无损映射的自动修复（别名改名、标题/样式归一、正文标题
 *    层级归一、自测答案拆独立区）；
 * 4. `checkLessonSectionsShape`：修复后仍不合规时报出可执行的拒绝原因（模型据此重发）；
 * 5. `checkLessonDepth`：重点深度**非阻断**提醒（重点区过简 / 重点被挤占），与 brief 同源。
 *
 * 纪律：模板只约束**命名与顺序**，不强制**必备区**——某概念确实没有代码示例就不该硬凑
 * 一个 code 区（宁缺毋滥）。`meta` 首区由既有循序渐进门禁单独把守。
 * 深度检查同样不做硬门禁：区是可选的，硬拦"字数不够"会诱导模型**删区**而不是**补写**。
 *
 * v6（2026-09-15 用户反馈「重点不突出」）：
 * - 每个区标 **role**（导学 lead / 核心 core / 案例 case / 支撑 support / 收尾 close）与一段
 *   **brief**（这一区要写什么、必须含哪些要素、写到什么程度）；重点是「定义 + 详解 + 案例」；
 * - 区序改为「定义 → 详解 → 案例」：`examples` 从定义之前**移到定义与详解之后**。
 *
 * v7（2026-09-15 同日用户口径「章节太细碎，合并；示例放到详解后面；不要卡片样式」）：
 * - **合并**：本质 → 定义；机制/构成与结构/规则/公式/性质/步骤/依据/适用与局限 → 详解；
 *   反例与边界 → 案例；补充与注意 → 常见坑。合并用 `mergedInto` 声明：老卡的这些 key
 *   在归一化时**内容一字不删地并进目标区**，新生成则只出合并后的区（章节从 15 降到 10 左右）；
 * - 区序：学习前必读 → 为什么学它 → （陈述）→ 定义 → **详解** → **案例** → …；
 * - 「详解」是篇幅最大的重点区：主线 + 逐项/逐类同维度展开 + 横向对比表 + 判定与计算规则。
 *
 * v8（2026-09-15 用户口径「章节还是太细碎；核心骨架就是定义、详解（含规则和逻辑）、示例、自测，
 * 有些领域还会有具体的操作」）：
 * - **再合并**：为什么学它 → 学习前必读（动机收进导学区，`### 为什么学它` 小标题保留）；
 *   步骤/落到代码 → **实操**（新生效区，只有本知识点确实有可照做的操作时才出现）；
 *   辨析 + 常见坑 + 补充与注意 → **辨析与易错**（新生效区）；
 * - **每种本质类型的骨架显式化**：`meta →（陈述）→ definition → detail →（争议）→ examples
 *   → operation → confusions → selfcheck → answers → notes`——六类模板只在这条主干上增减
 *   （K-stmt/K-agent/K-open 有「陈述/条文」，K-agent/K-open 另有「争议与评价」），
 *   即用户说的"不同领域会有所不同，但核心结构类似"；
 * - 生效区从 13 降到 11（章节数 K-concept 10 → 8），重点是 definition/detail/examples 三区；
 * - 自测的「参考答案」不再占章节编号（渲染层按跟随区折叠在自测之后），见 `lesson-sections`。
 */

import { splitSelfCheckAnswers } from './lesson-selfcheck'
import type { DlEssenceType, DlSectionStyle } from '../types/domain-learning.types'

/** 区在教学结构里的职责（决定篇幅配比与写作要求；v6：重点在 core + case，其余从简） */
export type LessonSectionRole =
  /** 导学：入口与动机，只列不展开 */
  | 'lead'
  /** 核心：定义与详解（机制/构成/规则/公式/性质/步骤/陈述/依据），必须写透 */
  | 'core'
  /** 案例：案例与示例、反例，必须写细 */
  | 'case'
  /** 支撑：适用局限/辨析/代码/进阶，按需 */
  | 'support'
  /** 收尾：自测/答案/注记 */
  | 'close'

/** 区职责 → 展示用短标签（提示词渲染用） */
export const LESSON_SECTION_ROLE_LABELS: Record<LessonSectionRole, string> = {
  lead: '导学',
  core: '核心',
  case: '案例',
  support: '支撑',
  close: '收尾',
}

/** 区目录条目：一个规范 key 的标题 / 样式 / 职责 / 写作说明 */
export interface LessonSectionSpec {
  /** 规范 key（落库与渲染都以此为准） */
  key: string
  /** 固定中文标题（模板派生；模型不再自由命名，避免"大标题都不同"） */
  title: string
  /** 区样式（渲染语义） */
  style: DlSectionStyle
  /** 区职责（v6：决定这一区该写多详细） */
  role: LessonSectionRole
  /**
   * 写作说明（v6）：这一区**要写什么、必须含哪些要素、写到什么程度**。
   * 生成侧把它渲染进提示词（`lessonTemplateBriefHint`），落库后按同一份说明做深度提醒
   * （`checkLessonDepth`）——一份口径，两处消费。
   */
  brief: string
  /** 重点区（core/case）的最少正文字数；低于此判"没讲透"（导学/支撑/收尾不设） */
  minChars?: number
  /**
   * 合并去向（v7 起；2026-09-15 用户口径「章节太细碎，合并」）：
   * 该区已并入目标区——它的 key 与全部同义写法都会被归一成目标 key，
   * 老卡重存时内容按原顺序**合并进目标区**（内容不删、标题按目标区派生）。
   * 带 mergedInto 的条目不再出现在任何新模板里，也不再进提示词的区写作要求总表（仅历史留档）。
   */
  mergedInto?: string
  /** 同义写法（模型/历史数据的自由命名 → 规范 key 的无损映射） */
  aliases?: string[]
}

/**
 * 全量条目（**生效区 + 已合并的历史区**；仅内部使用，v8：生效区 11 个）。
 * 标题取自既有 `DEFAULT_SECTION_TITLES` 口径（历史卡与新卡标题一致），样式沿用 v4 语义；
 * role/brief/minChars 为 v6 增补，mergedInto（已合并的历史区）见 `LESSON_MERGED_SECTION_SPECS`。
 * 对外只暴露两个视图：`LESSON_SECTION_CATALOG`（生效区）与 `LESSON_MERGED_SECTION_SPECS`（历史合并区），
 * 免得"目录里还列着「本质/结构/规则」"看起来像没合并。
 */
const ALL_SECTION_SPECS: LessonSectionSpec[] = [
  {
    key: 'meta',
    title: '学习前必读',
    style: 'intro',
    role: 'lead',
    brief: '读者的入场券（原来单独的「为什么学它」也并进这一区，用 `### 为什么学它` 小标题收在里面）：读者画像、本讲前置（逐条列前置概念名，确无前置就写"无需前置"）、记号热身、学完能做到（2~3 条可测目标）、为什么学它（解决什么问题、不学卡在哪）。全文唯一的导学区，只列不展开。',
  },
  {
    key: 'why',
    title: '为什么学它',
    style: 'body',
    role: 'lead',
    brief: '（v8 已并入「学习前必读」区：动机写成该区里的 `### 为什么学它` 小标题。）保留此条仅为历史键归一，新生成不再单独出这一区。',
    mergedInto: 'meta',
    aliases: ['motivation', 'background', 'purpose', 'goal', 'problem', 'why-here', 'why_here'],
  },
  {
    key: 'essence',
    title: '本质',
    style: 'intro',
    role: 'lead',
    brief: '（v7 起已并入「定义」区开头：用两三句人话给直觉，然后直接进正式定义。）保留此条仅为历史键归一，新生成不再单独出这一区。',
    mergedInto: 'definition',
    aliases: ['core', 'intuition', 'intuit', 'overview', 'what'],
  },
  {
    key: 'examples',
    title: '案例',
    style: 'body',
    role: 'case',
    minChars: 260,
    brief: '真实、具体的案例说明（本讲重点，紧跟详解之后，用来呼应上面的定义与详解）：每个案例写 背景 → 这一步对应定义/详解里的哪一条 → 得到什么结论，帮助读者理解即可，2~3 个足够。不要抽象罗列，不要做"换条件会怎样"的反事实推演，不编造公司与文献。原来单独的「反例/边界」也并到这里。',
    aliases: ['example', 'case', 'worked', 'worked-example', 'worked_example', 'worked-examples', 'numbers', 'numeric', 'calculation', 'instances', 'facts', 'data'],
  },
  {
    key: 'statement',
    title: '陈述/条文',
    style: 'body',
    role: 'core',
    minChars: 180,
    brief: '陈述/条文原文（法规注明效力与施行）+ 关键词逐条解释 + 适用对象与场景；不得把改写过的文字当原文引用。',
    aliases: ['stmt', 'theorem', 'claim', 'lemma'],
  },
  {
    key: 'justification',
    title: '依据/证明',
    style: 'body',
    role: 'core',
    minChars: 180,
    brief: '（v7 已并入「详解」区：证明思路 → 关键步骤与每步依据 → 结论。）保留此条仅为历史键归一。',
    mergedInto: 'detail',
    aliases: ['proof', 'proof-sketch', 'proof_sketch', 'proof-idea', 'rationale', 'np-lemma'],
  },
  {
    key: 'definition',
    title: '定义',
    style: 'body',
    role: 'core',
    minChars: 320,
    brief: '本讲重点，写详细：① 开头两三句人话直觉（原「本质」区并到这里，让人先抓住"它到底是什么"）；② 正式定义——谁、在什么条件下、对什么享有权利或承担义务；③ 逐个拆解定义里的限定词是什么意思；④ 边界：它不是什么、与最近邻概念差在哪；⑤ 首次出现的记号给读法。读完读者要能拿这个定义给一个没见过的东西归类。',
    aliases: ['def', 'define', 'formal', 'notation', 'semantics'],
  },
  {
    key: 'mechanism',
    title: '机制',
    style: 'body',
    role: 'core',
    minChars: 260,
    brief: '（v7 已并入「详解」区：为什么/怎么运转的因果链。）保留此条仅为历史键归一。',
    mergedInto: 'detail',
    aliases: ['mech', 'mechanisms', 'how', 'howto', 'how-to', 'algorithm', 'alg', 'construction', 'construct', 'derivation', 'derive'],
  },
  {
    key: 'structure',
    title: '构成与分类',
    style: 'body',
    role: 'core',
    minChars: 220,
    brief: '（v7 已并入「详解」区：逐项/逐类用同一组维度展开。）保留此条仅为历史键归一。',
    mergedInto: 'detail',
    aliases: ['composition', 'components', 'families', 'family', 'types', 'taxonomy', 'levels', 'variants', 'forms'],
  },
  {
    key: 'rules',
    title: '规则',
    style: 'body',
    role: 'core',
    minChars: 220,
    brief: '（v7 已并入「详解」区：判定与计算规则。）保留此条仅为历史键归一。',
    mergedInto: 'detail',
    aliases: ['rule', 'laws', 'ops'],
  },
  {
    key: 'formula',
    title: '公式',
    style: 'body',
    role: 'core',
    minChars: 160,
    brief: '（v7 已并入「详解」区：公式与推导。）保留此条仅为历史键归一。',
    mergedInto: 'detail',
    aliases: ['formulas', 'equation', 'equations'],
  },
  {
    key: 'property',
    title: '性质',
    style: 'body',
    role: 'core',
    minChars: 160,
    brief: '（v7 已并入「详解」区。）保留此条仅为历史键归一。',
    mergedInto: 'detail',
    aliases: ['properties', 'props'],
  },
  {
    key: 'procedure',
    title: '步骤',
    style: 'body',
    role: 'core',
    minChars: 180,
    brief: '（v8 已并入「实操」区：有序步骤与走查。）保留此条仅为历史键归一。',
    mergedInto: 'operation',
    aliases: ['steps', 'recipe', 'checklist', 'workflow', 'process', 'method', 'implementation', 'implement'],
  },
  {
    key: 'operation',
    title: '实操',
    style: 'body',
    role: 'support',
    brief:
      '本知识点确实有"能照着做一遍"的操作时才写这一区（没有就整区不出现，不要硬凑）：把操作写成可照做的步骤/命令/最小代码/办理流程——每步给"做什么 → 得到什么、在哪验证"，代码给最小可运行片段并写明期望输出。形态随领域不同（编程=代码与命令、法规=申报与办理流程、金融=计算与下单步骤），但都要能让读者跟着走通一遍。原来单独的「步骤」「落到代码」都并到这里。',
    aliases: ['hands-on', 'hands_on', 'how-to-do', 'how_to_do', 'runbook'],
  },
  {
    key: 'application',
    title: '适用与局限',
    style: 'body',
    role: 'support',
    brief: '（v7 已并入「详解」区：什么条件下适用、什么条件下失效。）保留此条仅为历史键归一。',
    mergedInto: 'detail',
    aliases: ['apply', 'usage', 'use', 'applicability', 'scope', 'limits', 'limit', 'boundary', 'boundaries', 'conditions', 'limitation', 'consequences', 'cost'],
  },
  {
    key: 'counterexample',
    title: '反例/边界',
    style: 'body',
    role: 'case',
    minChars: 160,
    brief: '（v7 已并入「案例」区。）保留此条仅为历史键归一。',
    mergedInto: 'examples',
    aliases: ['counter-example', 'counter_example', 'edge-case'],
  },
  {
    key: 'confusions',
    title: '辨析与易错',
    style: 'note',
    role: 'support',
    brief:
      '最容易混淆的邻近概念逐项对比（对比维度要一致，并给一句判据："看到 X 就是 A，看到 Y 就是 B"）+ 本讲范围内真会踩的 3~6 个坑（现象 → 为什么错 → 正确做法，每条一句话）。原来单独的「辨析」「常见坑」「补充与注意」都并到这里；既没有可辨析的邻概念、也没有真会踩的坑，就整区不出现。',
    aliases: ['confusion', 'confusions-and-pitfalls'],
  },
  {
    key: 'distinguish',
    title: '辨析',
    style: 'body',
    role: 'support',
    brief: '（v8 已并入「辨析与易错」区：与邻近概念的对比。）保留此条仅为历史键归一。',
    mergedInto: 'confusions',
    aliases: ['contrast', 'compare', 'comparison', 'vs', 'misconception', 'misconceptions', 'disambiguation', 'discreteness'],
  },
  {
    key: 'code',
    title: '落到代码',
    style: 'body',
    role: 'support',
    brief: '（v8 已并入「实操」区：最小可运行代码与命令、期望输出。）保留此条仅为历史键归一。',
    mergedInto: 'operation',
    aliases: ['js', 'implement-code', 'snippet'],
  },
  {
    key: 'detail',
    title: '详解',
    style: 'body',
    role: 'core',
    minChars: 600,
    brief: '本讲重点，篇幅最大（原来分散的「机制 / 构成与结构 / 规则 / 公式 / 性质 / 步骤 / 依据 / 适用与局限」都并进这一区）：① 先给一条**贯穿主线**——为什么这样分、各部分之间是什么关系（一条能推理的轴）；② 逐项/逐类展开，用**同一组维度**：它具体是什么 → 收益或结果从哪来、由什么决定 → 权利义务或输入产出 → 规则约束（能做什么、不能做什么、优先级）→ 什么条件下会失效或出错；③ 一张横向对比表收口；④ 判定与计算规则——拿到一个新对象怎么判它属于哪一类、涉及数字的怎么算（每条写成：适用条件 → 怎么判定/计算 → 为什么这样规定 → 判断错了会怎样）。',
    aliases: ['deep-dive', 'extended', 'extension', 'further', 'advanced', 'reading', 'extras'],
  },
  {
    key: 'controversy',
    title: '争议与评价',
    style: 'body',
    role: 'support',
    brief: '各方观点逐条：谁、主张什么、依据什么、被批评在哪；给读者一个可判断的框架，不替读者下结论。',
    aliases: ['debate', 'positions', 'schools', 'views', 'open', 'open-issues', 'open_issues', 'frontier'],
  },
  {
    key: 'edge',
    title: '补充与注意',
    style: 'note',
    role: 'support',
    brief: '（v8 起并入「辨析与易错」区。）保留此条仅为历史键归一。',
    mergedInto: 'confusions',
    aliases: ['edge-cases'],
  },
  {
    key: 'pitfalls',
    title: '常见坑',
    style: 'note',
    role: 'support',
    brief: '（v8 已并入「辨析与易错」区：现象 → 为什么错 → 正确做法。）保留此条仅为历史键归一。',
    mergedInto: 'confusions',
    aliases: ['pitfall', 'mistakes', 'failure', 'failures', 'trap', 'traps', 'misuse', 'misuses'],
  },
  {
    key: 'selfcheck',
    title: '自测',
    style: 'review',
    role: 'close',
    brief: '≥3 题，覆盖本讲核心（定义/详解/案例各至少 1 题），至少 1 题为换数字的同构应用题；题面写在这里，答案放 answers 区。',
    aliases: ['check', 'checks', 'quiz', 'selftest', 'self-test', 'self_test', 'self-check', 'self_check', 'review', 'exercises', 'questions', 'test'],
  },
  {
    key: 'answers',
    title: '参考答案',
    style: 'review',
    role: 'close',
    brief: '逐题给答案 + 一步解析，并标注回看区（哪一区讲过）；整区默认折叠，读者先做再对。',
    aliases: ['answer', 'solutions', 'solution', 'selfcheck-answers', 'selfcheck_answers', 'check-ans', 'check-answer', 'selftest-answers', 'selftest_answers'],
  },
  {
    key: 'notes',
    title: '编写注记（学习者可跳过）',
    style: 'body',
    role: 'close',
    brief: '只给编写者看：采集情况、证据级别、待核验点、资料缺口；folded 置底，不得写进学习者正文。',
    aliases: ['authoring-notes', 'authoring_notes'],
  },
]

/** **生效区目录**（v8）：只含当前讲义会真正出现的区——提示词、模板、UI 都读它 */
export const LESSON_SECTION_CATALOG: LessonSectionSpec[] = ALL_SECTION_SPECS.filter((s) => !s.mergedInto)

/**
 * **已合并的历史区**（v8）：本质 / 为什么学它 / 机制 / 构成与结构 / 规则 / 公式 / 性质 / 步骤 /
 * 依据 / 适用与局限 / 落到代码 / 反例与边界 / 辨析 / 常见坑 / 补充与注意。
 * 保留目的有二：① 老卡的这些 key 与同义写法仍能归一到目标区；
 * ② 老卡渲染时仍能取到原区标题（合并时作为 `### 小标题` 留在目标区里）。**不在任何模板里，也不进提示词。**
 */
export const LESSON_MERGED_SECTION_SPECS: LessonSectionSpec[] = ALL_SECTION_SPECS.filter((s) => !!s.mergedInto)

/** 合并去向表（历史 key → 目标 key；提示词/文档/测试用） */
export const LESSON_SECTION_MERGE_MAP: Record<string, string> = Object.fromEntries(
  LESSON_MERGED_SECTION_SPECS.map((s) => [s.key, s.mergedInto as string]),
)

/**
 * 每种知识本质类型的**固定区序**（有序子序列校验的依据）。
 *
 * v8 主干（2026-09-15 用户口径：**章节还是太细碎；核心骨架＝定义、详解（含规则和逻辑）、示例、自测，
 * 有些领域还有具体的操作**）——六类模板都长在这条主干上：
 *   学习前必读 →（陈述/条文）→ 定义 → 详解 →（争议与评价）→ 案例 → 实操 → 辨析与易错 → 自测 → 答案 → 注记
 * 类型差异只在「有没有陈述/条文」（K-stmt/K-agent/K-open）与「有没有争议与评价」（K-agent/K-open）；
 * 每个区都可以**按需跳过**（某概念确实没有可照做的操作，就不该硬凑一个「实操」区）。
 * 唯一一处顺序差异：**K-oper（做法）把「实操」排在「案例」之前**——做法类知识的本体就是"怎么做"，
 * 先跟做一遍，再看别人怎么用；其余类型都是「案例 → 实操」（先看清情形，再自己动手）。
 *
 * 合并关系（内容不删，只是不再单列成章）：
 *   本质 → 定义；为什么学它 → 学习前必读；
 *   机制/构成与结构/规则/公式/性质/依据/适用与局限 → 详解；
 *   步骤/落到代码 → 实操；反例与边界 → 案例；
 *   辨析/常见坑/补充与注意 → 辨析与易错。
 * 收尾仍按纪律：自测收尾、答案紧随自测、注记置底。
 */
export const LESSON_TEMPLATES: Record<DlEssenceType, string[]> = {
  'K-concept': [
    'meta', 'definition', 'detail', 'examples', 'operation', 'confusions',
    'selfcheck', 'answers', 'notes',
  ],
  'K-oper': [
    'meta', 'definition', 'detail', 'operation', 'examples', 'confusions',
    'selfcheck', 'answers', 'notes',
  ],
  'K-stmt': [
    'meta', 'statement', 'definition', 'detail', 'examples', 'operation', 'confusions',
    'selfcheck', 'answers', 'notes',
  ],
  'K-inst': [
    'meta', 'definition', 'detail', 'examples', 'operation', 'confusions',
    'selfcheck', 'answers', 'notes',
  ],
  'K-agent': [
    'meta', 'statement', 'definition', 'detail', 'controversy', 'examples', 'operation',
    'confusions', 'selfcheck', 'answers', 'notes',
  ],
  'K-open': [
    'meta', 'statement', 'definition', 'controversy', 'detail', 'examples', 'operation',
    'confusions', 'selfcheck', 'answers', 'notes',
  ],
}

/** 当前生效的模板版本（新生成按它走；老卡见 `LESSON_LEGACY_TEMPLATES`） */
export const LESSON_TEMPLATE_VERSION_CURRENT = 'v8'

/**
 * **历史模板留档：v7**（2026-09-15 下午，同日第二轮）。
 * 与 v8 的差别：为什么学它仍单独成区；步骤并进「详解」、代码另有「落到代码」区；
 * 辨析与常见坑各自成区（v8 才并成「实操」「辨析与易错」两个区）。
 */
export const LESSON_TEMPLATES_V7: Record<DlEssenceType, string[]> = {
  'K-concept': [
    'meta', 'why', 'definition', 'detail', 'examples', 'code', 'distinguish', 'pitfalls',
    'selfcheck', 'answers', 'notes',
  ],
  'K-oper': [
    'meta', 'why', 'definition', 'detail', 'code', 'examples', 'distinguish', 'pitfalls',
    'selfcheck', 'answers', 'notes',
  ],
  'K-stmt': [
    'meta', 'why', 'statement', 'definition', 'detail', 'examples', 'distinguish', 'pitfalls',
    'selfcheck', 'answers', 'notes',
  ],
  'K-inst': [
    'meta', 'why', 'definition', 'detail', 'examples', 'distinguish', 'pitfalls',
    'selfcheck', 'answers', 'notes',
  ],
  'K-agent': [
    'meta', 'why', 'statement', 'definition', 'detail', 'controversy', 'examples', 'distinguish',
    'pitfalls', 'selfcheck', 'answers', 'notes',
  ],
  'K-open': [
    'meta', 'why', 'statement', 'definition', 'controversy', 'detail', 'examples', 'distinguish',
    'pitfalls', 'selfcheck', 'answers', 'notes',
  ],
}

/**
 * **历史模板留档：v6**（2026-09-15 当天短暂存在的一版）。
 * 与 v7 的差别：区没有合并（机制/构成与结构/规则/公式/性质/步骤/依据/适用与局限各自成区，
 * 定义之前还没有"案例"这个名字）。
 */
export const LESSON_TEMPLATES_V6: Record<DlEssenceType, string[]> = {
  'K-concept': [
    'meta', 'essence', 'why', 'definition', 'mechanism', 'structure', 'rules', 'formula',
    'property', 'procedure', 'examples', 'application', 'counterexample', 'distinguish', 'code',
    'detail', 'edge', 'pitfalls', 'selfcheck', 'answers', 'notes',
  ],
  'K-oper': [
    'meta', 'essence', 'why', 'definition', 'procedure', 'mechanism', 'rules', 'formula',
    'examples', 'application', 'counterexample', 'distinguish', 'code', 'detail', 'edge',
    'pitfalls', 'selfcheck', 'answers', 'notes',
  ],
  'K-stmt': [
    'meta', 'essence', 'why', 'statement', 'definition', 'justification', 'mechanism',
    'formula', 'property', 'procedure', 'examples', 'application', 'counterexample',
    'distinguish', 'detail', 'edge', 'pitfalls', 'selfcheck', 'answers', 'notes',
  ],
  'K-inst': [
    'meta', 'essence', 'why', 'definition', 'structure', 'mechanism', 'property', 'procedure',
    'examples', 'application', 'distinguish', 'counterexample', 'detail', 'edge', 'pitfalls',
    'selfcheck', 'answers', 'notes',
  ],
  'K-agent': [
    'meta', 'essence', 'why', 'statement', 'mechanism', 'detail', 'controversy',
    'examples', 'application', 'distinguish', 'counterexample', 'edge', 'pitfalls', 'selfcheck',
    'answers', 'notes',
  ],
  'K-open': [
    'meta', 'essence', 'why', 'statement', 'controversy', 'mechanism', 'examples',
    'application', 'counterexample', 'detail', 'edge', 'pitfalls', 'selfcheck', 'answers', 'notes',
  ],
}

/**
 * **历史模板留档：v5**（2026-09-13 ～ 2026-09-15）。
 * 与 v6 的差别只有一处：`examples`（示例）在定义/机制**之前**（当时的"先例后律"纪律）。
 * 保留目的：① 历史留档可查（不删除任何旧定义）；② 老卡兼容——v5 时期落库的讲义区序
 * 仍是合法有序子序列，落库门禁按 `LESSON_LEGACY_TEMPLATES` 放行，**不改写老卡内容**。
 */
export const LESSON_TEMPLATES_V5: Record<DlEssenceType, string[]> = {
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

/** 历史模板清单（新→旧；门禁逐个尝试，命中任一即算区序合法，只读不改写） */
export const LESSON_LEGACY_TEMPLATES: Array<{ version: string; templates: Record<DlEssenceType, string[]> }> = [
  { version: 'v7', templates: LESSON_TEMPLATES_V7 },
  { version: 'v6', templates: LESSON_TEMPLATES_V6 },
  { version: 'v5', templates: LESSON_TEMPLATES_V5 },
]

/** 全部知识本质类型（提示词渲染用） */
export const DL_ESSENCE_TYPES: DlEssenceType[] = ['K-concept', 'K-oper', 'K-stmt', 'K-inst', 'K-agent', 'K-open']

/** 别名 → 规范 key（由**全量**条目派生：生效区指向自身，已合并的历史区折到目标 key） */
const CANONICAL_BY_NAME: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const spec of ALL_SECTION_SPECS) {
    const target = spec.mergedInto ?? spec.key
    map[spec.key] = target
    for (const alias of spec.aliases ?? []) map[alias] = target
  }
  return map
})()

/**
 * 当前生效的区 key（不含已合并进别处的历史区）。
 * 提示词里的「区 → 写作要求」总表只列这些；模板也只允许这些。
 */
export const LESSON_ACTIVE_SECTION_KEYS: string[] = LESSON_SECTION_CATALOG.map((s) => s.key)

/** 规范 key → 条目（含已合并的历史区，老卡标题/样式兜底要读） */
const SPEC_BY_KEY: Record<string, LessonSectionSpec> = (() => {
  const map: Record<string, LessonSectionSpec> = {}
  for (const spec of ALL_SECTION_SPECS) map[spec.key] = spec
  return map
})()

/**
 * 名字（key 或同义写法）→ **声明它的那条目录条目**的 key。
 * 用于合并时找回"原区标题"（cost 的 owner 是 application，标题「适用与局限」）——
 * 合并进目标区时把原标题作为 `### ` 小标题保留，内容与章法都不丢。
 */
const OWNER_KEY_BY_NAME: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const spec of ALL_SECTION_SPECS) {
    map[spec.key] = spec.key
    for (const alias of spec.aliases ?? []) map[alias] = spec.key
  }
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

/** 该本质类型当前允许的区序（v8） */
export function lessonTemplateKeys(essenceType: DlEssenceType): string[] {
  return LESSON_TEMPLATES[essenceType] ?? LESSON_TEMPLATES['K-concept']
}

/** 有序子序列判定：可按需跳过区，但不能乱序（区集校验的核心判据） */
export function isSectionOrderOk(keys: string[], template: string[]): boolean {
  let cursor = -1
  for (const key of keys) {
    const at = template.indexOf(key)
    if (at < cursor) return false
    cursor = at
  }
  return true
}

/**
 * 老卡兼容：该区序是否命中某个**历史模板**（返回版本号，否则 null）。
 * 命中即放行（内容保留不动），只在结果里附一句提示——见 `checkLessonSectionsShape`。
 */
export function legacyTemplateVersionFor(essenceType: DlEssenceType, keys: string[]): string | null {
  for (const entry of LESSON_LEGACY_TEMPLATES) {
    const tpl = entry.templates[essenceType] ?? entry.templates['K-concept']
    if (isSectionOrderOk(keys, tpl)) return entry.version
  }
  return null
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
  /**
   * 版式设备（2026-09-14 讲义流水线）：key 见 `shared/utils/lesson-layout` 的设备目录。
   * 归一化时**原样透传**（区集契约只管区名与区序，不管呈现形态）。
   */
  layout?: string | null
  /** 一句话结论（该区讲完读者该记住什么；渲染为结论条）——同样透传 */
  takeaway?: string | null
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
 * 1. 别名 / 已合并的区 → 规范 key（checks → selfcheck、worked → examples、
 *    cost/scope → detail、types → detail、edge-cases → pitfalls…）；
 * 2. **同 key 的多个区合并成一个**（v7 起）：内容按原出现顺序拼接、标题按目标区派生，
 *    内容一字不删（老卡的「组成/结构 + 规则 + 详解 + 适用与局限」重存后并成一个「详解」区，
 *    「辨析 + 常见坑」并成一个「辨析与易错」区）；
 * 3. 标题 / 样式按模板派生（同一类型同一区的标题完全一致）；
 * 4. 正文标题层级统一到 `###`；
 * 5. **按当前模板区序重排**（v8：定义 → 详解 → 案例 → 实操 → 辨析与易错）；
 * 6. 自测区里"独占一行答案标记"的答案拆成独立 `answers` 区（渲染层按整区折叠）；已有 answers 区时不重复拆。
 *
 * 未收录的 key **原样保留**（是否拒绝由 `checkLessonSectionsShape` 决定，避免静默吞掉内容）。
 */
export function normalizeCardSections(input: {
  essenceType: DlEssenceType
  sections: LessonSectionShape[]
}): NormalizeLessonSectionsResult {
  const changes: string[] = []
  const merged = new Map<string, LessonSectionShape>()
  let hasAnswersSection = (input.sections ?? []).some((s) => canonicalSectionKey(s.key) === 'answers')

  const pushOrMerge = (sec: LessonSectionShape, fromRawKey: string): void => {
    // 原 key 已被合并掉（structure/rules/mechanism/why/code/pitfalls… → 目标区）→ 记一条变更
    if (fromRawKey && fromRawKey !== sec.key && SPEC_BY_KEY[fromRawKey]?.mergedInto) {
      changes.push(
        `区 key「${fromRawKey}」按 ${LESSON_TEMPLATE_VERSION_CURRENT} 契约并入「${sec.key}（${sectionTitleOf(sec.key)}）」区（内容保留，未删除）`,
      )
    }
    const existing = merged.get(sec.key)
    if (!existing) {
      merged.set(sec.key, sec)
      return
    }
    // 合并：内容按出现顺序拼接（一字不删），折叠标记取"都折叠才算折叠"
    const parts = [existing.md, sec.md].filter((t) => String(t ?? '').trim().length > 0)
    existing.md = parts.join('\n\n')
    existing.folded = !!existing.folded && !!sec.folded
    if (existing.layout && sec.layout && existing.layout !== sec.layout) existing.layout = null
    else existing.layout = existing.layout ?? sec.layout ?? null
  }

  for (const sec of input.sections ?? []) {
    const rawKey = String(sec.key ?? '').trim()
    const key = canonicalSectionKey(rawKey)
    const spec = SPEC_BY_KEY[key] ?? null
    if (key !== rawKey && !SPEC_BY_KEY[rawKey]) {
      changes.push(`区 key「${rawKey}」按同义写法归一为「${key}」`)
    }
    // 合并：原区标题作为 `### ` 小标题保留在目标区正文里（章法不丢、内容不删）
    const ownerSpec = SPEC_BY_KEY[OWNER_KEY_BY_NAME[rawKey.toLowerCase()] ?? rawKey] ?? null
    const ownerTitle = ownerSpec?.title ?? ''
    const willMerge = !!ownerSpec && (ownerSpec.mergedInto ? ownerSpec.mergedInto === key : ownerSpec.key !== key)
    let md = normalizeLessonHeadingLevels(String(sec.md ?? ''))
    if (willMerge && ownerTitle && ownerTitle !== (spec?.title ?? '') && !md.trimStart().startsWith(`### ${ownerTitle}`)) {
      md = `### ${ownerTitle}\n\n${md}`
    }
    const title = spec ? spec.title : (sec.title ?? null)
    const style: DlSectionStyle | null = spec ? spec.style : (sec.style ?? null)

    // 自测区：答案拆独立区（未收录 key 不拆——它本就不该作为自测区落库）
    if (key === 'selfcheck' && !hasAnswersSection) {
      const parts = splitSelfCheckAnswers(md)
      if (parts.hasAnswers) {
        pushOrMerge({ key: 'selfcheck', title, style, md: parts.questions, folded: sec.folded, layout: sec.layout ?? null, takeaway: sec.takeaway ?? null }, rawKey)
        const answersSpec = SPEC_BY_KEY['answers']
        // 答案区沿用自测区的版式语义（都是题卡；答案整区默认折叠）
        pushOrMerge(
          { key: 'answers', title: answersSpec.title, style: answersSpec.style, md: parts.answers, folded: true, layout: sec.layout ?? null },
          rawKey,
        )
        hasAnswersSection = true
        changes.push('自测区答案已拆成独立「answers」区（渲染层默认折叠，读者先做再对答案）')
        continue
      }
    }
    pushOrMerge({ key, title, style, md, folded: sec.folded, layout: sec.layout ?? null, takeaway: sec.takeaway ?? null }, rawKey)
  }

  // 按当前模板区序重排（合并后的区落在目标区的位置；未收录 key 保序置底）
  const template = lessonTemplateKeys(input.essenceType)
  const orderOf = (key: string): number => {
    const at = template.indexOf(key)
    return at < 0 ? template.length : at
  }
  const beforeOrder = [...merged.keys()]
  const sections = [...merged.values()]
    .map((sec, index) => ({ sec, index }))
    .sort((a, b) => orderOf(a.sec.key) - orderOf(b.sec.key) || a.index - b.index)
    .map(({ sec }) => sec)
  if (sections.map((s) => s.key).join('>') !== beforeOrder.join('>')) {
    changes.push(
      '区序已按当前契约重排（学习前必读 → 定义 → 详解 → 案例 → 实操 → 辨析与易错 → 自测：重点在前、案例跟着详解）',
    )
  }

  return { sections, changes }
}

export interface LessonShapeCheckResult {
  ok: boolean
  /** ok=false 时给出可执行的拒绝原因（模型据此重发，不要照抄重发） */
  reason: string | null
  /**
   * ok=true 时的附注（目前只有一种：区序沿用历史模板）。
   * 老卡内容一律保留不动，不做自动重排——只提醒下次修订时可重排到当前契约。
   */
  note?: string | null
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
 * - 顺序不符 → 先看是否命中**历史模板**（老卡兼容：放行并在 note 里提示重排时机），
 *   都不是才拒绝，并给出该类型要求的区序；
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
      note: null,
    }
  }

  let note: string | null = null
  if (!isSectionOrderOk(keys, template)) {
    // 老卡兼容（2026-09-15）：历史模板时期落库的讲义区序仍然放行——
    // 已有内容不删除、不自动重排；只附一句提示，等下次修订该卡时再对齐当前契约。
    const legacy = legacyTemplateVersionFor(input.essenceType, keys)
    if (!legacy) {
      return {
        ok: false,
        reason:
          `区序不符合 ${input.essenceType} 模板（「${firstOrderOffender(keys, template)}」出现在它该在的位置之前）。` +
          `要求顺序：${template.join(' → ')}（可跳过不用的区，但不能乱序）。` +
          `请按该顺序重排各区的 md 内容（区与区之间的"承上启下"过渡句要跟着改），再重发本卡。`,
        note: null,
      }
    }
    note =
      `区序沿用历史模板 ${legacy}——内容保留不动、本次放行；` +
      `当前契约（${LESSON_TEMPLATE_VERSION_CURRENT}）的顺序是「定义 → 详解 → 案例 → 实操 → 辨析与易错 → 自测」，` +
      `下次修订这张卡时建议按它重排。`
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
      note: null,
    }
  }

  return { ok: true, reason: null, note }
}

/** 找出第一个乱序的区（拒绝信息里点名，便于模型定位） */
function firstOrderOffender(keys: string[], template: string[]): string {
  let cursor = -1
  for (const key of keys) {
    const at = template.indexOf(key)
    if (at < cursor) return key
    cursor = at
  }
  return keys[keys.length - 1] ?? ''
}

/** 提示词用：某类型的「key 标题」区序摘要（生成侧与门禁共用同一份契约，避免口径漂移） */
export function lessonTemplateHint(essenceType: DlEssenceType): string {
  return lessonTemplateKeys(essenceType)
    .map((key) => `${key}（${SPEC_BY_KEY[key].title}）`)
    .join(' → ')
}

/** 区职责（未收录 key 按"支撑"对待，不影响老卡渲染） */
export function sectionRoleOf(key: string): LessonSectionRole {
  return sectionSpecOf(key)?.role ?? 'support'
}

/** 区写作说明（未收录 key 返回空串） */
export function sectionBriefOf(key: string): string {
  return sectionSpecOf(key)?.brief ?? ''
}

/**
 * 单个区的「写作要求」行（提示词与深度提醒同源；未收录 key / 已合并的区返回空串）。
 * 形如：`definition（定义）[重点]：至少 320 字；本讲重点，写详细：…`
 * 只有重点区（core/case）带 `[重点]` 标记——其它区不打标签（v7：不给正文区贴"从简"的标签）。
 */
export function sectionBriefLine(key: string): string {
  const spec = SPEC_BY_KEY[canonicalSectionKey(key)]
  if (!spec || spec.mergedInto) return ''
  const mark = spec.role === 'core' || spec.role === 'case' ? '[重点]' : ''
  const need = spec.minChars ? `至少 ${spec.minChars} 字；` : ''
  return `${spec.key}（${spec.title}）${mark}：${need}${spec.brief}`
}

/**
 * 提示词用：某类型的区清单 + 写作要求（v8）。
 * 与 `lessonTemplateHint`（只给区序）配套：**写作要求只在这一份里**，
 * 生成侧提示词与落库后的深度提醒都读它，杜绝"提示词一份、检查另一份"。
 */
export function lessonTemplateBriefHint(essenceType: DlEssenceType): string {
  return lessonTemplateKeys(essenceType)
    .map((key) => `- ${sectionBriefLine(key)}`)
    .join('\n')
}

/**
 * 提示词用：**当前生效区的写作要求总表**（区与本质类型无关，一份总表够用；
 * 已合并进别处的历史区不列——它们不会出现在新讲义里）。
 */
export function lessonSectionBriefMenuHint(): string {
  return LESSON_ACTIVE_SECTION_KEYS.map((key) => `- ${sectionBriefLine(key)}`).join('\n')
}

// ==================== 重点深度检查（非阻断提醒） ====================

/** 重点深度阈值（一处定义，提示词与检查共用） */
export const LESSON_DEPTH = {
  /** 重点区（核心 + 案例）在全文里的最少字数占比：低于此判"重点被导学与自测挤占" */
  coreShareMin: 0.6,
  /** 全文不足这么多字时不做占比检查（短卡不苛求，避免噪声） */
  minTotalForShareCheck: 800,
} as const

export type LessonDepthIssueCode =
  | 'thin-core'
  | 'thin-case'
  | 'low-core-share'

export interface LessonDepthIssue {
  code: LessonDepthIssueCode
  /** 出问题的区（全文级问题为 null） */
  sectionKey: string | null
  message: string
  /** 可执行的补写建议 */
  fix: string
}

export interface LessonDepthCheckResult {
  /** 无提醒即 true（**非阻断**：只随落库结果回给模型，不拒绝落库） */
  ok: boolean
  issues: LessonDepthIssue[]
  /** 可读摘要（进动作摘要/工具返回） */
  summary: string
  stats: {
    /** 全文正文字数（围栏外非空白字符） */
    totalChars: number
    /** 重点区（核心 + 案例）字数 */
    keyChars: number
    /** 重点占比 */
    coreShare: number
  }
}

/**
 * 区正文有效字数：**围栏外的非空白字符数**（与 lesson-layout 的"文字墙"口径一致）。
 * 代码块/figure 规格里的字符不算正文——它们不是"讲清楚"的篇幅。
 */
export function lessonBodyChars(md: string): number {
  const lines = String(md ?? '').split('\n')
  let fenceChar: string | null = null
  let chars = 0
  for (const line of lines) {
    const fence = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      const char = fence[1][0]
      if (fenceChar === null) fenceChar = char
      else if (fenceChar === char) fenceChar = null
      continue
    }
    if (fenceChar !== null) continue
    chars += line.replace(/\s+/g, '').length
  }
  return chars
}

/**
 * 重点深度检查（**非阻断**）：按 `LESSON_SECTION_CATALOG` 的 role/brief/minChars 判——
 * 1. 重点区（定义/详解/案例）字数低于 minChars → 这一区没讲透（附该区写作要求与参考下限）；
 * 2. 重点区占比低于 `LESSON_DEPTH.coreShareMin` → 非重点章节挤占了篇幅（v7/v8 合并后一般不会触发）。
 *
 * 为什么不做硬门禁：区是可选的（宁缺毋滥），硬拦"字数不够"会诱导模型**删区**而不是**补写**，
 * 反而丢内容；因此提醒随 `dl_save_card` 结果一起回给模型，由模型自行重发修订版。
 * 注意：字数只是**参考下限**，不是重点；真正的标准是"这一区有没有把该讲的逻辑讲完"。
 */
export function checkLessonDepth(input: {
  essenceType: DlEssenceType
  sections: LessonSectionShape[]
}): LessonDepthCheckResult {
  const sections = input.sections ?? []
  const issues: LessonDepthIssue[] = []
  const charsByKey = new Map<string, number>()
  let totalChars = 0
  let keyChars = 0

  for (const sec of sections) {
    const key = canonicalSectionKey(sec.key)
    const chars = lessonBodyChars(String(sec.md ?? ''))
    // 同一区重复出现时累加（合并前的老卡按各区之和算）
    charsByKey.set(key, (charsByKey.get(key) ?? 0) + chars)
  }
  for (const [key, chars] of charsByKey) {
    totalChars += chars
    const role = SPEC_BY_KEY[key]?.role
    if (role === 'core' || role === 'case') keyChars += chars
  }

  for (const [key, chars] of charsByKey) {
    const spec = SPEC_BY_KEY[key]
    if (!spec?.minChars) continue
    if (chars >= spec.minChars) continue
    const isCase = spec.role === 'case'
    issues.push({
      code: isCase ? 'thin-case' : 'thin-core',
      sectionKey: key,
      message:
        `「${spec.title}」只有 ${chars} 字（参考下限 ${spec.minChars} 字）——` +
        (isCase ? '这是案例区，读者看不到具体情形就学不会。' : '这是本讲重点，写这么短等于没讲透。'),
      fix: `按这一区的写作要求补写（当前 ${chars} 字，参考下限 ${spec.minChars} 字）：${spec.brief}`,
    })
  }

  const coreShare = totalChars > 0 ? keyChars / totalChars : 0
  if (totalChars >= LESSON_DEPTH.minTotalForShareCheck && coreShare < LESSON_DEPTH.coreShareMin) {
    issues.push({
      code: 'low-core-share',
      sectionKey: null,
      message:
        `重点区（定义/详解/案例）只占全文 ${Math.round(coreShare * 100)}%（${keyChars}/${totalChars} 字）——` +
        '篇幅被非重点章节占了。',
      fix:
        '把篇幅让给定义/详解/案例（这三节要写详细），其余章节按 v1 原有分量写、不要扩写，' +
        '重点区按各自写作要求补到参考下限以上。',
    })
  }

  return {
    ok: issues.length === 0,
    issues,
    summary:
      issues.length === 0
        ? `重点占比 ${Math.round(coreShare * 100)}%（${keyChars}/${totalChars} 字）`
        : `${issues.length} 条重点提醒（${issues.map((i) => i.sectionKey ?? '全文').join('、')}）`,
    stats: { totalChars, keyChars, coreShare },
  }
}
