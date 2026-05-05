/**
 * narrative/ai/script-generator
 * @module modules/episode-production/narrative/ai/script-generator
 * @description 剧本（章节梗概 + 场景拆分）生成器。spec §4.1 要求 AI 输出 binding_id 强约束。
 *
 * 改造要点（P4-T4）：
 * - 入参从 `Array<{id, name}>` 改为 AssetRosterForScript（含 characters / locations / items 三类）
 * - 提示词把三类资产花名册一并喂给 AI，要求按 binding_id 引用，禁止裸字符串
 * - 解析阶段优先取 AI 给的 *BindingId；空 / 未命中 roster 时按 name 回退到匹配 binding，
 *   依然找不到时落 null（validator 会标违例 → UI 提示用户手动绑）
 */

import type {
  FullScriptGenerationResult,
  GeneratedScene,
  GeneratedSceneCharacter,
  GeneratedDialogue,
  GeneratedAction,
  GeneratedScenePropRef,
  AssetRosterForScript,
  AssetRosterEntry,
} from '@shared/types/episode-production'
import type { ScriptGenerationResult } from './types'
import { callAI, extractJsonFromResponse, parseJsonString } from './_helpers'

// ==================== 提示词模板 ====================

/**
 * 剧本生成提示词（完整专业剧本格式 · spec §4.1 强引用）
 */
const SCRIPT_GENERATION_PROMPT = `你是一位拥有10年以上一线影视工业经验的职业编剧，精通三幕剧结构、人物弧光设计、视觉化叙事与标准剧本格式。请将以下小说章节内容转换为专业的视频剧本。

## 输出要求

请输出三部分内容，每部分使用特定分隔符标记：

### 第一部分：章节梗概
使用 ===SYNOPSIS=== 作为开始标记，===SYNOPSIS_END=== 作为结束标记。
内容为 50-100 字的章节梗概。

### 第二部分：完整剧本正文
使用 ===SCRIPT=== 作为开始标记，===SCRIPT_END=== 作为结束标记。
输出标准剧本格式的完整正文（中文场景标题；动作描写现在时；角色对白居中缩进；转场标记右对齐）。
1. 严禁使用 Markdown 格式（如加粗、斜体、列表、代码块）
2. 仅使用纯文本标准剧本缩进与换行
3. 严格遵循"展示而非告知"原则，对白精炼且富含潜台词

### 第三部分：结构化场景数据
使用 ===SCENES_JSON=== 作为开始标记，===SCENES_JSON_END=== 作为结束标记。
输出 JSON 格式的结构化场景数据。

## ⭐ 强约束：所有引用必须使用 binding ID（不允许裸字符串）

下面给出本项目可用的 **角色 / 地点 / 物品** 资产清单。每条都有一个 binding ID。
你输出 JSON 时必须用 ID 引用：
- locationBindingId（场景级）：从【可用地点列表】里选一项的 bindingId 填入
- characterBindingId（出场角色 / 对话 / 动作）：从【可用角色列表】里选
- itemBindingId（道具）：从【可用物品列表】里选

如果场景中出现的对象在清单里**找不到对应项**，把对应 bindingId 字段填 null（不要瞎编 ID），
并在 location/characterName/name 字段保留实际名字以便人工补全。

## 场景拆分原则

1. 地点变化应拆分为新场景
2. 时间跳跃应拆分为新场景
3. 主要角色组合变化可考虑拆分
4. 情感氛围显著变化可拆分
5. 每个场景应有明确的视觉焦点

## JSON 场景数据格式

{
  "scenes": [
    {
      "sceneNumber": 1,
      "location": "茶馆",
      "locationBindingId": "lb_xxxxx",
      "locationType": "interior",
      "timeOfDay": "morning",
      "weather": "sunny",
      "sceneDescription": "详细场景描述（含空间布局/陈设/材质/色调/关键视觉元素）",
      "mood": "氛围",
      "lighting": "光线描述",
      "characters": [
        {
          "characterBindingId": "cb_xxxxx",
          "characterName": "张三",
          "position": "center",
          "expression": "凝重",
          "action": "推门进入",
          "outfit": "蓝色长衫",
          "props": [
            { "itemBindingId": "ib_xxxxx", "name": "茶壶" }
          ]
        }
      ],
      "originalText": "原文片段",
      "narration": "旁白文本",
      "dialogues": [
        {
          "id": "dlg_1",
          "characterBindingId": "cb_xxxxx",
          "characterName": "张三",
          "text": "请来一壶碧螺春",
          "emotion": "平静",
          "volume": "normal",
          "pace": "normal",
          "pause": 0
        }
      ],
      "actions": [
        {
          "id": "act_1",
          "characterBindingId": "cb_xxxxx",
          "description": "缓步走向角落座位",
          "timing": "before",
          "duration": 2
        }
      ]
    }
  ]
}

## 可用角色列表

{characters}

## 可用地点列表

{locations}

## 可用物品列表

{items}

## 章节内容

{chapterContent}`

