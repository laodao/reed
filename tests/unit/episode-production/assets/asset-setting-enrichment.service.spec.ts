import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import {
  AssetSettingEnrichmentService,
  type CallAIFn,
} from '@core/platform/episode-production/assets/services/asset-setting-enrichment.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      CharacterBindingEntity,
      LocationBindingEntity,
      ItemBindingEntity,
      EpisodeScriptEntity,
      SceneScriptEntity,
      VideoEpisodeEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('AssetSettingEnrichmentService', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildDb()
    // 准备：1 个 episode → 1 个 episodeScript → 1 个 sceneScript（含原文）
    // + 2 个 character binding（一个全空、一个已部分填）
    const epRepo = ds.getRepository(VideoEpisodeEntity)
    const scriptRepo = ds.getRepository(EpisodeScriptEntity)
    const sceneRepo = ds.getRepository(SceneScriptEntity)
    const chRepo = ds.getRepository(CharacterBindingEntity)

    await epRepo.save({
      id: 'ep1',
      projectId: 'p1',
      title: '第 1 集',
      episodeNumber: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await scriptRepo.save({
      id: 's1',
      projectId: 'p1',
      episodeId: 'ep1',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await sceneRepo.save({
      id: 'sc1',
      episodeScriptId: 's1',
      sceneNumber: 1,
      location: '茶馆',
      sceneDescription: '茶馆场景',
      originalText: '茶馆里有个老者，少年从西边走来',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await chRepo.save({
      id: 'cb1',
      projectId: 'p1',
      sourceType: 'standalone',
      standaloneName: '老者',
      voiceConfig: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await chRepo.save({
      id: 'cb2',
      projectId: 'p1',
      sourceType: 'standalone',
      standaloneName: '少年',
      standaloneDescription: '已经填好的少年描述',
      age: 16,
      voiceConfig: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('反推填充：仅写空字段，不覆盖已填', async () => {
    const calls: Array<{ kind: string; user: string }> = []
    const callAI: CallAIFn = async (user, _system) => {
      const m = user.match(/(character|location|item)/) // 简化
      const kind = m ? m[1] : 'character'
      calls.push({ kind, user })
      return JSON.stringify({
        results: [
          {
            id: 'cb1',
            fields: {
              description: 'AI: 老者描述',
              age: 70,
              gender: '男',
              race: 'east_asian',
            },
          },
          {
            id: 'cb2',
            fields: {
              description: 'AI: 少年描述（应该被丢弃，因为已填）',
              age: 99,
              gender: '男',
            },
          },
        ],
      })
    }
    const svc = new AssetSettingEnrichmentService(ds, callAI)
    await svc.enrich({ projectId: 'p1' })

    const cb1 = await ds.getRepository(CharacterBindingEntity).findOneByOrFail({ id: 'cb1' })
    const cb2 = await ds.getRepository(CharacterBindingEntity).findOneByOrFail({ id: 'cb2' })
    // cb1 全空 → 全部写入
    expect(cb1.standaloneDescription).toBe('AI: 老者描述')
    expect(cb1.age).toBe(70)
    expect(cb1.gender).toBe('男')
    expect(cb1.race).toBe('east_asian')
    // cb2 已填 → 保持原值
    expect(cb2.standaloneDescription).toBe('已经填好的少年描述')
    expect(cb2.age).toBe(16)
    // 但 cb2 原本空的 gender 被 AI 提供 → 写入
    expect(cb2.gender).toBe('男')
  })

  it('AI 返回非 JSON：该 kind 失败但不抛错；其他 kind 不受影响', async () => {
    let callIdx = 0
    const callAI: CallAIFn = async () => {
      callIdx++
      if (callIdx === 1) return '这不是 JSON'
      return JSON.stringify({ results: [] })
    }
    const svc = new AssetSettingEnrichmentService(ds, callAI)
    const summary = await svc.enrich({ projectId: 'p1' })
    expect(summary.failures.length).toBeGreaterThan(0)
    expect(summary.failures[0].kind).toBe('character')
  })

  it('未配置 AI provider（callAI 抛 "未配置"）：抛错让上层中止', async () => {
    const callAI: CallAIFn = async () => {
      throw new Error('未配置 AI 提供商')
    }
    const svc = new AssetSettingEnrichmentService(ds, callAI)
    await expect(svc.enrich({ projectId: 'p1' })).rejects.toThrow(/未配置/)
  })

  it('待补清单为空：跳过该 kind 不调 AI', async () => {
    const calls: number[] = []
    const callAI: CallAIFn = async () => {
      calls.push(1)
      return JSON.stringify({ results: [] })
    }
    const svc = new AssetSettingEnrichmentService(ds, callAI)
    await svc.enrich({ projectId: 'p1' })
    // p1 没有 location/item binding → 那两次调用应跳过
    expect(calls.length).toBe(1)
  })
})
