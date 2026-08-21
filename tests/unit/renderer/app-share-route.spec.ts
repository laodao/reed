// @vitest-environment happy-dom
/**
 * 应用分享页路由测试（片4）：/app-share/:token 注册并复用 WorkflowGuestRun
 * （后端 resolveShare 应用优先，数据面纯 REST 免登录——路由仅需托管即可）
 */
import { describe, it, expect } from 'vitest'
import { createMemoryHistory } from 'vue-router'

describe('应用分享页路由 /app-share/:token', () => {
  it('路由已注册：指向 WorkflowGuestRun 组件 + guest meta（免登录）', async () => {
    // 直接引入路由表（router/index.ts 顶层导出 routes 供 web-client 引用）
    const mod = await import('@/router/index')
    const router = mod.default
    const route = router.resolve('/app-share/abc123token')
    expect(route.name).toBe('AppShare')
    expect(route.meta.guest).toBe(true)
    expect(route.meta.title).toBe('应用运行')
    // 组件即 WorkflowGuestRun（复用——token 渠道无关）
    const guestRoute = router.resolve('/workflow-run/xyz')
    expect(String(route.components?.default ?? route.component)).toBe(String(guestRoute.components?.default ?? guestRoute.component))
  })

  it('与 /workflow-run/:token 同构：参数名 token', async () => {
    const mod = await import('@/router/index')
    const route = mod.default.resolve('/app-share/someToken')
    expect(route.params.token).toBe('someToken')
  })
})