// ==================== 辅助函数 ====================

/**
 * 把 roster 转成提示词里的清单字符串。
 * 空 roster 输出 "(无)"，避免 AI 看到空字符串导致格式幻觉。
 */
function formatRosterList(entries: AssetRosterEntry[]): string {
  if (entries.length === 0) return '(无)'
  return entries
    .map((e) => `- bindingId: ${e.bindingId}, 名称: ${e.name}${e.description ? `, 描述: ${e.description}` : ''}`)
    .join('\n')
}

/**
 * 按 name 在 roster 中查 binding ID（AI 给错 ID 或没给时的兜底）。
 * 大小写不敏感 + 全字符串完全匹配。
 */
function lookupBindingByName(
  entries: AssetRosterEntry[],
  name: string | undefined | null,
): string | null {
  if (!name) return null
  const norm = name.trim().toLowerCase()
  if (!norm) return null
  const match = entries.find((e) => e.name.trim().toLowerCase() === norm)
  return match ? match.bindingId : null
}

/**
 * 解析 AI 给的 binding ID：
 * 1. AI 字段非空且命中 roster → 用 AI 给的
 * 2. AI 字段空 / 不在 roster → 按 name 回退查 roster
 * 3. 还查不到 → null（validator 会标违例）
 */
function resolveBindingId(
  entries: AssetRosterEntry[],
  rawBindingId: unknown,
  fallbackName: string | undefined | null,
): string | null {
  if (typeof rawBindingId === 'string' && rawBindingId.length > 0) {
    if (entries.some((e) => e.bindingId === rawBindingId)) {
      return rawBindingId
    }
  }
  return lookupBindingByName(entries, fallbackName)
}

// ==================== 主类 ====================

/**
 * 剧本生成器
 */
export class EpisodeScriptGenerator {
  private static instance: EpisodeScriptGenerator

  private constructor() {}

  static getInstance(): EpisodeScriptGenerator {
    if (!EpisodeScriptGenerator.instance) {
      EpisodeScriptGenerator.instance = new EpisodeScriptGenerator()
    }
    return EpisodeScriptGenerator.instance
  }

  // ==================== 私有辅助方法 ====================

  private parseJsonString(jsonStr: string): any {
    return parseJsonString(jsonStr)
  }

  /**
   * 从完整剧本响应中提取三部分内容
   */
  private extractFullScriptFromResponse(
    response: string,
    roster: AssetRosterForScript,
  ): FullScriptGenerationResult {
    console.log('[EpisodeScriptGenerator] 解析完整剧本响应，长度:', response.length)

    let synopsis = ''
    let scriptContent = ''
    let scenes: GeneratedScene[] = []

    const synopsisMatch = response.match(/===SYNOPSIS===\s*([\s\S]*?)\s*===SYNOPSIS_END===/)
    if (synopsisMatch) synopsis = synopsisMatch[1].trim()

    const scriptMatch = response.match(/===SCRIPT===\s*([\s\S]*?)\s*===SCRIPT_END===/)
    if (scriptMatch) scriptContent = scriptMatch[1].trim()

    const scenesMatch = response.match(/===SCENES_JSON===\s*([\s\S]*?)\s*===SCENES_JSON_END===/)
    if (scenesMatch) {
      try {
        const scenesData = this.parseJsonString(scenesMatch[1].trim())
        if (scenesData.scenes && Array.isArray(scenesData.scenes)) {
          scenes = this.convertSceneDataToGeneratedScenes(scenesData.scenes, roster)
        }
      } catch (e) {
        console.error('[EpisodeScriptGenerator] 解析场景 JSON 失败:', e)
        // 备用：尝试 ```json 格式
        const jsonMatch = response.match(/===SCENES_JSON===\s*```json\s*([\s\S]*?)\s*```/)
        if (jsonMatch) {
          try {
            const scenesData = this.parseJsonString(jsonMatch[1].trim())
            if (scenesData.scenes && Array.isArray(scenesData.scenes)) {
              scenes = this.convertSceneDataToGeneratedScenes(scenesData.scenes, roster)
            }
          } catch (e2) {
            console.error('[EpisodeScriptGenerator] 备用解析方法也失败:', e2)
          }
        }
      }
    }

    if (!synopsis) {
      const fallbackMatch = response.match(/===SCENES_JSON===\s*([\s\S]*?)\s*===SCENES_JSON_END===/)
      if (fallbackMatch) {
        try {
          const data = this.parseJsonString(fallbackMatch[1].trim())
          if (data.synopsis) synopsis = data.synopsis
        } catch {
          // 忽略
        }
      }
    }

    if (!scriptContent) console.warn('[EpisodeScriptGenerator] 未找到剧本正文')
    if (scenes.length === 0) console.warn('[EpisodeScriptGenerator] 未找到场景数据')

    return { synopsis, scriptContent, scenes }
  }

