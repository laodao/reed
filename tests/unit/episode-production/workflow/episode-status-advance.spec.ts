/**
 * Episode 状态推进原语单测（2026-09-16 P0-CM2）
 * 状态机空转修复：storyboarding/producing/composing/completed 写者的核心语义——
 * 只前进不回退、未知状态视为 pending、实体缺失安全返回。
 */
import { describe, expect, it, vi } from 'vitest'
import { advanceEpisodeStatus, advanceEpisodeStatusForStoryboard } from '@core/platform/episode-production/workflow/episode-status-advance'

function makeDs(ep: { id: string; status: string } | null) {
  const epRepo = {
    findOne: vi.fn(async () => ep),
    update: vi.fn(async () => undefined),
  }
  const sbRepo = {
    findOne: vi.fn(async () => ({ id: 'sb1', sceneScriptId: 'sc1' })),
  }
  const sceneRepo = {
    findOne: vi.fn(async () => ({ id: 'sc1', episodeScriptId: 'es1' })),
  }
  const scriptRepo = {
    findOne: vi.fn(async () => ({ id: 'es1', episodeId: 'ep1' })),
  }
  const ds = {
    getRepository: vi.fn((entity: { name?: string }) => {
      const name = entity?.name ?? ''
      if (name.includes('VideoEpisode')) return epRepo
      if (name.includes('Storyboard')) return sbRepo
      if (name.includes('SceneScript')) return sceneRepo
      return scriptRepo
    }),
  }
  return { ds, epRepo }
}

describe('advanceEpisodeStatus', () => {
  it('向前推进：scripting → storyboarding 写入', async () => {
    const { ds, epRepo } = makeDs({ id: 'ep1', status: 'scripting' })
    const changed = await advanceEpisodeStatus(ds as any, 'ep1', 'storyboarding')
    expect(changed).toBe(true)
    expect(epRepo.update).toHaveBeenCalledWith({ id: 'ep1' }, { status: 'storyboarding', updatedAt: expect.any(Date) })
  })

  it('只前进不回退：completed 时请求 storyboarding 拒绝写入', async () => {
    const { ds, epRepo } = makeDs({ id: 'ep1', status: 'completed' })
    const changed = await advanceEpisodeStatus(ds as any, 'ep1', 'storyboarding')
    expect(changed).toBe(false)
    expect(epRepo.update).not.toHaveBeenCalled()
  })

  it('同状态不重复写入', async () => {
    const { ds, epRepo } = makeDs({ id: 'ep1', status: 'producing' })
    expect(await advanceEpisodeStatus(ds as any, 'ep1', 'producing')).toBe(false)
    expect(epRepo.update).not.toHaveBeenCalled()
  })

  it('未知当前状态视为 pending（最弱），允许推进', async () => {
    const { ds, epRepo } = makeDs({ id: 'ep1', status: 'some_legacy_value' })
    expect(await advanceEpisodeStatus(ds as any, 'ep1', 'composing')).toBe(true)
    expect(epRepo.update).toHaveBeenCalled()
  })

  it('实体不存在安全返回 false', async () => {
    const { ds, epRepo } = makeDs(null)
    expect(await advanceEpisodeStatus(ds as any, 'ep-x', 'completed')).toBe(false)
    expect(epRepo.update).not.toHaveBeenCalled()
  })
})

describe('advanceEpisodeStatusForStoryboard（sb→scene→script→episode 链式解析）', () => {
  it('解析链完整时按 episodeId 推进', async () => {
    const { ds, epRepo } = makeDs({ id: 'ep1', status: 'storyboarding' })
    const changed = await advanceEpisodeStatusForStoryboard(ds as any, 'sb1', 'producing')
    expect(changed).toBe(true)
    expect(epRepo.update).toHaveBeenCalledWith({ id: 'ep1' }, { status: 'producing', updatedAt: expect.any(Date) })
  })
})
