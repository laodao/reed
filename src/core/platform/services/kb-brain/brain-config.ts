/**
 * 知识大脑配置（brain_config，详细设计 §2）
 * @module platform/services/kb-brain/brain-config
 *
 * knowledge_bases.brain_config JSON 的类型 + ajv 校验 + 缺省值合并。
 * 契约纪律：响亮失败——损坏/非法配置抛错（带 ajv 错误清单），绝不静默降级
 * 为默认值（错误配置被当成"关闭"会让用户以为大脑在跑）。
 * null / 空串 → 返回 null = 大脑关闭（一切入口早退，等价现状）。
 */
import Ajv from 'ajv'

/** 内容类型（提取提示词与书级流程按此路由）；'' = 未识别（消化时自动检测） */
export type KbBrainContentType = 'novel' | 'knowledge' | 'history' | 'other'

/** 内容画像：库级内容类型（首次消化自动检测写入，用户可在面板改写覆盖） */
export interface KbBrainProfile {
  contentType: KbBrainContentType | ''
  /** 体裁细标（如 修真/玄幻、科普/编程；检测原样保留，作为提取上下文） */
  genre?: string
  detectedAt?: string
  sourceDocumentId?: string
}

/** 归一：缺省字段补齐 + 非法 contentType 归 ''（画像错值不致命，回落自动检测） */
export function normalizeProfile(p?: Partial<KbBrainProfile>): KbBrainProfile {
  const ct = p?.contentType
  const contentType = ct === 'novel' || ct === 'knowledge' || ct === 'history' || ct === 'other' ? ct : ''
  return {
    contentType,
    ...(p?.genre ? { genre: p.genre } : {}),
    ...(p?.detectedAt ? { detectedAt: p.detectedAt } : {}),
    ...(p?.sourceDocumentId ? { sourceDocumentId: p.sourceDocumentId } : {}),
  }
}

/**
 * 后台自动化（提炼动作免手点）：开机 + 挂机定时跑流程化管线
 * （续消化 → 分层补标 → 书级汇总 → 目标提炼 → 归纳/清理/伏笔扫描），
 * 各动作带冷却（brain_state.automation 记账）防重复烧调用。
 */
export interface KbBrainAutomationConfig {
  enabled: boolean
  /** 续消化：failed/pending 文档复活重跑（耗尽章冷却复活） */
  digest: boolean
  /** 存量场面补采（v2 P0 故事轨回填：已消化章的 events-only 提取，分批推进） */
  sceneBackfill: boolean
  /** 冶炼层（v2 P1：套路归纳/案例拆解/原理/品类认知，事件增长门控） */
  smelt: boolean
  /** 品类库归并（v2 P3：跨书实体归并 + 设定变体矩阵） */
  corpusMerge: boolean
  layerRelabel: boolean
  /** 存量论断重判（v3：换书测试三档处置 knowledge/evidence/junk） */
  rejudge: boolean
  /** 维度归纳（v3：从语料归纳建议提炼维度，停用待启用） */
  dimensionInduct: boolean
  /** 体系汇聚（v3 M2：设定层论断 → 体系树 + structure-map 卡） */
  systemAggregate: boolean
  bookPasses: boolean
  goalDistill: boolean
  consolidate: boolean
  cleanup: boolean
  foreshadow: boolean
}

