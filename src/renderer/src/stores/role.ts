/**
 * 角色状态管理
 * @module stores/role
 * @description 管理对话角色的状态
 */

import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Role, CreateRoleRequest, UpdateRoleRequest } from '../../../shared/types'

/**
 * 使用角色 Store
 */
export const useRoleStore = defineStore('role', () => {
  /**
   * 角色列表
   */
  const roles = ref<Role[]>([])

  /**
   * 当前选中的角色
   */
  const currentRole = ref<Role | null>(null)

  /**
   * 加载角色列表
   * @returns Promise<void>
   * @description 从数据库加载所有角色
   */
  async function loadRoles(): Promise<void> {
    // TODO: 实现加载角色列表
    throw new Error('Not implemented')
  }

  /**
   * 创建角色
   * @param request - 创建请求
   * @returns Promise<Role>
   * @description 创建新的角色
   * 逻辑：
   * 1. 验证 name 和 systemPrompt 非空
   * 2. 调用 window.electronAPI.createRole(request)
   * 3. 添加到列表
   */
  async function createRole(request: CreateRoleRequest): Promise<Role> {
    // TODO: 实现创建角色
    throw new Error('Not implemented')
  }

  /**
   * 更新角色
   * @param id - 角色ID
   * @param request - 更新请求
   * @returns Promise<void>
   */
  async function updateRole(id: string, request: UpdateRoleRequest): Promise<void> {
    // TODO: 实现更新角色
    throw new Error('Not implemented')
  }

  /**
   * 删除角色
   * @param id - 角色ID
   * @returns Promise<void>
   */
  async function deleteRole(id: string): Promise<void> {
    // TODO: 实现删除角色
    throw new Error('Not implemented')
  }

  /**
   * 选择角色
   * @param role - 角色对象
   */
  function selectRole(role: Role | null): void {
    currentRole.value = role
  }

  /**
   * 增加使用次数
   * @param id - 角色ID
   */
  async function incrementUseCount(id: string): Promise<void> {
    // TODO: 实现增加使用次数
    throw new Error('Not implemented')
  }

  /**
   * 根据ID获取角色
   * @param id - 角色ID
   * @returns Role | undefined
   */
  function getRoleById(id: string): Role | undefined {
    return roles.value.find(r => r.id === id)
  }

  return {
    // 状态
    roles,
    currentRole,
    // 方法
    loadRoles,
    createRole,
    updateRole,
    deleteRole,
    selectRole,
    incrementUseCount,
    getRoleById
  }
})
