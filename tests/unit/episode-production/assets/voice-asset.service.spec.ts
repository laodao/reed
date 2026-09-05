/**
 * VoiceAssetService 单测（P3a Task 7）
 * @module tests/unit/episode-production/assets/voice-asset.service
 *
 * 4 个用例覆盖 cloned_voices 查询 + character_binding voice_id 绑定：
 * - listAvailableVoices：返回全部，无论 status
 * - listReadyVoices：仅 status='ready'
 * - bindToCharacter：写 voiceId 到 character_binding
 * - listCharactersByVoice：反向查谁绑了某个 voice
 *
 * 注意：cloned_voices.created_at 在 entity 中是 string（ISO 字符串），不是 Date；
 * 测试 save 时需要传 ISO 字符串。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { ClonedVoiceEntity } from '@core/database/entities/cloned-voice.entity'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { VoiceAssetService } from '@core/platform/episode-production/assets/services/voice-asset.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [ClonedVoiceEntity, CharacterBindingEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('VoiceAssetService', () => {
  let ds: DataSource
  let svc: VoiceAssetService

  beforeEach(async () => {
    ds = await buildDb()
    svc = new VoiceAssetService(ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('listAvailableVoices: 返回全部，无论 status', async () => {
    await ds.getRepository(ClonedVoiceEntity).save([
      {
        id: 'v1',
        name: '沉稳男声',
        status: 'ready',
        voiceId: 'sys-1',
        createdAt: '2026-01-01',
      },
      {
        id: 'v2',
        name: '温柔女声',
        status: 'ready',
        voiceId: 'sys-2',
        createdAt: '2026-01-02',
      },
      {
        id: 'v3',
        name: '复刻 A',
        status: 'training',
        voiceId: null,
        createdAt: '2026-01-03',
      },
    ] as Partial<ClonedVoiceEntity>[])

    const voices = await svc.listAvailableVoices()
    expect(voices.map((v) => v.id).sort()).toEqual(['v1', 'v2', 'v3'])
  })

  it('listReadyVoices: 仅 status=ready', async () => {
    await ds.getRepository(ClonedVoiceEntity).save([
      {
        id: 'v1',
        name: 'A',
        status: 'ready',
        voiceId: 'sys-1',
        createdAt: '2026-01-01',
      },
      {
        id: 'v2',
        name: 'B',
        status: 'training',
        voiceId: null,
        createdAt: '2026-01-02',
      },
    ] as Partial<ClonedVoiceEntity>[])

    const ready = await svc.listReadyVoices()
    expect(ready.map((v) => v.id)).toEqual(['v1'])
  })

  it('bindToCharacter: 写 voiceId 到 character_binding', async () => {
    await ds.getRepository(ClonedVoiceEntity).save({
      id: 'v1',
      name: 'A',
      status: 'ready',
      voiceId: 'sys-1',
      createdAt: '2026-01-01',
    } as Partial<ClonedVoiceEntity>)
    await ds.getRepository(CharacterBindingEntity).save({
      id: 'cb1',
      projectId: 'p1',
      longWritingCharacterId: '',
      sourceType: 'standalone',
      voiceConfig: {},
      standaloneName: 'X',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Partial<CharacterBindingEntity>)

    await svc.bindToCharacter('cb1', 'v1')

    const cb = await ds
      .getRepository(CharacterBindingEntity)
      .findOne({ where: { id: 'cb1' } })
    expect(cb?.voiceId).toBe('v1')
  })

  it('listCharactersByVoice: 反向查谁绑了这个 voice', async () => {
    await ds.getRepository(CharacterBindingEntity).save([
      {
        id: 'cb1',
        projectId: 'p1',
        longWritingCharacterId: '',
        sourceType: 'standalone',
        voiceConfig: {},
        standaloneName: 'X',
        voiceId: 'v1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'cb2',
        projectId: 'p1',
        longWritingCharacterId: '',
        sourceType: 'standalone',
        voiceConfig: {},
        standaloneName: 'Y',
        voiceId: 'v1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'cb3',
        projectId: 'p1',
        longWritingCharacterId: '',
        sourceType: 'standalone',
        voiceConfig: {},
        standaloneName: 'Z',
        voiceId: 'v2',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as Partial<CharacterBindingEntity>[])

    const list = await svc.listCharactersByVoice('v1')
    expect(list.map((c) => c.id).sort()).toEqual(['cb1', 'cb2'])
  })
})
