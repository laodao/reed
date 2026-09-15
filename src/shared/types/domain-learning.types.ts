/**
 * 领域共学空间跨端类型契约（前后端 + 主进程服务共用）
 * @module shared/types/domain-learning
 * @description 权威来源：tasks/2026-09-07-domain-learning-space/design-v3.md
 *              （§4 概念模型 / §9 数据模型）+ content-template-design.md v4（§1/§3 内容模型）。
 *              演化纪律：改字段先改本文件与 design 文档；枚举值变更需同步
 *              dl_* 仓储校验与前端图例/筛选。
 */

// ==================== 概念节点类型（§4.2 统一枚举） ====================

/** 节点类型：group 是目录（大纲树，非知识）；其余为知识节点 */
export type DlNodeType =
  | 'group'
  | 'concept'
  | 'fact'
  | 'definition'
  | 'axiom'
  | 'theory'
  | 'method'
  | 'artifact'
  | 'paper'
  | 'standard'
  | 'regulation'
  | 'procedure'
  | 'case'
  | 'person'
  | 'controversy'
  | 'principle'

/** 知识节点类型集合（group 除外），Atlas 档案/图例用 */
export const DL_KNOWLEDGE_NODE_TYPES: DlNodeType[] = [
  'concept', 'fact', 'definition', 'axiom', 'theory', 'method', 'artifact',
  'paper', 'standard', 'regulation', 'procedure', 'case', 'person', 'controversy', 'principle',
]

// ==================== 关系类型（§4.2 三层） ====================

export type DlRelationType =
  | 'prerequisite' // 前置依赖（source→target：学 target 前需掌握 source）
  | 'is_a' // 特例/归类
  | 'part_of' // 包含/组成
  | 'compare' // 对比
  | 'cause' // 因果
  | 'supports' // 支撑/依据
  | 'cites' // 引用/出自
  | 'constrains' // 受…约束（法规等）
  | 'updates' // 规范更新/取代
  | 'related' // 相关（兜底）

// ==================== 状态枚举 ====================

/** 研究状态（研究引擎维护）：unresearched | researching | extracted | needs_verification | disputed */
export type DlResearchState = 'unresearched' | 'researching' | 'extracted' | 'needs_verification' | 'disputed'

/** 掌握度（仅用户行为推进）：untouched | learning | mastered | review */
export type DlMastery = 'untouched' | 'learning' | 'mastered' | 'review'

/** 来源：material（资料提炼）| ai_verified（先验经确认）| manual（人工） */
export type DlConceptSource = 'material' | 'ai_verified' | 'manual'

/** 空间目标（design.md v2 §5.1） */
export type DlGoal = '入门' | '工作应用' | '前沿'

/** 空间状态 */
export type DlProjectStatus = 'active' | 'paused' | 'archived'

/** 学习本质类型（content-template-design v4 §1；决定模板区集） */
export type DlEssenceType = 'K-concept' | 'K-oper' | 'K-stmt' | 'K-inst' | 'K-agent' | 'K-open'

/** 区视觉样式（v4：粗粒度少量样式） */
export type DlSectionStyle = 'intro' | 'body' | 'note' | 'review'

/** 文档类型：intro=导读 | review=分支总览 | manual=手册 */
export type DlDocType = 'intro' | 'review' | 'manual'

/** 追问状态：open=未解队列 | answered | escalated=研究中 | resolved */
export type DlQuestionStatus = 'open' | 'answered' | 'escalated' | 'resolved'

/** 回答来源：kb | lesson | graph | ai_verified | new_research | unanswered */
export type DlAnswerSource = 'kb' | 'lesson' | 'graph' | 'ai_verified' | 'new_research' | 'unanswered'

// ==================== 内容模型（content-template-design v4 §3） ====================