export interface KbBrainConfig {
  enabled: boolean
  /** 原子化消化：范围（scopeDocumentIds 缺省=全库）；bookPasses=书级汇总遍开关 */
  digestion: { enabled: boolean; scopeDocumentIds?: string[]; bookPasses?: boolean }
  /** 内容画像（§类型化提取：缺省/未识别时首次消化自动检测并写回） */
  profile: KbBrainProfile
  /** 视角遍：启用的视角卡 + 观感捕捉开关（多视角是乘法级成本，按需启用） */
  lenses: { enabledLensNoteIds: string[]; readingCapture: boolean }
  /** 模式提炼：设定卡（低风险）、情节卡（高风险）与人物原型卡（跨书聚类）分开关 */
  patterns: { settingEnabled: boolean; plotEnabled: boolean; characterEnabled: boolean }
  /** 高于阈值自动入池，低于进提议队列 */
  autoApproveThreshold: number
  /** 每日 LLM 调用上限（成本熔断；缺省/0=不限。env KB_BRAIN_DAILY_COST_LIMIT 作为未配置时的兜底） */
  dailyCostLimit?: number
  /** 跨文档提炼（重要性账户阈值） */
  distillation: { enabled: boolean; importanceThreshold: number }
  /** 学习模式（FSRS 复习队列） */
  learning: { enabled: boolean; desiredRetention: number }
  /** CRAG 检索纠错（M3：判级 + 改写重试；默认关——检索热路径多一次 LLM 调用） */
  crag: { enabled: boolean }
  /**
   * 模型设置（M3 用户反馈：从系统设置选模型，免 env）。
   * 值格式："modelId" 或 "providerConfigId:modelId"；空串=跟随宿主模型。
   */
  models: { atomize: string; adjudicate: string }
  /**
   * 提取目标（经验提炼维度）。机制通用、内容是数据：不同类型项目配不同目标
   * （小说库=修真体系/写作套路/经典场面/人物亮点；其他库自行定义）。
   * hint 即提炼指引（找什么、怎么组织），由 goal-distill 消费。
   */
  goals: KbBrainGoal[]
  /** 后台自动化（缺省全开：产物进待审提议人审，自动的是生产不是入库） */
  automation: KbBrainAutomationConfig
}

/** 单个提取目标（经验提炼维度） */
export interface KbBrainGoal {
  id: string
  name: string
  /** 提炼指引：要提取什么经验、如何组织成卡 */
  hint: string
  enabled: boolean
}

/** brain_state（运行态，非用户配置）：重要性账户/品味侧写/上次提炼时间 */
export interface KbBrainState {
  importance: number
  lastDistillAt: string | null
  taste?: { lensWeights: Record<string, number> }
  /** 后台自动化记账（各动作冷却/目标重跑门槛；ISO 时间戳） */
  automation?: {
    lastLayerRelabelAt?: string
    /** 补标时的工作集论断数（论断明显增长才再触发，防「全是 detail」状态反复补标） */
    relabelAtoms?: number
    /** 存量论断重判（v3）：冷却时间 + 当时工作集论断数（增长才再触发，防重确认空转） */
    lastRejudgeAt?: string
    rejudgeAtoms?: number
    /** 滚动阅读四件套（v3）：每文档上次运行时间（7 天一轮） */
    quartetRuns?: Record<string, string>
    /** 维度归纳（v3）：上次运行时间（7 天一轮） */
    lastDimensionInductAt?: string
    /** 体系汇聚（v3 M2）：上次运行时间（7 天一轮） */
    lastSystemAggregateAt?: string
    lastBookPassesAt?: string
    /** 每目标上次自动运行：时间 + 当时工作集论断数（论断增长才重跑，防日日重复出近似卡） */
    goalRuns?: Record<string, { at: string; atoms: number }>
    lastConsolidateAt?: string
    lastCleanupAt?: string
    lastForeshadowAt?: string
    /** 耗尽章自动复活（失败章重试烧钱，24h 一次） */
    lastExhaustedReviveAt?: string
    /** 存量场面补采（分批推进的冷却；一轮 200 章，6h 一轮） */
    lastSceneBackfillAt?: string
    /** 冶炼层（v2 P1）：上次运行时间 + 当时事件量（原料明显增长才重跑，防近似卡反复产） */
    lastSmeltAt?: string
    smeltEvents?: number
    /** 品类归并（v2 P3，7d 冷却——归并低频重活） */
    lastCorpusMergeAt?: string
    /** v4：章卡补跑 / 书级审校 上次执行时间 */
    lastCardBackfillAt?: string
    lastReviewAt?: string
  }
}

/** 自动化段缺省值（用户未配置/半段配置时补齐；全开——产物走待审提议人审） */
export function defaultAutomationConfig(): KbBrainAutomationConfig {
  return {
    enabled: true,
    digest: true,
    sceneBackfill: true,
    smelt: true,
    corpusMerge: true,
    layerRelabel: true,
    rejudge: true,
    dimensionInduct: true,
    systemAggregate: true,
    bookPasses: true,
    goalDistill: true,
    consolidate: true,
    cleanup: true,
    foreshadow: true,
  }
}

