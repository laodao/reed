/**
 * 章法工作流 runner 测试（W1.1/W1.2 参数贯通与图升级）
 * mock workflow-boot 的 definitionService/runService，验证：
 * 新建定义即发布、存量 v1 图（无 targetWords/eventId 输入）就地升级、v3 图不重复升级、
 * startRun inputs 携带生成参数与 eventId（取消锚点）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const defs = new Map<string, any>()
  return {
    defs,
    calls: {
      create: [] as any[],
      saveDraft: [] as any[],
      publish: [] as string[],
      update: [] as any[],
      startRun: [] as any[],
    },
  }
})

vi.mock('@core/platform/workflow/workflow-boot', () => ({
  getWorkflowSubsystem: () => ({
    definitionService: {
      list: async (params: { keyword: string }) => ({
        items: [...h.defs.values()].filter((d) => d.name === params.keyword),
      }),
      getById: async (id: string) => h.defs.get(id) ?? null,
      create: vi.fn(async (input: any) => {
        h.calls.create.push(input)
        const d = { id: 'def_new', publishedVersion: 0, ...input }
        h.defs.set(d.id, d)
        return d
      }),
      update: vi.fn(async (id: string, patch: any) => {
        h.calls.update.push([id, patch])
        Object.assign(h.defs.get(id), patch)
        return h.defs.get(id)
      }),
      saveDraft: vi.fn(async (id: string, graph: any) => {
        h.calls.saveDraft.push(graph)
        h.defs.get(id).draftGraph = graph
        return h.defs.get(id)
      }),
      publish: vi.fn(async (id: string) => {
        h.calls.publish.push(id)
        return { success: true }
      }),
    },
    runService: {
      startRun: vi.fn(async (o: any) => {
        h.calls.startRun.push(o)
        return { id: 'run_1' }
      }),
    },
  }),
}))

vi.mock('@core/utils/logger', () => ({ createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }) }))

import { ensureChapterWritingWorkflowRun } from '@core/packs/longwriting/services/chapter-workflow-runner'

function startInputsOf(def: any): Array<{ key?: string }> {
  return def?.draftGraph?.nodes?.find((n: any) => n.id === 'start')?.config?.inputs ?? []
}

beforeEach(() => {
  h.defs.clear()
  h.calls.create.length = 0
  h.calls.saveDraft.length = 0
  h.calls.publish.length = 0
  h.calls.update.length = 0
  h.calls.startRun.length = 0
})

describe('ensureChapterWritingWorkflowRun（W1.1/W1.2）', () => {
  it('无定义：创建 + 发布，start inputs 含 eventId/targetWords/style/extraPrompt', async () => {
    const r = await ensureChapterWritingWorkflowRun('p1', 'o1', false, { targetWords: 5000, style: 'light', extraPrompt: '多写雪' }, 'ev-1')
    expect(r.runId).toBe('run_1')
    expect(h.calls.create).toHaveLength(1)
    expect(h.calls.publish).toEqual(['def_new'])
    const inputs = startInputsOf(h.defs.get('def_new')).map((i) => i.key)
    expect(inputs).toContain('targetWords')
    expect(inputs).toContain('eventId')
    // 生成参数与取消锚点随 run 输入进入节点
    expect(h.calls.startRun[0].inputs).toMatchObject({
      projectId: 'p1',
      outlineId: 'o1',
      overwrite: false,
      eventId: 'ev-1',
      targetWords: 5000,
      style: 'light',
      extraPrompt: '多写雪',
    })
  })

  it('存量 v1 图（无 targetWords/eventId 输入）→ 就地 saveDraft+publish 升级', async () => {
    h.defs.set('def_old', {
      id: 'def_old',
      name: '章节写作章法',
      internal: true,
      draftGraph: {
        version: 1,
        nodes: [
          { id: 'start', config: { inputs: [{ key: 'projectId' }, { key: 'outlineId' }, { key: 'overwrite' }] } },
          { id: 'write', config: { targetWords: 2500 } },
        ],
        edges: [],
      },
    })
    await ensureChapterWritingWorkflowRun('p1', 'o1', false, { targetWords: 8000 }, 'ev-2')
    expect(h.calls.saveDraft).toHaveLength(1)
    expect(h.calls.publish).toEqual(['def_old'])
    // 升级后 start inputs 具备新参数；旧节点的硬编码 2500 图被替换
    const inputs = startInputsOf(h.defs.get('def_old')).map((i) => i.key)
    expect(inputs).toContain('targetWords')
    expect(inputs).toContain('eventId')
    expect(h.calls.startRun[0].inputs.targetWords).toBe(8000)
  })

  it('已是 v3 图 → 不重复升级，参数照常透传', async () => {
    h.defs.set('def_v3', {
      id: 'def_v3',
      name: '章节写作章法',
      internal: true,
      draftGraph: {
        version: 1,
        nodes: [
          { id: 'start', config: { inputs: [{ key: 'projectId' }, { key: 'outlineId' }, { key: 'overwrite' }, { key: 'eventId' }, { key: 'targetWords' }, { key: 'style' }, { key: 'extraPrompt' }] } },
          { id: 'write', config: {} },
        ],
        edges: [],
      },
    })
    await ensureChapterWritingWorkflowRun('p1', 'o1', true)
    expect(h.calls.saveDraft).toHaveLength(0)
    expect(h.calls.publish).toHaveLength(0)
    expect(h.calls.startRun[0].inputs.overwrite).toBe(true)
    expect(h.calls.startRun[0].inputs.targetWords).toBeUndefined()
  })

  it('不传生成参数时 inputs 不含对应键（undefined 不入 inputs）', async () => {
    await ensureChapterWritingWorkflowRun('p1', 'o1', false)
    expect(h.calls.startRun[0].inputs).toEqual({ projectId: 'p1', outlineId: 'o1', overwrite: false })
  })
})