/** 讲义区（粗粒度，md 整段；related 区不落库由关系派生） */
export interface DlCardSection {
  key: string
  /** 区标题（模板语义；缺省用 key 映射默认标题） */
  title?: string
  style?: DlSectionStyle
  /**
   * 版式设备（2026-09-14 用户反馈「纯文字堆砌、布局单调」）：
   * key 见 `shared/utils/lesson-layout` 的设备目录（prose/keypoints/compare/steps/figure/
   * worked/formula/stats/quote/timeline/pitfall/checklist/code/qa/callout）；
   * 缺省时渲染层按区 key 推导默认设备（老卡也有合理版式）。
   */
  layout?: string
  /** 一句话结论（该区讲完读者该记住什么；渲染为结论条） */
  takeaway?: string
  /** 区内容 md（可含图/表/mermaid/KaTeX） */
  md: string
  /** 深水内容默认折叠（证明/长条文） */
  folded?: boolean
}

/** 相关著作条目（works 区，有则显示） */
export interface DlWorkRef {
  kind: '论文' | '专著' | '标准' | '法规' | '报告'
  title: string
  authors?: string
  year?: string
  url?: string
  note?: string
}

/** 证据来源摘要（evidence_sources；全文入项目知识库，此处只存引用） */
export interface DlEvidenceRef {
  kind: string
  title: string
  url?: string
  kbDocId?: string
  quote?: string
}

// ==================== 概念图/图谱 ====================

/** 概念/知识节点视图（后端由 dl_concept 聚合 card 派生） */
export interface DlConceptView {
  id: string
  /** 树父 group id（null = 根层） */
  parentId: string | null
  nodeType: DlNodeType
  name: string
  en?: string | null
  /** 一句话定义（地图悬停用） */
  desc?: string | null
  researchState: DlResearchState
  mastery: DlMastery
  source: DlConceptSource
  /** 类型专属扩展字段（法规效力/论文年份等） */
  attrs?: Record<string, unknown> | null
  /**
   * 本知识点声明的前置要求（attrs.prerequisites；2026-09-12 用户需求）。
   * 生成知识点时即声明"学它之前必须先掌握什么"；与图上的 prerequisite 关系边互补——
   * 这里可能包含"已声明但尚未建关系"的前置（UI 用虚线 chip 标出）。
   */
  declaredPrereqs?: string[]
  /** 有无已发布讲义（无讲义时中栏显示"生成中"） */
  hasCard?: boolean
  card?: DlCardView | null
}

/** 关系边视图 */
export interface DlRelationView {
  source: string
  target: string
  type: DlRelationType
  /** 已人工/人审确认？ */
  verified?: boolean
  evidence?: string | null
}

// ==================== 手工建点（用户补全知识体系；2026-09-12） ====================

/** 手工新建知识点入参（左栏「+ 知识点」→ dl:save-concept） */
export interface DlCreateConceptInput {
  /** 目标空间 id */
  id: string
  name: string
  /** 知识节点类型（默认 concept；不允许 group） */
  nodeType?: string
  /** 所属分支目录（必须是本空间的 group 节点；null=根层） */
  parentId?: string | null
  definitionShort?: string | null
  en?: string | null
  /** 前置知识点名（勾选空间内已有概念）→ 直接落成已确认的前置边 */
  prerequisites?: string[]
}

/** 手工建点结果 */
export interface DlCreateConceptResult {
  conceptId: string
  /** false = 同父同名已存在，做了幂等更新 */
  created: boolean
  /** 已连上的前置（名 → 概念 id） */
  linkedPrereqs: Array<{ name: string; conceptId: string }>
  /** 空间里找不到落点的前置名（UI 提示"可让 AI 补全"） */
  missingPrereqs: string[]
}

/** 讲义视图（一概念当前版） */
export interface DlCardView {
  id: string
  conceptId: string
  essenceType: DlEssenceType
  sections: DlCardSection[]
  works?: DlWorkRef[] | null
  contentMd?: string | null
  evidenceSources?: DlEvidenceRef[] | null
  version: number
  status: 'draft' | 'published'
  /** 自动核验摘要（2026-09-09 复盘：M4-UX2 的 verification 由"只写不读"改为消费；
   *  null=尚未核验） */
  verification?: DlCardVerificationSummary | null
}

