/**
 * ProgressCalculator.listEpisodesWithProgress 单测（Task 2）
 *
 * 覆盖：返回项目下所有集的聚合进度 + 当前阶段中文标签。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { ProgressCalculator } from '@core/modules/episode-production/workflow/progress-calculator'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { StoryboardKeyframeEntity } from '@core/database/entities/episode-production/storyboard-keyframe.entity'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { StoryboardCharacterEntity } from '@core/database/entities/episode-production/storyboard-character.entity'
import { SceneCharacterEntity } from '@core/database/entities/episode-production/scene-character.entity'
import { ScenePropEntity } from '@core/database/entities/episode-production/scene-prop.entity'
import { SceneActionEntity } from '@core/database/entities/episode-production/scene-action.entity'
import { SceneDialogueEntity } from '@core/database/entities/episode-production/scene-dialogue.entity'

/** 构建内存 SQLite DataSource，包含 progress-calculator 依赖的所有 entity */
async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      VideoProjectEntity,
      VideoEpisodeEntity,
      EpisodeScriptEntity,
      SceneScriptEntity,
      StoryboardEntity,
      StoryboardKeyframeEntity,
      StoryboardCharacterEntity,
      CharacterBindingEntity,
      LocationBindingEntity,
      ItemBindingEntity,
      AssetImageEntity,
      SceneCharacterEntity,
      ScenePropEntity,
      SceneActionEntity,
      SceneDialogueEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('ProgressCalculator.listEpisodesWithProgress', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildDb()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('返回项目下所有集 + 进度 + 当前阶段标签', async () => {
    const projectRepo = ds.getRepository(VideoProjectEntity)
    const epRepo = ds.getRepository(VideoEpisodeEntity)
    const project = await projectRepo.save({
      id: 'proj-1',
      name: 'P1',
      config: {},
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    await epRepo.save([
      {
        id: 'ep-1',
        projectId: project.id,
        episodeNumber: 1,
        title: '第一回',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
      {
        id: 'ep-2',
        projectId: project.id,
        episodeNumber: 2,
        title: '第二回',
        status: 'asset_prep',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
      {
        id: 'ep-3',
        projectId: project.id,
        episodeNumber: 3,
        title: '第三回',
        status: 'completed',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    ])

    const calc = new ProgressCalculator(ds)
    const list = await calc.listEpisodesWithProgress(project.id)

    expect(list).toHaveLength(3)
    expect(list[0].episodeNumber).toBe(1)
    expect(list[0].currentStageLabel).toBe('未开始')
    expect(list[1].currentStageLabel).toBe('资产准备')
    expect(list[2].currentStageLabel).toBe('已完成')
    list.forEach((e) => {
      expect(e.progressPct).toBeGreaterThanOrEqual(0)
      expect(e.progressPct).toBeLessThanOrEqual(100)
    })
  })

  it('空项目返回空数组', async () => {
    const projectRepo = ds.getRepository(VideoProjectEntity)
    const project = await projectRepo.save({
      id: 'proj-empty',
      name: 'P-empty',
      config: {},
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    const calc = new ProgressCalculator(ds)
    const list = await calc.listEpisodesWithProgress(project.id)
    expect(list).toEqual([])
  })

  it('集按 episodeNumber 升序', async () => {
    const projectRepo = ds.getRepository(VideoProjectEntity)
    const epRepo = ds.getRepository(VideoEpisodeEntity)
    const project = await projectRepo.save({
      id: 'proj-order',
      name: 'P-order',
      config: {},
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await epRepo.save([
      {
        id: 'ep-o3',
        projectId: project.id,
        episodeNumber: 3,
        title: 't3',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
      {
        id: 'ep-o1',
        projectId: project.id,
        episodeNumber: 1,
        title: 't1',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
      {
        id: 'ep-o2',
        projectId: project.id,
        episodeNumber: 2,
        title: 't2',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    ])
    const calc = new ProgressCalculator(ds)
    const list = await calc.listEpisodesWithProgress(project.id)
    expect(list.map((e) => e.episodeNumber)).toEqual([1, 2, 3])
  })
})
