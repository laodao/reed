/**
 * narrative/ai/scene-polisher
 * @module platform/episode-production/narrative/ai/scene-polisher
 * @description 场景级 AI 润色器（spec 2026-05-08）。
 *              输入完整 SceneScript（含原文/旁白/对话/动作 + 场景上下文），
 *              输出润色后的 sceneDescription / originalText / narration / dialogues / actions
 *              JSON 子集，让用户在 SceneEditDialog 里对比 → 接受 → 保存。
 *
 * 设计原则：
 * - 仅润色，不重新生成结构（不增删 dialogues/actions 数量、不改 id）
 * - 保留所有 binding_id（characterId / characterBindingId / itemBindingId 原样回填）
 * - 输出 JSON 子集，避免误改 sceneNumber / location / locationBindingId 等"骨架"字段
 */

import { callAI, extractJsonFromResponse } from './_helpers'
import type {
  SceneScript,
  Dialogue,
  ActionDescription,
} from '@shared/types/episode-production'

/**
 * 场景背景上下文（拼到 prompt 让 AI 理解世界观一致性）。
 * 来自 episode 主表 storyEra / storyRegion / storyBackgroundExtra。
 */
export interface PolishStoryContext {
  era?: string | null
  region?: string | null
  extra?: string | null
}

/** 润色输出：仅这几个字段会被填回 SceneEditDialog */
export interface ScenePolishResult {
  sceneDescription: string
  originalText: string
  narration: string
  dialogues: Dialogue[]
  actions: ActionDescription[]
}

const SYSTEM_PROMPT = `你是一位拥有 10 年以上一线影视工业经验的职业编剧，擅长把粗糙的剧本场景润色成富有画面感、情感张力和潜台词的成熟剧本。

润色要求：
1. 保持场景时空、地点、角色出场不变
2. 保留所有 dialogue 和 action 的 id 字段、characterId / characterBindingId / itemBindingId 字段原样不动
3. 不增删 dialogue / action 条目数量（只改文本和情感/timing）
4. 让旁白具有叙事节奏，对白精炼且富含潜台词，动作描写有画面感
5. 与故事年代/地域/世界观保持一致
6. 直接输出 JSON 格式，不要任何额外说明`

/**
 * 构造润色 prompt。
 *
 * 用 ===SCENE_JSON=== 包裹原始场景 JSON，让模型清晰看到结构；
 * 输出用 ===POLISHED_JSON=== 包裹避免被前后白话噪声污染。
 */
function buildPrompt(scene: SceneScript, ctx: PolishStoryContext): string {
  const ctxLines: string[] = []
  if (ctx.era) ctxLines.push(`【故事年代】${ctx.era}`)
  if (ctx.region) ctxLines.push(`【故事地域】${ctx.region}`)
  if (ctx.extra) ctxLines.push(`【其他背景】${ctx.extra}`)

  const sceneInput = {
    sceneNumber: scene.sceneNumber,
    location: scene.location,
    locationType: scene.locationType,
    timeOfDay: scene.timeOfDay,
    weather: scene.weather,
    mood: scene.mood,
    lighting: scene.lighting,
    sceneDescription: scene.sceneDescription,
    originalText: scene.originalText,
    narration: scene.narration,
    dialogues: scene.dialogues ?? [],
    actions: scene.actions ?? [],
  }

  return `请润色下面这一场戏。

${ctxLines.join('\n')}

===SCENE_JSON===
${JSON.stringify(sceneInput, null, 2)}
===SCENE_JSON_END===

输出格式（严格遵守，用以下分隔符包裹纯 JSON，无其他文字）：

===POLISHED_JSON===
{
  "sceneDescription": "更富画面感的场景描述（含空间布局/陈设/材质/色调/关键视觉元素，120-300 字）",
  "originalText": "对应小说原文风格的润色文本（保持叙事视角，60-200 字；无原文则空串）",
  "narration": "节奏化旁白文本（适合视频字幕/配音，40-150 字）",
  "dialogues": [
    {
      "id": "原 id 不变",
      "characterId": "原 characterId 不变",
      "characterBindingId": "原 characterBindingId 不变（无则保持 null）",
      "characterName": "原角色名不变",
      "text": "润色后的对白",
      "emotion": "情感（如：愤怒、平静、压抑）",
      "volume": "原值或 normal",
      "pace": "原值或 normal",
      "pause": 0
    }
  ],
  "actions": [
    {
      "id": "原 id 不变",
      "characterId": "原 characterId 不变（群像动作可空）",
      "characterBindingId": "原 characterBindingId 不变（无则 null）",
      "description": "更具画面感的动作描述",
      "timing": "before / during / after（保持原值或合理调整）",
      "duration": 2
    }
  ]
}
===POLISHED_JSON_END===`
}

