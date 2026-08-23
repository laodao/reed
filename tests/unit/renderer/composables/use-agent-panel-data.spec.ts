/**
 * useAgentPanelData 面板聚合 单测
 * 覆盖：全量加载、分区刷新（只拉对应分区）、大纲+章节联动、生产状态。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAgentPanelData } from '../../../../src/renderer/src/composables/useAgentPanelData'

function makeApi(over: Record<string, unknown> = {}) {
  const api = {
    getStoryOverview: vi.fn(async () => ({ success: true, data: { id: 'ov1', title: '青云志' } })),
    getCharacters: vi.fn(async () => ({ success: true, data: [{ id: 'c1', name: '张三' }] })),
    getBackground: vi.fn(async () => ({ success: true, data: { id: 'bg1', eraDescription: '古代' } })),
    getLocations: vi.fn(async () => ({ success: true, data: [] })),
    getFactions: vi.fn(async () => ({ success: true, data: [] })),
    getSkills: vi.fn(async () => ({ success: true, data: [] })),
    getItems: vi.fn(async () => ({ success: true, data: [] })),
    getPlots: vi.fn(async () => ({ success: true, data: [{ id: 'p1', title: '拜师' }] })),
    getOutlineTree: vi.fn(async () => ({
      success: true,
      data: [
        { id: 'o1', name: '第一章', nodeType: 'chapter', orderIndex: 0 },
        { id: 'o2', name: '第二章', nodeType: 'chapter', orderIndex: 1 },
      ],
    })),
    getChaptersByOutlineIds: vi.fn(async () => ({ success: true, data: { o1: { id: 'ch1', content: 'x' } } })),
    agentState: vi.fn(async () => ({
      success: true,
      data: { overview: { exists: true }, characters: { count: 1 }, world: {}, plots: { count: 1 }, outline: { written: 1 }, chapters: { written: 1, totalWords: 10 } },
    })),
    ...over,
  }
  return api
}

describe('useAgentPanelData 面板聚合', () => {
  let api: ReturnType<typeof makeApi>

  beforeEach(() => {
    api = makeApi()
    vi.stubGlobal('window', { electronAPI: { longwriting: api } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('load 全量加载所有分区 + 生产状态', async () => {
    const panel = useAgentPanelData('p1')
    await panel.load()
    expect(panel.data.overview.title).toBe('青云志')
    expect(panel.data.characters[0].name).toBe('张三')
    expect(panel.data.background.eraDescription).toBe('古代')
    expect(panel.data.plots[0].title).toBe('拜师')
    expect(panel.data.outlineTree).toHaveLength(2)
    expect(panel.data.chaptersMap.o1).toBeTruthy()
    expect(panel.productionState.value.characters.count).toBe(1)
  })

  it('refresh 指定分区只拉对应接口', async () => {
    const panel = useAgentPanelData('p1')
    await panel.refresh(['characters'])
    expect(api.getCharacters).toHaveBeenCalled()
    expect(api.getStoryOverview).not.toHaveBeenCalled()
    expect(api.getPlots).not.toHaveBeenCalled()
    expect(api.agentState).toHaveBeenCalled() // 生产状态始终刷新
  })

  it('refresh world 分区拉 5 个世界接口', async () => {
    const panel = useAgentPanelData('p1')
    await panel.refresh(['world'])
    expect(api.getBackground).toHaveBeenCalled()
    expect(api.getLocations).toHaveBeenCalled()
    expect(api.getFactions).toHaveBeenCalled()
    expect(api.getSkills).toHaveBeenCalled()
    expect(api.getItems).toHaveBeenCalled()
    expect(api.getCharacters).not.toHaveBeenCalled()
  })

  it('大纲为空时 chaptersMap 置空（不调 getChaptersByOutlineIds）', async () => {
    const emptyApi = makeApi({ getOutlineTree: vi.fn(async () => ({ success: true, data: [] })) })
    vi.stubGlobal('window', { electronAPI: { longwriting: emptyApi } })
    const panel = useAgentPanelData('p1')
    await panel.refresh(['outline'])
    expect(emptyApi.getChaptersByOutlineIds).not.toHaveBeenCalled()
    expect(panel.data.chaptersMap).toEqual({})
  })
})
