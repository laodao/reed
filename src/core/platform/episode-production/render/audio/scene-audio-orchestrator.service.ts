/**
 * 场景音频编排 service（spec §4.1 + §4.7 · P5-T14/T15）
 * @module platform/episode-production/render/audio/scene-audio-orchestrator.service
 *
 * 把 spec §4.1 character_binding_id 强约束接到现有 TTS 路径上：
 *
 * 流程：
 *   1. 加载场景 + scene.dialogues / scene.narration
 *   2. 对每条 dialogue：
 *        优先 dialogue.voiceId（场景级覆盖）
 *        → 否则按 character_binding_id 用 ReferenceResolver 取 binding.voiceId
 *        → 都拿不到则 fallback 默认音色 'Cherry'
 *   3. 旁白：用项目级默认旁白音色或场景指定的旁白音色（暂用默认 'Cherry'）
 *   4. 调既有 NarrationSynthesisService / DialogueSynthesisService（不破坏）落盘
 *
 * 输出：narrationPath + dialoguePaths（dialogueId → audioPath）
 *
 * 与既有 SceneAudioService 区别：
 *   - 老 SceneAudioService 走 long_writing_character_id → characterBindings 查找（V2）
 *   - 本编排 走 character_binding_id → ReferenceResolver（V3 spec §4.1）
 *   - 双轨并存：V2 路径保留兼容，V3 路径走新编排
 */

import type { DataSource } from 'typeorm'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import type { Dialogue } from '@shared/types/episode-production'
import { NarrationSynthesisService } from './narration-synthesis.service'
import { DialogueSynthesisService } from './dialogue-synthesis.service'
import { ReferenceResolver } from '@core/platform/episode-production/narrative/reference-resolver'
import { VoiceService } from '@core/platform/services/voice.service'
import { toRelativeAssetPath } from '@core/utils/asset-path'

export interface OrchestrateAudioInput {
  sceneScriptId: string
  outputDir: string
  /** 项目级默认旁白音色（不传走 'Cherry'） */
  defaultNarratorVoiceId?: string
  onProgress?: (type: 'narration' | 'dialogue', index: number, total: number) => void
}

export interface OrchestrateAudioResult {
  /** 旁白音频路径（无旁白时为 null） */
  narrationPath: string | null
  /** dialogueId → 音频路径 */
  dialoguePaths: Map<string, string>
  /** 解析失败 / 兜底默认音色的对话计数 */
  fallbackDialogueCount: number
  /** 场景有旁白文本但合成失败（0916 review：内部 catch 返回 null 会组装出"空结果不报错"） */
  narrationFailed: boolean
  /** 合成失败的对白条数（生成 null 未进 dialoguePaths） */
  dialogueFailCount: number
}

/**
 * 编排场景全部音频。同时调用 binding-aware 路径 + 老 service 落盘逻辑。
 */
export class SceneAudioOrchestratorService {
  private readonly resolver: ReferenceResolver
  private readonly narrationSvc: NarrationSynthesisService
  private readonly dialogueSvc: DialogueSynthesisService
  /** 运行时缓存：第一次需要 fallback voice 时去 VoiceService 取列表，缓存后复用 */
  private cachedFallbackVoiceId: string | null = null

  constructor(private readonly ds: DataSource) {
    this.resolver = new ReferenceResolver(ds)
    this.narrationSvc = NarrationSynthesisService.getInstance()
    this.dialogueSvc = DialogueSynthesisService.getInstance()
  }

  /**
   * 取系统可用音色作为 fallback。
   *
   * 来源优先级：
   *   1. VoiceService.getVoices() 返回的第一个（含 DashScope 预置 + cloned voices）
   *   2. 失败时抛错（不再静默走硬编码 'Cherry'，迫使运维真正配 voice provider）
   *
   * 缓存避免每条对话都去查；首次调用时拉一次列表。
   */
  private async resolveFallbackVoiceId(): Promise<string> {
    if (this.cachedFallbackVoiceId) return this.cachedFallbackVoiceId
    const resp = await VoiceService.getVoices()
    if (!resp.success || !resp.data || resp.data.length === 0) {
      throw new Error(
        '无法生成音频：系统未提供任何可用音色。请在「设置 → 模型服务」配置 ' +
          'TTS provider（如 DashScope qwen-tts）后重试。',
      )
    }
    this.cachedFallbackVoiceId = resp.data[0].id
    return this.cachedFallbackVoiceId
  }