/** 讲义自动核验摘要（视图侧；明细见 DlCardVerification） */
export interface DlCardVerificationSummary {
  status: DlVerificationStatus
  /** 待复核/冲突条数 */
  issues: number
  checkedAt: string | null
  note?: string | null
}

/** 相关知识点（related 区：由关系边派生，可点击跳转） */
export interface DlRelatedRef {
  conceptId: string
  name: string
  /** 关系描述（前置/后继/对比…） */
  rel?: string
}

// ==================== 方案确认流程（2026-09-13 用户需求） ====================

/**
 * 方案步骤：
 * - `understanding`：模型对用户诉求的理解（先确认它，再规划体系）；
 * - `syllabus`：知识体系方案（确认后才允许落库知识点）；
 * - `lesson`：**讲义设计规格与区级计划**（2026-09-14；参考 ppt-master 的 design_spec +
 *   §IX 页级 roster：确认后模型才逐区精写，落库门禁按它校验区集/版式/载体）。
 *   按概念维度存储（dl_plan.concept_id），同一空间不同概念各有一套。
 */
export type DlPlanStep = 'understanding' | 'syllabus' | 'lesson'

/** 方案状态：draft=待用户确认 | confirmed=已确认（生效） | superseded=被新版本取代 */
export type DlPlanStatus = 'draft' | 'confirmed' | 'superseded'

/**
 * 诉求理解（第一步提案）。
 * 用户反馈「生成的知识点与期望差别较大」的正面解法：先让模型**复述**诉求并逐条列出要覆盖的
 * 对象与场景、明确不做什么，用户确认或纠正后再往下走。
 */
export interface DlPlanUnderstanding {
  /** 一句话重述：我理解你要学什么 */
  goalSummary: string
  /** 要覆盖的对象与场景（诉求点名的产品/市场/数据/动作，逐条有落点） */
  coverage: string[]
  /** 读者画像：从哪出发、到什么程度 */
  audience?: string | null
  /** 明确不做什么（防跑偏，如"不做个人记账与保险推销"） */
  notDoing?: string[]
  /** 关键期望：学完能做到什么（动词开头，可验证） */
  keyExpectations?: string[]
}

/** 知识体系方案里的一个节点（分支用 nodeType=group） */
export interface DlSyllabusConcept {
  name: string
  definitionShort?: string | null
  /** 前置知识点名（学它之前要先掌握什么） */
  prerequisites?: string[]
  /** 学习层级（0=零基础可直接学） */
  layer?: number
  /** group=分支目录 | concept=知识点（缺省 concept） */
  nodeType?: string
}

/** 知识体系方案（第二步提案）：分支 + 知识点 */
export interface DlPlanSyllabus {
  branches: Array<{
    name: string
    definitionShort?: string | null
    concepts: DlSyllabusConcept[]
  }>
  /** 不归属任何分支的根层知识点（如领域总览） */
  rootConcepts?: DlSyllabusConcept[]
  /** 方案说明（取材自哪些资料/哪些是按主干补的先验） */
  notes?: string | null
}

/** 方案版本行（IPC 视图） */
export interface DlPlanRevisionView<P = unknown> {
  id: string
  step: DlPlanStep
  status: DlPlanStatus
  revision: number
  payload: P
  /** 用户调整指令或确认备注 */
  feedback?: string | null
  updatedAt?: string | null
}

/** 空间方案总览（确认弹窗数据源） */
export interface DlPlanView {
  spaceId: string
  /** 当前诉求理解（最新版） */
  understanding: DlPlanRevisionView<DlPlanUnderstanding> | null
  /** 当前知识体系方案（最新版） */
  syllabus: DlPlanRevisionView<DlPlanSyllabus> | null
  /** 诉求理解是否已确认（未确认则不允许提交体系方案） */
  understandingConfirmed: boolean
  /** 知识体系是否已确认（= 允许落库知识点） */
  syllabusConfirmed: boolean
  /** 已确认方案里的知识点条目数（用于落库额度与界面提示） */
  confirmedConceptCount: number
}

// ==================== 空间视图（列表页 / 三栏空间页） ====================

