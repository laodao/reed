/**
 * narrative/ai/script-generator
 * @module platform/episode-production/narrative/ai/script-generator
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
 * 优化适配 DeepSeek 等国产大模型 - 强化 JSON 输出优先级
 */
const SCRIPT_GENERATION_PROMPT = `你是一位拥有10年以上一线影视工业经验的职业编剧。

## ⚠️⚠️⚠️ 最重要：你必须输出结构化 JSON 场景数据！

**这是你最重要的任务！如果不输出 JSON 场景数据，整个任务就是失败的！**

输出顺序（必须严格遵守）：
1. **先输出 JSON 场景数据**（最重要的部分）
2. 再输出章节梗概
3. 最后输出剧本正文

---

## 第一部分：结构化场景数据（JSON格式） - ⭐必须输出

格式要求：
- 开头写：【场景数据开始】
- 结尾写：【场景数据结束】
- 中间是完整的 JSON 数据（必须包含 scenes 数组）
- JSON 必须合法，可直接解析
- **这部分绝对不能跳过！如果跳过，整个生成将失败！**

---

## 第二部分：章节梗概

格式要求：
- 开头写：【梗概开始】
- 结尾写：【梗概结束】
- 中间是 50-100 字的章节概要

---

## 第三部分：完整剧本正文

格式要求：
- 开头写：【剧本正文开始】
- 结尾写：【剧本正文结束】
- 中间是标准剧本格式（中文场景标题；动作描写现在时；角色对白居中缩进）
- 严禁使用 Markdown 格式
- 仅使用纯文本标准剧本缩进与换行

---

## ⭐ 强约束：所有引用必须使用 binding ID

下面给出本项目可用的 **角色 / 地点 / 物品** 资产清单。每条都有一个 binding ID。
你输出 JSON 时必须用 ID 引用：
- locationBindingId（场景级）：从【可用地点列表】里选一项的 bindingId 填入
- characterBindingId（出场角色 / 对话 / 动作）：从【可用角色列表】里选
- itemBindingId（道具）：从【可用物品列表】里选

如果场景中出现的对象在清单里**找不到对应项**，把对应 bindingId 字段填 null（不要瞎编 ID），
并在 location/characterName/name 字段保留实际名字以便人工补全。

---

## 场景拆分原则

1. 地点变化应拆分为新场景
2. 时间跳跃应拆分为新场景
3. 主要角色组合变化可考虑拆分
4. 情感氛围显著变化可拆分
5. 每个场景应有明确的视觉焦点

---

## JSON 场景数据格式示例

{
  "scenes": [
    {
      "sceneNumber": 1,
      "location": "茶馆",
      "locationBindingId": "lb_xxxxx",
      "locationType": "interior",
      "timeOfDay": "morning",
      "weather": "sunny",
      "sceneDescription": "茶馆呈长方形，东侧柜台摆放茶罐，南侧临街大门，西侧靠墙方桌数张，北侧雅座屏风隔断。木质横梁、青花瓷茶具、水墨挂画、红木桌椅",
      "locationKeyObjects": ["柜台", "茶罐", "方桌", "屏风", "青花瓷茶具"],
      "mood": "市井烟火",
      "lighting": "晨光从南侧大门斜射入，明亮暖色调，室内微尘飘浮",
      "characters": [
        {
          "characterBindingId": "cb_xxxxx",
          "characterName": "张三",
          "position": "center",
          "expression": "凝重",
          "action": "推门进入",
          "outfit": "蓝色长衫（深蓝色，文人风格）",
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

---

## ⭐ 字段输出质量要求（必须严格遵守）

### sceneDescription（场景视觉描述）
必须包含以下信息（按顺序拼接，用句号分隔）：
1. **空间布局**：房间形状 + 各方位陈设位置（如"东侧梳妆台配铜镜，南侧临窗"）
2. **陈设材质**：主要家具材质 + 装饰细节（如"木质横梁、雕花屏风、青花瓷茶具"）
3. **关键物件**：本场景中会出现的道具（如"水墨画、香炉"）

示例："闺房呈方形，东侧梳妆台配铜镜，南侧临窗透晨光，西侧纱幔床榻，北侧百宝箱。木质横梁、雕花屏风、青花瓷茶具、水墨画、香炉"

### locationKeyObjects（地点关键物件列表）
列出本场景中会出现的道具/物件名称（3-6个），用于地点绑定参考。
如果场景物件少于3个，可以输出空数组 []。

示例：["铜镜", "梳妆台", "窗棂", "百宝箱", "香炉"]

### lighting（光线描述）
必须包含以下信息（按顺序拼接）：
1. **光源**：阳光/月光/室内灯光
2. **方向**：从哪边照射
3. **强度**：柔和/明亮/昏暗
4. **色调**：冷色/暖色/特定色

示例："晨光从南侧窗棂斜射入，柔和偏暗，冷蓝色调，室内笼罩阴影"

### outfit（角色服装）
格式要求：**服装名称（颜色，风格）**
- 服装名称：具体服装类型（如"素色衣裙"、"红色嫁衣"）
- 颜色：主色调（如"淡青色"、"深红色"）
- 风格：服装风格（如"古典仕女风格"、"粗布短衣风格"）

示例："素色衣裙（淡青色，古典仕女风格）"、"粗布短衣（灰褐色，市井平民风格）"

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
   * 支持新旧两种格式标记：
   * - 新格式：【梗概开始】【梗概结束】等（适配国产大模型）
   * - 旧格式：===SYNOPSIS=== ===SYNOPSIS_END=== 等（兼容旧版）
   *
   * BUG-2 前置（v2.3）：添加结构化路径追踪，统计每种解析路径的命中频率。
   * 这些数据用于判断是否有必要做标记系统统一。
   */
  private extractFullScriptFromResponse(
    response: string,
    roster: AssetRosterForScript,
  ): FullScriptGenerationResult {
    console.log('[EpisodeScriptGenerator] 解析完整剧本响应，长度:', response.length)
    console.log('[EpisodeScriptGenerator] 响应前1000字符:', response.substring(0, 1000))

    // BUG-2 前置：解析路径追踪
    const pathTrace = {
      synopsisPath: 'none' as 'new' | 'old' | 'json-fallback' | 'none',
      scriptPath: 'new' | 'old' | 'none',
      scenesPath: 'none' as 'new' | 'old' | 'json-block' | 'fallback' | 'failed',
      scenesCount: 0,
    }

    let synopsis = ''
    let scriptContent = ''
    let scenes: GeneratedScene[] = []

    // 新格式：【梗概开始】【梗概结束】
    const synopsisMatchNew = response.match(/【梗概开始】\s*([\s\S]*?)\s*【梗概结束】/)
    if (synopsisMatchNew) {
      synopsis = synopsisMatchNew[1].trim()
      pathTrace.synopsisPath = 'new'
    }

    // 旧格式兼容：===SYNOPSIS=== ===SYNOPSIS_END===
    if (!synopsis) {
      const synopsisMatchOld = response.match(/===SYNOPSIS===\s*([\s\S]*?)\s*===SYNOPSIS_END===/)
      if (synopsisMatchOld) {
        synopsis = synopsisMatchOld[1].trim()
        pathTrace.synopsisPath = 'old'
      }
    }

    // 新格式：【剧本正文开始】【剧本正文结束】
    const scriptMatchNew = response.match(/【剧本正文开始】\s*([\s\S]*?)\s*【剧本正文结束】/)
    if (scriptMatchNew) {
      scriptContent = scriptMatchNew[1].trim()
      pathTrace.scriptPath = 'new'
    }

    // 旧格式兼容
    if (!scriptContent) {
      const scriptMatchOld = response.match(/===SCRIPT===\s*([\s\S]*?)\s*===SCRIPT_END===/)
      if (scriptMatchOld) {
        scriptContent = scriptMatchOld[1].trim()
        pathTrace.scriptPath = 'old'
      }
    }

    // 场景数据解析（尝试多种格式）
    // 1. 新格式：【场景数据开始】【场景数据结束】
    const scenesMatchNew = response.match(/【场景数据开始】\s*([\s\S]*?)\s*【场景数据结束】/)
    if (scenesMatchNew) {
      console.log('[EpisodeScriptGenerator] 找到新格式场景标记')
      scenes = this.parseScenesJson(scenesMatchNew[1].trim(), roster)
      pathTrace.scenesPath = 'new'
    }

    // 2. 旧格式：===SCENES_JSON=== ===SCENES_JSON_END===
    if (scenes.length === 0) {
      const scenesMatchOld = response.match(/===SCENES_JSON===\s*([\s\S]*?)\s*===SCENES_JSON_END===/)
      if (scenesMatchOld) {
        console.log('[EpisodeScriptGenerator] 找到旧格式场景标记')
        scenes = this.parseScenesJson(scenesMatchOld[1].trim(), roster)
        pathTrace.scenesPath = 'old'
      }
    }

    // 3. ```json 代码块格式（DeepSeek 常用）
    if (scenes.length === 0) {
      const jsonBlockMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
      if (jsonBlockMatch) {
        console.log('[EpisodeScriptGenerator] 找到 json 代码块')
        scenes = this.parseScenesJson(jsonBlockMatch[1].trim(), roster)
        pathTrace.scenesPath = 'json-block'
      }
    }

    // 4. 直接查找 scenes 数组（兜底）
    if (scenes.length === 0) {
      const scenesArrayMatch = response.match(/"scenes"\s*:\s*\[/)
      if (scenesArrayMatch) {
        console.log('[EpisodeScriptGenerator] 尝试直接提取 scenes 数组')
        const start = scenesArrayMatch.index!
        const jsonStr = this.extractJsonFromPosition(response, start)
        if (jsonStr) {
          try {
            const data = this.parseJsonString(jsonStr)
            if (data.scenes && Array.isArray(data.scenes)) {
              scenes = this.convertSceneDataToGeneratedScenes(data.scenes, roster)
              pathTrace.scenesPath = 'fallback'
            }
          } catch (e) {
            console.error('[EpisodeScriptGenerator] 直接提取 scenes 失败:', e)
          }
        }
      }
    }

    if (!synopsis) {
      // 从场景数据中提取 synopsis（如果 AI 把梗概放在 JSON 里）
      try {
        const anyJsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/\{[\s\S]*"scenes"[\s\S]*\}/)
        if (anyJsonMatch) {
          const data = this.parseJsonString(anyJsonMatch[0])
          if (data.synopsis) {
            synopsis = data.synopsis
            pathTrace.synopsisPath = 'json-fallback'
          }
        }
      } catch {
        // 忽略
      }
    }

    // 记录场景数
    pathTrace.scenesCount = scenes.length
    if (scenes.length === 0) pathTrace.scenesPath = 'failed'

    if (!scriptContent) console.warn('[EpisodeScriptGenerator] 未找到剧本正文')
    if (scenes.length === 0) {
      console.warn('[EpisodeScriptGenerator] 未找到场景数据，请检查 AI 输出格式')
      console.log('[EpisodeScriptGenerator] 响应后1000字符:', response.substring(Math.max(0, response.length - 1000)))
    } else {
      console.log('[EpisodeScriptGenerator] 成功解析场景数:', scenes.length)
    }

    // BUG-2 前置：输出结构化路径追踪日志（JSON 格式，便于后续统计）
    console.log('[EpisodeScriptGenerator] 解析路径追踪:', JSON.stringify(pathTrace))

    return { synopsis, scriptContent, scenes }
  }

  /**
   * 解析场景 JSON 数据
   */
  private parseScenesJson(jsonStr: string, roster: AssetRosterForScript): GeneratedScene[] {
    try {
      const scenesData = this.parseJsonString(jsonStr)
      if (scenesData.scenes && Array.isArray(scenesData.scenes)) {
        return this.convertSceneDataToGeneratedScenes(scenesData.scenes, roster)
      }
    } catch (e) {
      console.error('[EpisodeScriptGenerator] 解析场景 JSON 失败:', e)
    }
    return []
  }

  /**
   * 从指定位置提取完整 JSON 对象
   */
  private extractJsonFromPosition(response: string, startPos: number): string | null {
    // 找到包含 scenes 的完整 JSON 对象
    let braceCount = 0
    let jsonStart = -1
    for (let i = startPos; i >= 0; i--) {
      if (response[i] === '{') {
        jsonStart = i
        break
      }
    }
    if (jsonStart === -1) return null

    let jsonEnd = -1
    braceCount = 0
    for (let i = jsonStart; i < response.length; i++) {
      if (response[i] === '{') braceCount++
      else if (response[i] === '}') {
        braceCount--
        if (braceCount === 0) {
          jsonEnd = i + 1
          break
        }
      }
    }
    if (jsonEnd === -1) return null

    return response.substring(jsonStart, jsonEnd)
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
        locationKeyObjects: Array.isArray(scene.locationKeyObjects)
          ? scene.locationKeyObjects.filter((obj: unknown) => typeof obj === 'string')
          : [],
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
    console.log('[EpisodeScriptGenerator] 开始生成剧本...')
    console.log('[EpisodeScriptGenerator] 资产花名册:', {
      characters: roster.characters.length,
      locations: roster.locations.length,
      items: roster.items.length
    })

    const prompt = SCRIPT_GENERATION_PROMPT.replace('{characters}', formatRosterList(roster.characters))
      .replace('{locations}', formatRosterList(roster.locations))
      .replace('{items}', formatRosterList(roster.items))
      .replace('{chapterContent}', chapterContent)

    const systemPrompt =
      '你是一位拥有10年以上一线影视工业经验的职业编剧。请严格按照要求的格式输出，不要添加任何额外的开场白或结束语。所有引用必须使用提供的 binding ID，不要瞎编 ID。必须输出【场景数据开始】【场景数据结束】标记的 JSON 场景数据！'

    console.log('[EpisodeScriptGenerator] 调用 AI，提示词长度:', prompt.length)

    const response = await callAI(prompt, systemPrompt, 16000, providerConfigId, modelId)

    // 输出完整的 AI 响应（用于诊断 DeepSeek 格式问题）
    console.log('[EpisodeScriptGenerator] AI 响应完整内容:')
    console.log('='.repeat(50))
    console.log(response)
    console.log('='.repeat(50))
    console.log('[EpisodeScriptGenerator] AI 响应长度:', response.length)

    // 检查响应中是否有场景标记
    const hasNewFormat = response.includes('【场景数据开始】')
    const hasOldFormat = response.includes('===SCENES_JSON===')
    const hasJsonBlock = response.includes('```json')
    const hasScenesArray = response.includes('"scenes"')

    console.log('[EpisodeScriptGenerator] 格式检测:', {
      '新格式【场景数据】': hasNewFormat,
      '旧格式===SCENES_JSON===': hasOldFormat,
      'json代码块': hasJsonBlock,
      'scenes数组': hasScenesArray
    })

    const result = this.extractFullScriptFromResponse(response, roster)

    if (!result.synopsis) console.warn('[EpisodeScriptGenerator] 生成的剧本缺少梗概')
    if (!result.scriptContent) {
      throw new Error('生成的剧本缺少剧本正文，请检查 AI 模型是否支持长文本输出')
    }
    if (result.scenes.length === 0) {
      console.warn('[EpisodeScriptGenerator] 生成的剧本缺少结构化场景数据')
      console.warn('[EpisodeScriptGenerator] 这可能是因为 DeepSeek 模型没有正确输出场景 JSON 格式')
    }

    console.log('[EpisodeScriptGenerator] 解析结果:', {
      synopsisLength: result.synopsis.length,
      scriptContentLength: result.scriptContent.length,
      scenesCount: result.scenes.length
    })

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

  /**
   * 从章节梗概拆分场景（spec §4.1 强引用）
   * 用于 handleGenerateScenes 场景——已有 synopsis，仅需生成结构化场景数据。
   */
  async generateScenesFromSynopsis(
    synopsis: string,
    roster: AssetRosterForScript,
    providerConfigId?: string,
    modelId?: string,
  ): Promise<GeneratedScene[]> {
    // 简化提示词：只输出场景数据，不需要剧本正文
    const prompt = `你是一位专业的影视编剧。请将以下章节梗概拆分为结构化的场景数据。

## 输出要求

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
      "sceneDescription": "茶馆呈长方形，东侧柜台摆放茶罐，南侧临街大门，西侧靠墙方桌数张，北侧雅座屏风隔断。木质横梁、青花瓷茶具、水墨挂画、红木桌椅",
      "locationKeyObjects": ["柜台", "茶罐", "方桌", "屏风", "青花瓷茶具"],
      "mood": "市井烟火",
      "lighting": "晨光从南侧大门斜射入，明亮暖色调，室内微尘飘浮",
      "characters": [
        {
          "characterBindingId": "cb_xxxxx",
          "characterName": "张三",
          "position": "center",
          "expression": "凝重",
          "action": "推门进入",
          "outfit": "蓝色长衫（深蓝色，文人风格）",
          "props": [
            { "itemBindingId": "ib_xxxxx", "name": "茶壶" }
          ]
        }
      ],
      "originalText": "原文片段",
      "narration": "旁白文本",
      "dialogues": [...],
      "actions": [...]
    }
  ]
}

## ⭐ 字段输出质量要求（必须严格遵守）

### sceneDescription（场景视觉描述）
必须包含：空间布局（房间形状+各方位陈设）+ 陈设材质 + 关键物件。
示例："闺房呈方形，东侧梳妆台配铜镜，南侧临窗，西侧纱幔床榻。木质横梁、雕花屏风、香炉"

### locationKeyObjects（地点关键物件列表）
列出本场景会出现的道具名称（3-6个），用于地点绑定参考。

### lighting（光线描述）
必须包含：光源+方向+强度+色调。
示例："晨光从南侧窗棂斜射入，柔和偏暗，冷蓝色调"

### outfit（角色服装）
格式：服装名称（颜色，风格）
示例："素色衣裙（淡青色，古典仕女风格）"

## 可用角色列表

${formatRosterList(roster.characters)}

## 可用地点列表

${formatRosterList(roster.locations)}

## 可用物品列表

${formatRosterList(roster.items)}

## 章节梗概

${synopsis}`

    const systemPrompt =
      '你是一位专业的影视编剧。请严格按照要求格式输出场景数据，所有引用使用提供的 binding ID。不要添加任何开场白或结束语。'

    const response = await callAI(prompt, systemPrompt, 8192, providerConfigId, modelId)

    // 解析 JSON
    const scenesMatch = response.match(/===SCENES_JSON===\s*([\s\S]*?)\s*===SCENES_JSON_END===/)
    if (!scenesMatch) {
      // 尝试 ```json 格式
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
      if (jsonMatch) {
        const scenesData = this.parseJsonString(jsonMatch[1].trim())
        if (scenesData.scenes && Array.isArray(scenesData.scenes)) {
          return this.convertSceneDataToGeneratedScenes(scenesData.scenes, roster)
        }
      }
      throw new Error('AI 响应中未找到场景数据')
    }

    const scenesData = this.parseJsonString(scenesMatch[1].trim())
    if (!scenesData.scenes || !Array.isArray(scenesData.scenes)) {
      throw new Error('生成的场景数据格式不正确')
    }

    return this.convertSceneDataToGeneratedScenes(scenesData.scenes, roster)
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
