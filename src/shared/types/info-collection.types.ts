/**
 * 信息搜集（info-collection）跨端类型契约（前后端 + 主进程服务共用）
 * @module shared/types/info-collection
 * @description 权威来源：docs/design/2026-10-07-info-collection-design.md（主设计 v3，
 *              §2 核心模型 / §3 八阶段管线）+ docs/design/2026-10-07-info-collection-storage-design.md
 *              （存储专项：约定列 / 宽表归一 / 恒等式校验）。
 *              演化纪律：改字段先改本文件与 design 文档；枚举值变更需同步
 *              ic_* 仓储校验与前端图例/筛选。
 *
 * 通用性纪律（主设计 §0 原则 1）：本文件不出现任何领域词（人口/政策/财报…）。
 * 领域差异全部由运行时 AI 起草的采集蓝图（IcBlueprint，JSON）承载——蓝图不是
 * 预制配置，是每次搜集对当前主题现场生成的计划（快速模式自动确认，精调模式人审）。
 */

// ==================== 信源分级（沿用 topic-research v5 四级） ====================

/** 信源四级：1 官方机构 | 2 官方媒体 | 3 互联网媒体 | 4 互联网搜索 */
export type IcSourceTier = 1 | 2 | 3 | 4

export const IC_SOURCE_TIERS: IcSourceTier[] = [1, 2, 3, 4]

export const IC_SOURCE_TIER_LABELS: Record<IcSourceTier, string> = {
  1: '官方机构',
  2: '官方媒体',
  3: '互联网媒体',
  4: '互联网搜索',
}

// ==================== 渠道 / 需求形态 / 优先级 ====================

/** 取材渠道：search=搜索引擎 | info-source=信息源库 | url=直取 | kb=私有知识库 | manual=手动导入 */
export type IcChannel = 'search' | 'info-source' | 'url' | 'kb' | 'manual'

export const IC_CHANNELS: IcChannel[] = ['search', 'info-source', 'url', 'kb', 'manual']

/** 需求形态：仅决定默认抽取模板，蓝图 schema 可覆盖（通用形状，非领域分类） */
export type IcRequirementForm = 'data' | 'fact' | 'document' | 'opinion' | 'case'

export const IC_REQUIREMENT_FORMS: IcRequirementForm[] = ['data', 'fact', 'document', 'opinion', 'case']

/** 需求优先级：must=必答（未满足需提前上报）| should=应答 | nice=加分项 */
export type IcPriority = 'must' | 'should' | 'nice'

export const IC_PRIORITIES: IcPriority[] = ['must', 'should', 'nice']

// ==================== 状态枚举 ====================

export type IcProjectStatus = 'active' | 'archived'

/** 任务终态机：pending → running → reviewing → done | failed | cancelled */
export type IcTaskStatus = 'pending' | 'running' | 'reviewing' | 'done' | 'failed' | 'cancelled'

export const IC_TASK_STATUSES: IcTaskStatus[] = ['pending', 'running', 'reviewing', 'done', 'failed', 'cancelled']

/** 执行台账遍次状态（照搬 kb_digest_passes：MAX_ATTEMPTS 后人工复活） */
export type IcPassStatus = 'running' | 'done' | 'failed'

/** 单源抓取结局：blocked=反爬/动态页（进手动导入建议清单） */
export type IcFetchStatus = 'ok' | 'partial' | 'failed' | 'blocked'

/** 源的审阅状态：staged=待审 | confirmed=已入库 | rejected=驳回 | merged=并入他源 */
export type IcReviewStatus = 'staged' | 'confirmed' | 'rejected' | 'merged'

export const IC_REVIEW_STATUSES: IcReviewStatus[] = ['staged', 'confirmed', 'rejected', 'merged']

/** 结构化行状态：stale=已确认但存在更新版本（只提示，不删） */
export type IcRowStatus = 'draft' | 'confirmed' | 'superseded' | 'stale'

export const IC_ROW_STATUSES: IcRowStatus[] = ['draft', 'confirmed', 'superseded', 'stale']

/** 抽取置信：复核不一致一律 low（进待审，不静默丢弃也不静默放行） */
export type IcConfidence = 'high' | 'low'

// ==================== 刷新策略 ====================

export interface IcRefreshPolicy {
  mode: 'manual' | 'cron'
  /** mode='cron' 时的 5 字段 cron 表达式 */
  cron?: string
}

// ==================== 采集蓝图（通用性的承载物，主设计 §2.2） ====================

