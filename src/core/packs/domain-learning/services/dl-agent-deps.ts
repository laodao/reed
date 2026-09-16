/**
 * 领域学习 Agent 依赖：状态快照 / 建议 / 系统提示词
 * @module packs/domain-learning/services/dl-agent-deps
 *
 * 快照 = 从 dl_* 业务表重建的领域状态文本（F9：库是权威源，不用 AI 复述）。
 * research 模式：给空间概览 + 目标概念现状 + 知识库命中提示；tutor 模式：
 * 给当前讲义全文摘要 + 相关概念定义 + 图关系（引证基础）。
 */

import { pickNextToLearn } from '../rules/learning-sequence.rules'
import { buildPrerequisiteBriefing } from '../rules/learning-prerequisites.rules'
import { assessMapCoverage, mapCoverageBriefing, type MapCoverageResult } from '../rules/learning-map-coverage.rules'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'
import type { DlSpacePrereq } from '@shared/types/domain-learning.types'
import { DL_ESSENCE_TYPES, lessonSectionBriefMenuHint, lessonTemplateHint } from '@shared/utils/lesson-template'
import { BUILTIN_SKILLS } from '@core/platform/workflow/skills/builtin-skills'
import { splitSkillFrontmatter } from '@core/platform/workflow/skills/skill-parser'

/** 领域起步研究技能 id（dlEmptySpaceMission / 宿主注入共用） */
export const DL_BOOTSTRAP_SKILL_ID = 'learning-space-bootstrap'

/** 知识体系补全技能 id（2026-09-12：AI 补全地图的作业规范；宿主按消息标记注入正文） */
export const DL_MAP_COMPLETION_SKILL_ID = 'learning-map-completion'

// ==================== 固定流程（2026-09-13 用户需求：先对齐诉求 → 确认体系 → 才落库） ====================

/**
 * 用户确认「诉求理解」后，前端发给 agent 的消息标记。
 * 宿主据此注入"第 2 步：规划知识体系"指令（与 MAP_COMPLETION_MARKER 同构：标记即契约）。
 */
export const PLAN_UNDERSTANDING_CONFIRMED_MARKER = '【已确认诉求理解】'
/** 用户确认「知识体系」后，前端发给 agent 的消息标记（注入"第 3 步：按方案落库"指令）。 */
export const PLAN_SYLLABUS_CONFIRMED_MARKER = '【已确认知识体系】'
/**
 * 用户确认「讲义方案」后，前端发给 agent 的消息标记（2026-09-14 讲义流水线）。
 * 宿主据此注入"按规格锁逐区精写"指令——**这是讲义生成的 Do 阶段**。
 */
export const PLAN_LESSON_CONFIRMED_MARKER = '【已确认讲义方案】'
/**
 * 快速模式标记（自动推进/重新生成等不需要用户确认的场景）：
 * 明确告诉模型"本轮直接产出讲义草稿，不必先提交讲义方案"。
 * 注意：跳过的是**方案确认**，不是质量——视觉质检（文字墙/通篇无图/声明与正文不符）照样生效。
 */
export const LESSON_QUICK_MODE_MARKER = '【直接产出讲义】'

/** 该消息是否属于「讲义流水线」的某一阶段（确认讲义方案 / 明确快速模式） */
export function isLessonPipelineMessage(message: string): boolean {
  const t = String(message ?? '')
  return t.includes(PLAN_LESSON_CONFIRMED_MARKER) || t.includes(LESSON_QUICK_MODE_MARKER)
}

/**
 * 讲义 Plan 阶段指令（2026-09-14）：先规划规格与区级计划 → 用户确认 → 再逐区精写。
 * 参考 ppt-master：Plan 与 Do 分离，规划产物（design_spec + 页级 roster）是写作的唯一口径。
 */
export function lessonPlanProposeInstruction(input: {
  conceptName: string
  /** 空间学习目标（决定深度默认值） */
  spaceGoal?: string | null
  /** 是否已有旧讲义（有则说明"这次是重做/增补"，规划要以已有内容为底） */
  hasExistingCard?: boolean
}): string {
  const goal = input.spaceGoal ? `空间目标：${input.spaceGoal}；` : ''
  return `【讲义流水线·Plan 阶段：先规划讲义方案，等用户确认】
概念：「${input.conceptName}」（${goal}${input.hasExistingCard ? '该概念已有旧讲义——这次是重做/增补，规划要以旧内容为底，别丢已核验的表述' : '尚无讲义'}）

本轮的产出**不是正文**，而是一份「讲义方案」草案：
1. 先采证：知识库优先（wf_kb_retrieve）→ 联网（wf_web_extract / http_get / arXiv），合计 3-6 次够用即停；边读边记要点与出处；
2. 判定知识本质类型（K-concept/K-oper/K-stmt/K-inst/K-agent/K-open）——它决定模板区集与区序；
3. 调用 **dl_propose_lesson_plan** 提交方案，必须写全：
   - **读者画像**（从哪出发、不是什么水平）+ **学完能做到**（2~4 条可测动词句）；
   - **深度 / 篇幅预算**（区数、每区字数上限）/ 语气；
   - **术语表**（首现要解释的词）与**记号表**（读法 + 最小例子）；
   - **示例参数表**（全讲复用同一套数字，防跨区漂移）；
   - **区级计划 roster**：每区给 key（模板区集内、按模板顺序）、layout（版式设备）、job（这一区替读者做什么）、
     carrier（用什么载体承载：figure/table/formula/code/points/stats/quote/checklist）、takeaway（一句话结论）；
   - 视觉计划：本讲靠什么图/表把结构讲清楚（**每个概念至少一个"看得见"的载体**：图/表/公式/代码）。
4. **本轮不要调用 dl_save_card**——用户会在弹窗里确认或改版式，确认后宿主驱动下一轮，你再逐区精写正文。
5. 提交后停下，用一段话说明：本质类型、准备怎么讲、打算配什么图，等用户确认。`
}

