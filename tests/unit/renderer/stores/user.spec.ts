/**
 * user store 单测
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUserStore } from '../../../../src/renderer/src/stores/user'

describe('stores/user', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('初始 user 为 null', () => {
    const s = useUserStore()
    expect(s.user).toBeNull()
  })

  it('setUser 后能读到字段', () => {
    const s = useUserStore()
    s.setUser({ id: 'u1', email: 'a@b.com', displayName: 'Alice', role: 'user' })
    expect(s.user).not.toBeNull()
    expect(s.user!.id).toBe('u1')
    expect(s.user!.email).toBe('a@b.com')
    expect(s.user!.displayName).toBe('Alice')
  })

  it('setUser(null) 后回到 null', () => {
    const s = useUserStore()
    s.setUser({ id: 'u1', email: 'a@b.com' })
    s.setUser(null)
    expect(s.user).toBeNull()
  })

  it('clear 等价于 setUser(null)', () => {
    const s = useUserStore()
    s.setUser({ id: 'u1', email: 'a@b.com' })
    s.clear()
    expect(s.user).toBeNull()
  })
})
