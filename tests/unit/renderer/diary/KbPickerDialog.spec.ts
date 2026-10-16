// @vitest-environment happy-dom
/**
 * KbPickerDialog 组件单测
 *
 * 覆盖 4 个核心场景：
 * 1. 空态显示 + 跳转到知识库页
 * 2. 加载失败显示错误信息
 * 3. 选中 KB 后确定 → 调用正确 IPC 入参 + emit imported
 * 4. isUpdate=true 时 emit 携带正确 flag
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import KbPickerDialog from '@/components/diary/KbPickerDialog.vue'

// mock vue-router
const push = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

// mock ElMessage，防止 happy-dom 环境里缺少实现
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return {
    ...actual,
    ElMessage: Object.assign(vi.fn(), {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    }),
  }
})

// ---- 辅助函数 ----

function setupMockApi(
  list: { success: boolean; data?: any[]; error?: string },
  add?: { success: boolean; data?: { doc: any; isUpdate: boolean }; error?: string },
) {
  ;(window as any).electronAPI = {
    knowledgeBase: {
      list: vi.fn().mockResolvedValue(list),
      addDocument: vi.fn().mockResolvedValue(
        add ?? { success: true, data: { doc: {}, isUpdate: false } },
      ),
    },
  }
}

/**
 * 挂载对话框：先以 modelValue=false 挂载，再 setProps(true) 触发 watch 内的 loadKbs。
 * el-dialog 组件的 watch 不带 immediate，必须经由 prop 变化才会调用 loadKbs。
 */
async function openDialog(extraProps: Record<string, unknown> = {}) {
  const wrapper = mount(KbPickerDialog, {
    props: { modelValue: false, entryId: 'e1', title: 't', content: 'c', ...extraProps },
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  return wrapper
}

// ---- 测试套件 ----

describe('KbPickerDialog', () => {
  beforeEach(() => {
    push.mockClear()
  })

  afterEach(() => {
    // 清理挂载到 body 的 DOM，防止用例间 DOM 污染
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild)
    }
  })

  it('列表为空时显示空态 + 去新建知识库按钮跳转', async () => {
    setupMockApi({ success: true, data: [] })
    const wrapper = await openDialog()

    expect(wrapper.text()).toContain('还没有知识库')
    expect(wrapper.text()).toContain('去新建知识库')

    // 找到"去新建知识库"按钮并点击
    const btn = Array.from(document.body.querySelectorAll('button')).find(
      b => b.textContent?.includes('去新建知识库'),
    )
    expect(btn).toBeTruthy()
    btn!.click()
    await flushPromises()

    expect(push).toHaveBeenCalledWith('/knowledge-base')

    wrapper.unmount()
  })

  it('列表加载失败时显示错误信息', async () => {
    setupMockApi({ success: false, error: '网络错误' })
    const wrapper = await openDialog()

    // el-alert 的 title 渲染在文本中
    expect(wrapper.text()).toContain('网络错误')

    wrapper.unmount()
  })

  it('选中 KB 后确定 → 调用正确 IPC 入参，并 emit imported', async () => {
    setupMockApi(
      {
        success: true,
        data: [
          { id: 'kb-1', name: 'K1', documentCount: 0, embeddingModel: 'm' } as any,
        ],
      },
      { success: true, data: { doc: {}, isUpdate: false } },
    )
    const wrapper = await openDialog({
      entryId: 'entry-1',
      title: '日记',
      content: '内容',
    })

    // 点击 el-radio label 选中（el-radio 渲染为 <label>，点击会触发 v-model 更新）
    const radioEl = document.body.querySelector('.el-radio') as HTMLElement
    expect(radioEl).toBeTruthy()
    radioEl.click()
    await flushPromises()

    // 找到已启用的"确定"按钮
    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find(
      b => b.textContent?.trim() === '确定' && !b.disabled,
    )
    expect(confirmBtn).toBeTruthy()
    confirmBtn!.click()
    await flushPromises()

    const api = (window as any).electronAPI.knowledgeBase
    expect(api.addDocument).toHaveBeenCalledWith('kb-1', {
      name: '日记',
      type: 'text',
      content: '内容',
      source: { type: 'diary', id: 'entry-1' },
    })

    expect(wrapper.emitted('imported')?.[0]).toEqual([{ kbId: 'kb-1', isUpdate: false }])

    wrapper.unmount()
  })

  it('isUpdate=true 时 emit 也携带正确 flag', async () => {
    setupMockApi(
      {
        success: true,
        data: [
          { id: 'kb-1', name: 'K1', documentCount: 0, embeddingModel: 'm' } as any,
        ],
      },
      { success: true, data: { doc: {}, isUpdate: true } },
    )
    const wrapper = await openDialog()

    const radioEl = document.body.querySelector('.el-radio') as HTMLElement
    radioEl.click()
    await flushPromises()

    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find(
      b => b.textContent?.trim() === '确定' && !b.disabled,
    )
    confirmBtn!.click()
    await flushPromises()

    expect(wrapper.emitted('imported')?.[0]).toEqual([{ kbId: 'kb-1', isUpdate: true }])

    wrapper.unmount()
  })
})
