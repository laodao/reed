/**
 * 回退保留 · 批建字数校验 · handler 单测（纯 mock，不依赖 better-sqlite3）
 * @module tests/unit/packs/episode-production/batch-create-char-limit.handler
 *
 * 覆盖 ep:batch-create-episodes 的字数校验（与单建 handleCreateEpisode 同口径：
 * 单集内容 ≤15000 字，先整体校验再落库）——原通道无校验，超长无结构文可经批建
 * 落库单集，绕过单建上限。
 *
 * 注：自升级回退保留手工摘取（源自 4deca1ca 的批建校验部分），不含任何
 * 导入体检（analyze/noChapterFallbackRejection）相关内容。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- mock：IPC 桥 + 数据库管理器（handler 内部才触库，拒绝路径不触库） ----
vi.mock('@core/ipc/bridge-adapter', () => ({
  ipcBridge: { handle: vi.fn(), removeHandler: vi.fn() },
}))

const getEpisodesByProjectMock = vi.fn()
const createEpisodeMock = vi.fn()

vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => ({
    videoEpisodes: {
      getByProjectId: getEpisodesByProjectMock,
      create: createEpisodeMock,
    },
  }),
}))

/** 注册 handler 并取回 ep:batch-create-episodes 的处理函数 */
async function getBatchHandler(): Promise<(...args: any[]) => Promise<any>> {
  await import('@core/packs/episode-production/handlers/episode.handler')
  const { registerEpisodeHandlers } = await import(
    '@core/packs/episode-production/handlers/episode.handler'
  )
  registerEpisodeHandlers()
  const { ipcBridge } = await import('@core/ipc/bridge-adapter')
  const calls = (ipcBridge.handle as ReturnType<typeof vi.fn>).mock
    .calls as Array<[string, (...args: any[]) => Promise<any>]>
  const entry = calls.find(([ch]) => ch === 'ep:batch-create-episodes')
  expect(entry, 'ep:batch-create-episodes 应已注册').toBeTruthy()
  return entry![1]
}

/** 生成指定字数的普通文本（不含任何章节标记） */
function plainText(chars: number): string {
  const unit = '这是一段没有章节标记的普通叙述文字，讲述主角的日常。'
  const repeats = Math.ceil(chars / unit.length)
  return unit.repeat(repeats).slice(0, chars)
}

describe('ep:batch-create-episodes 字数校验（回退保留）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getEpisodesByProjectMock.mockResolvedValue([])
    createEpisodeMock.mockImplementation(async (data: any) => ({
      id: `ve_${Math.random().toString(36).slice(2, 8)}`,
      ...data,
    }))
  })

  it('批建超限拒绝：15001 字候选 → success=false，不落库', async () => {
    const handler = await getBatchHandler()
    const res = await handler({}, {
      projectId: 'vp_1',
      episodes: [
        { title: '第一集', content: plainText(15001) },
      ],
    })
    expect(res.success).toBe(false)
    expect(res.error).toContain('字数超出限制')
    expect(res.error).toContain('15001')
    expect(createEpisodeMock).not.toHaveBeenCalled()
  })

  it('多条候选时任一超限整体拒绝（先校验后落库）', async () => {
    const handler = await getBatchHandler()
    const res = await handler({}, {
      projectId: 'vp_1',
      episodes: [
        { title: '第一集', content: plainText(100) },
        { title: '第二集', content: plainText(20000) },
      ],
    })
    expect(res.success).toBe(false)
    expect(res.error).toContain('第二集')
    expect(createEpisodeMock).not.toHaveBeenCalled()
  })

  it('边界内（15000 字，与单建上限一致）正常创建', async () => {
    const handler = await getBatchHandler()
    const res = await handler({}, {
      projectId: 'vp_1',
      episodes: [{ title: '第一集', content: plainText(15000) }],
    })
    expect(res.success).toBe(true)
    expect(res.data.created).toBe(1)
    expect(createEpisodeMock).toHaveBeenCalledTimes(1)
  })
})
