/**
 * 当前登录用户 store（Web 端使用，Electron 端永远为 null）
 * @module stores/user
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface CurrentUser {
  id: string
  email: string
  displayName?: string | null
  role?: string | null
}

export const useUserStore = defineStore('user', () => {
  const user = ref<CurrentUser | null>(null)

  function setUser(u: CurrentUser | null): void {
    user.value = u
  }

  function clear(): void {
    user.value = null
  }

  return { user, setUser, clear }
})
