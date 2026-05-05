/**
 * SceneAudioOrchestratorService 单测（P5-T14/T15）
 *
 * 用 mock NarrationSynthesisService 验证 voice ID 解析顺序：
 *   1. dialogue.voiceId（场景级覆盖）→ 直接用
 *   2. character_binding.voiceId（ReferenceResolver 取）→ 用
 *   3. fallback 'Cherry' → fallbackDialogueCount 增加
 *
 * 也覆盖：
 *   - 旁白生成（默认音色 / 自定义音色）
 *   - 解析失败的 dialogue 走 fallback
 *   - 多对话 batched 调用
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
import { SceneAudioOrchestratorService } from '@core/modules/episode-production/render/audio/scene-audio-orchestrator.service'
import { NarrationSynthesisService } from '@core/modules/episode-production/render/audio/narration-synthesis.service'

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
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

async function seedCharacterWithVoice(
  ds: DataSource,
  id: string,
  name: string,
  voiceId: string | null,
): Promise<void> {
  await ds.getRepository(CharacterBindingEntity).save({
    id,
    projectId: 'p1',
    longWritingCharacterId: null,
    sourceType: 'standalone',
    voiceConfig: {},
    voiceId,
    standaloneName: name,
    standaloneDescription: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
}

async function seedScene(
  ds: DataSource,
  opts: {
    narration?: string | null
    dialogues?: Array<{
      id: string
      text: string
      characterBindingId?: string | null
      characterId?: string
      characterName?: string
      voiceId?: string | null
    }>
  },
): Promise<string> {
  await ds.getRepository(SceneScriptEntity).save({
    id: 's1',
    episodeScriptId: 'es1',
    sceneNumber: 1,
    location: '茶馆',
    locationBindingId: null,
    locationType: 'interior',
    timeOfDay: 'morning',
    weather: null,
    sceneDescription: '',
    mood: null,
    lighting: null,
    characters: null,
    originalText: '',
    narration: opts.narration ?? null,
    dialogues: opts.dialogues ?? [],
    actions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
  return 's1'
}

describe('SceneAudioOrchestratorService', () => {
  let ds: DataSource
  let svc: SceneAudioOrchestratorService
  let narrationGenSpy: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    ds = await buildDb()
    svc = new SceneAudioOrchestratorService(ds)

    // mock NarrationSynthesisService.generateNarrationAudio：返回固定 path 串
    narrationGenSpy = vi.fn(
      async (text: string, voiceConfig: { voiceId: string }) => {
        return `/tmp/audio_${voiceConfig.voiceId}_${text.slice(0, 8)}.wav`
      },
    )
    const inst = NarrationSynthesisService.getInstance()
    ;(inst as any).generateNarrationAudio = narrationGenSpy
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
    vi.restoreAllMocks()
  })

  it('dialogue.voiceId 优先级最高（场景级覆盖）', async () => {
    await seedCharacterWithVoice(ds, 'cb1', '张三', 'voice_binding')
    await seedScene(ds, {
      dialogues: [
        {
          id: 'd1',
          text: '老板',
          characterBindingId: 'cb1',
          voiceId: 'voice_scene_override',
        },
      ],
    })

    const result = await svc.orchestrateScene({
      sceneScriptId: 's1',
      outputDir: '/tmp',
    })
    expect(narrationGenSpy).toHaveBeenCalled()
    // dialogue 用 voice_scene_override（非 binding voice）
    const call = narrationGenSpy.mock.calls.find(
      (c) => c[0] === '老板',
    )
    expect(call?.[1].voiceId).toBe('voice_scene_override')
    expect(result.fallbackDialogueCount).toBe(0)
  })

  it('binding.voiceId 当作回退（dialogue.voiceId 为空时）', async () => {
    await seedCharacterWithVoice(ds, 'cb1', '张三', 'voice_binding')
    await seedScene(ds, {
      dialogues: [
        {
          id: 'd1',
          text: '老板',
          characterBindingId: 'cb1',
          voiceId: null,
        },
      ],
    })

    const result = await svc.orchestrateScene({
      sceneScriptId: 's1',
      outputDir: '/tmp',
    })
    const call = narrationGenSpy.mock.calls.find((c) => c[0] === '老板')
    expect(call?.[1].voiceId).toBe('voice_binding')
    expect(result.fallbackDialogueCount).toBe(0)
  })

  it('binding 不存在 → fallback Cherry + fallbackCount 增加', async () => {
    await seedScene(ds, {
      dialogues: [
        {
          id: 'd1',
          text: '老板',
          characterBindingId: 'cb_ghost',
          voiceId: null,
        },
      ],
    })

    const result = await svc.orchestrateScene({
      sceneScriptId: 's1',
      outputDir: '/tmp',
    })
    const call = narrationGenSpy.mock.calls.find((c) => c[0] === '老板')
    expect(call?.[1].voiceId).toBe('Cherry')
    expect(result.fallbackDialogueCount).toBe(1)
  })

  it('binding 存在但无 voiceId → fallback Cherry', async () => {
    await seedCharacterWithVoice(ds, 'cb1', '张三', null)
    await seedScene(ds, {
      dialogues: [
        {
          id: 'd1',
          text: '老板',
          characterBindingId: 'cb1',
          voiceId: null,
        },
      ],
    })

    const result = await svc.orchestrateScene({
      sceneScriptId: 's1',
      outputDir: '/tmp',
    })
    expect(result.fallbackDialogueCount).toBe(1)
  })

  it('旁白用项目级默认音色 + 没旁白时不调 narration TTS', async () => {
    await seedScene(ds, {
      narration: '清晨茶馆',
      dialogues: [],
    })

    await svc.orchestrateScene({
      sceneScriptId: 's1',
      outputDir: '/tmp',
      defaultNarratorVoiceId: 'voice_narrator',
    })
    const narrationCall = narrationGenSpy.mock.calls.find(
      (c) => c[0] === '清晨茶馆',
    )
    expect(narrationCall?.[1].voiceId).toBe('voice_narrator')
  })

  it('多对话 + dialoguePaths Map 完整', async () => {
    await seedCharacterWithVoice(ds, 'cb1', '张三', 'v1')
    await seedCharacterWithVoice(ds, 'cb2', '李四', 'v2')
    await seedScene(ds, {
      dialogues: [
        { id: 'd1', text: '一壶茶', characterBindingId: 'cb1', voiceId: null },
        { id: 'd2', text: '请稍等', characterBindingId: 'cb2', voiceId: null },
        { id: 'd3', text: '多谢', characterBindingId: 'cb1', voiceId: null },
      ],
    })
    const result = await svc.orchestrateScene({
      sceneScriptId: 's1',
      outputDir: '/tmp',
    })
    expect(result.dialoguePaths.size).toBe(3)
    expect(result.dialoguePaths.get('d1')).toContain('v1')
    expect(result.dialoguePaths.get('d2')).toContain('v2')
    expect(result.dialoguePaths.get('d3')).toContain('v1')
  })

  it('scene 不存在 → 抛错', async () => {
    await expect(
      svc.orchestrateScene({
        sceneScriptId: 's_ghost',
        outputDir: '/tmp',
      }),
    ).rejects.toThrow(/Scene not found/)
  })
})
