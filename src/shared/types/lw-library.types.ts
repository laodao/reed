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

// ==================== 交互式创建角色：四层引导步骤（AI 提案、用户逐步确认） ====================
// 定义在 shared：后端 prompt 组装与前端向导渲染共用同一份字段/文案，杜绝两处漂移。

export interface IpWizardField {
  key: string
  label: string
  /** text=单行；textarea=多行；tags=可增删标签（数组）；select=options 单选 */
  type?: 'text' | 'textarea' | 'tags' | 'select'
  options?: string[]
  required?: boolean
  /** 给用户看的一句话解释（解决"不知道这字段什么意思"） */
  hint: string
}

export interface IpWizardStep {
  step: 1 | 2 | 3 | 4
  key: string
  title: string
  /** 引导问句（向导每步的标题） */
  question: string
  fields: IpWizardField[]
}

export const IP_WIZARD_STEPS: IpWizardStep[] = [
  {
    step: 1, key: 'identity', title: '辨识资讯', question: '第一步：他/她是谁？——先有个名字和第一印象',
    fields: [
      { key: 'name', label: '姓名', required: true, hint: '角色的名字，AI 会贴合题材起名' },
      { key: 'aliases', label: '别名称呼', type: 'tags', hint: '别人怎么叫他：外号、尊称、昵称（写对话时保持一致）' },
      { key: 'gender', label: '性别', type: 'select', options: ['male', 'female', 'other'], hint: '男 / 女 / 其他' },
      { key: 'age', label: '年龄', hint: '写大致档位即可，如 17、三十许、不详' },
      { key: 'occupation', label: '身份职业', hint: '他在世界里靠什么身份活动：散修、捕快、大学生……' },
      { key: 'appearance', label: '外貌', type: 'textarea', hint: '两三句即可，最好带一个辨识点（疤痕、眼神、口头小动作）' },
    ],
  },
  {
    step: 2, key: 'drive', title: '内在驱动', question: '第二步：他最想要什么？又在怕什么？——欲望与软肋是人物的引擎',
    fields: [
      { key: 'personality', label: '性格', type: 'textarea', hint: '要有内在张力，如"仗义但对背叛睚眦必报"，避免单薄标签' },
      { key: 'motivation', label: '核心欲望', type: 'textarea', hint: '他最想得到/改变什么——一切行动的发动机' },
      { key: 'flaw', label: '软肋缺陷', type: 'textarea', hint: '欲望的反差面：他最怕失去什么、哪里容易被拿捏' },
      { key: 'background', label: '背景故事', type: 'textarea', hint: '出身、经历、秘密；150 字左右，含说话习惯（AI 会替你写足）' },
      { key: 'valuesNotes', label: '底线', type: 'textarea', hint: '他绝不做什么（可选）' },
    ],
  },
  {
    step: 3, key: 'capability', title: '能力定位', question: '第三步：他能做什么？靠什么立足？',
    fields: [
      { key: 'talents', label: '天赋资质', type: 'textarea', hint: '灵根/体质/血脉等先天条件（须在所属世界的体系内）' },
      { key: 'abilities', label: '技能功法', type: 'textarea', hint: '会什么、擅长什么' },
      { key: 'signatureItems', label: '标志性物品', hint: '随身的关键道具/武器（可选）' },
    ],
  },
  {
    step: 4, key: 'arc', title: '成长弧光', question: '最后一步：他会变成什么样？——弧光让人物活到最后',
    fields: [
      { key: 'characterArc', label: '人物弧光', type: 'textarea', hint: '故事里他的信念将发生什么不可逆转变' },
      { key: 'catchphrases', label: '口头禅', type: 'tags', hint: '标志性用语，让对话"开口像他"' },
      { key: 'tags', label: '标签', type: 'tags', hint: '方便你在库里检索的关键词（可选）' },
    ],
  },
]

/** 单步产出校验：step1 必须有姓名；数组字段规整为 string[]；其余字符串裁边 */
export function validateIpStepData(step: IpWizardStep, data: Record<string, unknown>): { ok: boolean; data: Record<string, unknown>; error?: string } {
  const out: Record<string, unknown> = {}
  for (const field of step.fields) {
    const raw = data[field.key]
    if (field.type === 'tags') {
      out[field.key] = Array.isArray(raw) ? raw.map(String).filter(v => v.trim()) : []
      continue
    }
    const str = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw)
    if (field.required && !str) {
      return { ok: false, data: {}, error: `「${field.label}」不能为空` }
    }
    out[field.key] = str
  }
  return { ok: true, data: out }
}
