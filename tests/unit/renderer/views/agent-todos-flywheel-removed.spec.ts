/**
 * @vitest-environment happy-dom
 *
 * 待办中心去掉「记忆审批」后的行为回归
 *
 * 背景：知识飞轮已于 2026-09 停用，但待办中心仍在加载时调用 `am:list-pending`，
 * 后者在飞轮未装配时返回失败，页面因此常驻弹出「知识飞轮已停用（2026-09 暂停；
 * 重开：AGENT_MEMORY_FLYWHEEL=on）」。停用功能的入口不该留在待办中心里。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AgentTodosView from '@/views/workflow/AgentTodosView.vue'

const push = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

function installApi() {
  const calls: string[] = []
  const resp = (data: unknown) => async () => { return { success: true, data } }
  const api = {
    getPendingReviews: vi.fn(async () => { calls.push('getPendingReviews'); return { success: true, data: [] } }),
    listTaskRoots: vi.fn(async () => { calls.push('listTaskRoots'); return { success: true, data: [] } }),
    getTaskTree: vi.fn(async () => { calls.push('getTaskTree'); return { success: true, data: { root: { id: 'r' }, nodes: [] } } }),
    // 飞轮通道：被调用即视为回归
    listMemoryPending: vi.fn(async () => { calls.push('listMemoryPending'); return { success: false, error: '知识飞轮已停用（2026-09 暂停；重开：AGENT_MEMORY_FLYWHEEL=on）' } }),
    listMemoryActive: vi.fn(async () => { calls.push('listMemoryActive'); return resp([])() }),
    listMemoryArchived: vi.fn(async () => { calls.push('listMemoryArchived'); return resp([])() }),
    approveMemory: vi.fn(async () => { calls.push('approveMemory'); return { success: true, data: {} } }),
    archiveMemory: vi.fn(async () => { calls.push('archiveMemory'); return { success: true, data: {} } }),
  }
  ;(globalThis as any).window = { ...(globalThis as any).window, electronAPI: { workflow: api } }
  return { api, calls }
}

async function mountView() {
  const wrapper = mount(AgentTodosView, {
    global: {
      // Element Plus 未在本用例里安装。el-tabs 渲染插槽以暴露页签文案；
      // 页签内容（表格列用了作用域插槽）不渲染——本用例只断言"接到哪些 IPC"与文案
      stubs: {
        'el-tabs': { template: '<div class="tabs-stub"><slot /></div>' },
        'el-tab-pane': { template: '<div class="tab-pane-stub" />' },
        'el-table': true,
        'el-table-column': true,
        'el-pagination': true,
        'el-button': true,
        'el-tag': true,
      },
    },
  })
  await nextTick()
  await nextTick()
  await new Promise((r) => setTimeout(r, 0))
  return wrapper
}

describe('待办中心：知识飞轮停用后的入口清理', () => {
  beforeEach(() => {
    push.mockClear()
  })

  it('加载时不再请求记忆审批通道', async () => {
    const { api, calls } = installApi()
    await mountView()

    expect(api.listMemoryPending).not.toHaveBeenCalled()
    expect(api.listMemoryActive).not.toHaveBeenCalled()
    expect(api.listMemoryArchived).not.toHaveBeenCalled()
    expect(calls).not.toContain('listMemoryPending')
  })

  it('只保留工作流审批与任务裁决两类待办查询', async () => {
    const { api } = installApi()
    await mountView()

    expect(api.getPendingReviews).toHaveBeenCalledTimes(1)
    expect(api.listTaskRoots).toHaveBeenCalledTimes(1)
  })

  it('页面上不出现「记忆审批」入口与停用提示', async () => {
    const { api } = installApi()
    const wrapper = await mountView()
    const text = wrapper.text()

    // 页签文案来自 el-tabs 替身渲染的插槽内容
    expect(text).toContain('工作流审批')
    expect(text).toContain('任务裁决')
    expect(text).not.toContain('记忆审批')
    expect(text).not.toContain('知识飞轮')
    void api
  })
})