/**
 * 从 AI 响应里把 ===POLISHED_JSON=== ... ===POLISHED_JSON_END=== 之间的 JSON 抠出来。
 * 失败时回退到 extractJsonFromResponse（最宽松的 JSON 提取）。
 */
function extractPolishedJson(response: string): unknown {
  const re = /===POLISHED_JSON===([\s\S]*?)===POLISHED_JSON_END===/
  const m = response.match(re)
  if (m && m[1]) {
    const raw = m[1].trim()
    try {
      return JSON.parse(raw)
    } catch {
      // 部分模型在 fence 里仍可能有 ```json，剥一层再 extract
      return extractJsonFromResponse(raw)
    }
  }
  return extractJsonFromResponse(response)
}

/**
 * 场景级润色器单例。
 */
export class EpisodeScenePolisher {
  private static instance: EpisodeScenePolisher

  static getInstance(): EpisodeScenePolisher {
    if (!EpisodeScenePolisher.instance) {
      EpisodeScenePolisher.instance = new EpisodeScenePolisher()
    }
    return EpisodeScenePolisher.instance
  }

  /**
   * 润色一个场景。
   *
   * @param scene 原始 SceneScript（前端拿到的最新版本）
   * @param ctx   故事背景上下文（来自 episode.storyEra / storyRegion / storyBackgroundExtra）
   * @returns 润色后的字段子集；失败抛错由 handler 转 IPC error
   */
  async polishScene(
    scene: SceneScript,
    ctx: PolishStoryContext,
    providerConfigId?: string,
    modelId?: string,
  ): Promise<ScenePolishResult> {
    const prompt = buildPrompt(scene, ctx)
    const response = await callAI(prompt, SYSTEM_PROMPT, 4096, providerConfigId, modelId, { temperature: 0.3 })
    const parsed = extractPolishedJson(response) as Partial<ScenePolishResult> | null

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('润色失败：AI 返回内容不是合法 JSON')
    }

    // 兜底：缺字段用原值（避免某些模型只输出部分字段就把别的字段清空）
    const result: ScenePolishResult = {
      sceneDescription:
        typeof parsed.sceneDescription === 'string'
          ? parsed.sceneDescription
          : (scene.sceneDescription ?? ''),
      originalText:
        typeof parsed.originalText === 'string'
          ? parsed.originalText
          : (scene.originalText ?? ''),
      narration:
        typeof parsed.narration === 'string'
          ? parsed.narration
          : (scene.narration ?? ''),
      dialogues: Array.isArray(parsed.dialogues)
        ? this.mergeDialogues(scene.dialogues ?? [], parsed.dialogues as Dialogue[])
        : (scene.dialogues ?? []),
      actions: Array.isArray(parsed.actions)
        ? this.mergeActions(scene.actions ?? [], parsed.actions as ActionDescription[])
        : (scene.actions ?? []),
    }

    return result
  }

  /**
   * 把润色后的 dialogues 与原 dialogues 按 id 对齐合并：
   * - 优先按 id 匹配；id 缺失则按下标对齐
   * - 任一 binding 字段缺失时回退原值（防 AI 把 binding 改丢）
   * - 如果 AI 多/少返了条目，以 AI 的为准但保留原 id 序列
   */
  private mergeDialogues(orig: Dialogue[], polished: Dialogue[]): Dialogue[] {
    return polished.map((p, idx) => {
      const o = (p.id && orig.find((x) => x.id === p.id)) || orig[idx]
      return {
        id: p.id ?? o?.id ?? `dlg_${Date.now()}_${idx}`,
        characterBindingId: p.characterBindingId ?? o?.characterBindingId ?? null,
        characterId: p.characterId ?? o?.characterId ?? '',
        characterName: p.characterName ?? o?.characterName ?? '',
        text: p.text ?? o?.text ?? '',
        emotion: p.emotion ?? o?.emotion,
        volume: p.volume ?? o?.volume,
        pace: p.pace ?? o?.pace,
        pause: p.pause ?? o?.pause,
        voiceId: o?.voiceId ?? null, // 配音 id 不让 AI 改
        audioAsset: o?.audioAsset, // 音频资产同上
      }
    })
  }

  private mergeActions(
    orig: ActionDescription[],
    polished: ActionDescription[],
  ): ActionDescription[] {
    return polished.map((p, idx) => {
      const o = (p.id && orig.find((x) => x.id === p.id)) || orig[idx]
      return {
        id: p.id ?? o?.id ?? `act_${Date.now()}_${idx}`,
        characterBindingId: p.characterBindingId ?? o?.characterBindingId ?? null,
        characterId: p.characterId ?? o?.characterId,
        description: p.description ?? o?.description ?? '',
        timing: p.timing ?? o?.timing ?? 'during',
        duration: p.duration ?? o?.duration,
      }
    })
  }
}
