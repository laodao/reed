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
}

/** 相关知识点（related 区：由关系边派生，可点击跳转） */
export interface DlRelatedRef {
  conceptId: string
  name: string
  /** 关系描述（前置/后继/对比…） */
  rel?: string
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

/** 空间三栏聚合视图（Space 页一次拉取） */
export interface DlSpaceView {
  id: string
  name: string
  goal: DlGoal
  tagline: string
  profile: DlProfileView | null
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
  /** 直接邻居（含关系类型标注） */
  relations: { conceptId: string; name: string; rel: DlRelationType; direction: 'out' | 'in' }[]
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
