/**
 * 资产模块共享类型（通用资产库）
 * @module shared/types/asset
 * @description 工作流「保存资产」节点 /「读取资产」节点与资产中心页面的数据契约。
 *
 * 设计要点：
 * - 大类固定枚举（图片/音频/视频/文档/文本/数据），文件型资产按扩展名自动归类，
 *   也可在保存节点里显式指定；子分类（subCategory）留作自定义自由文本。
 * - 存储形态（kind）四选一：file=磁盘文件（storagePath 相对 dataPath）、
 *   url=保留原始链接、text=文本内容、json=结构化数据。文件型大内容一律落盘，
 *   DB 只存元数据，避免数据库膨胀。
 * - metadata 为附加元数据 JSON（图片宽高 / 音频时长 / 格式等，探测失败可缺省）。
 */

/** 资产大类（固定枚举） */
export const ASSET_CATEGORIES = {
  image: 'image',
  audio: 'audio',
  video: 'video',
  document: 'document',
  text: 'text',
  json: 'json',
  /** 模板（报告模板等：markdown/HTML 文本，供 read-asset 引用渲染） */
  template: 'template',
  other: 'other',
} as const

export type AssetCategory = keyof typeof ASSET_CATEGORIES

/** 大类中文名（资产中心分类筛选 / 节点表单选项共用） */
export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  image: '图片',
  audio: '音频',
  video: '视频',
  document: '文档',
  text: '文本',
  json: '数据',
  template: '模板',
  other: '其他',
}

/** 大类选项列表（工作流节点表单 select 用） */
export const ASSET_CATEGORY_OPTIONS: Array<{ label: string; value: AssetCategory }> =
  Object.entries(ASSET_CATEGORY_LABELS).map(([value, label]) => ({ label, value: value as AssetCategory }))

/**
 * 资产分类的预览模式（分类定义驱动：资产中心按 subCategory 命中分类定义后，
 * 按 previewMode 决定预览呈现——auto 沿用按存储形态的旧逻辑）
 */
export const ASSET_PREVIEW_MODES = {
  /** 按存储形态自动推断（缺省） */
  auto: 'auto',
  /** 不可预览（仅展示元数据） */
  none: 'none',
  /** 纯文本（pre 显示） */
  text: 'text',
  /** Markdown 排版（generic 模板渲染 HTML 预览） */
  markdown: 'markdown',
  /** HTML 原样显示 */
  html: 'html',
  /** JSON 格式化显示 */
  json: 'json',
  /** 图片 */
  image: 'image',
  /** 音频 */
  audio: 'audio',
  /** 视频 */
  video: 'video',
  /** 报告：markdown + 业务排版模板 → 长图（桌面端）/ HTML（Web 端降级） */
  report: 'report',
} as const

export type AssetPreviewMode = keyof typeof ASSET_PREVIEW_MODES

/** 预览模式中文名（资产中心分类管理 / 节点表单共用） */
export const ASSET_PREVIEW_MODE_LABELS: Record<AssetPreviewMode, string> = {
  auto: '按存储形态自动',
  none: '不可预览',
  text: '纯文本',
  markdown: 'Markdown 排版',
  html: 'HTML 原样',
  json: 'JSON 格式化',
  image: '图片',
  audio: '音频',
  video: '视频',
  report: '报告长图（模板渲染）',
}

/** 分类定义允许的文件形态/大类为空数组时表示不限 */
export type AssetCategoryAllowed = {
  kinds: AssetStorageKind[]
  categories: AssetCategory[]
}

/** 资产分类定义（asset_categories 表 DTO；业务每增一类即增一条，驱动资产中心分组与预览） */
export interface AssetCategoryDef {
  id: string
  /** 分类名（唯一；与资产 sub_category 匹配） */
  name: string
  /** 业务编码（可选，如 morning_report） */
  code?: string | null
  /** 允许的存储形态（空=不限） */
  allowedKinds: AssetStorageKind[]
  /** 允许的大类（空=不限） */
  allowedCategories: AssetCategory[]
  /** 是否可预览 */
  previewable: boolean
  /** 预览模式 */
  previewMode: AssetPreviewMode
  /** 预览渲染模板 ID（previewMode=report 时必填；对应 DOCUMENT_TEMPLATES key） */
  previewTemplateId?: string | null
  sortOrder: number
  /** 内置分类（禁删禁改，允许复制为自有） */
  isBuiltin?: boolean
  /** 该分类下资产数（资产中心 tab 计数；列表接口聚合返回） */
  count?: number
  createdAt: string
  updatedAt: string
}

/** 新建/更新分类的输入（service 层契约） */
export interface SaveAssetCategoryInput {
  name: string
  code?: string
  allowedKinds?: AssetStorageKind[]
  allowedCategories?: AssetCategory[]
  previewable?: boolean
  previewMode?: AssetPreviewMode
  previewTemplateId?: string | null
  sortOrder?: number
}

export interface UpdateAssetCategoryInput {
  name?: string
  code?: string | null
  allowedKinds?: AssetStorageKind[]
  allowedCategories?: AssetCategory[]
  previewable?: boolean
  previewMode?: AssetPreviewMode
  previewTemplateId?: string | null
  sortOrder?: number
}