  /**
   * 将 AI 返回的场景数据转换为 GeneratedScene 格式（带 binding_id 解析）。
   */
  private convertSceneDataToGeneratedScenes(
    sceneData: any[],
    roster: AssetRosterForScript,
  ): GeneratedScene[] {
    return sceneData.map((scene, index) => {
      const characters: GeneratedSceneCharacter[] = (scene.characters || []).map(
        (char: any) => {
          const props: GeneratedScenePropRef[] = Array.isArray(char.props)
            ? char.props
                .map((p: any) => this.normalizeProp(p, roster))
                .filter((p: GeneratedScenePropRef | null): p is GeneratedScenePropRef => p !== null)
            : []
          return {
            characterBindingId: resolveBindingId(
              roster.characters,
              char.characterBindingId,
              char.characterName,
            ),
            characterId: char.characterId || '',
            characterName: char.characterName || '未知角色',
            portraitId: char.portraitId,
            position: char.position || 'center',
            expression: char.expression,
            action: char.action,
            outfit: char.outfit,
            props,
          }
        },
      )

      const dialogues: GeneratedDialogue[] = (scene.dialogues || []).map(
        (dlg: any, dlgIndex: number) => ({
          id: dlg.id || `dlg_${Date.now()}_${dlgIndex}`,
          characterBindingId: resolveBindingId(
            roster.characters,
            dlg.characterBindingId,
            dlg.characterName,
          ),
          characterId: dlg.characterId || '',
          characterName: dlg.characterName || '未知角色',
          text: dlg.text || '',
          emotion: dlg.emotion,
          volume: dlg.volume || 'normal',
          pace: dlg.pace || 'normal',
          pause: dlg.pause || 0,
          voiceId: dlg.voiceId ?? null,
        }),
      )

      const actions: GeneratedAction[] = (scene.actions || []).map(
        (act: any, actIndex: number) => ({
          id: act.id || `act_${Date.now()}_${actIndex}`,
          // 群像动作允许 null（AI 可能不传 characterBindingId 也不传 characterName）
          characterBindingId: resolveBindingId(
            roster.characters,
            act.characterBindingId,
            act.characterName,
          ),
          characterId: act.characterId,
          description: act.description || '',
          timing: act.timing || 'before',
          duration: act.duration,
        }),
      )

      return {
        sceneNumber: scene.sceneNumber || index + 1,
        location: scene.location || '未知地点',
        locationBindingId: resolveBindingId(
          roster.locations,
          scene.locationBindingId,
          scene.location,
        ),
        locationType: scene.locationType || 'interior',
        timeOfDay: scene.timeOfDay || 'morning',
        weather: scene.weather,
        sceneDescription: scene.sceneDescription || '',
        mood: scene.mood || '',
        lighting: scene.lighting,
        characters,
        originalText: scene.originalText || '',
        narration: scene.narration || '',
        dialogues,
        actions,
      } as GeneratedScene
    })
  }

