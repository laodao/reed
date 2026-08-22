/**
 * 工具模块类型与常量（P0 片1：第三方 API 工具）
 * @module shared/types/tool.types
 * @description 凭据库（SecureStorage 加密）+ 自定义工具封装 + 预设工具。
 *              常量与类型双端同源（core 执行与前端面板共用）。
 */

/** 工具鉴权方式：none=无 / credential=引用凭据（Bearer 注入） / header=请求头手填 */
export const TOOL_AUTH_TYPES = {
  none: 'none',
  credential: 'credential',
  header: 'header',
} as const
export type ToolAuthType = (typeof TOOL_AUTH_TYPES)[keyof typeof TOOL_AUTH_TYPES]

/** 第三方凭据（tool_credentials 表字段同名直出） */
export interface ToolCredential {
  id: string
  name: string
  /** 密文（SecureStorage 加密后入库；绝不明文落库） */
  apiKeyEnc: string
  baseUrl: string | null
  createdAt: Date | null
  updatedAt: Date | null
}

/** 工具参数 schema 字段（表单渲染 + 参数映射共用） */
export interface ToolParamField {
  key: string
  label?: string
  type?: 'string' | 'number' | 'boolean' | 'json' | 'select'
  required?: boolean
  options?: Array<{ label: string; value: string | number }>
  default?: unknown
}

/** 自定义工具（custom_tools 表字段同名直出） */
export interface CustomTool {
  id: string
  name: string
  description: string | null
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string
  /** 请求头（value 支持 {{param}} 与 {{credential}} 占位） */
  headers: Array<{ key: string; value: string }>
  /** 参数 schema（编辑器生成参数表单 + 执行时映射 path/query/body） */
  paramsSchema: ToolParamField[]
  authType: ToolAuthType
  credentialId: string | null
  createdAt: Date | null
  updatedAt: Date | null
}

/** 预设工具（内置资产，只读）：结构同 CustomTool + 分类 */
export interface PresetTool extends Omit<CustomTool, 'id'> {
  id: string
  category: string
}
