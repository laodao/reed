/**
 * ImportFromParsedShotsService · spec（D5 follow-up · #55，spec 2026-05-09 §3.2 D5 · P-22）
 *
 * 验证：
 *   - 空数组返回空 imageIds
 *   - VLM 简化值 → 项目枚举 mapping 正确
 *   - shotNumber 续号（追加到既有最大值之后）
 *   - durationSec → milliseconds 转换 + 最小 500ms
 *   - frameDescription 缺省 fallback
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import {
  ImportFromParsedShotsService,
  _testing,
} from '@core/modules/episode-production/narrative/import-from-parsed-shots.service'
import type { ParsedShot } from '@core/database/entities/episode-production/reference-video-analysis.entity'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [StoryboardEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

const SAMPLE_SHOT: ParsedShot = {
  shotIndex: 1,
  startSec: 0,
  endSec: 2.5,
  durationSec: 2.5,
  shotType: 'close_up',
  cameraAngle: 'low',
  cameraMovement: 'push',
  frameDescription: '主角眼神特写',
  emotion: '紧张',
  representativeFramePath: '/tmp/shot-1.jpg',
  detectedDialogue: null,
}

describe('ImportFromParsedShotsService', () => {
  let ds: DataSource
  let svc: ImportFromParsedShotsService

  beforeEach(async () => {
    ds = await buildDb()
    svc = new ImportFromParsedShotsService(ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('空数组 → 返回空 storyboardIds', async () => {
    const result = await svc.importToScene({
      sceneScriptId: 'sc1',
      parsedShots: [],
    })
    expect(result.storyboardIds).toEqual([])
  })

  it('单 shot 导入 → 创建一行 storyboard', async () => {
    const result = await svc.importToScene({
      sceneScriptId: 'sc1',
      parsedShots: [SAMPLE_SHOT],
    })
    expect(result.storyboardIds.length).toBe(1)
    const repo = ds.getRepository(StoryboardEntity)
    const rows = await repo.find({})
    expect(rows.length).toBe(1)
    expect(rows[0].sceneScriptId).toBe('sc1')
    expect(rows[0].shotNumber).toBe(1)
    expect(rows[0].shotType).toBe('close')          // close_up → close
    expect(rows[0].cameraAngle).toBe('low')
    expect(rows[0].cameraMovement).toBe('dolly_in') // push → dolly_in
    expect(rows[0].frameDescription).toBe('主角眼神特写')
    expect(rows[0].duration).toBe(2500)             // 2.5s → 2500ms
  })

  it('shotNumber 续号 — 追加到既有最大值之后', async () => {
    // 先插一个已有的 storyboard
    const repo = ds.getRepository(StoryboardEntity)
    await repo.save({
      id: 'existing',
      sceneScriptId: 'sc1',
      shotNumber: 5,
      shotType: 'medium',
      cameraAngle: 'eye_level',
      cameraMovement: 'static',
      frameDescription: '已有',
      characters: [],
      dialogueIds: [],
      actionIds: [],
      duration: 1000,
      transition: '{}',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    await svc.importToScene({
      sceneScriptId: 'sc1',
      parsedShots: [SAMPLE_SHOT, SAMPLE_SHOT, SAMPLE_SHOT],
    })

    const all = await repo.find({ order: { shotNumber: 'ASC' } })
    expect(all.map((r) => r.shotNumber)).toEqual([5, 6, 7, 8])
  })

  it('durationSec 极小 → 兜底到 500ms', async () => {
    const tinyShot = { ...SAMPLE_SHOT, durationSec: 0.1 }
    await svc.importToScene({
      sceneScriptId: 'sc1',
      parsedShots: [tinyShot],
    })
    const rows = await ds.getRepository(StoryboardEntity).find({})
    expect(rows[0].duration).toBeGreaterThanOrEqual(500)
  })

  it('frameDescription 缺省 → fallback 描述', async () => {
    const noDesc = { ...SAMPLE_SHOT, frameDescription: '' }
    await svc.importToScene({
      sceneScriptId: 'sc1',
      parsedShots: [noDesc],
    })
    const rows = await ds.getRepository(StoryboardEntity).find({})
    expect(rows[0].frameDescription).toMatch(/参考视频/)
  })

  describe('mapping helpers', () => {
    it('shotType 全枚举映射', () => {
      expect(_testing.mapShotType('big_close_up')).toBe('detail')
      expect(_testing.mapShotType('close_up')).toBe('close')
      expect(_testing.mapShotType('medium')).toBe('medium')
      expect(_testing.mapShotType('long')).toBe('long')
      expect(_testing.mapShotType('wide')).toBe('extreme_long')
      expect(_testing.mapShotType('unknown')).toBe('medium')  // fallback
      expect(_testing.mapShotType(undefined)).toBe('medium')
    })

    it('cameraAngle 全枚举映射', () => {
      expect(_testing.mapCameraAngle('eye_level')).toBe('eye_level')
      expect(_testing.mapCameraAngle('high')).toBe('high')
      expect(_testing.mapCameraAngle('low')).toBe('low')
      expect(_testing.mapCameraAngle('overhead')).toBe('birds_eye')
      expect(_testing.mapCameraAngle('dutch')).toBe('dutch')
      expect(_testing.mapCameraAngle('unknown')).toBe('eye_level')
    })

    it('cameraMovement 全枚举映射', () => {
      expect(_testing.mapCameraMovement('static')).toBe('static')
      expect(_testing.mapCameraMovement('push')).toBe('dolly_in')
      expect(_testing.mapCameraMovement('pull')).toBe('dolly_out')
      expect(_testing.mapCameraMovement('pan')).toBe('pan_right')
      expect(_testing.mapCameraMovement('track')).toBe('truck_left')
      expect(_testing.mapCameraMovement('handheld')).toBe('handheld')
      expect(_testing.mapCameraMovement('unknown')).toBe('static')
    })
  })
})
