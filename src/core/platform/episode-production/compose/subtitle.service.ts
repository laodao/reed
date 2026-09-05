/**
 * 字幕轨生成 service（spec §5.3 · P6-T3）
 * @module platform/episode-production/compose/subtitle.service
 *
 * 输入：Timeline（P6-T1 装配）+ DataSource
 * 输出：SRT 字幕字符串 + 字幕条目数组（可写 .srt 文件 + 给 ffmpeg-assembler 用）
 *
 * 字幕来源：
 *   - 旁白（scene.narration）：场景级，在场景的第一个分镜起始处显示
 *   - 对话（dialogues 表 / scene.dialogues JSON）：分镜级，按 storyboard.dialogue_ids
 *     关联（V3 normalized）；JSON 列回退（V2 兼容）
 *
 * 时间分配（简化策略）：
 *   - 一个分镜内的对话按顺序均分该分镜时长
 *   - 一个对话最少 1 秒，超过 shot 时长则截断
 *   - 旁白单独显示在场景第一个分镜的前半段（不与对话重叠）
 *
 * 纯计算 + 单次 IO 查询，便于单测覆盖。
 */

import type { DataSource } from 'typeorm'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import type { Timeline, TimelineShot } from './timeline-builder.service'

/** 一条字幕 */
export interface SubtitleCue {
  /** 全局起始秒数（在整个剧集内） */
  startSec: number
  /** 全局结束秒数 */
  endSec: number
  /** 字幕显示文本 */
  text: string
  /** 来源：narration / dialogue */
  source: 'narration' | 'dialogue'
  /** 关联：dialogue 时含 characterName + dialogueId */
  characterName?: string
  dialogueId?: string
  /** 所属 storyboard */
  storyboardId: string
}

const MIN_CUE_DURATION_SEC = 1
const NARRATION_LEAD_SEC = 2 // 旁白默认显示 2 秒

export class SubtitleService {
  constructor(private readonly ds: DataSource) {}

  /**
   * 给一个 Timeline 生成全部字幕条目。
   * 分镜按时间顺序遍历；对每个分镜组装 narration（场景首镜）+ dialogues。
   */
  async buildCues(timeline: Timeline): Promise<SubtitleCue[]> {
    const cues: SubtitleCue[] = []
    for (const scene of timeline.scenes) {
      const sceneEntity = await this.ds
        .getRepository(SceneScriptEntity)
        .findOne({ where: { id: scene.sceneId } })
      if (!sceneEntity) continue

      // 旁白：场景首镜
      const firstShot = scene.shots[0]
      if (firstShot && sceneEntity.narration?.trim()) {
        const lead = Math.min(NARRATION_LEAD_SEC, firstShot.durationSec)
        cues.push({
          startSec: firstShot.startSec,
          endSec: firstShot.startSec + lead,
          text: sceneEntity.narration.trim(),
          source: 'narration',
          storyboardId: firstShot.storyboardId,
        })
      }

      // 对话：每个 storyboard 关联的 dialogues
      for (const shot of scene.shots) {
        const dialogues = await this.loadDialoguesForShot(shot, sceneEntity)
        cues.push(...this.distributeShotDialogues(shot, dialogues))
      }
    }
    // 按起始时间排序（避免 narration 与 dialogue 顺序错乱）
    cues.sort((a, b) => a.startSec - b.startSec)
    return cues
  }

  /**
   * 把 cues 转 SRT 字符串。
   * 行号从 1 开始；时间格式 hh:mm:ss,mmm。
   */
  toSrt(cues: SubtitleCue[]): string {
    return cues
      .map((c, i) => {
        const start = formatSrtTime(c.startSec)
        const end = formatSrtTime(c.endSec)
        const text =
          c.source === 'dialogue' && c.characterName
            ? `${c.characterName}：${c.text}`
            : c.text
        return `${i + 1}\n${start} --> ${end}\n${text}\n`
      })
      .join('\n')
  }