  async orchestrateScene(
    input: OrchestrateAudioInput,
  ): Promise<OrchestrateAudioResult> {
    const scene = await this.ds
      .getRepository(SceneScriptEntity)
      .findOne({ where: { id: input.sceneScriptId } })
    if (!scene) throw new Error(`Scene not found: ${input.sceneScriptId}`)

    const result: OrchestrateAudioResult = {
      narrationPath: null,
      dialoguePaths: new Map(),
      fallbackDialogueCount: 0,
      narrationFailed: false,
      dialogueFailCount: 0,
    }

    // 1. 旁白
    const narrationText = (scene.narration ?? '').trim()
    if (narrationText) {
      input.onProgress?.('narration', 0, 1)
      // 旁白音色：用户传 → 项目级配置 → VoiceService 取系统第一个可用
      const narrationVoice =
        input.defaultNarratorVoiceId ?? (await this.resolveFallbackVoiceId())
      const narrationPath = await this.narrationSvc.generateNarrationAudio(
        narrationText,
        { voiceId: narrationVoice, speed: 1.0, pitch: 0 },
        input.outputDir,
      )
      result.narrationPath = narrationPath
      if (!narrationPath) result.narrationFailed = true
    }

    // 2. 对话（V3 binding-aware 路径）
    const dialogues = (scene.dialogues as Dialogue[] | null) ?? []
    for (let i = 0; i < dialogues.length; i++) {
      const d = dialogues[i]
      input.onProgress?.('dialogue', i, dialogues.length)

      const { voiceId, fellBackToSystemDefault } = await this.resolveDialogueVoice(d)
      if (fellBackToSystemDefault) result.fallbackDialogueCount++

      // 调老 service 落盘。它内部走 binding 查 voice，会"再查一次"，
      // 但我们已经在这里把场景级 voiceId 决定好；为了不双重查找，直接调
      // narration 服务（参数完全等价：text + voiceConfig + outputDir）。
      const audioPath = await this.narrationSvc.generateNarrationAudio(
        d.text,
        { voiceId, speed: 1.0, pitch: 0 },
        input.outputDir,
      )
      if (audioPath) {
        result.dialoguePaths.set(d.id, audioPath)
      } else {
        result.dialogueFailCount++
      }

      // API 限流防御
      if (i < dialogues.length - 1) {
        await sleep(500)
      }
    }

    return result
  }

  /**
   * 产物落库（2026-09-16 P0-CM1）：此前 V3 结果只经 IPC 返回不持久化，导出器无从
   * 读取，成片永远无声。对白写 dialogues[].audioAsset（与 V2 路径同构），旁白写
   * scene_scripts.narration_audio_path。UI handler 与 agent 工具共用本方法。
   *
   * 落库一律转 user-rel 相对路径（相对 dataPath，与 image_assets / segment.videoPath
   * 同约定）：绝对路径落库后数据目录一迁移就成死路径，会被导出器当坏文件静默剔除
   * （X4：成片无声）。读取侧统一走 resolveAssetPath 兼容存量绝对路径。
   */
  async persistToScene(sceneScriptId: string, result: OrchestrateAudioResult): Promise<void> {
    if (result.dialoguePaths.size === 0 && !result.narrationPath) return
    // 对白与旁白同事务落库——两次 update 非原子会出现"对白落了旁白没落"的半落库
    await this.ds.transaction(async (em) => {
      const repo = em.getRepository(SceneScriptEntity)
      const scene = await repo.findOne({ where: { id: sceneScriptId } as any })
      if (!scene) return
      if (result.dialoguePaths.size > 0) {
        const dialogues = JSON.parse(JSON.stringify(scene.dialogues ?? []))
        for (const [dialogueId, audioPath] of result.dialoguePaths) {
          const idx = dialogues.findIndex((d: any) => d?.id === dialogueId)
          if (idx !== -1) {
            dialogues[idx].audioAsset = {
              id: `audio_${dialogueId}_${Date.now()}`,
              type: 'dialogue',
              text: dialogues[idx].text,
              audioPath: toRelativeAssetPath(audioPath),
            }
          }
        }
        await repo.update({ id: sceneScriptId } as any, { dialogues } as any)
      }
      if (result.narrationPath) {
        await repo.update({ id: sceneScriptId } as any, {
          narrationAudioPath: toRelativeAssetPath(result.narrationPath),
        } as any)
      }
    })
  }

  /**
   * 解析对话的 voice ID（spec §4.1 优先级）：
   *   1. dialogue.voiceId（场景级覆盖）
   *   2. character_binding.voiceId（resolver 取）
   *   3. VoiceService 第一个可用音色（运行时取，不硬编码）
   *
   * 返回 fellBackToSystemDefault=true 表示走了第 3 档（系统兜底），调用方累计统计。
   */
  private async resolveDialogueVoice(
    d: Dialogue,
  ): Promise<{ voiceId: string; fellBackToSystemDefault: boolean }> {
    if (d.voiceId && d.voiceId.length > 0) {
      return { voiceId: d.voiceId, fellBackToSystemDefault: false }
    }
    if (d.characterBindingId) {
      const r = await this.resolver.resolveCharacter(d.characterBindingId)
      if (r?.effective.voiceId) {
        return { voiceId: r.effective.voiceId, fellBackToSystemDefault: false }
      }
    }
    const voiceId = await this.resolveFallbackVoiceId()
    return { voiceId, fellBackToSystemDefault: true }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
