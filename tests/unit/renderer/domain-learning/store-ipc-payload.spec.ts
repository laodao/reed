// @vitest-environment happy-dom
/**
 * 领域学习 store：IPC 出站参数必须可结构化克隆（Vue 代理不得直接过 IPC）
 * @module tests/unit/renderer/domain-learning/store-ipc-payload
 *
 * 背景（2026-09-14 用户报错「An object could not be cloned.」）：
 * 确认弹窗的知识体系草稿、新建知识点表单都来自 Vue reactive，嵌套数组（prerequisites 等）
 * 读出来是 Proxy；`ipcRenderer.invoke` 的结构化克隆克隆不了 Proxy，整次确认/建点直接失败。
 * 这里用与 Electron 同款的假 IPC（出站参数一律过 structuredClone）把 store 的出站口逐个钉死：
 * 任何一处把 reactive 数据原样透传，测试就红。
 *
 * 2026-09-15 追加：讲义导出（exportLessonOf）的出站口——导出下拉的 el-dropdown command
 * 事件第二个参数是组件实例，被当成 cardId 透传后导出必炸（同一报错）。见文件末尾用例。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { useDomainLearningStore } from '@/stores/domain-learning'
import type { DlPlanSyllabus, DlPlanView } from '@shared/types/domain-learning.types'

const PLAN: DlPlanView = {
  spaceId: 'sp1',
  understanding: null,
  syllabus: {
    id: 'p2',
    step: 'syllabus',
    status: 'draft',
    revision: 1,
    feedback: null,
    updatedAt: null,
    payload: { branches: [{ name: '金融产品', concepts: [{ name: '债券', layer: 0, prerequisites: ['股票'] }] }] },
  },
  understandingConfirmed: true,
  syllabusConfirmed: false,
  confirmedConceptCount: 0,
}

const confirmCalls: Array<Record<string, unknown>> = []
const saveConceptCalls: Array<Record<string, unknown>> = []
const exportLessonCalls: Array<Record<string, unknown>> = []

/** 与 Electron ipcRenderer.invoke 同款：出站参数必须能结构化克隆 */
function ipcClone<T>(value: T): T {
  return structuredClone(value)
}

/** 冒充 Element Plus dropdown command 事件带进来的 ElDropdownItem 组件实例（含函数 + 循环引用） */
function fakeComponentInstance(): Record<string, unknown> {
  const inst: Record<string, unknown> = { uid: 42, type: { name: 'ElDropdownItem' }, render: () => null }
  inst.parent = inst
  return inst
}

function installFakeApi(plan: DlPlanView = PLAN): void {
  confirmCalls.length = 0
  saveConceptCalls.length = 0
  exportLessonCalls.length = 0
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    domainLearning: {
      confirmPlan: async (p: Record<string, unknown>) => {
        confirmCalls.push(ipcClone(p))
        return { success: true, data: { message: '已确认' } }
      },
      getPlan: async () => ({ success: true, data: plan }),
      saveConcept: async (p: Record<string, unknown>) => {
        saveConceptCalls.push(ipcClone(p))
        return { success: true, data: { conceptId: 'c1', created: true, linkedPrereqs: [], missingPrereqs: [] } }
      },
      exportLesson: async (p: Record<string, unknown>) => {
        exportLessonCalls.push(ipcClone(p))
        return {
          success: true,
          data: {
            format: 'md',
            filename: '金融理财-股票-讲义-v1.md',
            mime: 'text/markdown;charset=utf-8',
            conceptId: 'c1',
            conceptName: '股票',
            spaceName: '金融理财',
            version: 1,
            markdown: '# 股票\n',
          },
        }
      },
      getSpaceView: async () => ({ success: true, data: null }),
    },
  }
}

