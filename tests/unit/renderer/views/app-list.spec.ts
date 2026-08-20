// @vitest-environment happy-dom
/**
 * 应用列表页挂载测试（片3b）：渲染应用表格 + 渠道点 + 从工作流创建（mock electronAPI）
 * 注：不实例化 ElementPlus（@popperjs 在 vitest 下命名导出异常）——shallowMount + stubs 验证逻辑层。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// 拦截 element-plus 主入口：不真实加载（其 @popperjs 在 vitest 下命名导出异常）
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn(async () => true) },
}))
import { shallowMount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppList from '@/views/app/AppList.vue'

function mockApi(apps: any[], defs: any[]) {
  ;(window as never as { electronAPI: any }).electronAPI = {
    app: {
      list: vi.fn(async () => ({ success: true, data: { items: apps, total: apps.length } })),
      createFromWorkflow: vi.fn(async () => ({ success: true, data: { id: 'app_new' } })),
      delete: vi.fn(async () => ({ success: true })),
    },
    workflow: {
      listDefinitions: vi.fn(async () => ({ success: true, data: { items: defs, total: defs.length } })),
    },
  }
}

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [{ path: '/apps', component: AppList }] })
}

/** el-* 轻量 stub（避开 ElementPlus 完整实例化） */
const stubs = {
  'el-table': { template: '<div><slot /></div>', props: ['data'] },
  'el-table-column': { template: '<div />' },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-dialog': { template: '<div v-if="modelValue"><slot /></div>', props: ['modelValue'] },
  'el-select': { template: '<div><slot /></div>', props: ['modelValue'] },
  'el-option': { template: '<div />', props: ['label', 'value'] },
  'el-tag': { template: '<span><slot /></span>' },
}

describe('AppList 应用列表页', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('渲染应用卡片（名称/来源版本/渠道点/会话数）', async () => {
    mockApi([
      { id: 'a1', name: '每日早间新闻', sourceVersion: 3, channelSession: 1, channelShare: 1, channelApi: 0, enabled: 1, sessionCount: 2 },
      { id: 'a2', name: '文档翻译', sourceVersion: 1, channelSession: 0, channelShare: 0, channelApi: 1, enabled: 1, sessionCount: 0 },
    ], [])
    const wrapper = shallowMount(AppList, { global: { plugins: [makeRouter()], stubs } })
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.apps).toHaveLength(2)
    expect(vm.apps[0]).toMatchObject({ name: '每日早间新闻', sourceVersion: 3, channelSession: 1, channelShare: 1, channelApi: 0, sessionCount: 2 })
    expect((window as any).electronAPI.app.list).toHaveBeenCalled()
  })

  it('从工作流创建：仅已发布定义进选择器', async () => {
    mockApi([], [
      { id: 'd1', name: '已发布流', publishedVersion: 2 },
      { id: 'd2', name: '未发布流', publishedVersion: 0 },
    ])
    const wrapper = shallowMount(AppList, { global: { plugins: [makeRouter()], stubs } })
    await flushPromises()
    const vm = wrapper.vm as any
    const createBtn = wrapper.findAll('button').find(b => b.text().includes('从工作流创建'))
    expect(createBtn).toBeTruthy()
    await createBtn!.trigger('click')
    await flushPromises()
    expect(vm.createVisible).toBe(true)
    expect(vm.publishedDefs.map((d: any) => d.name)).toEqual(['已发布流'])  // 未发布被滤除
  })
})