/**
 * StoryboardCogenService 模型解析单测（2026-09-18 「分镜生成」设置接线）
 *
 * - 项目只配 storyboardModel → cogen 用 storyboardModel（此前错用 scriptModel，
 *   设置里的「分镜生成」是死设置）
 * - storyboardModel 未配 → 回退 scriptModel
 * - 两者都未配 → 报错提示配置分镜生成模型
 *
 * LLM 调用（generateCogenForScene）整体 mock：捕获实参证明模型解析结果，
 * 并抛哨兵错误阻断后续 binding/写库链路（本 spec 不覆盖）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { SceneCharacterEntity } from '@core/database/entities/episode-production/scene-character.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { ImageAssetEntity } from '@core/database/entities/image-asset.entity'
import { StoryboardCogenService } from '@core/platform/episode-production/narrative/services/storyboard-cogen.service'

const SENTINEL = 'SENTINEL_LLM_STOP'
const generateCogenForScene = vi.fn()

vi.mock('@core/platform/episode-production/narrative/ai/storyboard-cogen', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@core/platform/episode-production/narrative/ai/storyboard-cogen')>()
  return {
    ...orig,
    generateCogenForScene: (...args: any[]) => generateCogenForScene(...args),
  }
})

const ENTITIES = [
  VideoProjectEntity,
  VideoEpisodeEntity,
  EpisodeScriptEntity,
  SceneScriptEntity,
  SceneCharacterEntity,
  StoryboardEntity,
  CharacterBindingEntity,
  LocationBindingEntity,
  ItemBindingEntity,
  AssetImageEntity,
  ImageAssetEntity,
]

let ds: DataSource

async function buildDb(): Promise<DataSource> {
  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: ENTITIES,
    synchronize: true,
  })
  await dataSource.initialize()
  return dataSource
}

async function seedEpisode(config: any): Promise<void> {
  const now = new Date()
  await ds.getRepository(VideoProjectEntity).save({
    id: 'vp1',
    name: 'demo',
    status: 'draft',
    config,
    createdAt: now,
    updatedAt: now,
  } as any)
  await ds.getRepository(VideoEpisodeEntity).save({
    id: 've1',
    projectId: 'vp1',
    episodeNumber: 1,
    title: '第一集',
    status: 'draft',
    scriptId: 'es1',
    createdAt: now,
    updatedAt: now,
  } as any)
  await ds.getRepository(EpisodeScriptEntity).save({
    id: 'es1',
    projectId: 'vp1',
    episodeId: 've1',
    title: '剧本',
    createdAt: now,
    updatedAt: now,
  } as any)
  await ds.getRepository(SceneScriptEntity).save({
    id: 'ss1',
    episodeScriptId: 'es1',
    sceneNumber: 1,
    location: '忘川渡船',
    sceneDescription: '忘川渡船船舱，烛火微弱',
    createdAt: now,
    updatedAt: now,
  } as any)
}

beforeEach(async () => {
  ds = await buildDb()
  generateCogenForScene.mockReset().mockRejectedValue(new Error(SENTINEL))
})

afterEach(async () => {
  await ds.destroy()
})

describe('StoryboardCogenService · 分镜生成模型解析', () => {
  it('只配 storyboardModel → LLM 调用收到 storyboardModel', async () => {
    await seedEpisode({
      storyboardModel: { providerConfigId: 'pc_sb', modelId: 'm_sb' },
    })
    const svc = new StoryboardCogenService(ds)
    const result = await svc.cogenStoryboardsForEpisode('ve1')
    expect(generateCogenForScene).toHaveBeenCalledTimes(1)
    const args = generateCogenForScene.mock.calls[0]
    expect(args[2]).toBe('pc_sb')
    expect(args[3]).toBe('m_sb')
    // 哨兵错误被场景级捕获进 result.error（证明流程走到了 LLM 步）
    expect(result.results[0].error).toContain(SENTINEL)
  })

  it('storyboardModel 未配 → 回退 scriptModel', async () => {
    await seedEpisode({
      scriptModel: { providerConfigId: 'pc_sc', modelId: 'm_sc' },
    })
    const svc = new StoryboardCogenService(ds)
    await svc.cogenStoryboardsForEpisode('ve1')
    const args = generateCogenForScene.mock.calls[0]
    expect(args[2]).toBe('pc_sc')
    expect(args[3]).toBe('m_sc')
  })

  it('两者都未配 → 报错提示配置分镜生成模型', async () => {
    await seedEpisode({})
    const svc = new StoryboardCogenService(ds)
    await expect(svc.cogenStoryboardsForEpisode('ve1')).rejects.toThrow('未配置分镜生成模型')
    expect(generateCogenForScene).not.toHaveBeenCalled()
  })
})
