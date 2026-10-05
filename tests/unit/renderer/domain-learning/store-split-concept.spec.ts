// @vitest-environment happy-dom
/**
 * 领域学习 store：拆分知识点（splitConceptOf）出站契约
 * @module tests/unit/renderer/domain-learning/store-split-concept
 *
 * 背景（2026-10-05 用户需求）：庞杂知识点拆成一层的子知识点——出站 { id, conceptId,
 * branchName, children }，成功后刷新当前空间视图；失败置 error。与 Electron 同款假 IPC
 * （出站过 structuredClone）钉死。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { useDomainLearningStore } from '@/stores/domain-learning'

const splitCalls: Array<Record<string, unknown>> = []
const getSpaceViewCalls: string[] = []

function installFakeApi(): void {
  splitCalls.length = 0
  getSpaceViewCalls.length = 0
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    domainLearning: {
      splitConcept: async (p: Record<string, unknown>) => {
        splitCalls.push(structuredClone(p))
        return {
          success: true,
          data: {
            branchId: 'c-tf',
            branchName: 'Transformer 体系',
            children: [{ conceptId: 'k1', name: '编码器' }],
            removed: { cards: 1, notes: 0, questions: 0 },
            inheritedPrereqs: [{ name: '注意力', conceptId: 'c-attn' }],
            droppedRelations: 1,
          },
        }
      },
      getSpaceView: async (id: string) => {
        getSpaceViewCalls.push(id)
        // 返回带 id 的最小视图：让 currentSpaceView.id === id，"删/拆的是当前空间 → 刷新"分支可测
        return { success: true, data: { id, name: '任意主题' } }
      },
    },
  }
}

describe('domain-learning store：拆分知识点（splitConceptOf）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    installFakeApi()
  })

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
  })

  it('reactive 草稿出站前纯化 → 结构化克隆不报错；成功后刷新当前空间视图', async () => {
    const store = useDomainLearningStore()
    // 与拆分对话框同形：行编辑器是 reactive 数组
    const rows = reactive([{ name: '编码器', definitionShort: '' }])
    // 先装载当前空间视图（真实场景：空间页正开着），拆分成功后才会触发刷新
    await store.fetchSpaceView('sp1')
    expect(getSpaceViewCalls).toEqual(['sp1'])

    const r = await store.splitConceptOf({
      id: 'sp1',
      conceptId: 'c-tf',
      branchName: 'Transformer 体系',
      children: rows,
    })

    expect(r?.branchName).toBe('Transformer 体系')
    expect(r?.removed).toMatchObject({ cards: 1 })
    expect(splitCalls).toEqual([{
      id: 'sp1',
      conceptId: 'c-tf',
      branchName: 'Transformer 体系',
      children: [{ name: '编码器', definitionShort: '' }], // 空串归一为 null 在服务层做，store 只负责纯化
    }])
    expect(getSpaceViewCalls).toEqual(['sp1', 'sp1'])
    expect(store.error).toBeNull()
  })

  it('失败：置 error、返回 null', async () => {
    const store = useDomainLearningStore()
    ;(window as unknown as { electronAPI: { domainLearning: Record<string, unknown> } }).electronAPI.domainLearning.splitConcept =
      async () => ({ success: false, error: '子知识点名称重复：编码器' })
    const r = await store.splitConceptOf({ id: 'sp1', conceptId: 'c-tf', children: [{ name: '编码器' }] })
    expect(r).toBeNull()
    expect(store.error).toBe('子知识点名称重复：编码器')
  })
})