/** 资产渲染预览结果（桌面端 report 类 → 长图；Web 端 → HTML） */
export type AssetPreviewResult =
  | { mode: 'image'; url: string; html?: string }
  | { mode: 'html'; html: string }

/** 分类定义携带的预览渲染模板选项（分类管理表单用；值=DOCUMENT_TEMPLATES key） */
export interface AssetPreviewTemplateOption {
  value: string
  label: string
}

/** 存储形态 */
export const ASSET_STORAGE_KINDS = {
  file: 'file',
  url: 'url',
  text: 'text',
  json: 'json',
} as const

export type AssetStorageKind = keyof typeof ASSET_STORAGE_KINDS

/** 资产来源类型（sourceType） */
export const ASSET_SOURCE_TYPES = {
  workflow: 'workflow',
  app: 'app',
  manual: 'manual',
  import: 'import',
} as const

export type AssetSourceType = keyof typeof ASSET_SOURCE_TYPES

/** 资产记录（DB 行 DTO；tags/metadata 反序列化后的形态） */
export interface AssetRecord {
  id: string
  userId: string | null
  /** 大类（ASSET_CATEGORIES） */
  category: AssetCategory
  /** 子分类（自由文本，资产中心二级分组；如模板场景/文档类型/项目名） */
  subCategory?: string | null
  /** 资产名（文件型缺省取文件名） */
  name: string
  description?: string | null
  /** 标签列表（DB 存 JSON 数组字符串） */
  tags: string[]
  /** 存储形态（ASSET_STORAGE_KINDS） */
  kind: AssetStorageKind
  /** 相对 dataPath 的文件路径（kind=file） */
  storagePath?: string | null
  /** 原始 URL（kind=url） */
  url?: string | null
  /** 文本内容（kind=text） */
  textContent?: string | null
  /** JSON 内容（kind=json，序列化后的 JSON 字符串） */
  jsonContent?: string | null
  mimeType?: string | null
  sizeBytes?: number | null
  /** 附加元数据（宽高/时长/格式等；DB 存 JSON 字符串） */
  metadata?: Record<string, unknown> | null
  /** 来源类型（ASSET_SOURCE_TYPES） */
  sourceType?: string | null
  /** 来源引用（工作流运行 id / 应用 id） */
  sourceRef?: string | null
  /** 资产组 ID（套图/组图：一次流程多图归为一组，asset_groups.id） */
  groupId?: string | null
  /** 组内角色（cover=封面图 | member=组内成员；非组资产为 null） */
  groupRole?: string | null
  /** 组名（列表查询时随 groupId 填充，供前端组卡片展示真实组名） */
  groupName?: string | null
  /** 内置资产（全局共享、禁删禁改，允许复制为自有） */
  isBuiltin?: boolean
  createdAt: string
  updatedAt: string
}

/** 资产组记录（asset_groups DTO） */
export interface AssetGroupRecord {
  id: string
  userId: string | null
  name: string
  category?: string | null
  subCategory?: string | null
  description?: string | null
  coverAssetId?: string | null
  sourceType?: string | null
  sourceRef?: string | null
  createdAt: string
  updatedAt: string
}

/** 资产来源跳转（需求 3：资产 → 产出它的功能） */
export interface AssetSourceLink {
  /** 跳转类型：app=应用会话 | workflow=工作流运行 */
  type: 'app' | 'workflow'
  /** 应用会话跳转参数 */
  appId?: string
  sessionId?: string
  /** 工作流运行跳转参数 */
  runId?: string
  definitionId?: string
  /** 展示名（如「电商商品套图」/「周报生成器」） */
  label: string
}

/** 保存资产的输入（service 层契约；IPC 与节点 handler 共用） */
export interface SaveAssetInput {
  /** 大类；缺省按内容自动探测 */
  category?: AssetCategory
  /** 子分类（自由文本，资产中心二级分组） */
  subCategory?: string
  /** 资产名；缺省按文件名/内容自动生成 */
  name?: string
  description?: string
  /** 标签列表 */
  tags?: string[]
  /** 内容来源（四种形态按 kind 判别） */
  content: { kind: 'file'; path: string } | { kind: 'url'; url: string } | { kind: 'text'; text: string } | { kind: 'json'; json: string }
  /**
   * 正文（仅 kind=file 时使用）：文件落盘的同时把提取的正文文本（如 markdown）写入
   * text_content 列——"一资产一文件一正文"形态（网页收藏归档：html 文件 + md 正文），
   * 删除随资产行自动清理，预览渲染也优先取文件内容（见 renderAssetPreview）。
   */
  textContent?: string
  /** 附加元数据 JSON（来源链接/抓取时间等；与存储探测的元数据合并，本字段优先） */
  metadata?: Record<string, unknown>
  /** 来源类型/引用（工作流节点保存时注入 runId） */
  sourceType?: string
  sourceRef?: string
  /** 资产组名（套图：同一次来源内同名组自动归组；缺省不分组） */
  groupName?: string
}