const BRAIN_CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    digestion: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        scopeDocumentIds: { type: 'array', items: { type: 'string' } },
        bookPasses: { type: 'boolean' },
      },
      required: ['enabled'],
      additionalProperties: false,
    },
    profile: {
      type: 'object',
      properties: {
        contentType: { enum: ['novel', 'knowledge', 'history', 'other', ''] },
        genre: { type: 'string' },
        detectedAt: { type: 'string' },
        sourceDocumentId: { type: 'string' },
      },
      required: ['contentType'],
      additionalProperties: false,
    },
    lenses: {
      type: 'object',
      properties: {
        enabledLensNoteIds: { type: 'array', items: { type: 'string' } },
        readingCapture: { type: 'boolean' },
      },
      required: ['enabledLensNoteIds', 'readingCapture'],
      additionalProperties: false,
    },
    patterns: {
      type: 'object',
      properties: {
        settingEnabled: { type: 'boolean' },
        plotEnabled: { type: 'boolean' },
        characterEnabled: { type: 'boolean' },
      },
      required: ['settingEnabled', 'plotEnabled'],
      additionalProperties: false,
    },
    autoApproveThreshold: { type: 'number', minimum: 0, maximum: 1 },
        dailyCostLimit: { type: 'integer', minimum: 0 },
    distillation: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        importanceThreshold: { type: 'number', minimum: 1 },
      },
      required: ['enabled', 'importanceThreshold'],
      additionalProperties: false,
    },
    learning: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        desiredRetention: { type: 'number', minimum: 0.5, maximum: 0.99 },
      },
      required: ['enabled', 'desiredRetention'],
      additionalProperties: false,
    },
    crag: {
      type: 'object',
      properties: { enabled: { type: 'boolean' } },
      required: ['enabled'],
      additionalProperties: false,
    },
    models: {
      type: 'object',
      properties: {
        atomize: { type: 'string' },
        adjudicate: { type: 'string' },
      },
      required: ['atomize', 'adjudicate'],
      additionalProperties: false,
    },
    goals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          hint: { type: 'string', minLength: 1 },
          enabled: { type: 'boolean' },
        },
        required: ['id', 'name', 'hint', 'enabled'],
        additionalProperties: false,
      },
    },
    automation: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        digest: { type: 'boolean' },
        sceneBackfill: { type: 'boolean' },
        smelt: { type: 'boolean' },
        corpusMerge: { type: 'boolean' },
        layerRelabel: { type: 'boolean' },
        rejudge: { type: 'boolean' },
        dimensionInduct: { type: 'boolean' },
        systemAggregate: { type: 'boolean' },
        bookPasses: { type: 'boolean' },
        goalDistill: { type: 'boolean' },
        consolidate: { type: 'boolean' },
        cleanup: { type: 'boolean' },
        foreshadow: { type: 'boolean' },
      },
      required: ['enabled'],
      additionalProperties: false,
    },
  },
  required: ['enabled'],
  additionalProperties: false,
} as const

const ajv = new Ajv({ allErrors: true })
const validate = ajv.compile(BRAIN_CONFIG_SCHEMA)

/** 全量缺省值（用户只给 partial 时补齐；enabled 必填由 schema 保证） */
export function defaultBrainConfig(enabled = true): KbBrainConfig {
  return {
    enabled,
    digestion: { enabled: true, bookPasses: true },
    profile: { contentType: '' },
    lenses: { enabledLensNoteIds: [], readingCapture: true },
    // 人物原型产线 v3 起默认开（character-arc/character-pattern 是用户点名诉求；
    // 存量库的显式 false 尊重用户配置，可在面板「人物模式」开关打开）
    patterns: { settingEnabled: true, plotEnabled: false, characterEnabled: true },
    autoApproveThreshold: 0.8,
    distillation: { enabled: true, importanceThreshold: 50 },
    learning: { enabled: false, desiredRetention: 0.9 },
    crag: { enabled: false },
    models: { atomize: '', adjudicate: '' },
    goals: [],
    automation: defaultAutomationConfig(),
  }
}