/** 空间列表卡片 */
export interface DlSpaceSummary {
  id: string
  name: string
  goal: DlGoal
  /** 列表卡片一句话说明 */
  tagline: string
  profileId?: string | null
  status: DlProjectStatus
  /** 掌握度统计：已理解/总数（叶子概念） */
  stats?: { mastered: number; total: number }
  updatedAt?: string | null
}

/** 领域画像（profile，design-v3 §4.4/§6） */
export interface DlProfileView {
  id: string
  kindLabel: string
  nature: string
  /** 侧重知识类型（高权重） */
  emphasis: string[]
  /** 自定义画像时携带 */
  custom?: boolean
}

/**
 * 主题学习前置要求（整个空间的门槛；2026-09-12 用户需求）
 *
 * 学这个领域之前需要具备什么——可以是领域外能力（如「Python 基础」「线性代数基础」），
 * 也可以是空间内已建的知识点。学习者一进空间就该看到门槛，研究模型生成知识点时
 * 必须按它排顺序（dl_project.prerequisites）。
 */
export interface DlSpacePrereq {
  /** 前置能力名（如「Python 基础」「线性代数基础」） */
  name: string
  /** 为什么学这个领域需要它（一句话） */
  why?: string
  /** 掌握到什么程度即可（如「能用 NumPy 索引与广播即可」） */
  level?: string
  /** true = 空间内已建成知识点并会教；false/缺省 = 需自备或另找资料 */
  inSpace?: boolean
}

/**
 * 知识地图完整度诊断（2026-09-12；后端 assessMapCoverage 产出，UI 展示 + 供 AI 补全起步）。
 * 只暴露展示与指令所需的字段（完整诊断在 core rules 内）。
 */
export interface DlMapCoverage {
  /** 0-100 */
  score: number
  /** 一行摘要（含规模/层数/交付率） */
  summary: string
  metrics: {
    leaves: number
    groups: number
    edges: number
    verifiedEdges: number
    entries: number
    levels: number
    lessons: number
  }
  gaps: Array<{
    kind: string
    severity: 'high' | 'medium'
    message: string
    conceptNames?: string[]
  }>
}

/** 空间三栏聚合视图（Space 页一次拉取） */
export interface DlSpaceView {
  id: string
  name: string
  goal: DlGoal
  tagline: string
  profile: DlProfileView | null
  /** 主题学习前置要求（整个领域的学习门槛；可空=尚未声明） */
  prerequisites: DlSpacePrereq[]
  /** 地图完整度诊断（结构性缺口清单；2026-09-12） */
  coverage: DlMapCoverage
  status: DlProjectStatus
  /** 掌握度统计 */
  stats: { mastered: number; learning: number; total: number }
  concepts: DlConceptView[]
  relations: DlRelationView[]
  /** 大纲树（左栏；group 目录层级，叶子引 conceptId） */
  tree: DlTreeNode[]
  /** 追问对话历史 */
  turns: DlChatTurn[]
  openQuestionCount: number
}

/** 大纲树节点（非叶=group；叶=概念） */
export interface DlTreeNode {
  id: string
  name: string
  conceptId?: string
  children?: DlTreeNode[]
}

/** 追问对话一轮 */
export interface DlChatTurn {
  role: 'user' | 'assistant'
  text: string
  /** 有据回答的来源标签（kb 文档/讲义节/图内事实） */
  sourceLabel?: string
  /** 是否建议开启新研究（答不上） */
  suggestsResearch?: boolean
  questionId?: string
  /** 所属概念（2026-09-09 复盘：答疑历史为空间级，收藏/归属须按问题真实概念判定；空间级泛问为 null） */
  conceptId?: string | null
}

// ==================== 追问/队列 ====================

export interface DlQuestionView {
  id: string
  conceptId?: string | null
  question: string
  answerMd?: string | null
  answerSource?: DlAnswerSource | null
  status: DlQuestionStatus
  createdAt?: string | null
}

// ==================== Atlas（知识全景） ====================

/** Atlas 节点（类型元数据留前端本地图例；数据由此契约承载） */
export interface DlAtlasNode {
  id: string
  name: string
  nodeType: DlNodeType
  /** 归属 group 或分支 */
  group?: string
  mastery?: DlMastery
  desc?: string | null
  attrs?: Record<string, unknown> | null
}

