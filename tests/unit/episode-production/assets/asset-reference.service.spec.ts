/**
 * AssetReferenceService 单测（T01 · 资产历史分组 + 写回影响范围提示）
 * @module tests/unit/episode-production/assets/asset-reference.service
 *
 * 覆盖 task-01 §5 单测要求的五个口径：
 * 1. character：N 个分镜引用的角色计数正确（storyboard_characters 路径A
 *    + scene_characters 路径B，两路去重到 storyboard 粒度 + 剧集折算）
 * 2. 无引用返回 0
 * 3. location/item 的 simple-json 数组包含判断（应用层过滤）正确——含子串 id 不误判
 * 4. scene_characters.character_binding_id 为 null 的老数据不计入且 notes 标注
 * 5. user 隔离：A 的分镜对 B 不可见；user_id IS NULL 共享行双方可见
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { StoryboardCharacterEntity } from '@core/database/entities/episode-production/storyboard-character.entity'
import { SceneCharacterEntity } from '@core/database/entities/episode-production/scene-character.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import {
  AssetReferenceService,
} from '@core/platform/episode-production/assets/services/asset-reference.service'
import { runWithUser } from '@core/context/user-context'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [StoryboardEntity, StoryboardCharacterEntity, SceneCharacterEntity, SceneScriptEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

let seq = 0
function nextId(prefix: string): string {
  return `${prefix}_${(++seq).toString(36).padStart(4, '0')}`
}

async function insertScene(
  ds: DataSource,
  input: { id: string; episodeId: string; userId?: string | null },
): Promise<void> {
  const repo = ds.getRepository(SceneScriptEntity)
  await repo.save(
    repo.create({
      userId: input.userId ?? null,
      id: input.id,
      episodeScriptId: input.episodeId,
      sceneNumber: 1,
      location: '茶楼',
      sceneDescription: 'desc',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Partial<SceneScriptEntity>),
  )
}

async function insertStoryboard(
  ds: DataSource,
  input: { id: string; sceneId: string; userId?: string | null },
): Promise<StoryboardEntity> {
  const repo = ds.getRepository(StoryboardEntity)
  const sb = await repo.save(
    repo.create({
      userId: input.userId ?? null,
      id: input.id,
      sceneScriptId: input.sceneId,
      shotNumber: 1,
      frameDescription: '分镜',
      transition: 'cut',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Partial<StoryboardEntity>),
  )
  return sb
}

describe('AssetReferenceService · getWriteImpact（T01 写回影响口径）', () => {
  let ds: DataSource
  let svc: AssetReferenceService

  beforeEach(async () => {
    ds = await buildDb()
    svc = new AssetReferenceService(ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('character：路径A（storyboard_characters）N 个分镜计数正确，剧集数按 episode 去重', async () => {
    // 集 E1：2 个分镜引用 cb_a；集 E2：1 个分镜引用 cb_a → 3 分镜 / 2 集
    await insertScene(ds, { id: 'scene_1', episodeId: 'ep_1' })
    await insertScene(ds, { id: 'scene_2', episodeId: 'ep_2' })
    await insertStoryboard(ds, { id: 'sb_1', sceneId: 'scene_1' })
    await insertStoryboard(ds, { id: 'sb_2', sceneId: 'scene_1' })
    await insertStoryboard(ds, { id: 'sb_3', sceneId: 'scene_2' })
    const sbcRepo = ds.getRepository(StoryboardCharacterEntity)
    for (const sbId of ['sb_1', 'sb_2', 'sb_3']) {
      await sbcRepo.save(
        sbcRepo.create({ id: nextId('sbc'), storyboardId: sbId, characterId: 'cb_a' }),
      )
    }
    // 干扰项：别的角色
    await sbcRepo.save(
      sbcRepo.create({ id: nextId('sbc'), storyboardId: 'sb_1', characterId: 'cb_b' }),
    )

    const impact = await svc.getWriteImpact('character', 'cb_a')
    expect(impact.storyboardCount).toBe(3)
    expect(impact.episodeCount).toBe(2)
    // 估算口径声明固定在 notes 首条
    expect(impact.notes[0]).toContain('估算值')
    expect(impact.legacyUnmigratedSceneCount).toBe(0)
  })

  it('character：路径B（scene_characters.character_binding_id）展开到场景名下分镜，与路径A去重', async () => {
    await insertScene(ds, { id: 'scene_1', episodeId: 'ep_1' })
    await insertStoryboard(ds, { id: 'sb_1', sceneId: 'scene_1' })
    await insertStoryboard(ds, { id: 'sb_2', sceneId: 'scene_1' })

    const scRepo = ds.getRepository(SceneCharacterEntity)
    // 场景级声明 cb_a（binding 迁移过的行）→ 该场景下 sb_1 / sb_2 都计入
    await scRepo.save(
      scRepo.create({
        id: nextId('sc'),
        sceneScriptId: 'scene_1',
        characterId: 'char_1',
        characterName: '李白',
        characterBindingId: 'cb_a',
      }),
    )

    const impact = await svc.getWriteImpact('character', 'cb_a')
    expect(impact.storyboardCount).toBe(2)
    expect(impact.episodeCount).toBe(1)
  })

  it('character：同一分镜两条路径同时命中只计 1（去重到 storyboard 粒度）', async () => {
    await insertScene(ds, { id: 'scene_1', episodeId: 'ep_1' })
    await insertStoryboard(ds, { id: 'sb_1', sceneId: 'scene_1' })
    const sbcRepo = ds.getRepository(StoryboardCharacterEntity)
    const scRepo = ds.getRepository(SceneCharacterEntity)
    await sbcRepo.save(
      sbcRepo.create({ id: nextId('sbc'), storyboardId: 'sb_1', characterId: 'cb_a' }),
    )
    await scRepo.save(
      scRepo.create({
        id: nextId('sc'),
        sceneScriptId: 'scene_1',
        characterId: 'char_1',
        characterName: '李白',
        characterBindingId: 'cb_a',
      }),
    )

    const impact = await svc.getWriteImpact('character', 'cb_a')
    expect(impact.storyboardCount).toBe(1)
    expect(impact.episodeCount).toBe(1)
  })

  it('无引用时返回 0 分镜 0 集（三类资产同验）', async () => {
    for (const t of ['character', 'location', 'item'] as const) {
      const impact = await svc.getWriteImpact(t, 'cb_nobody')
      expect(impact.storyboardCount).toBe(0)
      expect(impact.episodeCount).toBe(0)
    }
  })

  it('location：locationBindingIds simple-json 数组包含判断（应用层过滤），子串 id 不误判', async () => {
    await insertScene(ds, { id: 'scene_1', episodeId: 'ep_1' })
    await insertStoryboard(ds, { id: 'sb_1', sceneId: 'scene_1' })
    await insertStoryboard(ds, { id: 'sb_2', sceneId: 'scene_1' })
    await insertStoryboard(ds, { id: 'sb_3', sceneId: 'scene_1' })
    const repo = ds.getRepository(StoryboardEntity)
    // sb_1 命中；sb_2 数组里有子串相近的别的 id（cb_xxx1 vs cb_xxx12 类误命中防御）；sb_3 不引用
    await repo.update({ id: 'sb_1' }, { locationBindingIds: ['lb_other', 'lb_target'] })
    await repo.update({ id: 'sb_2' }, { locationBindingIds: ['lb_target_ext'] })
    await repo.update({ id: 'sb_3' }, { locationBindingIds: [] })

    const impact = await svc.getWriteImpact('location', 'lb_target')
    expect(impact.storyboardCount).toBe(1)
    expect(impact.episodeCount).toBe(1)
  })

  it('item：itemBindingIds 数组包含判断 + 多值数组 + NULL 数组行安全跳过', async () => {
    await insertScene(ds, { id: 'scene_1', episodeId: 'ep_1' })
    await insertScene(ds, { id: 'scene_2', episodeId: 'ep_2' })
    await insertStoryboard(ds, { id: 'sb_1', sceneId: 'scene_1' })
    await insertStoryboard(ds, { id: 'sb_2', sceneId: 'scene_2' })
    const repo = ds.getRepository(StoryboardEntity)
    await repo.update({ id: 'sb_1' }, { itemBindingIds: ['ib_a', 'ib_b'] })
    await repo.update({ id: 'sb_2' }, { itemBindingIds: null })

    const impact = await svc.getWriteImpact('item', 'ib_b')
    expect(impact.storyboardCount).toBe(1)
    expect(impact.episodeCount).toBe(1)
  })

  it('character_binding_id 为 null 的未迁移老数据不计入，notes 标注"含未迁移老数据"', async () => {
    await insertScene(ds, { id: 'scene_1', episodeId: 'ep_1' })
    await insertStoryboard(ds, { id: 'sb_1', sceneId: 'scene_1' })
    const scRepo = ds.getRepository(SceneCharacterEntity)
    // 老剧本未迁移：character_id 指向该角色但 binding 为空 → 不计入
    await scRepo.save(
      scRepo.create({
        id: nextId('sc'),
        sceneScriptId: 'scene_1',
        characterId: 'cb_a',
        characterName: '李白',
        characterBindingId: null,
      }),
    )

    const impact = await svc.getWriteImpact('character', 'cb_a')
    expect(impact.storyboardCount).toBe(0)
    expect(impact.episodeCount).toBe(0)
    expect(impact.legacyUnmigratedSceneCount).toBe(1)
    expect(impact.notes.join('\n')).toContain('含未迁移老数据')
  })

  it('user 隔离：A 的分镜对 B 不可见；user_id IS NULL 共享行双方可见', async () => {
    await insertScene(ds, { id: 'scene_a', episodeId: 'ep_a', userId: 'user-a' })
    await insertScene(ds, { id: 'scene_b', episodeId: 'ep_b', userId: 'user-b' })
    await insertScene(ds, { id: 'scene_shared', episodeId: 'ep_shared', userId: null })
    await insertStoryboard(ds, { id: 'sb_a', sceneId: 'scene_a', userId: 'user-a' })
    await insertStoryboard(ds, { id: 'sb_b', sceneId: 'scene_b', userId: 'user-b' })
    await insertStoryboard(ds, { id: 'sb_shared', sceneId: 'scene_shared', userId: null })

    const repo = ds.getRepository(StoryboardEntity)
    await repo.update({ id: 'sb_a' }, { locationBindingIds: ['lb_x'] })
    await repo.update({ id: 'sb_b' }, { locationBindingIds: ['lb_x'] })
    await repo.update({ id: 'sb_shared' }, { locationBindingIds: ['lb_x'] })

    // A 看到：自己的 sb_a + 共享 sb_shared
    const aView = await runWithUser('user-a', () => svc.getWriteImpact('location', 'lb_x'))
    expect(aView.storyboardCount).toBe(2)
    expect(aView.episodeCount).toBe(2)

    // B 看到：自己的 sb_b + 共享 sb_shared
    const bView = await runWithUser('user-b', () => svc.getWriteImpact('location', 'lb_x'))
    expect(bView.storyboardCount).toBe(2)
    expect(bView.episodeCount).toBe(2)
  })

  it('user 隔离（character 路径）：storyboard_characters 他人行不可见', async () => {
    await insertScene(ds, { id: 'scene_a', episodeId: 'ep_a', userId: 'user-a' })
    await insertStoryboard(ds, { id: 'sb_a', sceneId: 'scene_a', userId: 'user-a' })
    await insertStoryboard(ds, { id: 'sb_shared', sceneId: 'scene_a', userId: null })
    const sbcRepo = ds.getRepository(StoryboardCharacterEntity)
    await sbcRepo.save(
      sbcRepo.create({ id: nextId('sbc'), userId: 'user-a', storyboardId: 'sb_a', characterId: 'cb_a' }),
    )
    await sbcRepo.save(
      sbcRepo.create({ id: nextId('sbc'), userId: null, storyboardId: 'sb_shared', characterId: 'cb_a' }),
    )

    const aView = await runWithUser('user-a', () => svc.getWriteImpact('character', 'cb_a'))
    expect(aView.storyboardCount).toBe(2)
  })

  it('非法 assetType 抛错、空 assetId 抛错', async () => {
    const badType = 'voice' as unknown as Parameters<AssetReferenceService['getWriteImpact']>[0]
    await expect(svc.getWriteImpact(badType, 'cb_x')).rejects.toThrow(/不支持的资产类型/)
    await expect(svc.getWriteImpact('character', '  ')).rejects.toThrow(/assetId/)
  })
})
