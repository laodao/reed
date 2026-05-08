/**
 * ProgressCalculator.listEpisodesWithProgress 单测（Task 2）
 *
 * 覆盖：返回项目下所有集的聚合进度 + 当前阶段中文标签 + 找不到项目报错。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ProgressCalculator } from '@core/modules/episode-production/workflow/progress-calculator'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import {
  createTestDataSource,
  type TestDataSource,
} from '../../../unit/helpers/create-test-data-source'

describe('ProgressCalculator.listEpisodesWithProgress', () => {
  let tds: TestDataSource

  beforeEach(async () => {
    // 使用公共 helper，包含全部 entity，避免重复维护 entity 列表
    tds = await createTestDataSource('sqlite')
  })

  afterEach(async () => {
    await tds.close()
  })

  it('返回项目下所有集 + 进度 + 当前阶段标签', async () => {
    const projectRepo = tds.ds.getRepository(VideoProjectEntity)
    const epRepo = tds.ds.getRepository(VideoEpisodeEntity)
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

    const calc = new ProgressCalculator(tds.ds)
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
    // pending 无任何 stage 完成，进度应为 0
    expect(list[0].progressPct).toBe(0)
    // completed 终态：6 个生产 stage 中无任何阶段数据完成，故 progress=0
    expect(list[2].progressPct).toBe(0)
  })

  it('空项目返回空数组', async () => {
    const projectRepo = tds.ds.getRepository(VideoProjectEntity)
    const project = await projectRepo.save({
      id: 'proj-empty',
      name: 'P-empty',
      config: {},
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    const calc = new ProgressCalculator(tds.ds)
    const list = await calc.listEpisodesWithProgress(project.id)
    expect(list).toEqual([])
  })

  it('集按 episodeNumber 升序', async () => {
    const projectRepo = tds.ds.getRepository(VideoProjectEntity)
    const epRepo = tds.ds.getRepository(VideoEpisodeEntity)
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
    const calc = new ProgressCalculator(tds.ds)
    const list = await calc.listEpisodesWithProgress(project.id)
    expect(list.map((e) => e.episodeNumber)).toEqual([1, 2, 3])
  })

  it('找不到项目报错', async () => {
    const calc = new ProgressCalculator(tds.ds)
    await expect(calc.listEpisodesWithProgress('not-exist-id'))
      .rejects.toThrow(/Project not found/)
  })
})