export interface DlAtlasEdge {
  source: string
  target: string
  type: DlRelationType
}

export interface DlAtlasGraph {
  spaceId: string
  nodes: DlAtlasNode[]
  edges: DlAtlasEdge[]
}

/** 节点档案（Atlas 右栏：定义/关键属性/关联内容/直接关系） */
export interface DlNodeProfile {
  node: DlAtlasNode
  /** 类型专属属性展示（法规效力/论文年份…按 nodeType 挑） */
  attrs: Record<string, unknown> | null
  /**
   * 直接邻居（含关系类型标注）。
   * 2026-09-12：补 verified/source/target —— 未确认的边可在档案里直接「确认」（地图人审）。
   */
  relations: {
    conceptId: string
    name: string
    rel: DlRelationType
    direction: 'out' | 'in'
    verified?: boolean
    sourceId?: string
    targetId?: string
    evidence?: string | null
  }[]
  /** 关联内容（论文/法规/案例…按 nodeType 聚合） */
  relatedContent: DlWorkRef[]
  /** 是否有子图谱（下层 group） */
  hasChildren: boolean
}

/** 周期推进配置（dl_project.pace_settings；M2-C 自动研究调度） */
export interface DlPaceSettings {
  /** 是否启用自动推进 */
  enabled: boolean
  /** 推进周期（分钟，>=1） */
  intervalMin: number
  /** 自动研究「尚无讲义」的知识概念（产出草稿待人审） */
  autoResearchConcepts: boolean
  /** 自动对未解问题开子研究（找到有据答案回填原问题） */
  autoResolveOpenQuestions: boolean
}

/** 默认推进配置（未配置 = 关闭） */
export const DEFAULT_DL_PACE_SETTINGS: DlPaceSettings = {
  enabled: false,
  intervalMin: 30,
  autoResearchConcepts: true,
  autoResolveOpenQuestions: true,
}

/** 间隔复习配置（dl_project.review_settings；M3-B） */
export interface DlReviewSettings {
  /** 是否启用间隔复习队列 */
  enabled: boolean
  /** 复习间隔（分钟，>=1；默认 1440 = 隔日回访） */
  intervalMin: number
  /** 每轮展示条数上限 */
  limit: number
}

export const DEFAULT_DL_REVIEW_SETTINGS: DlReviewSettings = {
  enabled: false,
  intervalMin: 1440,
  limit: 10,
}

/** dl:review-due 载荷（到期候选明细） */
export interface DlReviewDueItem {
  conceptId: string
  name: string
  /** 当前掌握态（mastered 或 review） */
  mastery: string
  /** 最近掌握确认/复习时间（距复习间隔的基准） */
  lastReviewedAt: string
  /** 已逾期 ms（>0 = 到期） */
  overdueMs: number
}

// ==================== 统计与导出（M3-C） ====================

/** dl:get-space-stats 载荷（学习进度快照聚合） */
export interface DlSpaceStats {
  spaceId: string
  name: string
  updatedAt: string | null
  concepts: { total: number; groups: number; mastered: number; learning: number; review: number; untouched: number }
  research: Record<string, number>
  cards: { published: number; draft: number }
  relations: { total: number; prerequisite: number; verified: number }
  questions: { total: number; open: number; answered: number }
  /** 当前复习到期条数（review_settings 启用时按规则计，否则 0） */
  reviewDueCount: number
}

/** dl:export-lesson-digest 载荷（讲义合集 md） */
export interface DlLessonDigest {
  markdown: string
  filename: string
  /** 收录概念数 */
  count: number
}

// ==================== 单篇讲义导出（2026-09-15 用户需求：md / PDF / 长图） ====================

/** 讲义导出格式：md=markdown 正文 | pdf=PDF 文档 | image=PNG 长图 */
export type DlLessonExportFormat = 'md' | 'pdf' | 'image'