/** 单条信息需求：原子化、可独立判定"满足/不满足"；一条 IR 只问一件事 */
export interface IcRequirement {
  /** 稳定标识（"R1"…），抽取与负结果记录按它回指 */
  id: string
  question: string
  /** 需求形态：仅决定默认抽取模板，schema 可覆盖 */
  form: IcRequirementForm
  priority: IcPriority
  /** 指向 blueprint.schemas 中的 schema id；缺省 = 引文卡（fact 默认） */
  schemaId?: string
  /** 时效窗：提取不到发布时间的源不得作为满足带窗 must IR 的唯一依据 */
  timeWindow?: { from?: string; to?: string }
  /** 信源下限，缺省继承 sourceStrategy.minTier */
  tierFloor?: IcSourceTier
}

/** measure 约定（存储专项 §3）：声明 row_json 哪些字段映射进约定列（可计算投影） */
export interface IcMeasureConvention {
  type: 'measure'
  /** 字段名映射：value/unit/period/metric 为 row_json 属性名；dims 为属性名数组 */
  map: {
    value: string
    unit?: string
    period?: string
    metric?: string
    dims?: string[]
  }
}

/**
 * 跨行恒等式规则（存储专项 §5，通用数据自洽机制）。
 * expr 语法：`科目A = 科目B + 科目C`（标识符为 metric 名；v1 支持同期同维恒等式）。
 * tolerance 为相对容差（默认 0.005）；不平 → 整数据集 needs_review，不阻断入库。
 */
export interface IcCheckRule {
  expr: string
  tolerance?: number
  note?: string
}

/** 抽取 schema：任意主题自定义；convention/checks 可选 */
export interface IcBlueprintSchema {
  id: string
  title: string
  /** JSON Schema（ajv 校验在服务层；本文件只承载结构） */
  jsonSchema: Record<string, unknown>
  convention?: IcMeasureConvention
  checks?: IcCheckRule[]
}

export interface IcSourceStrategy {
  channels: IcChannel[]
  /** 信源分级下限（must 级 IR 默认 1，should 默认 2） */
  minTier: IcSourceTier
  /** 查询与取材语言（默认中文主题也扫英文源） */
  languages: string[]
  /** 查询词种子：同义扩展 / 中英双语 / 不同切入角度 */
  seedQueries: string[]
  /** 一手来源机会点（权威域名 / 机构 / 原始出版物提示） */
  primaryHint: string[]
}

export interface IcStopRules {
  /** IR 满足率目标（<1.0：蓝图从第一天就承认部分需求可能获取不到） */
  coverageTarget: number
  /** 关键需求最少独立源数（跨机构且非转载簇同源） */
  minIndependentSources: number
  /** 连续 N 轮无新 IR 满足即停（防死磕烧预算） */
  marginalRounds: number
  budget: {
    maxToolCalls: number
    maxMinutes: number
  }
}

/** 整理产出物规格：summary-cards | data-table | timeline | comparison-matrix | source-list（可扩展） */
export interface IcDeliverable {
  kind: string
  title?: string
}

/**
 * 采集蓝图：先规格后采集（照搬 lesson-spec 写作锁模式）。
 * 快速模式：AI 起草 → 自检通过自动确认即锁；精调模式：人审确认后锁。
 * 锁定后执行期间不可变；改蓝图 = version+1 = 允许重跑（旧任务记录不丢）。
 */
export interface IcBlueprint {
  version: number
  goal: string
  /** 未被用户确认的口径假设必须显式声明，禁止静默假设（随产出报告展示） */
  assumptions: string[]
  requirements: IcRequirement[]
  schemas: IcBlueprintSchema[]
  sourceStrategy: IcSourceStrategy
  stopRules: IcStopRules
  organizationSpec: IcDeliverable[]
  /** 低风险自动确认开关，默认 false（AI 产出一律 draft 起步） */
  autoConfirm: boolean
}

// ==================== 恒等式校验结果（存储专项 §5；纯数据，供服务层/UI 消费） ====================

/** 单条规则在单个 (schema, period, dims) 分组上的求值结果 */
export interface IcCheckFinding {
  ruleExpr: string
  /** 分组键：`${period}|${dimsKey}` */
  groupId: string
  /** 左右两侧求值；任一侧缺科目时为 null 且 skipped=true */
  left: number | null
  right: number | null
  /** |left-right| / max(|left|,|right|)，两侧为 0 时为 0 */
  diffRatio: number | null
  ok: boolean
  /** 分组内缺少科目 / 表达式解析失败 → 跳过（不计失败也不计通过） */
  skipped: boolean
  missingMetrics: string[]
  /** 解析失败等原因的补充说明（skipped 时可读） */
  detail?: string
}

/** 抽取行落库载荷（服务层组装；row_json 为全量权威，约定列为派生投影） */
export interface IcRowMeasure {
  value: number | null
  unit: string | null
  period: string | null
  metric: string | null
  dims: Record<string, unknown> | null
}
