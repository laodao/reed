/**
 * ScriptBindingFixerService 单测（2026-09-21 去重归一改造）
 * @module tests/unit/episode-production/narrative/script-binding-fixer.service
 *
 * 验证：
 *   1. fixByNameMatch 按归一化名字匹配（书名号/空白差异也命中，含 alias）；
 *   2. createMissingBindings 改走 CharacterAssetService.createStandalone：
 *      新建的 binding 带 styleAnchors 项目风格快照（不再是裸 repo 直插）；
 *   3. find-or-create：已有同名 binding（归一化后）时不再新建，直接填回。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LwCharacterEntity } from '@core/database/entities/lw-character.entity'
import { ScriptBindingFixerService } from '@core/platform/episode-production/narrative/services/script-binding-fixer.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      VideoProjectEntity,
      VideoEpisodeEntity,
      EpisodeScriptEntity,
      SceneScriptEntity,
      CharacterBindingEntity,
      LwCharacterEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

/** 项目 + 剧集 + 剧本 + 一个带未绑定角色的场景 */
async function seedScene(
  ds: DataSource,
  characters: unknown[],
  styleAnchors?: string[],
): Promise<void> {
  await ds.getRepository(VideoProjectEntity).save({
    id: 'p1',
    name: '项目',
    config: styleAnchors ? { styleAnchors } : {},
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
  await ds.getRepository(VideoEpisodeEntity).save({
    id: 'ep1',
    projectId: 'p1',
    episodeNumber: 1,
    title: '第一集',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
  await ds.getRepository(EpisodeScriptEntity).save({
    id: 'es1',
    projectId: 'p1',
    episodeId: 'ep1',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
  await ds.getRepository(SceneScriptEntity).save({
    id: 'ss1',
    episodeScriptId: 'es1',
    sceneNumber: 1,
    location: '书房',
    sceneDescription: '夜',
    characters,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
}

describe('ScriptBindingFixerService', () => {
  let ds: DataSource
  let svc: ScriptBindingFixerService

  beforeEach(async () => {
    ds = await buildDb()
    svc = new ScriptBindingFixerService(ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('fixByNameMatch：归一化匹配（书名号差异）+ alias 命中', async () => {
    await seedScene(ds, [
      { characterName: '《沈云萝》', characterBindingId: null },
      { characterName: '浪剑客', characterBindingId: null },
    ])
    await ds.getRepository(CharacterBindingEntity).save({
      id: 'cb1',
      projectId: 'p1',
      sourceType: 'standalone',
      standaloneName: '沈云萝',
      voiceConfig: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await ds.getRepository(CharacterBindingEntity).save({
      id: 'cb2',
      projectId: 'p1',
      sourceType: 'standalone',
      standaloneName: '顾三',
      alias: '三爷 / 浪剑客',
      voiceConfig: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const fix = await svc.fixByNameMatch('es1')
    expect(fix.matched).toBe(2)
    expect(fix.stillUnboundNames).toEqual([])

    const scene = await ds.getRepository(SceneScriptEntity).findOne({ where: { id: 'ss1' } })
    const chars = scene!.characters as any[]
    expect(chars[0].characterBindingId).toBe('cb1')
    expect(chars[1].characterBindingId).toBe('cb2')
  })

  it('createMissingBindings：走 service 创建（带 styleAnchors 快照）并填回', async () => {
    await seedScene(ds, [{ characterName: '沈云萝', characterBindingId: null }], ['工笔国风'])

    const result = await svc.createMissingBindings('es1')
    expect(result.created).toHaveLength(1)
    expect(result.created[0].name).toBe('沈云萝')
    expect(result.filled).toBe(1)

    const bindings = await ds.getRepository(CharacterBindingEntity).find({ where: { projectId: 'p1' } })
    expect(bindings).toHaveLength(1)
    expect(bindings[0].sourceType).toBe('standalone')
    // 裸 repo 直插时代没有 styleAnchors；走 service 后必须带项目风格快照
    expect(bindings[0].styleAnchors).toBe(JSON.stringify(['工笔国风']))
    expect(bindings[0].standaloneName).toBe('沈云萝')

    const scene = await ds.getRepository(SceneScriptEntity).findOne({ where: { id: 'ss1' } })
    expect((scene!.characters as any[])[0].characterBindingId).toBe(bindings[0].id)
  })

  it('createMissingBindings：已有同名（归一化差异）binding → 不新建，直接填回', async () => {
    await seedScene(ds, [{ characterName: '沈　云萝', characterBindingId: null }])
    await ds.getRepository(CharacterBindingEntity).save({
      id: 'cb_exist',
      projectId: 'p1',
      sourceType: 'standalone',
      standaloneName: '沈云萝',
      voiceConfig: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const result = await svc.createMissingBindings('es1')
    // 已有同名（归一化后）→ 不缺 binding，不新建（filled 语义是"通过新建填回"，此处为 0）
    expect(result.created).toEqual([])
    expect(result.filled).toBe(0)

    // fix 入口按归一化名字填回已有 binding
    const fix = await svc.fixByNameMatch('es1')
    expect(fix.matched).toBe(1)

    const bindings = await ds.getRepository(CharacterBindingEntity).find({ where: { projectId: 'p1' } })
    expect(bindings).toHaveLength(1)
    const scene = await ds.getRepository(SceneScriptEntity).findOne({ where: { id: 'ss1' } })
    expect((scene!.characters as any[])[0].characterBindingId).toBe('cb_exist')
  })
})
