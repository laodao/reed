/**
 * 角色相关类型定义
 * @module types/role.types
 */

/**
 * 内置角色定义
 */
export interface BuiltinRoleDefinition {
  id: string
  name: string
  description: string
  systemPrompt: string
  avatar: string
}

/**
 * 内置角色列表
 */
export const BUILTIN_ROLES: BuiltinRoleDefinition[] = [
  {
    id: 'default-assistant',
    name: '默认助手',
    description: '对话首页创建对话时的默认助手',
    systemPrompt: '你是一个智能助手，能够帮助用户解答各种问题，提供专业、准确、有建设性的回答。',
    avatar: '💬'
  },
  {
    id: 'assistant',
    name: '智能助手',
    description: '通用 AI 助手，可以回答各种问题',
    systemPrompt: '你是一个智能助手，能够帮助用户解答各种问题，提供专业、准确、有建设性的回答。',
    avatar: '🤖'
  },
  {
    id: 'translator',
    name: '翻译专家',
    description: '专业的多语言翻译助手',
    systemPrompt: '你是一个专业的翻译专家，精通多种语言，能够准确、流畅地进行翻译，保持原文的语义和风格。',
    avatar: '🌐'
  },
  {
    id: 'coder',
    name: '编程助手',
    description: '专业的编程和代码助手',
    systemPrompt: '你是一个专业的编程助手，精通多种编程语言和框架，能够帮助用户解决编程问题、编写代码、调试错误，并提供最佳实践建议。',
    avatar: '💻'
  },
  {
    id: 'writer',
    name: '写作助手',
    description: '文字创作和润色专家',
    systemPrompt: '你是一个专业的写作助手，擅长各类文体创作，能够帮助用户进行文章写作、文案润色、创意构思等工作。',
    avatar: '✍️'
  },
  {
    id: 'teacher',
    name: '学习导师',
    description: '教育和学习辅导专家',
    systemPrompt: '你是一个耐心的学习导师，擅长用通俗易懂的方式解释复杂概念，能够根据学生的水平调整教学方式，帮助用户更好地学习和理解知识。',
    avatar: '📚'
  }
]

/**
 * 角色
 */
export interface Role {
  id: string
  name: string
  description?: string
  systemPrompt?: string
  avatar?: string
  isBuiltin?: boolean

  // 模型配置
  defaultModelId?: string          // 默认模型 ID
  defaultProviderConfigId?: string // 默认提供商配置 ID
  autoResetModel?: boolean         // 新话题是否重置模型（默认 true）

  // 生成参数
  temperature?: number             // 温度 (0-2)
  topP?: number                    // Top P (0-1)
  maxContextMessages?: number      // 上下文消息数量
  maxTokens?: number               // 最大输出 Token
  enableStream?: boolean           // 是否流式输出（默认 true）
  customParams?: Record<string, unknown>  // 自定义参数

  // 知识库配置
  knowledgeBaseIds?: string[]      // 关联的知识库 ID 列表
  knowledgeRetrieveCount?: number  // 检索数量（默认 5）
  knowledgeThreshold?: number      // 检索阈值（0-1，默认 0.5）

  createdAt: Date
  updatedAt: Date
}

/**
 * 创建角色请求
 */
export interface CreateRoleRequest {
  name: string
  description?: string
  systemPrompt?: string
  avatar?: string
  // 模型配置
  defaultModelId?: string
  defaultProviderConfigId?: string
  autoResetModel?: boolean
  // 生成参数
  temperature?: number
  topP?: number
  maxContextMessages?: number
  maxTokens?: number
  enableStream?: boolean
  customParams?: Record<string, unknown>
  // 知识库配置
  knowledgeBaseIds?: string[]
  knowledgeRetrieveCount?: number
  knowledgeThreshold?: number
}

/**
 * 更新角色请求
 */
export interface UpdateRoleRequest {
  name?: string
  description?: string
  systemPrompt?: string
  avatar?: string
  // 模型配置
  defaultModelId?: string
  defaultProviderConfigId?: string
  autoResetModel?: boolean
  // 生成参数
  temperature?: number
  topP?: number
  maxContextMessages?: number
  maxTokens?: number
  enableStream?: boolean
  customParams?: Record<string, unknown>
  // 知识库配置
  knowledgeBaseIds?: string[]
  knowledgeRetrieveCount?: number
  knowledgeThreshold?: number
}

/**
 * 角色列表响应
 */
export interface ListRolesResponse {
  success: boolean
  roles: Role[]
}

/**
 * 获取角色响应
 */
export interface GetRoleResponse {
  success: boolean
  role?: Role
}

/**
 * 创建角色响应
 */
export interface CreateRoleResponse {
  success: boolean
  role?: Role
  error?: string
}