  /** 把一条 prop（可能是字符串或 {itemBindingId,name}）规范化为 GeneratedScenePropRef */
  private normalizeProp(
    raw: unknown,
    roster: AssetRosterForScript,
  ): GeneratedScenePropRef | null {
    if (raw == null) return null
    if (typeof raw === 'string') {
      // 老格式：纯字符串 → 仅按 name 匹配
      const trimmed = raw.trim()
      if (!trimmed) return null
      return {
        itemBindingId: lookupBindingByName(roster.items, trimmed),
        name: trimmed,
      }
    }
    if (typeof raw === 'object') {
      const obj = raw as { itemBindingId?: unknown; name?: unknown }
      const name = typeof obj.name === 'string' ? obj.name.trim() : ''
      if (!name) return null
      return {
        itemBindingId: resolveBindingId(roster.items, obj.itemBindingId, name),
        name,
      }
    }
    return null
  }

  // ==================== 公开方法 ====================

  /**
   * 生成完整剧本（含正文 + 结构化数据 + binding 引用强约束）
   */
  async generateFullScript(
    chapterContent: string,
    roster: AssetRosterForScript,
    providerConfigId?: string,
    modelId?: string,
  ): Promise<FullScriptGenerationResult> {
    const prompt = SCRIPT_GENERATION_PROMPT.replace('{characters}', formatRosterList(roster.characters))
      .replace('{locations}', formatRosterList(roster.locations))
      .replace('{items}', formatRosterList(roster.items))
      .replace('{chapterContent}', chapterContent)

    const systemPrompt =
      '你是一位拥有10年以上一线影视工业经验的职业编剧。请严格按照要求的格式输出，不要添加任何额外的开场白或结束语。所有引用必须使用提供的 binding ID，不要瞎编 ID。'

    const response = await callAI(prompt, systemPrompt, 16000, providerConfigId, modelId)
    const result = this.extractFullScriptFromResponse(response, roster)

    if (!result.synopsis) console.warn('[EpisodeScriptGenerator] 生成的剧本缺少梗概')
    if (!result.scriptContent) {
      throw new Error('生成的剧本缺少剧本正文，请检查 AI 模型是否支持长文本输出')
    }
    if (result.scenes.length === 0) {
      console.warn('[EpisodeScriptGenerator] 生成的剧本缺少结构化场景数据')
    }

    return result
  }

  /**
   * 仅生成结构化剧本（无正文，兼容老入口）
   */
  async generateScript(
    chapterContent: string,
    roster: AssetRosterForScript,
    providerConfigId?: string,
    modelId?: string,
  ): Promise<ScriptGenerationResult> {
    const prompt = SCRIPT_GENERATION_PROMPT.replace('{characters}', formatRosterList(roster.characters))
      .replace('{locations}', formatRosterList(roster.locations))
      .replace('{items}', formatRosterList(roster.items))
      .replace('{chapterContent}', chapterContent)

    const systemPrompt =
      '你是一个专业的影视编剧，擅长将小说转换为视频剧本。请严格按照要求格式输出，所有引用使用提供的 binding ID。'

    const response = await callAI(prompt, systemPrompt, 8192, providerConfigId, modelId)
    const result = extractJsonFromResponse(response)

    if (!result.synopsis || !Array.isArray(result.scenes)) {
      throw new Error('生成的剧本格式不正确，缺少必要字段')
    }
    // 注：这里走的是简化模式（无正文），调用方一般用 generateFullScript
    result.scenes = this.convertSceneDataToGeneratedScenes(result.scenes, roster)
    return result as ScriptGenerationResult
  }
}

// ==================== 测试用导出（仅用于单测） ====================

/** @internal 测试用：暴露纯函数解析器，便于不调 AI 的情况下验证 binding 解析逻辑 */
export const __test = {
  formatRosterList,
  lookupBindingByName,
  resolveBindingId,
  buildPrompt: (roster: AssetRosterForScript, chapterContent: string): string =>
    SCRIPT_GENERATION_PROMPT.replace('{characters}', formatRosterList(roster.characters))
      .replace('{locations}', formatRosterList(roster.locations))
      .replace('{items}', formatRosterList(roster.items))
      .replace('{chapterContent}', chapterContent),
  /** 暴露 convertSceneDataToGeneratedScenes 供单测 */
  convertScenes: (sceneData: unknown[], roster: AssetRosterForScript): GeneratedScene[] => {
    const inst = EpisodeScriptGenerator.getInstance()
    return (inst as any).convertSceneDataToGeneratedScenes(sceneData, roster)
  },
}
