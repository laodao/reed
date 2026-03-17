/**
 * 角色相关类型定义
 * @module types/role.types
 */

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
}

/**
 * 更新角色请求
 */
export interface UpdateRoleRequest {
  name?: string
  description?: string
  systemPrompt?: string
  avatar?: string
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