/**
 * 讲义导出格式运行时白名单（与 {@link DlLessonExportFormat} 同源，双端共用）。
 * UI 入口与 IPC 出站/入站都按它校验：未知格式一律拒绝，绝不"猜一个格式"往下渲染。
 */
export const DL_LESSON_EXPORT_FORMATS = ['md', 'pdf', 'image'] as const

/**
 * dl:export-lesson 载荷（单篇知识点讲义导出）。
 * - md：正文走 markdown 字段；
 * - pdf/image：二进制走 contentBase64（前端 base64→Blob 保存）；
 * - html：当前端无平台渲染能力（Web）时的降级产物（含排版 HTML，供前端打印/另存）。
 */
export interface DlLessonExportResult {
  /** 实际产出格式（请求 pdf/image 但无渲染器时为 html） */
  format: 'md' | 'pdf' | 'image' | 'html'
  filename: string
  mime: string
  conceptId: string
  conceptName: string
  spaceName: string
  /** 导出所用讲义版本号 */
  version: number
  markdown?: string
  contentBase64?: string
  html?: string
}

// ==================== 讲义版本管理（2026-09-15 用户需求：历史查看/预览/恢复） ====================

/** 讲义版本列表项（dl:list-card-versions） */
export interface DlCardVersionItem {
  cardId: string
  version: number
  status: 'draft' | 'published'
  essenceType: string
  sectionsCount: number
  worksCount: number
  evidenceCount: number
  /** 核验状态摘要（null=未核验） */
  verifyStatus: string | null
  revisionNote: string | null
  changeSource: string | null
  createdAt: string | null
  updatedAt: string | null
  /** 是否为该概念当前最新版 */
  isCurrent: boolean
}

/** dl:restore-card 载荷 */
export interface DlCardRestoreResult {
  /** 新生成的卡片 id */
  cardId: string
  /** 新版本号 */
  version: number
  /** 恢复来源版本号 */
  restoredFrom: number
}

/** 笔记来源：讲义选区笔记 / 答疑回答收藏 */
export type DlNoteSource = 'selection' | 'qna'

/** 概念笔记（dl_note；M4-UX1 #3/#6） */
export interface DlNote {
  id: string
  projectId: string
  /** 所属概念（选区笔记或收藏回答所属概念；可空=空间级） */
  conceptId: string | null
  source: DlNoteSource
  /** 选区原文快照（selection 类） */
  anchorText: string | null
  /** 选区起止（讲义正文内可选偏移） */
  anchorStart: number | null
  anchorEnd: number | null
  /** 收藏回答引用的答疑问题 id（qna 类） */
  questionId: string | null
  contentMd: string
  createdAt: string | null
}

/** dl:list-notes 载荷（按概念/空间） */
export interface DlNoteQueryResult {
  notes: DlNote[]
  total: number
}

/** 讲义内部核验状态（M4-UX2：仅后端使用,不向用户展示） */
export type DlVerificationStatus = 'unverified' | 'verifying' | 'verified' | 'needs_review'

/** 单条存疑点结论 */
export interface DlVerificationIssue {
  /** 被核验的论断/片段（可空=整体性结论） */
  claim?: string | null
  verdict: 'supported' | 'unsupported' | 'needs_review'
  reason: string
  /** 支撑来源引用（KB 文档/URL/段落） */
  sourceRef?: string | null
}

/** 讲义核验记录（dl_card.verification 内部 JSON；UI 不展示细节） */
export interface DlCardVerification {
  status: DlVerificationStatus
  issues: DlVerificationIssue[]
  checkedAt: string | null
  /** 触发核验的材料摘要（如 KB/URL 数），仅诊断用 */
  note?: string | null
}

// ==================== Atlas 增强视图（M2-E，按画像启用） ====================

/** Atlas 增强视图种类（图谱之外的可视化形态） */
export type DlAtlasViewKind = 'timeline' | 'flow' | 'matrix' | 'layers'

/** 时间线条目（依 attrs 时间类字段派生） */
export interface DlTimelineViewItem {
  id: string
  name: string
  nodeType: string
  /** 所属 group（无则空） */
  group: string | null
  /** 展示用时间文本（原样/提取的年份） */
  dateText: string
  /** 数值年份（可空：无法解析时按 dateText 排序靠后） */
  year: number | null
  desc: string | null
  attrs: Record<string, unknown> | null
}

