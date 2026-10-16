/**
 * 长文设计契约——JSON Schema 与 TS 类型（2026-09-16 结构化设定方案 §4.1，M0 定稿）
 *
 * 三级契约：spine（全书总纲）→ 卷设计文档（vN）→ 章卡 facts（prewrite v2）。
 * 校验执行在 validate.ts（ajv，主进程/web 端使用）；本文件是纯数据 +
 * 类型，渲染进程可安全引用（不把 ajv 打进 renderer bundle）。
 *
 * ID 命名空间（设计层内部引用，落库时由分解器解析/映射到真实 DB id）：
 *   人物 c_* / 势力 f_* / 地点 l_* / 物品 i_* / 故事线 p_* / 卷 v\d+ /
 *   暗线 hl_* / 事件 ev_*
 */

// ---------- TS 类型 ----------

export interface SpineCore {
  premise: string
  theme: string
  ending: string
}

export interface SpineMainLine {
  id: string
  title: string
  stages: string[]
}

export interface SpineVolume {
  id: string
  title: string
  chapter_range: { from: number; to: number }
  focus: string
}

export interface SpineDoc {
  core: SpineCore
  main_lines: SpineMainLine[]
  core_cast: string[]
  volumes: SpineVolume[]
}

export type VolumeCastKind = 'character' | 'faction' | 'location' | 'item'
export type VolumeCastImportance = 'core' | 'volume' | 'minor'

export interface VolumeCastEntry {
  id: string
  kind: VolumeCastKind
  name: string
  aliases?: string[]
  importance?: VolumeCastImportance
}

export interface VolumeThread {
  id: string
  name: string
  involves: string[]
  plant: number
  develop?: number[]
  payoff?: number
  constraint?: string
}

export interface VolumeGridLineAction {
  line: string
  act: 'plant' | 'develop' | 'payoff'
  note?: string
}

export interface VolumeGridEntry {
  ch: number
  beats: string[]
  present?: string[]
  location?: string
  line_actions?: VolumeGridLineAction[]
}

export interface VolumeEvent {
  id: string
  chapter: number
  story_time?: string
  desc: string
  participants: string[]
}

export interface VolumeDesignDoc {
  volume: string
  cast: VolumeCastEntry[]
  threads: VolumeThread[]
  grid: VolumeGridEntry[]
  events: VolumeEvent[]
}

export interface ChapterCardFacts {
  musts?: string[]
  must_nots?: string[]
  explicit_facts?: string[]
}

// ---------- JSON Schema（draft-07，ajv 直接消费） ----------

const CHAR_ID = '^[cflip]_[A-Za-z0-9_-]+$'
const ENTITY_REF = '^[cfli]_[A-Za-z0-9_-]+$'
const THREAD_ID = '^hl_[A-Za-z0-9_-]+$'
const EVENT_ID = '^ev_[A-Za-z0-9_-]+$'
const VOLUME_ID = '^v\\d+$'
const nonEmpty = { type: 'string', minLength: 1 } as const

export const SPINE_SCHEMA_ID = 'lw:design/spine'
export const VOLUME_DESIGN_SCHEMA_ID = 'lw:design/volume'
export const CHAPTER_CARD_FACTS_SCHEMA_ID = 'lw:design/chapter-card-facts'

export const SPINE_SCHEMA = {
  $id: SPINE_SCHEMA_ID,
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  additionalProperties: false,
  required: ['core', 'main_lines', 'core_cast', 'volumes'],
  properties: {
    core: {
      type: 'object',
      additionalProperties: false,
      required: ['premise', 'theme', 'ending'],
      properties: { premise: nonEmpty, theme: nonEmpty, ending: nonEmpty },
    },
    main_lines: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'stages'],
        properties: {
          id: { type: 'string', pattern: '^p_[A-Za-z0-9_-]+$' },
          title: { type: 'string', minLength: 1, maxLength: 80 },
          stages: { type: 'array', minItems: 1, items: nonEmpty },
        },
      },
    },
    core_cast: { type: 'array', items: { type: 'string', pattern: '^c_[A-Za-z0-9_-]+$' } },
    volumes: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'chapter_range', 'focus'],
        properties: {
          id: { type: 'string', pattern: VOLUME_ID },
          title: { type: 'string', minLength: 1, maxLength: 80 },
          chapter_range: {
            type: 'object',
            additionalProperties: false,
            required: ['from', 'to'],
            properties: { from: { type: 'integer', minimum: 1 }, to: { type: 'integer', minimum: 1 } },
          },
          focus: nonEmpty,
        },
      },
    },
  },
} as const

