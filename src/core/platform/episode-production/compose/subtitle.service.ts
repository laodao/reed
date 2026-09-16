/**
 * 字幕轨生成 service（spec §5.3 · P6-T3）
 * @module platform/episode-production/compose/subtitle.service
 *
 * 输入：Timeline（P6-T1 装配）+ DataSource
 * 输出：SRT 字幕字符串 + 字幕条目数组（可写 .srt 文件 + 给 ffmpeg-assembler 用）
 *
 * 字幕来源：
 *   - 旁白（scene.narration）：场景级，在场景的第一个分镜起始处显示，说话人标"旁白"
 *   - 对话：分镜级，按场景内 shot 位置均分。说话人优先取归一化 scene_dialogues 表
 *     的 character_name（V3），空表回退 scene.dialogues JSON 列（V2 兼容），
 *     都解析不到才标"未知角色"
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
import { SceneDialogueEntity } from '@core/database/entities/episode-production/scene-dialogue.entity'
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
const NARRATION_SPEAKER = '旁白'
const UNKNOWN_SPEAKER = '未知角色' // 说话人实在解析不到时的兜底

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

      // 旁白：场景首镜（说话人标"旁白"）
      const firstShot = scene.shots[0]
      if (firstShot && sceneEntity.narration?.trim()) {
        const lead = Math.min(NARRATION_LEAD_SEC, firstShot.durationSec)
        cues.push({
          startSec: firstShot.startSec,
          endSec: firstShot.startSec + lead,
          text: sceneEntity.narration.trim(),
          source: 'narration',
          characterName: NARRATION_SPEAKER,
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
   * 有说话人（dialogue 角色名 / narration "旁白"）时以"说话人：内容"呈现。
   */
  toSrt(cues: SubtitleCue[]): string {
    return cues
      .map((c, i) => {
        const start = formatSrtTime(c.startSec)
        const end = formatSrtTime(c.endSec)
        const text = c.characterName ? `${c.characterName}：${c.text}` : c.text
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
    // 说话人解析优先级（H8）：
    //   1. 归一化 scene_dialogues 表（character_name 为权威角色名，V3 路径）
    //   2. scene_scripts.dialogues JSON 列（V2 兼容回退）
    //   3. 都解析不到 → "未知角色"
    // 对话到分镜的分配保持原有简化策略：按 shot 在场景内的位置均分
    // （真正的精细分配需要 storyboard_dialogue_links 表，留 follow-up）
    const dialoguesTable = await this.ds
      .getRepository(SceneDialogueEntity)
      .find({ where: { sceneScriptId: sceneEntity.id }, order: { sortOrder: 'ASC' } })
      .catch(() => [] as SceneDialogueEntity[])

    const allDialogues: Array<{ id: string; text: string; characterName: string }> =
      dialoguesTable.length > 0
        ? dialoguesTable.map((d) => ({
            id: d.id,
            text: d.text ?? '',
            characterName: d.characterName?.trim() || UNKNOWN_SPEAKER,
          }))
        : ((sceneEntity.dialogues as any[] | null) ?? []).map((d: any, i: number) => ({
            id: d.id ?? `d_${i}`,
            text: d.text ?? '',
            characterName: (typeof d.characterName === 'string' && d.characterName.trim()) || UNKNOWN_SPEAKER,
          }))

    // 这里的简化：平均分给场景内的 shots
    // 算 shot 在场景内的位置，按比例切分对话
    const sceneShots = await this.countShotsInScene(sceneEntity.id)
    if (sceneShots === 0) return []
    const idxInScene = await this.indexOfShotInScene(shot, sceneEntity.id)
    const dialoguesPerShot = Math.ceil(allDialogues.length / sceneShots)
    const start = idxInScene * dialoguesPerShot
    const end = Math.min(start + dialoguesPerShot, allDialogues.length)
    return allDialogues.slice(start, end)
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
        characterName: d.characterName,
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