/**
 * 讲义 Do 阶段指令（2026-09-14）：按**已确认规格锁**逐区精写。
 * 对应 ppt-master 的 Executor 阶段（按 §IX roster 逐页画，每 5 页回读 spec_lock）。
 */
export function lessonAuthoringInstruction(input: { conceptName: string; specLock: string }): string {
  return `【讲义流水线·Do 阶段：按已确认规格逐区精写】
${input.specLock}

现在写概念「${input.conceptName}」的讲义正文，纪律如下：
1. **逐区写、逐区报进度**：先用 dl_task_progress（action=plan，total=区数，label=各区名）声明计划，
   然后每写一区 start/done 一次，让用户看到进度；每写完 3 个区**回读上面的规格锁**一次（防术语/记号/算例漂移）；
2. **一区一版式**：严格按 roster 的 layout 写——keypoints 就是 2~6 条「- **要点**：一句话」；
   compare 就是一张对比表；steps 就是有序步骤；figure 就真给 \`\`\`figure 规格块（合法 JSON）；
   stats 就是「- 68% | 命中率 | 备注」；quote 就是「> 原文」；code 就是可运行的 \`\`\`js；
   pitfall 就是短句误区；checklist 就是「- [ ] 事项」；qa 就是题面（答案拆到独立 answers 区）；
   写不出对应形状就别硬套版式（但大纲声明的载体必须补上）；
3. **精炼归纳（用户最不满的一点）**：不要写大段散文——一区长段信息必须归纳成要点卡/小标题/表格；
   每区给 takeaway（一句话结论）；单区正文超过 400 字就要拆结构；
4. **配图（每个概念至少一个）**：结构/形状用 shape|matrix|network，趋势/对比用 plot|bar，
   并列关系用对比表，公式用 $$ 块级公式，能跑的东西用 \`\`\`js；图要服务理解，不要为配图而配图；
5. 写完后 **dl_save_card** 落库（sections 带 key/layout/takeaway/md；evidenceSources 非空）：
   落库会按已确认区级计划校验（区集/区序/载体），并按视觉质检拦"文字墙/通篇无图/声明与正文不符"；
6. 收尾用一段话告诉用户：这一讲讲清了什么、配了什么图、哪个区是重点。`
}

/** 快速模式说明（跳过方案确认，但质量照样管） */
export function lessonQuickModeHint(): string {
  return `【直接产出讲义】（快速模式：本轮不必先提交讲义方案）
要求不变：先采证（知识库优先 → 联网，3-6 次即停），再按该本质类型的模板区集**逐区精写**：
- 每区选一个合适版式（要点卡/对比表/步骤条/图解/算例/公式/数据看点/引文/时间线/误区/清单/代码/自测/结论条），
  正文必须与该版式形状一致；一区长段信息要归纳，不要写成一堵文字墙；
- 每区给 takeaway；**整篇至少一个"看得见"的载体**（figure 图 / 对比表 / 公式 / 可运行代码）；
- 落库前自检：区集与区序符合模板、自测答案拆到独立 answers 区、每条论断有证据来源。
落库时视觉质检会拦"文字墙 / 通篇无图 / 声明版式与正文不符"——过了才落库。`
}

/**
 * 该消息是否属于固定流程的某一阶段（含两个确认标记）。
 * 宿主据此把这一轮也当「规划落库轮」处理——否则补图流程的第 2/3 轮会因为文案不含"补全"动词
 * 而掉出规划轮，导致阶段指令不注入、门禁不生效（2026-09-13 自查发现的坑）。
 */
export function isPlanPhaseMessage(message: string): boolean {
  const t = String(message ?? '')
  return t.includes(PLAN_UNDERSTANDING_CONFIRMED_MARKER) || t.includes(PLAN_SYLLABUS_CONFIRMED_MARKER)
}

/** 阶段 1（对齐诉求）：本轮只提交诉求理解草案，不落库 */
export function planUnderstandingPhaseInstruction(spaceName: string): string {
  return `【固定流程·第 1 步：对齐诉求】
本次不是"直接生成知识点"，而是**先确认对诉求的理解**：
1. 读快照里的【学习主题诉求（用户原话）】，必要时先做少量资料探查（S1）；
2. 调用 **dl_propose_understanding** 提交草案：goalSummary（一句话复述他把什么学到什么程度）、coverage（**逐条**列出要覆盖的对象与场景——用户点名的产品/市场/数据/动作各自都要有落点）、audience、notDoing（明确不做什么）、keyExpectations；
3. **本轮不要调用 dl_save_concept / dl_save_relation**（规划轮门禁会直接拒绝），提交草案后就用一段话说明"等你确认或纠正"，然后停下。
用户确认后，宿主会以新一轮消息驱动第 2 步（规划知识体系）。
（空间：「${spaceName}」）`
}

/**
 * 阶段 2（规划知识体系）：诉求已确认，本轮只提交知识体系草案。
 */
export function planSyllabusPhaseInstruction(input: {
  spaceName: string
  understandingSummary: string
}): string {
  return `【固定流程·第 2 步：规划知识体系】（用户已确认诉求理解）
已确认的诉求理解：
${input.understandingSummary}

本轮只做一件事：
1. 按已确认的诉求，结合资料与模型知识规划**分支目录 + 知识点**（粒度细到"学完能做一件具体小事"）；
2. 调用 **dl_propose_syllabus** 提交：branches[].name + 每个分支下的 concepts[]（name/definitionShort/prerequisites/layer）——**每个分支都必须有知识点，不许出现空分支**（上一版「投资与配置」就是空的）；
3. 前置关系要在方案里写清（prerequisites），落库时再落成边；诉求点名的对象必须在方案里有落点；
4. **本轮不要调用 dl_save_concept / dl_save_relation**（门禁会拒绝），提交方案后说明"等你勾选确认"，然后停下。
用户确认后，宿主会以新一轮消息驱动第 3 步（按方案落库）。
（空间：「${input.spaceName}」）`
}

