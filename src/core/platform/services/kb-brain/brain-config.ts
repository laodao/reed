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

export interface KbBrainConfig {
  enabled: boolean
  /** 原子化消化：范围（scopeDocumentIds 缺省=全库） */
  digestion: { enabled: boolean; scopeDocumentIds?: string[] }
  /** 视角遍：启用的视角卡 + 观感捕捉开关（多视角是乘法级成本，按需启用） */
  lenses: { enabledLensNoteIds: string[]; readingCapture: boolean }
  /** 模式提炼：设定卡（低风险）与情节卡（高风险）分开关 */
  patterns: { settingEnabled: boolean; plotEnabled: boolean }
  /** 高于阈值自动入池，低于进提议队列 */
  autoApproveThreshold: number
  /** 跨文档提炼（重要性账户阈值） */
  distillation: { enabled: boolean; importanceThreshold: number }
  /** 学习模式（FSRS 复习队列） */
  learning: { enabled: boolean; desiredRetention: number }
}

/** brain_state（运行态，非用户配置）：重要性账户/品味侧写/上次提炼时间 */
export interface KbBrainState {
  importance: number
  lastDistillAt: string | null
  taste?: { lensWeights: Record<string, number> }
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
      },
      required: ['enabled'],
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
      },
      required: ['settingEnabled', 'plotEnabled'],
      additionalProperties: false,
    },
    autoApproveThreshold: { type: 'number', minimum: 0, maximum: 1 },
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
    digestion: { enabled: true },
    lenses: { enabledLensNoteIds: [], readingCapture: true },
    patterns: { settingEnabled: true, plotEnabled: false },
    autoApproveThreshold: 0.8,
    distillation: { enabled: true, importanceThreshold: 50 },
    learning: { enabled: false, desiredRetention: 0.9 },
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
  const partial = json as Partial<KbBrainConfig>
  const def = defaultBrainConfig(partial.enabled ?? true)
  return {
    enabled: partial.enabled ?? def.enabled,
    digestion: { ...def.digestion, ...partial.digestion },
    lenses: { ...def.lenses, ...partial.lenses },
    patterns: { ...def.patterns, ...partial.patterns },
    autoApproveThreshold: partial.autoApproveThreshold ?? def.autoApproveThreshold,
    distillation: { ...def.distillation, ...partial.distillation },
    learning: { ...def.learning, ...partial.learning },
  }
}

/** 序列化前校验（写路径统一走这里，非法配置写不进库） */
export function stringifyBrainConfig(config: KbBrainConfig): string {
  if (!validate(config)) {
    throw new Error(`brainConfig 校验失败: ${ajv.errorsText(validate.errors)}`)
  }
  return JSON.stringify(config)
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
    }
  } catch {
    return { importance: 0, lastDistillAt: null }
  }
}
