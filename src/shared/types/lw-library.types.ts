/**
 * 长文写作·设定资产库（世界观库 + 角色 IP 库）类型定义
 * @module shared/types/lw-library.types
 *
 * 设计文档：docs/design/2026-09-24-worldview-ip-library-design.md
 * 核心原则：库存「世界常量」（user 作用域，无 project 维度），项目存「故事变量」。
 * 项目侧引用 = 绑定表（lw_world_bindings / lw_ip_bindings）+ 既有实体表血缘列。
 */

// ---------- 字段模板（与 bible kinds 的 fields_schema 同构） ----------

export interface LibraryFieldSchemaItem {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'tags'
  options?: string[]
  required?: boolean
}

// ---------- 世界观库 ----------

export type WorldStatus = 'active' | 'archived'

export interface World {
  id: string
  name: string
  /** 题材（对齐 story_type：xiuzhen|xuanhuan|urban|scifi|western_fantasy|history|custom） */
  genre: string
  tagline: string
  description: string
  coverPath: string | null
  status: WorldStatus
  /** 条目变更即 bump，血缘同步用 */
  version: number
  tags: string[]
  createdAt: number
  updatedAt: number
}

export interface WorldKind {
  id: string
  worldId: string
  key: string
  label: string
  icon: string | null
  sortOrder: number
  fieldsSchema: LibraryFieldSchemaItem[] | null
  /** AI 提炼/生成该分类条目的引导（输出 JSON 字段说明） */
  promptHint: string | null
  enabled: boolean
}

export interface WorldEntry {
  id: string
  worldId: string
  kindKey: string
  name: string
  /** 别名/称呼（JSON 数组），提及检测与触发式注入的地基 */
  aliases: string[]
  summary: string
  /** 按所属 kind 的 fields_schema 组织的扩展字段 */
  fields: Record<string, unknown> | null
  /** 层级归属（地域>国别>驻地；体系>条目） */
  parentId: string | null
  sortOrder: number
  /** 榜单化排序（异火榜式），NULL=无序 */
  rankValue: number | null
  /** 常驻注入（体系/规则类），写作时全量进 prompt */
  pinned: boolean
  /** JSON: {type:'manual'|'ai'|'promoted', projectId?, conversationId?} */
  origin: Record<string, unknown> | null
  createdAt: number
  updatedAt: number
}

export interface WorldEdge {
  id: string
  worldId: string
  sourceId: string
  targetId: string
  relationType: string
  label: string | null
  origin: Record<string, unknown> | null
  createdAt: number
}

// ---------- 角色 IP 库 ----------

export interface IpCharacter {
  id: string
  name: string
  aliases: string[]
  /** 可空：不归属任何世界的通用 IP */
  worldId: string | null
  // 第一层：辨识资讯
  gender: string | null
  age: string | null
  race: string | null
  occupation: string | null
  appearance: string | null
  /** 人像设计模块的 portrait id（先例：lw_story_characters.portraitId） */
  portraitId: string | null
  // 第二层：内在驱动
  personality: string | null
  motivation: string | null
  flaw: string | null
  background: string | null
  valuesNotes: string | null
  // 第三层：能力与世界观定位
  talents: string | null
  abilities: string | null
  signatureItems: string | null
  // 第四层：弧光
  characterArc: string | null
  catchphrases: string[]
  /** 题材扩展字段（由所挂世界的 character fields_schema 驱动） */
  fields: Record<string, unknown> | null
  tags: string[]
  status: WorldStatus
  origin: Record<string, unknown> | null
  createdAt: number
  updatedAt: number
}

export interface IpEdge {
  id: string
  sourceId: string
  targetId: string
  relationType: string
  label: string | null
  description: string | null
  createdAt: number
}

// ---------- 项目侧绑定 ----------

export interface WorldBindingConfig {
  /** 强制常驻注入的 kind（额外于 entry.pinned） */
  pinnedKindKeys?: string[]
  /** 屏蔽的库条目（不导入/不注入） */
  disabledEntryIds?: string[]
  /** 故事级覆写说明（注入 prompt 时附注） */
  overrides?: Array<{ entryId: string; note: string }>
}

export interface WorldBinding {
  id: string
  projectId: string
  worldId: string
  /** 冗余快照：库删除/改名后的展示兜底 */
  worldName: string
  isPrimary: boolean
  config: WorldBindingConfig | null
  createdAt: number
}

export interface IpBinding {
  id: string
  projectId: string
  ipCharacterId: string
  ipName: string
  /** 导入生成的项目角色 id（lw_story_characters.id）；null=尚未导入 */
  projectCharacterId: string | null
  rolePosition: string | null
  createdAt: number
}

// ---------- 请求载荷 ----------

export interface CreateWorldRequest {
  name: string
  genre: string
  tagline?: string
  description?: string
  tags?: string[]
  /** 按内置模板播种 kinds（P0：xiuzhen；缺省不播种） */
  fromTemplate?: string
}

export interface UpdateWorldRequest {
  name?: string
  genre?: string
  tagline?: string
  description?: string
  coverPath?: string | null
  status?: WorldStatus
  tags?: string[]
}

export interface CreateWorldEntryRequest {
  worldId: string
  kindKey: string
  name: string
  aliases?: string[]
  summary?: string
  fields?: Record<string, unknown> | null
  parentId?: string | null
  sortOrder?: number
  rankValue?: number | null
  pinned?: boolean
}

export type UpdateWorldEntryRequest = Partial<Omit<CreateWorldEntryRequest, 'worldId' | 'kindKey'>>

export interface CreateIpCharacterRequest {
  name: string
  aliases?: string[]
  worldId?: string | null
  gender?: string | null
  age?: string | null
  race?: string | null
  occupation?: string | null
  appearance?: string | null
  portraitId?: string | null
  personality?: string | null
  motivation?: string | null
  flaw?: string | null
  background?: string | null
  valuesNotes?: string | null
  talents?: string | null
  abilities?: string | null
  signatureItems?: string | null
  characterArc?: string | null
  catchphrases?: string[]
  fields?: Record<string, unknown> | null
  tags?: string[]
}

export type UpdateIpCharacterRequest = Partial<Omit<CreateIpCharacterRequest, 'name'>> & {
  name?: string
  status?: WorldStatus
}

export interface CreateIpEdgeRequest {
  sourceId: string
  targetId: string
  relationType: string
  label?: string | null
  description?: string | null
}

export interface BindWorldRequest {
  projectId: string
  worldId: string
  isPrimary?: boolean
  config?: WorldBindingConfig | null
}

export interface ImportIpCharacterRequest {
  projectId: string
  ipCharacterId: string
  /** 导入时建议定位（protagonist/supporting/antagonist/minor），可后改 */
  rolePosition?: string
}
