/**
 * 场景音频编排 service（spec §4.1 + §4.7 · P5-T14/T15）
 * @module modules/episode-production/render/audio/scene-audio-orchestrator.service
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
import { ReferenceResolver } from '@core/modules/episode-production/narrative/reference-resolver'

const DEFAULT_NARRATION_VOICE = 'Cherry'
const DEFAULT_FALLBACK_VOICE = 'Cherry'

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
}

/**
 * 编排场景全部音频。同时调用 binding-aware 路径 + 老 service 落盘逻辑。
 */
export class SceneAudioOrchestratorService {
  private readonly resolver: ReferenceResolver
  private readonly narrationSvc: NarrationSynthesisService
  private readonly dialogueSvc: DialogueSynthesisService

  constructor(private readonly ds: DataSource) {
    this.resolver = new ReferenceResolver(ds)
    this.narrationSvc = NarrationSynthesisService.getInstance()
    this.dialogueSvc = DialogueSynthesisService.getInstance()
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
    }

    // 1. 旁白
    const narrationText = (scene.narration ?? '').trim()
    if (narrationText) {
      input.onProgress?.('narration', 0, 1)
      const narrationVoice =
        input.defaultNarratorVoiceId ?? DEFAULT_NARRATION_VOICE
      const narrationPath = await this.narrationSvc.generateNarrationAudio(
        narrationText,
        { voiceId: narrationVoice, speed: 1.0, pitch: 0 },
        input.outputDir,
      )
      result.narrationPath = narrationPath
    }

    // 2. 对话（V3 binding-aware 路径）
    const dialogues = (scene.dialogues as Dialogue[] | null) ?? []
    for (let i = 0; i < dialogues.length; i++) {
      const d = dialogues[i]
      input.onProgress?.('dialogue', i, dialogues.length)

      const voiceId = await this.resolveDialogueVoice(d)
      const isFallback = !d.voiceId && voiceId === DEFAULT_FALLBACK_VOICE
      if (isFallback) result.fallbackDialogueCount++

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
      }

      // API 限流防御
      if (i < dialogues.length - 1) {
        await sleep(500)
      }
    }

    return result
  }

  /**
   * 解析对话的 voice ID（spec §4.1 优先级）：
   *   1. dialogue.voiceId（场景级覆盖）
   *   2. character_binding.voiceId（resolver 取）
   *   3. DEFAULT_FALLBACK_VOICE（'Cherry'）
   */
  private async resolveDialogueVoice(d: Dialogue): Promise<string> {
    if (d.voiceId && d.voiceId.length > 0) return d.voiceId
    if (d.characterBindingId) {
      const r = await this.resolver.resolveCharacter(d.characterBindingId)
      if (r?.effective.voiceId) return r.effective.voiceId
    }
    return DEFAULT_FALLBACK_VOICE
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