/**
 * 阶段 3（按方案落库）：体系已确认，本轮才允许建点建边并出首份讲义。
 */
export function planSavePhaseInstruction(input: {
  spaceName: string
  syllabusLines: string
  conceptCount: number
}): string {
  return `【固定流程·第 3 步：按已确认的知识体系落库】（用户已确认，落库门禁已放行）
已确认方案（${input.conceptCount} 个知识点）：
${input.syllabusLines}

本轮执行顺序（**不要重新规划**，方案就是用户已确认的版本）：
1. 先落分支目录：dl_save_concept（nodeType=group，parentId=领域根），拿到各 group 的 id；
2. 再落知识点：dl_save_concept（parentId=所属分支 group id，definitionShort + prerequisites 必填）；
3. 逐条落前置边：dl_save_relation（source=前置 → target=本概念）；
4. 挑最基础的一个 dl_save_card 出第一份讲义（首区 meta + 前置声明 + 证据）；
5. **方案里的知识点要全部落库**；确有必要新增（方案外的），要在总结里单独说明新增了什么、为什么；
6. 收尾报数：建成几个分支/知识点/边、首份讲义给了谁、还有哪些没建成及原因。
（空间：「${input.spaceName}」）`
}

/** 方案清单的可读行（注入阶段 3 指令用；与 planNodeNames 同源的渲染） */
export function formatSyllabusLines(
  syllabus: import('@shared/types/domain-learning.types').DlPlanSyllabus,
): string {
  const lines: string[] = []
  for (const b of syllabus.branches ?? []) {
    lines.push(`- 分支「${b.name}」${b.definitionShort ? `：${b.definitionShort}` : ''}`)
    for (const c of b.concepts ?? []) {
      const layer = c.layer != null ? `layer=${c.layer}` : 'layer=?'
      const pre = c.prerequisites?.length ? ` 前置=${c.prerequisites.join('、')}` : ''
      lines.push(`  · ${c.name}（${layer}${pre}）${c.definitionShort ? `：${c.definitionShort}` : ''}`)
    }
  }
  for (const c of syllabus.rootConcepts ?? []) {
    lines.push(`- 根层知识点：${c.name}${c.definitionShort ? `：${c.definitionShort}` : ''}`)
  }
  return lines.join('\n')
}

/**
 * 整体知识点体系清单（分支配概念树，紧凑、有上限）。
 * @module packs/domain-learning/services/dl-agent-deps
 *
 * 2026-09-14 补：此前研究轮快照只有聚合统计/缺口/当前概念邻居，模型看不到"空间里已有哪些分支与概念"，
 * 导致研究时容易和已有概念撞名、分不清归属。这里把完整树（根层 group → 概念；孤点归到「未归类」）
 * 折叠成有上限的行，注入 research/tutor/task 快照，让模型一眼看清全图。
 *
 * - 只输出**名字 + 类型 + 是否已有讲义**（✓），不输出定义/讲义全文——既有 current 概念文本与
 *   前置/缺口清单已给细节，这里是"结构"盲区补全；
 * - `limit` 上限（默认 80 行）：超长地图截断并注明，避免把上下文窗口/本轮长度撑爆。
 * @returns 渲染好的行（空地图返回 []）
 */
export function buildMapInventoryLines(
  concepts: Array<{
    id: string
    name: string
    nodeType: string
    parentId: string | null
    cardId?: string | null
  }>,
  limit = 80,
): string[] {
  if (!concepts.length) return []

  const isKnowledge = (c: { nodeType: string }): boolean => c.nodeType !== 'group'
  const groups = concepts.filter((c) => c.nodeType === 'group')
  const groupById = new Map(groups.map((g) => [g.id, g]))
  const roots = groups.filter((g) => !g.parentId)
  const sortedGroups = [...roots, ...groups.filter((g) => g.parentId)].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))

  const lines: string[] = []
  const visitedConcepts = new Set<string>()
  const mark = (c: { nodeType: string; cardId?: string | null }): string =>
    `${c.nodeType}${c.cardId ? ' ✓' : ''}`

  // 根层分支（nodeType=group）
  for (const g of sortedGroups) {
    if (lines.length >= limit) break
    lines.push(`- 分支「${g.name}」`)
    for (const c of concepts.filter((x) => x.parentId === g.id && isKnowledge(x))) {
      if (lines.length >= limit) break
      lines.push(`  · ${c.name}（${mark(c)}）`)
      visitedConcepts.add(c.id)
    }
  }

  // 已挂在 group 下的概念已访问；剩下来的是根层知识概念，以及"父级不是本空间 group"的孤点
  for (const c of concepts) {
    if (!isKnowledge(c) || visitedConcepts.has(c.id)) continue
    if (lines.length >= limit) break
    const underLocalGroup = !!c.parentId && groupById.has(c.parentId)
    lines.push(`${underLocalGroup ? '  ' : '- '}${underLocalGroup ? '' : '根层/未归类：'}· ${c.name}（${mark(c)}）`)
    visitedConcepts.add(c.id)
  }

  // 超长地图：截断并注明，避免撑爆上下文
  if (lines.length >= limit) {
    lines.length = limit
    lines.push(`…（地图共 ${concepts.length} 个节点，仅列示前 ${limit} 行，请按缺口清单与选题决定补哪些）`)
  }
  return [`【当前知识点体系清单】（分支 → 概念；✓=已有讲义）`, ...lines]
}