export interface DlTimelineView {
  items: DlTimelineViewItem[]
}

/** 流程阶段（prerequisite 链按层分组：同层概念可并行学） */
export interface DlFlowStage {
  /** 层序（0 起 = 无前置的源头） */
  order: number
  conceptIds: string[]
}

export interface DlFlowView {
  stages: DlFlowStage[]
  /** 流程内源头/终点概念（供前端标注） */
  sourceIds: string[]
  sinkIds: string[]
}

/** 矩阵单元格 = 某 nodeType × 某 relationType 的边计数（双向合计） */
export interface DlMatrixView {
  nodeTypes: string[]
  relationTypes: string[]
  /** 行 = nodeType；列值经 cell(nodeType, relationType) 取 */
  cells: Record<string, Record<string, number>>
}

/** 三层结构：目录(group)/概念/概念附件（讲义=卡片 + 著作） */
export interface DlLayersConcept {
  id: string
  name: string
  nodeType: string
  hasCard: boolean
  worksCount: number
}

export interface DlLayersGroup {
  /** 目录节点 id（null = 根层概念，无目录归属） */
  groupId: string | null
  groupName: string | null
  concepts: DlLayersConcept[]
}

export interface DlLayersView {
  groups: DlLayersGroup[]
}

/** dl:get-atlas-views 载荷：可启用/数据可用 + 各增强视图派生数据 */
export interface DlAtlasViews {
  spaceId: string
  /** 数据上能派生出的视图 */
  available: DlAtlasViewKind[]
  /** 画像侧重 → 实际启用（available ∩ 侧重；无侧重则取 available） */
  enabled: DlAtlasViewKind[]
  timeline: DlTimelineView | null
  flow: DlFlowView | null
  matrix: DlMatrixView | null
  layers: DlLayersView | null
}

/** 画像侧重词 → 视图种类（宽容映射；加别名只影响是否显式启用） */
export const DL_EMPHASIS_VIEW_ALIASES: Record<DlAtlasViewKind, string[]> = {
  timeline: ['时间线', '时间', '时序', '沿革', '大事记', '历史脉络'],
  flow: ['流程', '步骤', '工序', '操作', '推导链', '证明链', '学习顺序'],
  matrix: ['矩阵', '对比', '比较', '对照', '关系矩阵'],
  layers: ['三层结构', '层级', '结构', '体系', '目录'],
}

/** Atlas 增强视图固定顺序与展示词（前端选项/切换条单源） */
export const DL_VIEW_KIND_ORDER: DlAtlasViewKind[] = ['timeline', 'flow', 'matrix', 'layers']

export const DL_VIEW_KIND_LABELS: Record<DlAtlasViewKind, string> = {
  timeline: '时间线',
  flow: '流程',
  matrix: '矩阵',
  layers: '三层结构',
}

/** 画像预设（建空间/画像配置用；emphasis 用上面别名能识别的展示词） */
export interface DlProfilePreset {
  id: string
  kindLabel: string
  nature: string
  emphasis: string[]
}

export const DL_PROFILE_PRESETS: DlProfilePreset[] = [
  { id: 'theory', kindLabel: '理论体系', nature: '概念—命题—推演层层递进，重视结构与证明链', emphasis: ['流程', '三层结构'] },
  { id: 'regulation', kindLabel: '法规标准', nature: '条款解读、效力层级与施行时间线', emphasis: ['时间线', '三层结构'] },
  { id: 'practice', kindLabel: '实践技能', nature: '方法步骤、操作流程与工具案例', emphasis: ['流程', '矩阵'] },
  { id: 'frontier', kindLabel: '前沿研究', nature: '论文脉络、方法流派对比与开放问题', emphasis: ['时间线', '矩阵'] },
  { id: 'custom', kindLabel: '自定义领域', nature: '按自己侧重勾选要启用的图谱视图', emphasis: [] },
]
