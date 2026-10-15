// @vitest-environment happy-dom
/**
 * 应用列表页挂载测试（重构：卡片网格 + 卡片直接启动；发布入口已迁移到工作流编辑器）
 * 注：不实例化 ElementPlus（@popperjs 在 vitest 下命名导出异常）——shallowMount + stubs 验证逻辑层。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// 拦截 element-plus 主入口：不真实加载（其 @popperjs 在 vitest 下命名导出异常）
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn(async () => true) },
}))
import { shallowMount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppList from '@/views/app/AppList.vue'

function mockApi(apps: any[]) {
  ;(window as never as { electronAPI: any }).electronAPI = {
    app: {
      list: vi.fn(async () => ({ success: true, data: { items: apps, total: apps.length } })),
      delete: vi.fn(async () => ({ success: true })),
    },
    appSession: {
      create: vi.fn(async () => ({ success: true, data: { id: 'session_new' } })),
    },
  }
}

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [{ path: '/apps', component: AppList }] })
}

/** el-* 轻量 stub（避开 ElementPlus 完整实例化） */
const stubs = {
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-pagination': { template: '<div />' },
}

describe('AppList 应用列表页（卡片化）', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('渲染应用卡片（名称/来源版本/渠道点/会话数）', async () => {
    mockApi([
      { id: 'a1', name: '每日早间新闻', sourceVersion: 3, channelSession: 1, channelShare: 1, channelApi: 0, enabled: 1, sessionCount: 2 },
      { id: 'a2', name: '文档翻译', sourceVersion: 1, channelSession: 0, channelShare: 0, channelApi: 1, enabled: 1, sessionCount: 0 },
    ])
    const wrapper = shallowMount(AppList, { global: { plugins: [makeRouter()], stubs } })
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.apps).toHaveLength(2)
    expect(vm.apps[0]).toMatchObject({ name: '每日早间新闻', sourceVersion: 3, channelSession: 1, channelShare: 1, channelApi: 0, sessionCount: 2 })
    expect((window as any).electronAPI.app.list).toHaveBeenCalled()
  })

  it('卡片直接启动：创建会话并跳转会话页', async () => {
    mockApi([{ id: 'a1', name: '每日早间新闻', sourceVersion: 1, channelSession: 1, channelShare: 0, channelApi: 0, enabled: 1, sessionCount: 0 }])
    const router = makeRouter()
    const wrapper = shallowMount(AppList, { global: { plugins: [router], stubs } })
    await flushPromises()
    await (wrapper.vm as any).launch((wrapper.vm as any).apps[0])
    expect((window as any).electronAPI.appSession.create).toHaveBeenCalledWith({ appId: 'a1' })
    expect(router.currentRoute.value.fullPath).toBe('/apps/a1/session/session_new')
  })

  it('未开启会话渠道的应用：启动提示而非创建会话', async () => {
    mockApi([{ id: 'a2', name: '仅API应用', sourceVersion: 1, channelSession: 0, channelShare: 0, channelApi: 1, enabled: 1, sessionCount: 0 }])
    const wrapper = shallowMount(AppList, { global: { plugins: [makeRouter()], stubs } })
    await flushPromises()
    await (wrapper.vm as any).launch((wrapper.vm as any).apps[0])
    expect((window as any).electronAPI.appSession.create).not.toHaveBeenCalled()
  })
})