/** 诉求理解的可读摘要（注入阶段 2 指令用） */
export function formatUnderstandingSummary(
  u: import('@shared/types/domain-learning.types').DlPlanUnderstanding,
): string {
  const parts = [`目标：${u.goalSummary}`, `要覆盖：${u.coverage.join('、')}`]
  if (u.audience) parts.push(`读者：${u.audience}`)
  if (u.notDoing?.length) parts.push(`不做：${u.notDoing.join('、')}`)
  if (u.keyExpectations?.length) parts.push(`期望：${u.keyExpectations.join('；')}`)
  return parts.join('\n')
}


/**
 * 「补全知识地图」消息标记（dlMapCompletionMission 的固定开头）。
 * 宿主据此在 task 模式下注入 learning-map-completion 技能正文——两边共用同一常量/同一句话，
 * 由契约用例钉死（改文案不改标记会导致注入失效，测试会红）。
 */
export const MAP_COMPLETION_MARKER = '【补全知识地图】'

/** 取内置技能正文（去 frontmatter）；找不到返回 null */
export function dlSkillBody(skillId: string): string | null {
  const entry = BUILTIN_SKILLS.find((s) => s.id === skillId)
  if (!entry) return null
  return splitSkillFrontmatter(entry.markdown).body.trim() || null
}

/**
 * 取 learning-space-bootstrap 技能正文（S1~S5 全文，去掉 frontmatter）。
 * 宿主在空空间研究轮直接注入快照 → 外层带工具模型真执行五阶段。
 * （2026-09-09 复盘：invoke_skill 的内层是无工具单次生成，对 bootstrap 这类
 *  过程型技能会"看似完成实则零落库"，故不再依赖 invoke_skill 执行它。）
 */
export function dlBootstrapSkillBody(): string | null {
  return dlSkillBody(DL_BOOTSTRAP_SKILL_ID)
}

/** 用户自然语言里同类意图的识别（用户在任务框直接说"补全知识体系"时也注入技能正文） */const MAP_COMPLETION_INTENT =
  /(补全|补齐|完善|追加|添加|新增|补充).{0,12}(知识体系|知识地图|知识点|知识骨架|体系|骨架|地图|概念)/
/** 语序颠倒的说法（"把缺的知识点补上"）：名词在前、动作在后 */
const MAP_COMPLETION_INTENT_REVERSED =
  /(知识体系|知识地图|知识点|知识骨架|体系|骨架|地图|概念).{0,8}(补上|补齐|补全|完善|添加|新增|落库)/

/**
 * 该轮消息是否要求「补全知识地图」（task 模式据此注入技能正文）。
 * 命中条件：① 按钮指令的固定标记；② 用户自然语言里同义的建图/补全意图（含语序颠倒的说法）。
 */
export function shouldInjectMapCompletionSkill(message: string): boolean {
  const text = String(message ?? '')
  return (
    text.includes(MAP_COMPLETION_MARKER) ||
    MAP_COMPLETION_INTENT.test(text) ||
    MAP_COMPLETION_INTENT_REVERSED.test(text)
  )
}

/** 快照信息（宿主每轮装配时调用） */
export interface DlSpaceSnapshot {
  text: string
  /** 下一步建议（"继续学习"目标概念） */
  nextConceptId: string | null
  /** 空间是否尚无知识概念叶（仅目录 group/空）——research 需走"起步研究"分支 */
  isEmptySpace: boolean
  /** 空间名（起步引导文案用；未知则回退 id） */
  spaceName: string | null
  /** 学习主题诉求（dl_project.description 用户原话；2026-09-13 起进快照与起步指令） */
  spaceDescription?: string | null
  /** 主题学习前置要求（2026-09-12：整个领域的学习门槛；空数组=尚未声明） */
  spacePrereqs: DlSpacePrereq[]
  /** 地图完整度诊断（2026-09-12：结构缺口清单，供模型按缺口补全） */
  coverage: MapCoverageResult
}

/** 纯判定：是否存在知识概念叶（group 目录不算） */
export function hasConceptLeaves(concepts: Array<{ nodeType: string }>): boolean {
  return concepts.some((c) => c.nodeType !== 'group')
}

/**
 * 空空间起步研究指令（research 会话在快照为空时追加；指向 learning-space-bootstrap 技能并保留兜底）
 *
 * 2026-09-13 用户反馈「金融理财主题生成的知识点与期望差别较大」复盘：
 * 原实现只吃 `spaceName`，用户写在空间描述里的真实诉求（"想听懂股票、债券、期货、做空做多、
 * MBS、美元…能读财报与行情"）**从未进入模型上下文**，模型只能凭「金融理财」四个字猜，
 * 于是做成了一份"个人理财规划"（记账→复利→风险→防线→配置）。
 * 现在把诉求原文一并带上，并要求骨架覆盖诉求点名的对象与场景。
 */