/** brain_config 列解析：null/空 = 大脑关闭；非法 = 抛错（响亮失败） */
export function parseBrainConfig(raw: string | null | undefined): KbBrainConfig | null {
  if (raw == null) return null
  const trimmed = raw.trim()
  if (!trimmed || trimmed === 'null') return null
  let json: unknown
  try {
    json = JSON.parse(trimmed)
  } catch (e) {
    throw new Error(`brainConfig 不是合法 JSON: ${(e as Error).message}`)
  }
  if (!validate(json)) {
    const detail = ajv.errorsText(validate.errors)
    throw new Error(`brainConfig 校验失败: ${detail}`)
  }
  return normalizeBrainConfig(json as Partial<KbBrainConfig>)
}

/** partial → 全量配置：所有嵌套段深合并（浅合并会丢段内 required 字段 → 校验炸） */
export function normalizeBrainConfig(partial: Partial<KbBrainConfig>): KbBrainConfig {
  const def = defaultBrainConfig(partial.enabled ?? true)
  return {
    enabled: partial.enabled ?? def.enabled,
    digestion: { ...def.digestion, ...partial.digestion },
    profile: normalizeProfile(partial.profile),
    lenses: { ...def.lenses, ...partial.lenses },
    patterns: { ...def.patterns, ...partial.patterns },
    autoApproveThreshold: partial.autoApproveThreshold ?? def.autoApproveThreshold,
    dailyCostLimit: typeof partial.dailyCostLimit === 'number' && partial.dailyCostLimit > 0 ? partial.dailyCostLimit : undefined,
    distillation: { ...def.distillation, ...partial.distillation },
    learning: { ...def.learning, ...partial.learning },
    crag: { ...def.crag, ...partial.crag },
    models: { ...def.models, ...partial.models },
    goals: Array.isArray(partial.goals) ? partial.goals : def.goals,
    automation: { ...def.automation, ...partial.automation },
  }
}

/** 段合并：base 打底，仅采纳 patch 中显式定义（非 undefined）的键——半段 patch 不丢 base 子键 */
function mergeSeg<T extends object>(base: T, patch: Partial<T> | undefined): T {
  const out = { ...base } as unknown as Record<string, unknown>
  if (patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) out[k] = v
    }
  }
  return out as T
}

/**
 * 已有配置 + 前端 patch → 合并配置（updateConfig 写路径）。
 * 段级深合并且段内保留 base 子键（缺省键回退默认值的是 parseBrainConfig 的职责，
 * 两处语义不同：merge 丢 base 子键 = 用户已保存设置被静默重置）。
 * patch 顶层 undefined 值键同样剥离（显式 undefined 不翻 enabled）。
 */
export function mergeBrainConfig(base: KbBrainConfig, patch: Partial<KbBrainConfig>): KbBrainConfig {
  return normalizeBrainConfig({
    ...mergeSeg(base, patch),
    digestion: mergeSeg(base.digestion, patch.digestion),
    profile: normalizeProfile({ ...base.profile, ...patch.profile }),
    lenses: mergeSeg(base.lenses, patch.lenses),
    patterns: mergeSeg(base.patterns, patch.patterns),
    distillation: mergeSeg(base.distillation, patch.distillation),
    learning: mergeSeg(base.learning, patch.learning),
    crag: mergeSeg(base.crag, patch.crag),
    models: mergeSeg(base.models, patch.models),
    goals: patch.goals ?? base.goals,
    automation: mergeSeg(base.automation, patch.automation),
  })
}

/** 序列化前校验（写路径统一走这里，非法配置写不进库） */
export function stringifyBrainConfig(config: KbBrainConfig): string {
  if (!validate(config)) {
    throw new Error(`brainConfig 校验失败: ${ajv.errorsText(validate.errors)}`)
  }
  return JSON.stringify(config)
}

/** brain_state 序列化（写回统一入口） */
export function stringifyBrainState(state: KbBrainState): string {
  return JSON.stringify(state)
}

/** brain_state 列解析：损坏返回干净初始态（运行态容错，与配置的响亮失败不同） */
export function parseBrainState(raw: string | null | undefined): KbBrainState {
  if (!raw) return { importance: 0, lastDistillAt: null }
  try {
    const v = JSON.parse(raw) as Partial<KbBrainState>
    return {
      importance: typeof v.importance === 'number' ? v.importance : 0,
      lastDistillAt: typeof v.lastDistillAt === 'string' ? v.lastDistillAt : null,
      taste: v.taste,
      automation: v.automation,
    }
  } catch {
    return { importance: 0, lastDistillAt: null }
  }
}
