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
  /** 空间是否尚无知识概念叶（仅目录 group/空）——research 需走"起步研究"分支 */
  isEmptySpace: boolean
  /** 空间名（起步引导文案用；未知则回退 id） */
  spaceName: string | null
}

/** 纯判定：是否存在知识概念叶（group 目录不算） */
export function hasConceptLeaves(concepts: Array<{ nodeType: string }>): boolean {
  return concepts.some((c) => c.nodeType !== 'group')
}

/** 空空间起步研究指令（research 会话在快照为空时追加；指向 learning-space-bootstrap 技能并保留兜底） */
export function dlEmptySpaceMission(opts: { spaceName: string }): string {
  return `【空领域起步研究】学习空间「${opts.spaceName}」当前还没有任何知识点，本次任务=给整个领域做一次"起步研究"。
执行方式：先 discover_capabilities 查看可用技能，再 invoke_skill 调用技能 learning-space-bootstrap（领域起步研究），按该技能的 S1~S5 阶段执行并在每阶段向用户回报进度；
若技能不可用，按此摘要执行（同技能口径）：
1. 先规划并落库 3-6 个最核心的知识点（dl_save_concept，parentId 优先填快照"目录分组"里的领域根 group id，没有则留 null）；
2. 再为它们建立学习顺序关系（dl_save_relation，前置关系 prerequisite）；
3. 挑其中"最基础、第一个要学"的概念 dl_save_card 产出一份可展示的讲义草稿（区级内容 + evidenceSources）；讲义每条论断的证据必须来自你实际读到的资料（知识库文档/网页/arXiv/API），查不到就少写，不得编造；
4. 其余概念保持"待研究"即可，不必一次全部出讲义；
5. 全部做完用一段话总结：建立了哪些概念与关系、首个讲义给谁、下一步建议。`
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

  const head = [
    `学习空间：${project?.name ?? spaceId}（目标：${project?.goal ?? '—'}）`,
    `掌握度：${masteredCount}/${leafCount} 个知识概念已理解`,
    ready ? `推荐下一个待学概念：${concepts.find((c) => c.id === ready)?.name ?? ready}` : '（全部已理解）',
  ]

  return {
    text: [...head, ...kbLines, ...groupLines, ...conceptText].join('\n'),
    nextConceptId: ready,
    isEmptySpace: !hasConceptLeaves(concepts.map((c) => ({ nodeType: c.nodeType }))),
    spaceName: project?.name ?? null,
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
1. 需要研究概念时，先调用 discover_capabilities 查看可用技能，再用 invoke_skill 调用学习技能：learning-domain-map（建骨架）/ learning-concept-explainer（单概念讲义）/ learning-source-collector（采集前先规划资料路由）/ learning-question-generator（多视角补盲提问）/ learning-relation-miner（从材料提取关系与建议）；
2. 研究产出经 dl_save_concept / dl_save_relation 把概念与关系建议落为草稿（用户会在地图人审中确认），经 dl_save_card 把讲义卡片落为草稿；
3. 讲义必须带 evidence：dl_save_card 的 evidenceSources 至少一条，否则工具会拒绝——宁可少产出一条，也不落无出处的断言；evidence 必须来自你实际读到的资料（标题/URL/文档 id + 引文），不得编造；
4. 采集纪律（会话提供读工具时）：资料不足先用 learning-source-collector 规划，再按需取——知识库优先（wf_kb_retrieve）；网页正文提取用 wf_web_extract；API/原文用 http_get（arXiv 论文用 http_get 请求 export.arxiv.org/api/query，如 search_query=all:关键词 或 id_list=编号）；模型先验与资料要区分：先验内容在卡片 attrs 或注释里标 needs_verification；
5. 联网搜索只在提供了 web_search 工具时使用；没有 web_search 时不得假装搜索，改用知识库 / 给定 URL / arXiv；
6. 不要重复执行刚成功的同一动作；动作失败可换参数重试一次；
7. 若本轮是研究一个未解问题（快照含【待研究问题】）：找到有据答案时务必调用 dl_answer_question 把「问题+答案+来源」存档（answerSource 用 ai_verified 或 新研究），并把支撑沉淀为概念/讲义草稿；仍无据则保持 open，并在总结里说明缺什么资料、下一步该去哪找；
8. 全部完成后用一段话总结：研究了什么、读了哪些资料、产出哪些草稿、下一步建议（等用户人审/继续学习）；
9. 归属（M3-A）：快照「目录分组」里若存在契合的目录，dl_save_concept 的 parentId 填其目录 id；不确定就保持 null（根层），地图人审会再归类；
10. 知识库优先（M4-B）：快照含「本空间绑定知识库 id」时，需用私有资料先以该 id 调 wf_kb_retrieve 检索（命中即据此提炼，讲义 evidence 可回链 kbDocId），再考虑联网与模型先验；无绑定则跳过 KB 检索。`
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
4. 技能与工作流：任务契合平台技能时，先 discover_capabilities 查看，再 invoke_skill 执行
   （如 learning-space-bootstrap 领域起步研究、learning-concept-explainer 概念讲义、learning-lesson-planner
   讲义规划、learning-domain-map 领域骨架等）；
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

