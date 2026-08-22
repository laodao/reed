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
  /** 内置资产（全局共享、禁删禁改，允许复制为自有） */
  isBuiltin?: boolean
  createdAt: string
  updatedAt: string
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
  /** 来源类型/引用（工作流节点保存时注入 runId） */
  sourceType?: string
  sourceRef?: string
}
