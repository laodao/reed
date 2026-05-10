/**
 * 从 ParsedShot 导入分镜 service（spec 2026-05-09 ep-redesign §3.2 D5 follow-up · #55）
 *
 * 把 ReferenceVideoAnalysisService 解析出的 ParsedShot[]（VLM 推断字段）转成
 * storyboard 行批量插入到目标 sceneScript 下，让用户参考视频后能"反向工程"成分镜骨架。
 */

import type { DataSource } from 'typeorm'
import type { ParsedShot } from '@core/database/entities/episode-production/reference-video-analysis.entity'
import type {
  ShotType,
  CameraAngle,
  CameraMovement,
} from '@shared/types/episode-production/narrative.types'
import { StoryboardRepository, type CreateStoryboardRequest } from '@core/database/repositories/storyboard.repository'

/**
 * VLM 输出的简化值 → 项目内枚举映射。
 *
 * VLM prompt 约束输出 5 类景别 / 5 类角度 / 6 类运镜（vlm-shot-inferrer 中定义）；
 * 项目枚举更细。这里做最近邻映射，未识别值兜底到默认。
 */
const SHOT_TYPE_MAP: Record<string, ShotType> = {
  big_close_up: 'detail',
  close_up: 'close',
  medium: 'medium',
  long: 'long',
  wide: 'extreme_long',
}

const CAMERA_ANGLE_MAP: Record<string, CameraAngle> = {
  eye_level: 'eye_level',
  high: 'high',
  low: 'low',
  overhead: 'birds_eye',
  dutch: 'dutch',
}

const CAMERA_MOVEMENT_MAP: Record<string, CameraMovement> = {
  static: 'static',
  push: 'dolly_in',
  pull: 'dolly_out',
  pan: 'pan_right',
  track: 'truck_left',
  handheld: 'handheld',
}

function mapShotType(s: string | undefined): ShotType {
  return SHOT_TYPE_MAP[s ?? ''] ?? 'medium'
}

function mapCameraAngle(a: string | undefined): CameraAngle {
  return CAMERA_ANGLE_MAP[a ?? ''] ?? 'eye_level'
}

function mapCameraMovement(m: string | undefined): CameraMovement {
  return CAMERA_MOVEMENT_MAP[m ?? ''] ?? 'static'
}

export class ImportFromParsedShotsService {
  constructor(private readonly ds: DataSource) {}

  /**
   * 把 ParsedShot[] 批量转为 storyboard 行追加到目标 sceneScript 下。
   *
   * 行为:
   *   - 自动 shotNumber 续号（既有 max + 1, +2, ...）
   *   - 时长 durationSec 转毫秒到 storyboard.duration
   *   - frameDescription / shot 字段从 VLM 推断字段映射
   *   - characters / dialogueIds / actionIds 留空（用户后续在 ④ 分镜 stage 编辑）
   *   - 默认 transition：cut（最常见）
   */
  async importToScene(input: {
    sceneScriptId: string
    parsedShots: ParsedShot[]
  }): Promise<{ storyboardIds: string[] }> {
    if (!input.sceneScriptId) throw new Error('sceneScriptId 必填')
    if (!Array.isArray(input.parsedShots) || input.parsedShots.length === 0) {
      return { storyboardIds: [] }
    }

    const repo = new StoryboardRepository(this.ds)
    const existing = await repo.getBySceneScriptId(input.sceneScriptId)
    const baseShotNumber = existing.length > 0
      ? Math.max(...existing.map((s) => s.shotNumber))
      : 0

    const requests: CreateStoryboardRequest[] = input.parsedShots.map((p, i) => ({
      sceneScriptId: input.sceneScriptId,
      shotNumber: baseShotNumber + i + 1,
      shotType: mapShotType(p.shotType),
      cameraAngle: mapCameraAngle(p.cameraAngle),
      cameraMovement: mapCameraMovement(p.cameraMovement),
      frameDescription: p.frameDescription || `（参考视频 shot ${p.shotIndex}）`,
      characters: [],
      dialogueIds: [],
      actionIds: [],
      duration: Math.max(500, Math.round((p.durationSec ?? 1) * 1000)),
      transition: { type: 'cut' } as any,
    }))

    const saved = await repo.createMany(requests)
    return { storyboardIds: saved.map((s) => s.id) }
  }
}

// 给测试 / 直接复用 mapping 函数 export
export const _testing = {
  mapShotType,
  mapCameraAngle,
  mapCameraMovement,
}
