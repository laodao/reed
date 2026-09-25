/**
 * SubtitleService 单测（P6-T3）
 *
 * 覆盖：
 * - 旁白：场景首镜起始处 NARRATION_LEAD_SEC 秒
 * - 对话：分镜区间内均分时间
 * - SRT 格式：行号 / 时间码 / "角色名：内容"
 * - formatSrtTime：边界（00:00:00,000 / 01:23:45,678）
 * - 无对话/无旁白时不报错
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { SceneDialogueEntity } from '@core/database/entities/episode-production/scene-dialogue.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import {
  SubtitleService,
  formatSrtTime,
} from '@core/platform/episode-production/compose/subtitle.service'
import { TimelineBuilderService } from '@core/platform/episode-production/compose/timeline-builder.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [SceneScriptEntity, SceneDialogueEntity, StoryboardEntity],
    synchronize: true,
  })
  await ds.initialize()
  await ds.query(`
    CREATE TABLE IF NOT EXISTS storyboard_dialogue_links (
      id TEXT PRIMARY KEY,
      storyboard_id TEXT NOT NULL,
      dialogue_id TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
      FOREIGN KEY (dialogue_id) REFERENCES scene_dialogues(id) ON DELETE CASCADE
    )
  `)
  return ds
}

async function seed(ds: DataSource): Promise<void> {
  await ds.getRepository(SceneScriptEntity).save({
    id: 's1',
    episodeScriptId: 'es1',
    sceneNumber: 1,
    location: '茶馆',
    locationBindingId: null,
    locationType: 'interior',
    timeOfDay: 'morning',
    weather: null,
    sceneDescription: '清晨茶馆',
    mood: '安静',
    lighting: null,
    characters: null,
    originalText: '',
    narration: '清晨的茶馆，张三推门而入',
    dialogues: [
      { id: 'd1', text: '老板，来一壶碧螺春', characterName: '张三' },
      { id: 'd2', text: '好嘞，您稍等', characterName: '老板娘' },
    ],
    actions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)

  await ds.getRepository(StoryboardEntity).save([
    {
      id: 'sb1',
      sceneScriptId: 's1',
      shotNumber: 1,
      shotType: 'medium',
      cameraAngle: 'eye_level',
      cameraMovement: 'static',
      movementDuration: null,
      frameDescription: '',
      subject: null,
      composition: null,
      characters: null,
      narrationId: null,
      dialogueIds: [],
      actionIds: [],
      frameImage: null,
      frameImageId: null,
      videoPath: '/v1.mp4',
      duration: 4,
      transition: '{}',
      transitionType: null,
      transitionDurationMs: null,
      transitionDirection: null,
      transitionEasing: null,
      transitionColor: null,
      status: 'pending',
      keyframeCount: 2,
      videoProviderId: null,
      videoModelId: null,
      videoMode: null,
      use3dStaging: 0,
      stagingLayoutId: null,
      backgroundRefImageId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'sb2',
      sceneScriptId: 's1',
      shotNumber: 2,
      shotType: 'close',
      cameraAngle: 'eye_level',
      cameraMovement: 'static',
      movementDuration: null,
      frameDescription: '',
      subject: null,
      composition: null,
      characters: null,
      narrationId: null,
      dialogueIds: [],
      actionIds: [],
      frameImage: null,
      frameImageId: null,
      videoPath: '/v2.mp4',
      duration: 4,
      transition: '{}',
      transitionType: null,
      transitionDurationMs: null,
      transitionDirection: null,
      transitionEasing: null,
      transitionColor: null,
      status: 'pending',
      keyframeCount: 2,
      videoProviderId: null,
      videoModelId: null,
      videoMode: null,
      use3dStaging: 0,
      stagingLayoutId: null,
      backgroundRefImageId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ] as any)
}

describe('SubtitleService', () => {
  let ds: DataSource
  let svc: SubtitleService
  let timelineSvc: TimelineBuilderService

  beforeEach(async () => {
    ds = await buildDb()
    svc = new SubtitleService(ds)
    timelineSvc = new TimelineBuilderService(ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('生成 cues：1 旁白 + 2 对话（均分）', async () => {
    await seed(ds)
    const tl = await timelineSvc.buildEpisodeTimeline('es1')
    const cues = await svc.buildCues(tl)

    expect(cues.length).toBeGreaterThanOrEqual(3)
    // 第一条应是 narration（startSec=0）
    expect(cues[0].source).toBe('narration')
    expect(cues[0].text).toContain('清晨的茶馆')
    // 后面两条 dialogue
    const dialogueCues = cues.filter((c) => c.source === 'dialogue')
    expect(dialogueCues).toHaveLength(2)
    expect(dialogueCues[0].text).toContain('老板')
    expect(dialogueCues[1].text).toContain('稍等')
  })

  it('toSrt：行号 / 时间码 / 角色名：内容 格式正确', async () => {
    await seed(ds)
    const tl = await timelineSvc.buildEpisodeTimeline('es1')
    const srt = await svc.buildSrt(tl)

    // 检查格式
    expect(srt).toMatch(/^1\s*\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/m)
    expect(srt).toContain('张三：老板，来一壶碧螺春')
    expect(srt).toContain('老板娘：好嘞，您稍等')
  })

  it('H8 说话人：narration 标"旁白"；dialogue 优先取 scene_dialogues 表角色名；解析不到兜底"未知角色"', async () => {
    await seed(ds)
    // 归一化表角色名与 JSON 列不同 → 应以表为准
    await ds.getRepository(SceneDialogueEntity).save([
      {
        id: 'sd1',
        sceneScriptId: 's1',
        characterId: 'c1',
        characterBindingId: null,
        characterName: '张三（表）',
        text: '老板，来一壶碧螺春',
        emotion: null,
        volume: 'normal',
        pace: 'normal',
        pause: 0,
        voiceId: null,
        audioAssetId: null,
        sortOrder: 0,
      },
      {
        id: 'sd2',
        sceneScriptId: 's1',
        characterId: 'c2',
        characterBindingId: null,
        characterName: '  ', // 空白 → 兜底未知角色
        text: '好嘞，您稍等',
        emotion: null,
        volume: 'normal',
        pace: 'normal',
        pause: 0,
        voiceId: null,
        audioAssetId: null,
        sortOrder: 1,
      },
    ] as any)

    const tl = await timelineSvc.buildEpisodeTimeline('es1')
    const cues = await svc.buildCues(tl)
    const narration = cues.find((c) => c.source === 'narration')
    expect(narration?.characterName).toBe('旁白')
    const dialogueCues = cues.filter((c) => c.source === 'dialogue')
    expect(dialogueCues.map((c) => c.characterName)).toEqual(['张三（表）', '未知角色'])

    const srt = svc.toSrt(cues)
    expect(srt).toContain('旁白：清晨的茶馆')
    expect(srt).toContain('张三（表）：老板，来一壶碧螺春')
    expect(srt).toContain('未知角色：好嘞，您稍等')
  })

  it('C4：混合状态下均分回退不重复分配已被 links 承接的对白', async () => {
    // 场景 4 句对白；sb2 有 links 承接 sd2，sb1 无 links 走均分回退
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
      narration: null,
      dialogues: [],
      actions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await ds.getRepository(SceneDialogueEntity).save(
      ['sd1', 'sd2', 'sd3', 'sd4'].map((id, i) => ({
        id,
        sceneScriptId: 's1',
        characterId: 'c1',
        characterBindingId: null,
        characterName: '张三',
        text: `台词${i + 1}`,
        emotion: null,
        volume: 'normal',
        pace: 'normal',
        pause: 0,
        voiceId: null,
        audioAssetId: null,
        sortOrder: i,
      })) as any,
    )
    await ds.getRepository(StoryboardEntity).save([
      {
        id: 'sb1',
        sceneScriptId: 's1',
        shotNumber: 1,
        shotType: 'medium',
        cameraAngle: 'eye_level',
        cameraMovement: 'static',
        frameDescription: '',
        dialogueIds: [],
        actionIds: [],
        videoPath: '/v1.mp4',
        duration: 6,
        transition: '{}',
        status: 'pending',
        keyframeCount: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'sb2',
        sceneScriptId: 's1',
        shotNumber: 2,
        shotType: 'close',
        cameraAngle: 'eye_level',
        cameraMovement: 'static',
        frameDescription: '',
        dialogueIds: ['sd2'],
        actionIds: [],
        videoPath: '/v2.mp4',
        duration: 6,
        transition: '{}',
        status: 'pending',
        keyframeCount: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as any)
    await ds.query(
      `INSERT INTO storyboard_dialogue_links (id, storyboard_id, dialogue_id, sort_order)
        VALUES ('l1', 'sb2', 'sd2', 0)`,
    )

    const tl = await timelineSvc.buildEpisodeTimeline('es1')
    const cues = await svc.buildCues(tl)
    const dialogueCues = cues.filter((c) => c.source === 'dialogue')

    // sd2 只出现在 sb2；sb1 均分池剔除 sd2 后拿到 sd1/sd3/sd4；无重复分配
    expect(dialogueCues.map((c) => c.dialogueId).sort()).toEqual(['sd1', 'sd2', 'sd3', 'sd4'])
    expect(dialogueCues.find((c) => c.dialogueId === 'sd2')?.storyboardId).toBe('sb2')
    expect(
      dialogueCues.filter((c) => c.storyboardId === 'sb1').map((c) => c.dialogueId),
    ).toEqual(['sd1', 'sd3', 'sd4'])
  })

  it('无对话 / 无旁白：返回空 cues 不报错', async () => {
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
      narration: null, // 无旁白
      dialogues: [], // 无对话
      actions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await ds.getRepository(StoryboardEntity).save({
      id: 'sb1',
      sceneScriptId: 's1',
      shotNumber: 1,
      shotType: 'medium',
      cameraAngle: 'eye_level',
      cameraMovement: 'static',
      movementDuration: null,
      frameDescription: '',
      subject: null,
      composition: null,
      characters: null,
      narrationId: null,
      dialogueIds: [],
      actionIds: [],
      frameImage: null,
      frameImageId: null,
      videoPath: '/v1.mp4',
      duration: 3,
      transition: '{}',
      transitionType: null,
      transitionDurationMs: null,
      transitionDirection: null,
      transitionEasing: null,
      transitionColor: null,
      status: 'pending',
      keyframeCount: 2,
      videoProviderId: null,
      videoModelId: null,
      videoMode: null,
      use3dStaging: 0,
      stagingLayoutId: null,
      backgroundRefImageId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const tl = await timelineSvc.buildEpisodeTimeline('es1')
    const cues = await svc.buildCues(tl)
    expect(cues).toEqual([])
    expect(await svc.buildSrt(tl)).toBe('')
  })
})

describe('formatSrtTime', () => {
  it('边界：0 → 00:00:00,000', () => {
    expect(formatSrtTime(0)).toBe('00:00:00,000')
  })

  it('1.5 秒 → 00:00:01,500', () => {
    expect(formatSrtTime(1.5)).toBe('00:00:01,500')
  })

  it('5025.678 秒 → 01:23:45,678', () => {
    expect(formatSrtTime(5025.678)).toBe('01:23:45,678')
  })

  it('负数：clamp 到 0', () => {
    expect(formatSrtTime(-1)).toBe('00:00:00,000')
  })
})