describe('domain-learning store：IPC 出站参数纯化', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    installFakeApi()
  })

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
  })

  it('confirmPlan：reactive 载荷（含前置数组）出站前纯化 → 结构化克隆不报错、确认真的送达', async () => {
    const store = useDomainLearningStore()
    // 最坏情形：整份载荷都是 reactive（嵌套 prerequisites 数组是 Proxy）
    const payload = reactive<DlPlanSyllabus>({
      branches: [{ name: '金融产品', definitionShort: '各类金融工具', concepts: [{ name: '债券', layer: 0, prerequisites: ['股票'] }] }],
    })

    const r = await store.confirmPlan({ id: 'sp1', step: 'syllabus', payload })

    expect(r.ok).toBe(true)
    expect(confirmCalls).toHaveLength(1)
    const sent = confirmCalls[0].payload as DlPlanSyllabus
    expect(sent.branches[0].concepts[0].prerequisites).toEqual(['股票'])
    expect(store.plan?.syllabus?.id).toBe('p2') // 确认后拉回了最新方案
  })

  it('createConceptOf：reactive 前置数组出站前纯化 → 结构化克隆不报错、建点真的送达', async () => {
    const store = useDomainLearningStore()
    // 与空间页新建知识点表单同形：conceptDraft 是 reactive，prerequisites 绑定 el-select multiple
    const conceptDraft = reactive({
      name: '导数与链式法则',
      nodeType: 'concept',
      parentId: null as string | null,
      definitionShort: '复合函数求导的基本法则',
      prerequisites: ['极限'],
    })

    const r = await store.createConceptOf({
      id: 'sp1',
      name: conceptDraft.name.trim(),
      nodeType: conceptDraft.nodeType,
      parentId: conceptDraft.parentId,
      definitionShort: conceptDraft.definitionShort.trim() || null,
      prerequisites: conceptDraft.prerequisites,
    })

    expect(r).toBeTruthy()
    expect(saveConceptCalls).toHaveLength(1)
    expect(saveConceptCalls[0].prerequisites).toEqual(['极限'])
  })
})

describe('domain-learning store：讲义导出（exportLessonOf）出站参数', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    installFakeApi()
  })

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
  })

  it('cardId 混进组件实例（el-dropdown command 事件第 2 参）→ 归一为 null，导出照常送达', async () => {
    const store = useDomainLearningStore()

    // 与真机一致：handleExportLesson(format, 组件实例)
    const r = await store.exportLessonOf({
      spaceId: 'sp1',
      conceptId: 'c1',
      format: 'md',
      cardId: fakeComponentInstance() as unknown as string,
    })

    expect(r?.format).toBe('md')
    expect(exportLessonCalls).toHaveLength(1)
    expect(exportLessonCalls[0]).toEqual({ id: 'sp1', conceptId: 'c1', format: 'md', cardId: null })
    expect(store.error).toBeNull()
  })

  it('字符串 cardId（版本抽屉「导出该版」）原样透传', async () => {
    const store = useDomainLearningStore()

    await store.exportLessonOf({ spaceId: 'sp1', conceptId: 'c1', format: 'pdf', cardId: 'card-v2' })

    expect(exportLessonCalls[0]).toEqual({ id: 'sp1', conceptId: 'c1', format: 'pdf', cardId: 'card-v2' })
  })

  it('非法格式：不发 IPC，给出可读错误（不当成图片渲染）', async () => {
    const store = useDomainLearningStore()

    const r = await store.exportLessonOf({
      spaceId: 'sp1',
      conceptId: 'c1',
      format: 'docx' as never,
    })

    expect(r).toBeNull()
    expect(exportLessonCalls).toHaveLength(0)
    expect(store.error).toContain('不支持的导出格式')
  })

  it('缺少知识点标识：不发 IPC、明确报错', async () => {
    const store = useDomainLearningStore()

    const r = await store.exportLessonOf({ spaceId: 'sp1', conceptId: '', format: 'md' })

    expect(r).toBeNull()
    expect(exportLessonCalls).toHaveLength(0)
    expect(store.error).toContain('知识点')
  })

  it('成功后 error 复位：上一次的失败文案不会残留在 UI 上', async () => {
    const store = useDomainLearningStore()

    await store.exportLessonOf({ spaceId: 'sp1', conceptId: '', format: 'md' })
    expect(store.error).not.toBeNull()

    const r = await store.exportLessonOf({ spaceId: 'sp1', conceptId: 'c1', format: 'md' })
    expect(r).toBeTruthy()
    expect(store.error).toBeNull()
  })
})
