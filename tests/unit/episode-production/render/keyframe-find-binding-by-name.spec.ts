/**
 * KeyframeGenerationService.findBindingByName 生效名归一化反查（2026-09-24 一致性修复 A3）
 * @module tests/unit/episode-production/render/keyframe-find-binding-by-name
 *
 * 旧实现直查 standalone_name 列，linked_lw 角色该列为 null 永远反查不到。
 * 现实现：项目 binding 列表逐个经 CharacterAssetService.getEffectiveData 投影生效名，
 * normalizeBindingName 归一化后匹配。
 *
 * 覆盖：
 * - standalone 角色按 standaloneName 命中（回归）
 * - linked_lw 角色 standaloneName=null、名字来自 overrideName 命中
 * - linked_lw 角色 overrideName=null、名字来自 lw 投影命中
 * - 归一化：书名号 / 全角空格 / 大小写差异命中
 * - 未知名 → null；同名多条取最早创建者
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { LwCharacterEntity } from '@core/database/entities/lw-character.entity'
import { LwLocationEntity } from '@core/database/entities/lw-location.entity'
import { LwItemEntity } from '@core/database/entities/lw-item.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { StoryboardKeyframeEntity } from '@core/database/entities/episode-production/storyboard-keyframe.entity'
import { StoryboardCharacterEntity } from '@core/database/entities/episode-production/storyboard-character.entity'
import { ImageAssetEntity } from '@core/database/entities/image-asset.entity'
import { KeyframeGenerationService } from '@core/platform/episode-production/render/keyframe/keyframe-generation.service'

// 不起真实 sharp 子进程（本 spec 不触达合成路径，仅为模块加载兜底）
vi.mock('@core/platform/episode-production/common/sharp-worker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@core/platform/episode-production/common/sharp-worker')>()
  return {
    ...actual,
    workerCompositeOntoScene: vi.fn(async () => ({ members: [] })),
  }
})

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      CharacterBindingEntity,
      LocationBindingEntity,
      ItemBindingEntity,
      AssetImageEntity,
      LwCharacterEntity,
      LwLocationEntity,
      LwItemEntity,
      SceneScriptEntity,
      EpisodeScriptEntity,
      VideoEpisodeEntity,
      VideoProjectEntity,
      StoryboardEntity,
      StoryboardKeyframeEntity,
      StoryboardCharacterEntity,
      ImageAssetEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

async function seedBinding(
  ds: DataSource,
  id: string,
  fields: Partial<CharacterBindingEntity> = {},
): Promise<void> {
  await ds.getRepository(CharacterBindingEntity).save({
    id,
    projectId: 'proj1',
    sourceType: 'standalone',
    voiceConfig: {},
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...fields,
  } as any)
}

async function seedLwCharacter(
  ds: DataSource,
  id: string,
  name: string,
): Promise<void> {
  await ds.getRepository(LwCharacterEntity).save({
    id,
    projectId: 'proj1',
    name,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
}

describe('KeyframeGenerationService.findBindingByName（A3 生效名投影反查）', () => {
  let ds: DataSource
  let svc: KeyframeGenerationService

  beforeEach(async () => {
    ds = await buildDb()
    svc = new KeyframeGenerationService(ds, { generate: vi.fn() } as any)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    if (ds.isInitialized) await ds.destroy()
  })

  const find = (name: string) =>
    (svc as any).findBindingByName('proj1', name) as Promise<string | null>

  it('standalone 角色按 standaloneName 命中（回归）', async () => {
    await seedBinding(ds, 'cb_standalone', { standaloneName: '张三' })
    expect(await find('张三')).toBe('cb_standalone')
  })

  it('linked_lw 角色 standaloneName=null、overrideName 生效 → 命中', async () => {
    await seedBinding(ds, 'cb_linked_override', {
      sourceType: 'linked_lw',
      longWritingCharacterId: 'lwc_x',
      standaloneName: null,
      standaloneDescription: null,
      overrideName: '李四',
    })
    expect(await find('李四')).toBe('cb_linked_override')
  })

  it('linked_lw 角色 overrideName=null、名字来自 lw 投影 → 命中', async () => {
    await seedLwCharacter(ds, 'lwc1', '沈云萝')
    await seedBinding(ds, 'cb_linked_lw', {
      sourceType: 'linked_lw',
      longWritingCharacterId: 'lwc1',
      standaloneName: null,
      standaloneDescription: null,
    })
    expect(await find('沈云萝')).toBe('cb_linked_lw')
  })

  it('归一化命中：书名号 / 全角空格 / 大小写差异不影响', async () => {
    await seedBinding(ds, 'cb_norm', { standaloneName: '李墨' })
    expect(await find('《李墨》')).toBe('cb_norm')
    expect(await find('　李墨　')).toBe('cb_norm')

    await seedLwCharacter(ds, 'lwc2', 'Su Bai')
    await seedBinding(ds, 'cb_norm_lw', {
      sourceType: 'linked_lw',
      longWritingCharacterId: 'lwc2',
      standaloneName: null,
    })
    expect(await find('su_bai')).toBeNull()
    expect(await find('SuBai')).toBe('cb_norm_lw')
  })

  it('未知名 / 空参 → null', async () => {
    await seedBinding(ds, 'cb_only', { standaloneName: '张三' })
    expect(await find('不存在的人')).toBeNull()
    expect(await find('')).toBeNull()
    expect(await (svc as any).findBindingByName('', '张三')).toBeNull()
  })

  it('同名多条取最早创建者', async () => {
    await seedBinding(ds, 'cb_late', {
      standaloneName: '王五',
      createdAt: new Date('2026-09-02T00:00:00Z'),
    })
    await seedBinding(ds, 'cb_early', {
      standaloneName: '王五',
      createdAt: new Date('2026-08-01T00:00:00Z'),
    })
    expect(await find('王五')).toBe('cb_early')
  })
})
