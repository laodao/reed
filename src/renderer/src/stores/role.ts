/**
 * 角色状态管理
 * @module stores/role
 * @description 管理对话角色的状态
 */

import { ref, computed } from 'vue'
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
   * 加载中状态
   */
  const loading = ref(false)

  /**
   * 内置角色列表
   */
  const builtinRoles = computed(() => roles.value.filter(r => r.isBuiltin))

  /**
   * 自定义角色列表
   */
  const customRoles = computed(() => roles.value.filter(r => !r.isBuiltin))

  /**
   * 加载角色列表
   */
  async function loadRoles(): Promise<void> {
    loading.value = true
    try {
      const response = await window.electronAPI.role.list()
      if (response.success && response.roles) {
        roles.value = response.roles
      }
    } catch (error) {
      console.error('加载角色列表失败:', error)
    } finally {
      loading.value = false
    }
  }

  /**
   * 创建角色
   */
  async function createRole(request: CreateRoleRequest): Promise<Role | null> {
    try {
      const response = await window.electronAPI.role.create(request)
      if (response.success && response.role) {
        roles.value.push(response.role)
        return response.role
      }
      return null
    } catch (error) {
      console.error('创建角色失败:', error)
      return null
    }
  }

  /**
   * 更新角色
   */
  async function updateRole(id: string, request: UpdateRoleRequest): Promise<boolean> {
    try {
      const response = await window.electronAPI.role.update(id, request)
      if (response.success) {
        const index = roles.value.findIndex(r => r.id === id)
        if (index !== -1) {
          roles.value[index] = { ...roles.value[index], ...request }
        }
        return true
      }
      return false
    } catch (error) {
      console.error('更新角色失败:', error)
      return false
    }
  }

  /**
   * 获取角色关联的对话数量
   */
  async function getDialogCount(id: string): Promise<number> {
    try {
      const response = await window.electronAPI.role.getDialogCount(id)
      return response.success ? (response.count || 0) : 0
    } catch (error) {
      console.error('获取对话数量失败:', error)
      return 0
    }
  }

  /**
   * 删除角色
   * @returns 删除结果：{ success: boolean; dialogCount: number }
   */
  async function deleteRole(id: string): Promise<{ success: boolean; dialogCount: number }> {
    try {
      const response = await window.electronAPI.role.delete(id)
      if (response.success) {
        roles.value = roles.value.filter(r => r.id !== id)
        if (currentRole.value?.id === id) {
          currentRole.value = null
        }
        return { success: true, dialogCount: response.dialogCount || 0 }
      }
      return { success: false, dialogCount: 0 }
    } catch (error) {
      console.error('删除角色失败:', error)
      return { success: false, dialogCount: 0 }
    }
  }

  /**
   * 选择角色
   */
  function selectRole(role: Role | null): void {
    currentRole.value = role
  }

  /**
   * 根据ID获取角色
   */
  function getRoleById(id: string): Role | undefined {
    return roles.value.find(r => r.id === id)
  }

  return {
    // 状态
    roles,
    currentRole,
    loading,
    builtinRoles,
    customRoles,
    // 方法
    loadRoles,
    createRole,
    updateRole,
    deleteRole,
    getDialogCount,
    selectRole,
    getRoleById
  }
})
