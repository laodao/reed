/**
 * CharacterAssetService 单测（P3a Task 4）
 * @module tests/unit/episode-production/assets/character-asset.service
 *
 * 6 个用例覆盖双源 + override 投影核心逻辑：
 * - linked_lw 模式 getEffectiveData：投影 lw_character + override 覆盖
 * - standalone 模式 getEffectiveData：直接读 standalone_*
 * - linked_lw 无 override：全部走 lw 字段
 * - listByProject：按 project 隔离
 * - createStandalone：新建 standalone binding
 * - createLinkedLw：新建 linked_lw binding
 *
 * 注意：lw_story_characters 实体只有 name / appearance（以及 background / personality
 * 等），并不存在 description / outfit 列。所以 description / outfit 仅来自 override，
 * 其余字段（name / appearance）按 spec §3.7 投影 lw + override 覆盖。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LwCharacterEntity } from '@core/database/entities/lw-character.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import { CharacterAssetService } from '@core/platform/episode-production/assets/services/character-asset.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [VideoProjectEntity, CharacterBindingEntity, LwCharacterEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('CharacterAssetService', () => {
  let ds: DataSource
  let svc: CharacterAssetService

  beforeEach(async () => {
    ds = await buildDb()
    svc = new CharacterAssetService(ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('linked_lw 模式：getEffectiveData 投影 lw_character + override 覆盖', async () => {
    // lw_character 数据：name / appearance 是真实列；description / outfit 不在 lw entity 里
    await ds.getRepository(LwCharacterEntity).save({
      id: 'lwc1',
      projectId: 'lwp1',
      name: '张三',
      appearance: '剑眉星目',
      importance: 'main',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    // character_binding linked_lw + 覆盖 appearance + override outfit（lw 没该字段）
    await ds.getRepository(CharacterBindingEntity).save({
      id: 'cb1',
      projectId: 'p1',
      longWritingCharacterId: 'lwc1',
      sourceType: 'linked_lw',
      voiceConfig: {},
      overrideAppearance: '剑眉星目（受伤版）',
      overrideOutfit: '白衣（重要场合）',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const eff = await svc.getEffectiveData('cb1')
    expect(eff).toMatchObject({
      name: '张三', // 投影自 lw
      appearance: '剑眉星目（受伤版）', // override 覆盖 lw.appearance
      outfit: '白衣（重要场合）', // 仅来自 override（lw 无 outfit 列）
      source: 'linked_lw',
    })
    // description 在 lw 中不存在，无 override 时为空字符串
    expect(eff.description).toBe('')
  })

  it('standalone 模式：getEffectiveData 直接读 standalone_*', async () => {
    await ds.getRepository(CharacterBindingEntity).save({
      id: 'cb2',
      projectId: 'p1',
      longWritingCharacterId: '',
      sourceType: 'standalone',
      voiceConfig: {},
      standaloneName: '老板娘',
      standaloneDescription: '茶馆掌柜',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const eff = await svc.getEffectiveData('cb2')
    expect(eff).toMatchObject({
      name: '老板娘',
      description: '茶馆掌柜',
      source: 'standalone',
    })
    // standalone 模式下 appearance / outfit 不投影
    expect(eff.appearance).toBeUndefined()
    expect(eff.outfit).toBeUndefined()
  })

  it('linked_lw 没有任何 override 时全部走 lw 字段（appearance 投影；description/outfit 为空）', async () => {
    await ds.getRepository(LwCharacterEntity).save({
      id: 'lwc1',
      projectId: 'lwp1',
      name: '李四',
      appearance: '红衣胖子',
      importance: 'secondary',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await ds.getRepository(CharacterBindingEntity).save({
      id: 'cb1',
      projectId: 'p1',
      longWritingCharacterId: 'lwc1',
      sourceType: 'linked_lw',
      voiceConfig: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const eff = await svc.getEffectiveData('cb1')
    expect(eff.name).toBe('李四')
    expect(eff.appearance).toBe('红衣胖子')
    // description / outfit 在 lw 里没有列，无 override 时各自取默认（'' / undefined）
    expect(eff.description).toBe('')
    expect(eff.outfit).toBeUndefined()
  })

  it('listByProject: 取一个 project 的所有 binding', async () => {
    await ds.getRepository(CharacterBindingEntity).save([
      {
        id: 'cb1',
        projectId: 'p1',
        longWritingCharacterId: '',
        sourceType: 'standalone',
        voiceConfig: {},
        standaloneName: 'A',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'cb2',
        projectId: 'p1',
        longWritingCharacterId: '',
        sourceType: 'standalone',
        voiceConfig: {},
        standaloneName: 'B',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'cb3',
        projectId: 'p2',
        longWritingCharacterId: '',
        sourceType: 'standalone',
        voiceConfig: {},
        standaloneName: 'C',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as any)

    const list = await svc.listByProject('p1')
    expect(list.map((b) => b.id).sort()).toEqual(['cb1', 'cb2'])
  })

  it('createStandalone: 新建 standalone 角色', async () => {
    const created = await svc.createStandalone({
      projectId: 'p1',
      name: '新角色',
      description: '描述',
    })
    expect(created.id).toMatch(/^cb_[0-9a-f]{16}$/)
    expect(created.sourceType).toBe('standalone')
    expect(created.standaloneName).toBe('新角色')
    expect(created.standaloneDescription).toBe('描述')
    expect(created.projectId).toBe('p1')
    // standalone 不绑 lw（migration relax-binding-lw-id-nullable 已开放 nullable）
    expect(created.longWritingCharacterId).toBeNull()

    // 落库可被 getById 取到
    const loaded = await svc.getById(created.id)
    expect(loaded?.standaloneName).toBe('新角色')
    expect(loaded?.longWritingCharacterId).toBeNull()
  })

  it('createLinkedLw: 新建 linked_lw 角色（含初始 override）', async () => {
    await ds.getRepository(LwCharacterEntity).save({
      id: 'lwc1',
      projectId: 'lwp1',
      name: '张三',
      importance: 'main',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const created = await svc.createLinkedLw({
      projectId: 'p1',
      lwCharacterId: 'lwc1',
      initialOverride: {
        outfit: '黑袍',
      },
    })
    expect(created.id).toMatch(/^cb_[0-9a-f]{16}$/)
    expect(created.sourceType).toBe('linked_lw')
    expect(created.longWritingCharacterId).toBe('lwc1')
    expect(created.overrideOutfit).toBe('黑袍')

    // getEffectiveData 应用初始 override：name 走 lw、outfit 走 override
    const eff = await svc.getEffectiveData(created.id)
    expect(eff.name).toBe('张三')
    expect(eff.outfit).toBe('黑袍')
    expect(eff.source).toBe('linked_lw')
  })
})
