// @vitest-environment happy-dom
/**
 * 应用分享页路由测试（片4）：/app-share/:token 注册并复用 WorkflowGuestRun
 * （后端 resolveShare 应用优先，数据面纯 REST 免登录——路由仅需托管即可）
 *
 * 二期包化（2026-09-05）后该路由由 app 业务包声明（renderer/packs/app），
 * 不再落在壳路由表——本测试改为直接断言包定义里的路由条目。
 */
import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { appPack } from '@/packs/app'
import { workflowPack } from '@/packs/workflow'

describe('应用分享页路由 /app-share/:token（app 业务包）', () => {
  it('路由已注册：指向 WorkflowGuestRun 组件 + guest meta（免登录）', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [...appPack.routes, ...workflowPack.routes],
    })
    const route = router.resolve('/app-share/abc123token')
    expect(route.name).toBe('AppShare')
    expect(route.meta.guest).toBe(true)
    expect(route.meta.title).toBe('应用运行')
    // 组件即 workflow 包的 WorkflowGuestRun（懒加载闭包源码含组件路径）
    const appShare = appPack.routes.find((r) => r.path === '/app-share/:token')
    expect(String(appShare?.component)).toContain('WorkflowGuestRun')
    const guest = workflowPack.routes.find((r) => r.path === '/workflow-run/:token')
    expect(String(guest?.component)).toContain('WorkflowGuestRun')
  })

  it('与 /workflow-run/:token 同构：参数名 token', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [...appPack.routes, ...workflowPack.routes],
    })
    const route = router.resolve('/app-share/someToken')
    expect(route.params.token).toBe('someToken')
  })

  it('app 包 manifest 声明 workflow 依赖（跨包视图引用方向合法）', () => {
    expect(appPack.manifest.dependencies).toEqual(['workflow'])
  })
})
