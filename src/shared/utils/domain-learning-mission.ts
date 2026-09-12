/**
 * 领域学习「补全知识地图」任务指令（纯文本生成；前后端共用）
 * @module shared/utils/domain-learning-mission
 *
 * 背景（2026-09-12 用户需求）：学习者多半不清楚一个领域完整的知识体系——
 * 「左侧知识点不够完善」时，既要能自己手工追加，也要能一键让 AI 把缺口补齐。
 *
 * 本模块只负责把「补全知识地图」这件事写成一段结构化的任务指令（注入 task 会话），
 * 与 `dlTaskSystemPrompt` 里「补全知识地图」作业口径、以及技能层的循序渐进纪律对齐：
 * 先看欠账清单 → 判四类缺口 → 落概念 → 落前置边 → 不产出讲义。
 */

/**
 * 「补全知识地图」消息标记（**必须**出现在指令开头）。
 * 宿主（dl-agent-harness）据此在 task 模式下注入 `learning-map-completion` 技能正文；
 * 该常量在后端 `dl-agent-deps.MAP_COMPLETION_MARKER` 有同名镜像，两边由契约用例钉死。
 */
export const MAP_COMPLETION_MARKER = '【补全知识地图】'

export interface DlMapCompletionInput {
  /** 学习空间名（回显给模型定位） */
  spaceName?: string | null
  /** 当前知识点数（让模型知道基线，避免重复建） */
  conceptCount?: number
  /** 空间学习目标（入门/工作应用/前沿） */
  goal?: string | null
  /** 用户额外补充的要求（如"重点补数学前置"），可为空 */
  extra?: string | null
  /**
   * 确定性诊断出的结构缺口（来自 assessMapCoverage 的 summary/gaps）。
   * 有则写进指令，让模型从"已知缺口"起步，而不是自由发挥；无则按通用四类缺口检查。
   */
  coverageSummary?: string | null
  coverageGaps?: string[]
}

/**
 * 组装「补全知识地图」任务指令。
 * 只描述**作业要求**，不描述数据（数据由快照注入，模型据此核对缺口）。
 */
export function dlMapCompletionMission(input: DlMapCompletionInput = {}): string {
  const space = (input.spaceName ?? '').trim()
  const head = space ? `学习空间「${space}」` : '当前学习空间'
  const baseline =
    typeof input.conceptCount === 'number' ? `（当前 ${input.conceptCount} 个知识点）` : ''
  const goal = (input.goal ?? '').trim()
  const extra = (input.extra ?? '').trim()
  const coverageSummary = (input.coverageSummary ?? '').trim()
  const coverageGaps = (input.coverageGaps ?? []).map((g) => String(g).trim()).filter(Boolean)

  const diagnostic =
    coverageSummary || coverageGaps.length
      ? `\n\n系统已做结构诊断，S2 规划时必须逐条落实这些已知缺口（不要只重复通用检查）：
${coverageSummary ? `- ${coverageSummary}\n` : ''}${coverageGaps.map((g) => `- ${g}`).join('\n')}`
      : ''

  return `${MAP_COMPLETION_MARKER}请审视 ${head}${baseline} 的知识地图并**补齐缺口**——本轮只补结构（知识点与前置关系），不改写已有概念、不产出讲义、不重复建同名概念${goal ? `。学习目标：${goal}` : ''}。（宿主会把技能 learning-map-completion 的正文注入本会话，按它的四阶段执行；若未注入，就按下面的摘要执行。）${diagnostic}

**执行顺序（四阶段，不许跳过 S1）**：先采集资料 → 再规划整体体系（资料事实 + 模型先验，两者必须区分）→ 再落库 → 最后自检。

S1 采集（先做，别急着建概念）
- **知识库优先**：快照含本空间绑定知识库 id 时，先用 wf_kb_retrieve 检索领域主干类资料（如"目录 / 知识体系 / 大纲 / 综述 / 学习路径 / 入门顺序"），读回的内容是本轮第一手依据；
- **再联网补充**：会话提供 web_search 时用它搜「<领域> 知识体系 / 学习路线 / 综述 / 教程目录」；网页正文用 wf_web_extract；API/论文用 http_get（arXiv 用 export.arxiv.org/api/query）；
- **预算**：读工具合计 3-6 次就够，够用即停（后面还要留步数给规划与落库；同一步可以并行多个工具调用，不要一个个串行）；
- 边读边记**要点 + 出处**（标题/URL/文档 id + 引文），S2/S3 引用它；
- 若两处都取不到资料：明确写一句"本轮无外部资料"，S2 全部按模型先验做，并按 S2 的要求逐条标注。

S2 规划整体体系（资料 + 模型知识结合，二者必须区分）
- 四类典型缺口（逐条对照）：**主干缺失**（零基础到目标之间缺台阶）/ **前置缺失**（用到但图上没落点）/ **跨度太大**（相邻层级跨度超过一步，如 张量 → 自动微分之间缺「导数与链式法则」）/ **粒度太粗**（把整个领域当知识点）；
- 先用**资料里的事实**搭主干：分支/目录、层级（layer）、每个概念的前置；资料没覆盖但属于该领域公认主干的概念，可以用**模型先验**补，但必须标注：
  有资料支撑的概念 → attrs 写 \`{"evidenceLevel":"有原文：<出处标题/URL/文档 id>"}\`；
  纯先验的概念 → attrs 写 \`{"prior":true,"evidenceLevel":"prior_needs_verification：本轮无资料覆盖"}\`；
- 逐条给 prerequisites，并做两条硬自检：① **不跳级**（前置必须在本次清单里，或已在图上，或列入主题前置要求）② **相邻层级跨度不超过一步**；建议把 layer 也写进 attrs.layer 便于后续诊断；
- **粒度**：细到"学完能做一件具体小事"；把整个领域/大方向当概念的要拆开；
- 对照 S1 的资料检查：资料里出现的主干概念，清单里不能缺（缺了就是体系漏洞）。

S3 落库（顺序执行，批量调用）
- dl_save_concept（name / definitionShort / prerequisites / parentId / attrs 带证据级别）；parentId 优先挂快照「目录分组」里合适的目录；
- dl_save_relation 把每条前置落成 prerequisite 边（source=前置 → target=本概念）；**已有概念只补边不重建**（同名会被 skipped，属正常）；
- 领域外需自备的能力（如 Python 基础、概率统计基础）用 dl_save_space_prereqs 更新「主题前置要求」，不要硬塞成知识点；
- **不编造出处**：没读到原文就不要写"某文献/某链接"，只能按先验标注。

S4 自检与交接
- 复核三条：**可达性**（从入口概念能否沿前置边走到全部概念）、**顺序**（每一步只需要前面已出现的知识、相邻层级跨度 ≤1）、**证据**（资料覆盖 vs 纯先验各多少）；
- 收尾一段话：新增了哪些知识点与前置边（逐条）、依据来自哪些资料（标题/URL/文档 id）、哪些是先验（点名，提醒需核验）、还缺什么（供下次继续补）。${extra ? `\n\n用户补充要求：${extra}` : ''}`
}