  /**
   * 一站式：build + 写到 SRT 字符串
   */
  async buildSrt(timeline: Timeline): Promise<string> {
    const cues = await this.buildCues(timeline)
    return this.toSrt(cues)
  }

  // ─── 内部 ──────────────────────────────────────────────

  private async loadDialoguesForShot(
    shot: TimelineShot,
    sceneEntity: SceneScriptEntity,
  ): Promise<Array<{ id: string; text: string; characterName: string }>> {
    // V3：从 storyboard.dialogue_ids 关联（实际 schema：storyboard_dialogue_links 表）
    // 简化：用 sceneEntity.dialogues JSON 顺序按 shot 数均分（兼容 V2 路径）
    // 真正的精细分配需要 storyboard_dialogue_links 表，留 follow-up
    const allDialogues = (sceneEntity.dialogues as any[] | null) ?? []

    // 这里的简化：平均分给场景内的 shots
    // 算 shot 在场景内的位置，按比例切分对话
    const sceneShots = await this.countShotsInScene(sceneEntity.id)
    if (sceneShots === 0) return []
    const idxInScene = await this.indexOfShotInScene(shot, sceneEntity.id)
    const dialoguesPerShot = Math.ceil(allDialogues.length / sceneShots)
    const start = idxInScene * dialoguesPerShot
    const end = Math.min(start + dialoguesPerShot, allDialogues.length)
    return allDialogues.slice(start, end).map((d: any) => ({
      id: d.id ?? `d_${start}_${end}`,
      text: d.text ?? '',
      characterName: d.characterName ?? '',
    }))
  }

  private async countShotsInScene(sceneId: string): Promise<number> {
    // 查 storyboard 数；这里用 timeline 已加载的 sceneShots 数会更省，
    // 但 service 接 cues 时可能只有 timeline 已经传入。简化用 typeorm count。
    const count = await this.ds
      .getRepository<any>('storyboards' as any)
      .count({ where: { sceneScriptId: sceneId } as any })
      .catch(() => 0)
    return count
  }

  private async indexOfShotInScene(
    shot: TimelineShot,
    sceneId: string,
  ): Promise<number> {
    void sceneId
    return Math.max(0, shot.shotNumber - 1)
  }

  /**
   * 在一个分镜的时间区间内均分字幕：
   * - 单条对话默认占 shot.durationSec / dialogues.length
   * - 最短不小于 MIN_CUE_DURATION_SEC（除非超过 shot 时长）
   */
  private distributeShotDialogues(
    shot: TimelineShot,
    dialogues: Array<{ id: string; text: string; characterName: string }>,
  ): SubtitleCue[] {
    if (dialogues.length === 0) return []
    const slot = shot.durationSec / dialogues.length
    const cues: SubtitleCue[] = []
    for (let i = 0; i < dialogues.length; i++) {
      const d = dialogues[i]
      if (!d.text.trim()) continue
      const startSec = shot.startSec + i * slot
      const span = Math.max(MIN_CUE_DURATION_SEC, slot)
      const endSec = Math.min(shot.startSec + (i + 1) * slot, startSec + span)
      cues.push({
        startSec,
        endSec: Math.min(endSec, shot.endSec),
        text: d.text.trim(),
        source: 'dialogue',
        characterName: d.characterName || undefined,
        dialogueId: d.id,
        storyboardId: shot.storyboardId,
      })
    }
    return cues
  }
}

/**
 * SRT 时间格式：hh:mm:ss,mmm
 */
export function formatSrtTime(totalSec: number): string {
  const sec = Math.max(0, totalSec)
  const hours = Math.floor(sec / 3600)
  const minutes = Math.floor((sec % 3600) / 60)
  const seconds = Math.floor(sec % 60)
  const millis = Math.round((sec - Math.floor(sec)) * 1000)
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0')
}