export function dlEmptySpaceMission(opts: { spaceName: string; description?: string | null }): string {
  const need = String(opts.description ?? '').trim()
  const needBlock = need
    ? `
【用户诉求（用户原话，最高优先级）】
${need}

规划纪律（先对齐再规划，**不得凭空间名猜主题**）：
1. 先把这段话复述成你理解的「学习目标 / 要覆盖的对象与场景 / 明确不做什么」，写进你的阶段回报；
2. 骨架必须**覆盖诉求里点名的对象与场景**——诉求点到的名词（产品、市场、数据、动作）各自要有落点，不允许只搭一层抽象框架（如"地基/时间与风险/防线"）就交差；
3. 诉求之外只补该领域公认主干，并在总结里注明"诉求未涵盖、按领域主干补的"。
`
    : ''
  return `【空领域起步研究】学习空间「${opts.spaceName}」当前还没有任何知识点。本次任务**只是固定流程的第 1 步：对齐诉求**。${needBlock}
执行方式（顺序不可跳）：
1. **先做少量资料探查**：知识库优先（wf_kb_retrieve），其次联网（wf_web_extract / http_get / web_search 若可用）；预算 3-6 次读工具，够用即停，边读边记要点与出处；
2. **提交诉求理解草案**：调用 dl_propose_understanding（goalSummary / coverage / audience / notDoing / keyExpectations），系统会弹窗让用户确认或纠正；
3. **本轮不要调用 dl_save_concept / dl_save_relation**——规划轮门禁会直接拒绝（首批知识点必须等用户确认知识体系之后才允许落库）；
4. 提交草案后用一段话说明"等你确认或纠正"，然后**停下**，不要继续规划细节；
5. 用户确认后宿主会以新一轮消息驱动第 2 步（dl_propose_syllabus 规划知识体系），确认后再第 3 步（按方案落库建点/建边/出首份讲义）。`
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

  // 目录分组（研究侧引导归属用：dl_save_concept 的 parentId 可填目录 id；M3-A）
  const rootGroups = concepts.filter((c) => c.nodeType === 'group' && !c.parentId)
  const groupLines =
    rootGroups.length > 0
      ? [`目录分组（dl_save_concept 的 parentId 可填其中 id）：${rootGroups.map((g) => `${g.name}(${g.id})`).join('；')}`]
      : []

  // 项目知识库绑定（M4-B：研究/核验按此 kbId 语义检索,evidence 可回链 kbDocId）
  const kbLines = project?.kbId
    ? [`本空间绑定知识库 id：${project.kbId}（需要读私有资料时把 wf_kb_retrieve 的 knowledgeBaseId 填此 id；讲义证据可用 kbDocId 回链）`]
    : []

  // 前置要求简报（2026-09-12 用户需求：主题级 + 知识点级；让模型每轮都按门槛与顺序生成）
  // 读侧信任仓储已解析结果（写入时已规范化并物化 inSpace）
  const spacePrereqs = project?.prerequisites ?? []
  const prereqLines = buildPrerequisiteBriefing({
    spacePrereqs,
    concepts: concepts.map((c) => ({ id: c.id, name: c.name, nodeType: c.nodeType, attrs: c.attrs })),
    relations: relations.map((r) => ({ source: r.sourceId, target: r.targetId, type: r.relationType })),
  })

  // 地图完整度简报（2026-09-12 用户反馈"知识体系不够完善"）：
  // 研究模式一次只保证当前概念的讲义，地图不会自己变完整——这里把结构性缺口摆到模型面前，
  // 让每一轮研究顺手补 1-3 个缺口概念（口径见 dlResearchSystemPrompt 第 14 条）。
  const coverage = assessMapCoverage({
    spaceName: project?.name ?? null,
    concepts: concepts.map((c) => ({
      id: c.id,
      name: c.name,
      nodeType: c.nodeType,
      parentId: c.parentId,
      researchState: c.researchState,
      cardId: c.cardId,
      attrs: c.attrs,
    })),
    relations: relations.map((r) => ({ source: r.sourceId, target: r.targetId, type: r.relationType, verified: r.verified })),
    spacePrereqs,
  })
  const coverageLines = mapCoverageBriefing(coverage)

  // 整体知识点体系清单（2026-09-14 补：让模型看清全部分支/概念的树形结构，避免撞名/归属不清）
  const mapInventoryLines = buildMapInventoryLines(
    concepts.map((c) => ({
      id: c.id,
      name: c.name,
      nodeType: c.nodeType,
      parentId: c.parentId,
      cardId: c.cardId,
    })),
  )

  // 学习主题诉求（2026-09-13）：用户创建空间时写的原话必须进上下文——
  // 之前只送 name+goal，模型只能凭「金融理财」猜，规划出的骨架与用户期望完全不同。
  const need = String(project?.description ?? '').trim()
  const needLines = need ? [`【学习主题诉求（用户原话，规划与讲义都以它为准）】${need}`] : []
  // 空间档案（题主选的领域类型：方法步骤/理论体系…；影响骨架取向）
  const profile = project?.profile ?? null
  const profileLines = profile
    ? [
        `空间档案：${String(profile.kindLabel ?? '—')}（${String(profile.nature ?? '—')}` +
          `${Array.isArray(profile.emphasis) && profile.emphasis.length ? `；侧重 ${profile.emphasis.join('/')}` : ''}）`,
      ]
    : []

  const head = [
    `学习空间：${project?.name ?? spaceId}（目标：${project?.goal ?? '—'}）`,
    ...needLines,
    ...profileLines,
    `掌握度：${masteredCount}/${leafCount} 个知识概念已理解`,
    ready ? `推荐下一个待学概念：${concepts.find((c) => c.id === ready)?.name ?? ready}` : '（全部已理解）',
  ]

  return {
    text: [...head, ...kbLines, ...groupLines, ...prereqLines, ...coverageLines, ...mapInventoryLines, ...conceptText].join('\n'),
    nextConceptId: ready,
    isEmptySpace: !hasConceptLeaves(concepts.map((c) => ({ nodeType: c.nodeType }))),
    spaceName: project?.name ?? null,
    spaceDescription: need || null,
    spacePrereqs,
    coverage,
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
1. 需要研究概念时，先调用 discover_capabilities 查看可用技能，再用 invoke_skill 调用学习技能：learning-domain-map（建骨架）/ learning-lesson-designer（**讲义方案规划：先规划规格与区级计划，再动笔**）/ learning-concept-explainer（单概念讲义逐区精写）/ learning-source-collector（采集前先规划资料路由）/ learning-question-generator（多视角补盲提问）/ learning-relation-miner（从材料提取关系与建议）/ learning-lesson-updater（已有讲义做增量修订，别整篇重写）/ learning-practice-builder（出分层练习与自测）；
2. 研究产出经 dl_save_concept / dl_save_relation 把概念与关系建议落为草稿（用户会在地图人审中确认），经 dl_save_card 把讲义卡片落为草稿；
   - **讲义区集契约（2026-09-13 起 dl_save_card 硬校验，违反会被拒绝）**：区名只能用下表中的在册区名，并按该知识本质类型给定的顺序排（用不到的区可以跳过，但不能乱序、不能自造区名）：
${DL_ESSENCE_TYPES.map((t) => `     · ${t}：${lessonTemplateHint(t)}`).join('\n')}
     区标题由模板派生（**不要自己起大标题**，同一类型同一区的标题必须一致）；区正文里的小标题一律用 \`###\`（区标题已占二级语义），不要写 \`##\`；
     自测的**题目与答案必须分开**：题面放 selfcheck，答案放独立 answers 区；或所有题目写完后用**独占一行**的「答案」/「参考答案」小标题引出（系统会自动拆成独立区）。答案写在题目行里（\`**答案 1**：…\`、\`（答：…）\`）会被拒绝——渲染层据此把答案默认折叠，读者先做再对；
   - **重点分配与区序（2026-09-15 用户口径：章节还是太细碎，核心骨架＝定义 → 详解（含规则和逻辑）→ 案例 → 自测，有些领域还有具体的操作）**：一个知识点的重点就是**定义、详解、案例**这三节（写详细），其余章节按原有分量写、不扩写；自测收尾。区序是「**定义 → 详解 → 案例 →（实操）→ 辨析与易错 → 自测**」，案例紧跟详解之后。合并去向（内容不删，只是不再单列成章）：**为什么学它 → 学习前必读**（动机写成该区里的 \`### 为什么学它\`）；**机制/构成与结构/规则/公式/性质/依据/适用与局限 → 详解**（篇幅最大的重点区：主线 + 逐项/逐类同维度展开 + 横向对比表 + 判定与计算规则）；**步骤/落到代码 → 实操**（只有本知识点确实有"能照着做一遍"的操作时才写，没有就整区不出现，不要硬凑）；**反例/边界 → 案例**；**辨析/常见坑/补充与注意 → 辨析与易错**。**按文档写**（段落 + 小标题 + 表格），不要做成要点卡堆砌。标了 [重点] 的区有参考字数下限，写不到会在落库后被点名提醒（不拒绝落库，但要按提醒补写后再发一版）。每个区要写什么，见下表：
${lessonSectionBriefMenuHint().split('\n').map((line) => `     ${line}`).join('\n')}
3. 讲义必须带 evidence：dl_save_card 的 evidenceSources 至少一条，否则工具会拒绝——宁可少产出一条，也不落无出处的断言；evidence 必须来自你实际读到的资料（标题/URL/文档 id + 引文），不得编造；
4. 采集纪律（会话提供读工具时）：资料不足先用 learning-source-collector 规划，再按需取——知识库优先（wf_kb_retrieve）；网页正文提取用 wf_web_extract；API/原文用 http_get（arXiv 论文用 http_get 请求 export.arxiv.org/api/query，如 search_query=all:关键词 或 id_list=编号）；模型先验与资料要区分：先验内容在卡片 attrs 或注释里标 needs_verification；
5. 联网搜索只在提供了 web_search 工具时使用；没有 web_search 时不得假装搜索，改用知识库 / 给定 URL / arXiv；
6. 不要重复执行刚成功的同一动作；动作失败可换参数重试一次；
7. 若本轮是研究一个未解问题（快照含【待研究问题】）：找到有据答案时务必调用 dl_answer_question 把「问题+答案+来源」存档（answerSource 用 ai_verified 或 新研究），并把支撑沉淀为概念/讲义草稿；仍无据则保持 open，并在总结里说明缺什么资料、下一步该去哪找；
8. 全部完成后用一段话总结：研究了什么、读了哪些资料、产出哪些草稿、下一步建议（等用户人审/继续学习）；
9. 归属（M3-A）：快照「目录分组」里若存在契合的目录，dl_save_concept 的 parentId 填其目录 id；不确定就保持 null（根层），地图人审会再归类；
10. 知识库优先（M4-B）：快照含「本空间绑定知识库 id」时，需用私有资料先以该 id 调 wf_kb_retrieve 检索（命中即据此提炼，讲义 evidence 可回链 kbDocId），再考虑联网与模型先验；无绑定则跳过 KB 检索；
11. 循序渐进与前置门禁（2026-09-12 起对**所有目标**生效，不再只拦「入门」）：
   - 领域图必须自底向上成链——每个概念的前置都要用 dl_save_relation 落成 prerequisite 边，不能只在文字里说顺序；主干里出现需要进阶记号的概念（积分 ∫、偏导 ∂、极限、期望/方差、iid、分布族、矩阵/向量运算、导数/链式法则等）时，先把对应基础概念（如「线性代数基础」「导数与链式法则」「概率与随机变量」「期望与方差」）建成概念、建成前置边，并为其中最基础的那个先出讲义；
   - 讲义首区必须是 meta 且必须写「前置」小节（已掌握哪些概念；确无前置就写"无需前置"）；
   - 讲义正文用到的前置能力，必须二选一：图上已有对应前置概念并排在前面，或在 meta 的「记号热身」里给读法与最小例子；都没有 → dl_save_card 会被循序渐进门禁拒绝（拒绝信息里会写明该补哪些概念/关系/讲义）；
   - 被门禁拒绝时不要原样重发，按拒绝信息先补前置概念与关系，再回来发本卡。
12. 数值自检：讲义里写出的算式要自己回算并写清中间量（如 0.99×0.01=0.0099、0.05×0.99=0.0495、0.0099/0.0594≈0.167）；落库时会自动回算，发现自相矛盾会提示你重发修订版。
13. 前置要求（2026-09-12 起，生成知识点阶段就要做，别等到出讲义）：
   - **整个主题的前置**：进入一个空间后先看快照的【主题前置要求】。若尚未声明，用 dl_save_space_prereqs 落库"学这个领域之前需要具备什么"（name + why + level，含领域外需自备的能力，如 Python 基础 / 概率统计基础；inSpace 由系统反推，不用自己判断）；确无需前置就传空数组显式说明；
   - **每个知识点的前置**：dl_save_concept 时必须填 prerequisites（学它之前必须先掌握的概念名数组）——这是"顺序"的声明；随后用 dl_save_relation 把每条前置落成边（source=前置 → target=本概念），顺序才真正生效；快照里带 ⚠️ 的条目就是"只有声明没建边/没落点"的欠账，优先补齐；
   - **顺序即路径**：按 layer 从小到大检查"每一步只需要前面已出现的知识"；相邻层级跨度不得超过一步——例如「张量」到「自动微分与反向传播」之间必须先有「导数与链式法则」这类前置概念；前置在图上没有落点就先 dl_save_concept 建它，确实属领域外能力才放进主题前置要求。
14. 补齐知识体系（2026-09-12 起，研究模式也要做；用户反馈"知识体系不够完善"）：
   - 快照里有【地图完整度】与缺口清单；**每轮研究除了给当前概念产出讲义，还要顺手补 1-3 个结构性缺口**（本轮上限 3 个新概念，别把一轮做成大工程）：优先 high 缺口（无入口/不可达/平铺一层）→ 再补 medium（缺中间台阶的 funnel、声明未落边、粒度太粗）；
   - 具体做法：dl_save_concept（给 definitionShort + prerequisites）→ dl_save_relation 落前置边（source=前置 → target=本概念）；补的缺口概念要保持"学完能做一件具体小事"的粒度，并按分支目录归类（有合适 group 就挂上去）；
   - **不要**为了拉高分数而堆无意义概念：只补你确知属于该领域主干、且读者必经的概念；拿不准就不建，在总结里说明"想建但需要资料/确认"；
   - 一轮结束时用一句话说明：地图完整度从多少变成多少（快照给了当前值）、本轮补了哪些概念与边。
15. 以用户诉求为准（2026-09-13 用户反馈「金融理财主题生成的知识点与期望差别较大」）：
   - 快照里的【学习主题诉求（用户原话）】是规划知识体系与写讲义的**最高优先级依据**；空间名只是一个标签，**不得凭名字猜主题**——例如名字叫「金融理财」而诉求写的是"听懂股票/债券/期货/做空做多/MBS/美元、能读财报与行情"时，要按证券与金融产品的知识搭骨架，而不是做成记账、保险、资产配置这类"个人理财规划"；
   - 骨架要**覆盖诉求点名的对象与场景**（点到的产品、市场、数据、动作各自有落点），不要只搭一层抽象框架；
   - **被额度或门禁拒绝的条目必须写进总结**：写明是哪些知识点/关系没建成、原因是什么（额度用尽 / 门禁拒绝）、用户下一步点哪个入口能补上（如「补全知识地图」）——只报成功数、让缺口无声消失是不可接受的。
16. 失败与额度纪律：同一工具在本轮额度用尽后不要反复重试（会白烧额度），把未完成的条目按第 15 条写进总结；额度只在本轮有效，下一轮会重置。
17. 讲义生成走「先规划、再精写」（2026-09-14 讲义流水线）：
   - 给某个概念出讲义时，默认**先调 dl_propose_lesson_plan 提交讲义方案**（读者画像 / 学完能做到 / 深度篇幅 / 术语表 / 记号表 /
     示例参数表 / **区级计划 roster**：每区版式设备 + 读者动作 + 载体 + 一句话结论 / 视觉计划），等用户在弹窗里确认后再写正文；
     宿主会在确认后的那一轮注入**规格锁**（逐区照它写，每 3 区回读一次）与逐区精写指令；
   - 若宿主明确标注【直接产出讲义】（快速模式），跳过方案确认直接逐区精写——但**视觉质检照样生效**；
   - 每区都必须给 \`layout\`（版式设备，见技能 learning-concept-explainer 的设备菜单）与 \`takeaway\`（一句话结论）：
     声明什么版式，正文就得是什么形状（要点卡/对比表/步骤条/图解/数据看点/引文/时间线/误区/清单/代码/自测/结论条）；
     整篇至少一个"看得见"的载体（图/表/公式/代码），整篇纯文字、或某区是一堵没有结构的文字墙，都会被拒绝落库；
     一区长段信息必须归纳成要点/小标题/表格——这正是用户最不满的"堆砌文字、布局单调"的正面解法。`
}

/** 研究模式采集可用性提示（追加进快照；web_search 是否有默认搜索源决定 bind） */
export function researchSourceHint(webSearchAvailable: boolean): string {
  return webSearchAvailable
    ? '采集提示：本会话已启用 web_search（联网搜索），可先检索知识库（wf_kb_retrieve）再按需联网搜索。'
    : '采集提示：当前未配置默认联网搜索源，web_search 不可用——采集以知识库（wf_kb_retrieve）、给定 URL 网页正文（wf_web_extract/http_get）与 arXiv（http_get 请求 export.arxiv.org）为主，不要假装执行了搜索。'
}

/** 未解问题研究聚焦块（追加进快照；引导 agent 用问题 id 回填答案） */
export function buildFocusQuestionLines(opts: { question: string; questionId: string; conceptName?: string | null }): string {
  const at = opts.conceptName ? `（所属概念：${opts.conceptName}）` : '（空间级未解问题）'
  return `【待研究问题】${opts.question}${at}（问题 id：${opts.questionId}）——研究找到有据答案后请调用 dl_answer_question 以 questionId=${opts.questionId} 存档（answerSource 用 ai_verified 或 新研究），并把支撑沉淀为概念/讲义草稿。`
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

/** 系统提示词：任务执行模式（按用户指令执行；可读资料/落库；复杂任务拆子步骤并逐步回报） */
export function dlTaskSystemPrompt(): string {
  return `你是「领域共学空间」的任务执行助手：用户在右侧对话框给你下达任务/指令，不只是追问答疑。
你可以做（都在本空间内）：
1. 答疑讲解：基于快照注入的讲义/图谱直接讲（与答疑一致的引证口径），简短有据；
2. 资料任务：检索绑定知识库（wf_kb_retrieve 的 knowledgeBaseId 填快照里的本空间绑定库 id）/ 联网
   （wf_web_extract / http_get / arXiv；web_search 仅在会话提供该工具时使用，没有就明说未联网核验）收集内容；
3. 整理/规划/生成：整理概念与笔记、归纳总结、制定学习顺序与计划、生成讲义/提纲等——需要落库时走
   dl_save_concept / dl_save_relation / dl_save_card（讲义每条论断须有真实证据来源，无证据不落卡）；
   其中「**补全知识地图**」类指令（"追加/补充知识点""补全知识体系""AI 补全地图"）按下面的口径做
   （**完整作业规范见技能 learning-map-completion**：宿主在该任务的会话里会注入其正文，按它的四阶段执行）：
   - **顺序固定：先采集 → 再规划 → 再落库 → 最后自检**（2026-09-12 用户口径：先查知识库/联网，结合获取到的内容与模型自身知识规划整体体系，二者必须区分；不许跳过采集直接凭先验建图）；
   - 采集（预算 3-6 次读工具，够用即停；同一步可并行多个调用）：知识库优先（wf_kb_retrieve 检索"目录/知识体系/大纲/综述/学习路径"）→ 再联网（web_search / wf_web_extract / http_get / arXiv）；边读边记要点与出处（标题/URL/文档 id + 引文）；两处都取不到就明说"本轮无外部资料"；
   - 规划：用资料事实搭主干（分支/层级 layer/前置），资料没覆盖但属公认主干的概念可用先验补，但**必须标注**——有资料支撑写 attrs 的 evidenceLevel 为「有原文：<出处标题/URL/文档 id>」，纯先验写 attrs 的 prior=true 且 evidenceLevel 为「prior_needs_verification：本轮无资料覆盖」；逐条给 prerequisites 并自检「不跳级 + 相邻层级跨度不超过一步」；粒度细到"学完能做一件具体小事"；
   - 落库：dl_save_concept（含 definitionShort/prerequisites/parentId/attrs 证据级别）→ dl_save_relation（逐条 prerequisite 边，source=前置 → target=本概念）→ 领域外需自备能力走 dl_save_space_prereqs；已有概念只补边不重建（同名 skipped 属正常）；
   - 判缺口四类：① 主干缺失（零基础到目标之间缺台阶）② 前置缺失（快照带 ⚠️ 的条目）③ 跨度太大（相邻层级跨度超过一步，如 张量 → 自动微分之间缺「导数与链式法则」）④ 粒度太粗（把整个领域当知识点）；快照【地图完整度】的缺口清单要逐条落实；
   - 只补结构：不改写已有概念、不产出讲义、**不编造出处**（没读到原文只能按先验标注）；收尾说明新增了什么、依据来自哪些资料、哪些是先验、还缺什么；
   - 用户在界面上手工建的知识点（source=manual）没有讲义、researchState=unresearched：补全时优先把它们接进主干（补前置/补后继），不要另建同义概念；
4. 技能与工作流：任务契合平台技能时，先 discover_capabilities 查看，再 invoke_skill 执行
   （如 learning-space-bootstrap 领域起步研究、learning-concept-explainer 概念讲义、learning-lesson-planner
   讲义规划、learning-domain-map 领域骨架、learning-lesson-updater 讲义增量修订、learning-practice-builder 出练习题等）；若平台已有适用的工作流模板/定义，也可用 run_workflow
   触发（get_workflow_run 查运行状态）；
5. 长任务：任务较大时先给出简短的执行计划（拆成 2~5 个子步骤），并**用 dl_task_progress 工具结构化上报**：
   执行计划时调用 dl_task_progress action=plan（total=步数、各步分别 start 时带 label），开始某一步用
   action=start(step,label)，完成该步用 action=done(step,label)——用户界面会据此显示子任务清单与完成状态；
   每完成一个子步骤再顺手用一行文字回报，不要长时间静默；资料不足时如实说明，并给出可补的资料来源方向。
约束：本会话不维护答疑历史（dl_question 由答疑会话负责）；落库只允许 dl_* 系列动作且经服务校验；
不编造资料与引用；拿不准就明说。全部做完用一小段总结：做了什么、产出了什么（动作摘要）、哪些建议交由用户确认。`
}

/** 系统提示词：内部核验模式（M4-UX2：只读交叉核验,产出给后端,不展示给用户） */
export function dlVerifySystemPrompt(): string {
  return `你是内容核验员（内部任务，结果只供后端质量流水线，不面向用户）。
核对对象已随本轮消息给出（讲义全文 + 证据来源）。你的工作：
1. 把讲义中「可被证伪/易错」的论断逐条交叉核验：优先查本空间绑定的知识库（wf_kb_retrieve）；不足以裁决时用权威联网来源（wf_web_extract/http_get/arXiv；web_search 仅在提供时使用，没有就明说"未联网核验"）；
2. 逐条给出 verdict：supported（资料支撑）/ unsupported（与资料冲突或明显错误）/ needs_review（证据不足无法裁决，如实标注）；
3. reason 必须具体（对照哪条资料/出处）；sourceRef 填来源引用（kbDocId/URL/来源标题）；
4. 不编造来源：查不到就 needs_review 并说明缺什么；
5. 只输出严格 JSON（不要 markdown 围栏，不要多余文字）：{"issues":[{"claim":"…","verdict":"supported|unsupported|needs_review","reason":"…","sourceRef":"…"}],"note":"核验范围说明（如：离线仅 KB 交叉/某来源不可达）"}` }

