/**
 * 设计包确认流单测（实跑修复回归）：
 * 1. lw_save_card 嵌套 payload（{taskTitle, card:{kind,title,data}}）正确解包到 persistByKind；
 * 2. 落库失败的条目保留在草稿包（旧实现一律移出，失败即丢数据）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { confirmDesignPackage } from '@core/packs/longwriting/story-room/room-design'
import { StoryRoomDistillerService } from '@core/packs/longwriting/story-room/room-distiller'
import type { DesignPackage } from '@shared/types/story-room.types'

function makeDb(pkg: DesignPackage) {
  const project = { id: 'p1', name: 't', type: 'story', wizardState: { room: { designPackages: [pkg] } } }
  return {
    lwProjects: {
      getById: vi.fn(async (id: string) => (id === 'p1' ? project : null)),
      update: vi.fn(async (_id: string, patch: { wizardState: any }) => {
        project.wizardState = patch.wizardState
        return project
      }),
    },
  }
}

function pkgWith(item: DesignPackage['items'][number]): DesignPackage {
  return { id: 'dp1', title: '故事核定稿', status: 'draft', items: [item], sourceTurn: 1, createdAt: 1 }
}

const STORY_CORE_ITEM = {
  id: 'it1',
  kind: 'card' as const,
  label: '卡片 · 故事核 · 《汴京查案录》',
  payload: {
    taskTitle: '故事核定稿',
    card: { kind: 'overview', title: '故事核 · 《汴京查案录》', data: { title: '汴京查案录', summary: '女捕快探案', coreConflict: '女子为吏 vs 残卷黑手' } },
  },
  note: '',
  createdAt: 1,
}

describe('confirmDesignPackage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('嵌套 card payload 正确解包：persistByKind 收到真实 kind 与 data', async () => {
    const db = makeDb(pkgWith(STORY_CORE_ITEM))
    const spy = vi.spyOn(StoryRoomDistillerService.getInstance(), 'persistByKind').mockResolvedValue({ ok: true, message: 'ok' } as never)
    const r = await confirmDesignPackage(db, 'p1', 'dp1')
    expect(r.ok).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
    const cardArg = spy.mock.calls[0][2] as any
    expect(cardArg.kind).toBe('overview')
    expect(cardArg.data.title).toBe('汴京查案录')
    expect(cardArg.data.coreConflict).toBe('女子为吏 vs 残卷黑手')
  })

  it('落库失败：条目保留在草稿包且包状态不变（不丢数据）', async () => {
    const db = makeDb(pkgWith(STORY_CORE_ITEM))
    vi.spyOn(StoryRoomDistillerService.getInstance(), 'persistByKind').mockResolvedValue({ ok: false, message: 'boom' } as never)
    const r = await confirmDesignPackage(db, 'p1', 'dp1', ['it1'])
    expect(r.ok).toBe(false)
    const pkg = db.lwProjects.getById.mock.results.length
      ? (await db.lwProjects.getById('p1')).wizardState.room.designPackages[0]
      : null
    expect(pkg.items).toHaveLength(1)
    expect(pkg.items[0].id).toBe('it1')
    expect(pkg.status).toBe('draft')
  })

  it('全部成功：整包确认后包转 confirmed', async () => {
    const db = makeDb(pkgWith(STORY_CORE_ITEM))
    vi.spyOn(StoryRoomDistillerService.getInstance(), 'persistByKind').mockResolvedValue({ ok: true, message: 'ok' } as never)
    await confirmDesignPackage(db, 'p1', 'dp1')
    const pkg = (await db.lwProjects.getById('p1')).wizardState.room.designPackages[0]
    expect(pkg.status).toBe('confirmed')
    expect(pkg.items).toHaveLength(0)
  })
})