const CAST_ENTRY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'kind', 'name'],
  properties: {
    id: { type: 'string', pattern: CHAR_ID },
    kind: { type: 'string', enum: ['character', 'faction', 'location', 'item'] },
    name: { type: 'string', minLength: 1, maxLength: 60 },
    aliases: { type: 'array', items: { type: 'string', minLength: 1 } },
    importance: { type: 'string', enum: ['core', 'volume', 'minor'] },
  },
  // kind 与 id 前缀对齐（模型生成的高频错型，schema 层直接拦）
  allOf: (['character', 'faction', 'location', 'item'] as const).map(kind => ({
    if: { properties: { kind: { const: kind } } },
    then: { properties: { id: { type: 'string', pattern: `^${kind[0]}_[A-Za-z0-9_-]+$` } } },
  })),
}

export const VOLUME_DESIGN_SCHEMA = {
  $id: VOLUME_DESIGN_SCHEMA_ID,
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  additionalProperties: false,
  required: ['volume', 'cast', 'threads', 'grid', 'events'],
  properties: {
    volume: { type: 'string', pattern: VOLUME_ID },
    cast: { type: 'array', minItems: 1, items: CAST_ENTRY_SCHEMA },
    threads: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'involves', 'plant'],
        properties: {
          id: { type: 'string', pattern: THREAD_ID },
          name: { type: 'string', minLength: 1, maxLength: 80 },
          involves: { type: 'array', minItems: 1, items: { type: 'string', pattern: ENTITY_REF } },
          plant: { type: 'integer', minimum: 1 },
          develop: { type: 'array', items: { type: 'integer', minimum: 1 } },
          payoff: { type: 'integer', minimum: 1 },
          constraint: { type: 'string', minLength: 1 },
        },
      },
    },
    grid: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ch', 'beats'],
        properties: {
          ch: { type: 'integer', minimum: 1 },
          beats: { type: 'array', minItems: 1, items: nonEmpty },
          present: { type: 'array', items: { type: 'string', pattern: ENTITY_REF } },
          location: { type: 'string', pattern: '^l_[A-Za-z0-9_-]+$' },
          line_actions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['line', 'act'],
              properties: {
                line: { type: 'string', pattern: THREAD_ID },
                act: { type: 'string', enum: ['plant', 'develop', 'payoff'] },
                note: { type: 'string', minLength: 1 },
              },
            },
          },
        },
      },
    },
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'chapter', 'desc', 'participants'],
        properties: {
          id: { type: 'string', pattern: EVENT_ID },
          chapter: { type: 'integer', minimum: 1 },
          story_time: nonEmpty,
          desc: nonEmpty,
          participants: { type: 'array', minItems: 1, items: { type: 'string', pattern: ENTITY_REF } },
        },
      },
    },
  },
} as const

export const CHAPTER_CARD_FACTS_SCHEMA = {
  $id: CHAPTER_CARD_FACTS_SCHEMA_ID,
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  additionalProperties: false,
  properties: {
    musts: { type: 'array', minItems: 1, items: nonEmpty },
    must_nots: { type: 'array', minItems: 1, items: nonEmpty },
    explicit_facts: { type: 'array', minItems: 1, items: nonEmpty },
  },
} as const

export const DESIGN_SCHEMAS = [SPINE_SCHEMA, VOLUME_DESIGN_SCHEMA, CHAPTER_CARD_FACTS_SCHEMA] as const
