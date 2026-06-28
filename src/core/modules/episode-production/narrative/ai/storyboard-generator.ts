/**
 * narrative/ai/storyboard-generator
 * @module modules/episode-production/narrative/ai/storyboard-generator
 * @description 分镜生成器（批量模式 / 逐个模式）。
 *              拆自原 StoryToVideoAIService 的分镜相关方法：
 *              generateStoryboard / generateSingleStoryboard /
 *              generateStoryboardsIncremental / generateStoryboards
 */

import type { SceneCharacter, SceneScript } from '@shared/types/episode-production'
import type { StoryboardGenerationResult, StoryboardResult } from './types'
import { callAI, extractJsonFromResponse } from './_helpers'

// ==================== 后处理 helpers ====================

/**
 * Bug C 修复（spec 2026-05-09 ep-redesign · e2e report-shot-1.2.md）：
 *
 * AI 拆分镜返回的 storyboard.characters[].characterId 经常不是真实
 * character_binding.id（cb_xxx），而是：
 *   - 角色中文名（"李墨" / "苏白"）
 *   - 长文写作角色 ID（lwc_xxx）
 *   - 占位符 / 空字符串
 *
 * 这导致下游 keyframe 生成 / UI 显示无法反查到 binding，prompt 丢失角色信息。
 *
 * 本函数后处理 AI 输出：
 *   - characterId 已是 scene.characters[].characterBindingId 之一 → 保留
 *   - 否则按 characterName / 兼容 characterId 反查 → 替换为对应的 characterBindingId
 *   - 都找不到 → 保留为空字符串 + console.warn（让 service 层 fallback 接管，
 *     不抛错避免 e2e 中断 — 仍然能生成关键帧只是少一个角色描述）
 */
export function normalizeAiCharacters(
  raw: any[] | null | undefined,
  sceneCharacters: SceneCharacter[],
): any[] {
  if (!Array.isArray(raw)) return []

  // 建索引：bindingId set + name → bindingId map + lwcId → bindingId map
  const validBindingIds = new Set<string>()
  const nameToBindingId = new Map<string, string>()
  const lwcToBindingId = new Map<string, string>()
  for (const sc of sceneCharacters) {
    const bid = sc.characterBindingId ?? null
    if (bid) {
      validBindingIds.add(bid)
      if (sc.characterName) nameToBindingId.set(sc.characterName, bid)
      if (sc.characterId) lwcToBindingId.set(sc.characterId, bid)
    }
  }

  const out: any[] = []
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue
    const original =
      typeof (c as any).characterId === 'string' ? (c as any).characterId : ''

    let resolved: string | null = null
    if (original) {
      if (validBindingIds.has(original)) {
        resolved = original
      } else if (nameToBindingId.has(original)) {
        resolved = nameToBindingId.get(original)!
      } else if (lwcToBindingId.has(original)) {
        resolved = lwcToBindingId.get(original)!
      }
    }

    if (resolved === null) {
      // 未识别 / 空：保留 entry（保持本分镜角色数量），characterId 设空让 fallback 接管
      // eslint-disable-next-line no-console
      console.warn(
        `[storyboard-generator] AI 输出的 characterId="${original}" 无法反查到 character_binding；` +
          `保留为空字符串，下游按场景级 fallback 解析（report-shot-1.2.md Bug C）`,
      )
      out.push({ ...c, characterId: '' })
    } else {
      out.push({ ...c, characterId: resolved })
    }
  }
  return out
}

// ==================== 提示词模板 ====================

/**
 * 分镜生成提示词（批量生成模式）
 */
const STORYBOARD_GENERATION_PROMPT = `你是一个专业的影视导演和分镜师。请根据以下场景剧本设计分镜。

## 镜头语言说明

### 景别（shotType）
- extreme_long: 大远景 - 展示宏大环境，交代地理位置
- long: 远景 - 展示完整场景，人物较小
- full: 全景 - 人物全身，展示动作
- medium: 中景 - 人物膝盖以上，展示互动
- medium_close: 中近景 - 人物腰部以上，常用对话场景
- close: 近景 - 人物胸部以上，展示表情
- extreme_close: 特写 - 人物面部，展示情感
- detail: 大特写 - 极小细节，强调重点

### 镜头运动（cameraMovement）
- static: 固定镜头
- pan_left: 左摇
- pan_right: 右摇
- tilt_up: 上仰
- tilt_down: 下俯
- dolly_in: 推镜头
- dolly_out: 拉镜头
- zoom_in: 变焦推进
- zoom_out: 变焦拉远
- crane_up: 升镜头
- crane_down: 降镜头
- tracking_left: 左移
- tracking_right: 右移
- handheld: 手持晃动
- steadicam: 稳定器跟随

### 镜头角度（cameraAngle）
- eye_level: 平视 - 客观中立
- high: 俯拍 - 显渺小或弱势
- low: 仰拍 - 显高大或强势
- dutch: 荷兰角 - 不安或混乱
- birds_eye: 鸟瞰 - 全局视角
- worms_eye: 虫视 - 极度仰拍

### 转场类型（transition.type）
- cut: 硬切
- fade: 淡入淡出
- dissolve: 叠化
- wipe: 划像
- slide: 滑动
- zoom: 缩放转场
- iris: 圈入圈出
- whip: 甩镜头转场

## 分镜设计原则

1. **开场**：通常用远景或全景建立场景
2. **对话**：常用中景或近景，交替使用正反打
3. **情感**：近景或特写强调情感
4. **动作**：全景或中景展示动作
5. **转场**：考虑前后分镜的衔接
6. **节奏**：快节奏用短镜头，慢节奏用长镜头

## 画面描述格式要求（必须按此结构填写 frameDescription）

frameDescription 必须按以下结构化格式填写，确保画面信息完整：

\`\`\`
【场景】地点名称 + 空间布局描述 + 关键物件
【人物】角色名称 + 具体位置 + 表情神态 + 服装外观 + 姿态动作
【动作】正在发生什么 + 动作细节 + 人物交互
【氛围】光线描述（方向/强弱/色温） + 整体色调 + 情绪基调
\`\`\`

**示例**：
\`\`\`
【场景】杜十娘闺房，轻纱环绕四周，铜镜立于梳妆台东侧，晨光透过窗棂洒入
【人物】杜十娘位于画面中央，面容清丽而决绝，眼神冰冷，红唇紧抿，身着素色衣裙，手持镶金百宝箱
【动作】她缓缓转身面向铜镜，凝视镜中自己，手指轻抚镜面，表情由绝望转为坚定
【氛围】晨光柔和偏暗，室内笼罩冷蓝色调，氛围凝重压抑，透出复仇前夕的决绝感
\`\`\`

## 输出格式（必须严格遵循）

\`\`\`json
{
  "storyboards": [
    {
      "shotNumber": 1,
      "shotType": "long",
      "cameraAngle": "eye_level",
      "cameraMovement": "static",
      "frameDescription": "按上述结构化格式填写",
      "subject": "画面主体",
      "composition": "构图说明",
      "duration": 5,
      "transition": {
        "type": "fade",
        "duration": 500,
        "easing": "ease_out"
      },
      "narrationId": "旁白ID（如有）",
      "dialogueIds": ["dlg_1"],
      "actionIds": ["act_1"],
      "characters": [
        {
          "characterId": "角色ID",
          "position": { "x": 50, "y": 50, "scale": 1 },
          "expression": "表情",
          "action": "动作",
          "facing": "front"
        }
      ]
    }
  ]
}
\`\`\`

## 场景剧本

{sceneScript}`

/**
 * 单个分镜生成提示词（逐个生成模式）
 */
const SINGLE_STORYBOARD_GENERATION_PROMPT = `你是一个专业的影视导演和分镜师。请为以下场景设计第 {shotNumber} 个分镜。

## 镜头语言说明

### 景别（shotType）
- extreme_long: 大远景 - 展示宏大环境，交代地理位置
- long: 远景 - 展示完整场景，人物较小
- full: 全景 - 人物全身，展示动作
- medium: 中景 - 人物膝盖以上，展示互动
- medium_close: 中近景 - 人物腰部以上，常用对话场景
- close: 近景 - 人物胸部以上，展示表情
- extreme_close: 特写 - 人物面部，展示情感
- detail: 大特写 - 极小细节，强调重点

### 镜头运动（cameraMovement）
- static: 固定镜头
- pan_left: 左摇
- pan_right: 右摇
- tilt_up: 上仰
- tilt_down: 下俯
- dolly_in: 推镜头
- dolly_out: 拉镜头
- zoom_in: 变焦推进
- zoom_out: 变焦拉远
- crane_up: 升镜头
- crane_down: 降镜头
- tracking_left: 左移
- tracking_right: 右移
- handheld: 手持晃动
- steadicam: 稳定器跟随

### 镜头角度（cameraAngle）
- eye_level: 平视 - 客观中立
- high: 俯拍 - 显渺小或弱势
- low: 仰拍 - 显高大或强势
- dutch: 荷兰角 - 不安或混乱
- birds_eye: 鸟瞰 - 全局视角
- worms_eye: 虫视 - 极度仰拍

### 转场类型（transition.type）
- cut: 硬切
- fade: 淡入淡出
- dissolve: 叠化
- wipe: 划像
- slide: 滑动
- zoom: 缩放转场
- iris: 圈入圈出
- whip: 甩镜头转场

## 分镜设计原则

1. **开场镜头（shotNumber=1）**：用远景或全景建立场景，展示环境和空间关系
2. **对话镜头**：常用中景或近景，交替使用正反打
3. **情感镜头**：近景或特写强调情感变化
4. **动作镜头**：全景或中景展示动作细节
5. **转场设计**：考虑与前后分镜的衔接
6. **节奏控制**：快节奏用短镜头（2-3秒），慢节奏用长镜头（5-8秒）

## 上下文信息

{contextInfo}

## 场景剧本

{sceneScript}

## 任务要求

请设计第 {shotNumber} 个分镜，输出单个分镜的JSON格式：

## 画面描述格式要求（必须按此结构填写 frameDescription）

frameDescription 必须按以下结构化格式填写，确保画面信息完整：

\`\`\`
【场景】地点名称 + 空间布局描述 + 关键物件
【人物】角色名称 + 具体位置 + 表情神态 + 服装外观 + 姿态动作
【动作】正在发生什么 + 动作细节 + 人物交互
【氛围】光线描述（方向/强弱/色温） + 整体色调 + 情绪基调
\`\`\`

**示例**：
\`\`\`
【场景】杜十娘闺房，轻纱环绕四周，铜镜立于梳妆台东侧，晨光透过窗棂洒入
【人物】杜十娘位于画面中央，面容清丽而决绝，眼神冰冷，红唇紧抿，身着素色衣裙
【动作】她缓缓转身面向铜镜，凝视镜中自己，手指轻抚镜面
【氛围】晨光柔和偏暗，室内笼罩冷蓝色调，氛围凝重压抑
\`\`\`

\`\`\`json
{
  "shotNumber": {shotNumber},
  "shotType": "选择合适的景别",
  "cameraAngle": "选择合适的镜头角度",
  "cameraMovement": "选择合适的镜头运动",
  "movementDuration": "镜头运动持续时间（毫秒，如推镜头需要3000）",
  "frameDescription": "按上述结构化格式填写",
  "subject": "画面主要焦点/主体",
  "composition": "构图方式，如三分构图、中心构图、对称构图等",
  "duration": "镜头持续时间（秒）",
  "transition": {
    "type": "转场类型",
    "duration": 500,
    "easing": "ease_out"
  },
  "narrationId": "如需旁白，填写旁白ID",
  "dialogueIds": ["如需对话，填写对话ID列表"],
  "actionIds": ["如需动作，填写动作ID列表"],
  "characters": [
    {
      "characterId": "角色ID",
      "position": { "x": 50, "y": 50, "scale": 1 },
      "expression": "表情描述",
      "action": "动作描述",
      "facing": "front/left/right/back"
    }
  ]
}
\`\`\`

**注意**：
- 根据镜头编号和场景内容选择合适的镜头类型
- frameDescription 必须按结构化格式填写，包含【场景】【人物】【动作】【氛围】四个部分
- 如果场景有对话或旁白，需要在 dialogueIds 或 narrationId 中关联对应的ID`

// ==================== 主类 ====================

/**
 * 分镜生成器
 * 支持批量模式（generateStoryboard）和逐个模式（generateStoryboardsIncremental）
 */
export class EpisodeStoryboardGenerator {
  private static instance: EpisodeStoryboardGenerator

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): EpisodeStoryboardGenerator {
    if (!EpisodeStoryboardGenerator.instance) {
      EpisodeStoryboardGenerator.instance = new EpisodeStoryboardGenerator()
    }
    return EpisodeStoryboardGenerator.instance
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 分析场景，确定需要的分镜数量和类型
   */
  async analyzeSceneStoryboardNeeds(
    sceneScript: SceneScript,
    providerConfigId?: string,
    modelId?: string
  ): Promise<{ shotCount: number; shotTypes: string[]; notes: string }> {
    const sceneDescription = `
场景 ${sceneScript.sceneNumber}: ${sceneScript.location}
地点类型: ${sceneScript.locationType}
时间: ${sceneScript.timeOfDay}
场景描述: ${sceneScript.sceneDescription}
氛围: ${sceneScript.mood}

出场角色: ${sceneScript.characters.map(c => c.characterName).join(', ')}

旁白长度: ${sceneScript.narration?.length || 0} 字符
对话数量: ${sceneScript.dialogues.length} 条
动作数量: ${sceneScript.actions.length} 个
`

    const prompt = `分析以下场景，确定需要多少个分镜镜头来完整呈现这个场景。

请考虑：
1. 场景开场需要建立镜头（远景或全景）
2. 每段重要对话需要对应的镜头（通常是中景或近景的正反打）
3. 情感高潮需要特写镜头
4. 重要动作需要展示镜头
5. 场景结尾可能需要结束镜头

场景信息：
${sceneDescription}

请输出JSON格式：
{
  "shotCount": 需要的分镜总数,
  "shotTypes": ["每个镜头的建议类型，如：long/medium/close等"],
  "notes": "简要说明分镜安排的理由"
}`

    const systemPrompt = '你是一个专业的影视导演。请根据场景内容分析分镜需求，严格按照 JSON 格式输出。'

    const response = await callAI(prompt, systemPrompt, 1024, providerConfigId, modelId)
    const result = extractJsonFromResponse(response)

    return {
      shotCount: result.shotCount || 5,
      shotTypes: result.shotTypes || [],
      notes: result.notes || ''
    }
  }

  /**
   * 智能分配对话到各个分镜
   * 如果分镜的 dialogueIds 为空，则根据对话数量平均分配
   */
  private distributeDialoguesToStoryboards(sceneScript: SceneScript, storyboards: StoryboardResult[]): void {
    const dialogues = sceneScript.dialogues
    console.log(`[EpisodeStoryboardGenerator] distributeDialoguesToStoryboards: 对话数=${dialogues.length}, 分镜数=${storyboards.length}`)

    if (dialogues.length === 0 || storyboards.length === 0) return

    // 检查是否所有分镜的 dialogueIds 都为空
    const totalAssigned = storyboards.reduce((sum, sb) => sum + (sb.dialogueIds?.length || 0), 0)
    console.log(`[EpisodeStoryboardGenerator] totalAssigned=${totalAssigned}`)

    if (totalAssigned === 0 && dialogues.length > 0) {
      console.log('[EpisodeStoryboardGenerator] AI 未分配对话，进行智能分配')

      // 计算每个分镜应该分配的对话数量
      const dialoguesPerShot = Math.ceil(dialogues.length / storyboards.length)

      let dialogueIndex = 0
      for (let i = 0; i < storyboards.length && dialogueIndex < dialogues.length; i++) {
        const count = Math.min(dialoguesPerShot, dialogues.length - dialogueIndex)
        storyboards[i].dialogueIds = dialogues
          .slice(dialogueIndex, dialogueIndex + count)
          .map(d => d.id)
        dialogueIndex += count
        console.log(`[EpisodeStoryboardGenerator] 分镜 ${i + 1} 分配了 ${count} 条对话:`, storyboards[i].dialogueIds)
      }

      console.log(`[EpisodeStoryboardGenerator] 已将 ${dialogues.length} 条对话分配到 ${storyboards.length} 个分镜`)
    }
  }

  // ==================== 公开方法 ====================

  /**
   * 生成分镜（批量模式）
   * @deprecated 建议使用 generateStoryboardsIncremental 方法
   */
  async generateStoryboard(
    sceneScript: SceneScript,
    providerConfigId?: string,
    modelId?: string
  ): Promise<StoryboardGenerationResult> {
    // 构建场景剧本描述
    const sceneDescription = `
场景 ${sceneScript.sceneNumber}: ${sceneScript.location}
地点类型: ${sceneScript.locationType}
时间: ${sceneScript.timeOfDay}
天气: ${sceneScript.weather || '未指定'}
场景描述: ${sceneScript.sceneDescription}
氛围: ${sceneScript.mood}
光线: ${sceneScript.lighting || '未指定'}

出场角色（characterId 必须用下方 ID 之一回填到分镜的 characters[].characterId）:
${sceneScript.characters.map(c => `- ID: ${c.characterBindingId ?? c.characterId}, 名称: ${c.characterName}, 表情(${c.expression || '无'}), 动作(${c.action || '无'})`).join('\n')}

旁白: ${sceneScript.narration}

对话:
${sceneScript.dialogues.map(d => `- ${d.characterName}: "${d.text}" (${d.emotion || '普通'})`).join('\n')}

动作:
${sceneScript.actions.map(a => `- ${a.description}`).join('\n')}
`

    // 替换提示词中的变量
    const prompt = STORYBOARD_GENERATION_PROMPT.replace('{sceneScript}', sceneDescription)

    const systemPrompt = '你是一个专业的影视导演和分镜师。请严格按照 JSON 格式输出，不要添加任何额外的文字说明。'

    const response = await callAI(prompt, systemPrompt, 4096, providerConfigId, modelId)
    const result = extractJsonFromResponse(response)

    if (!Array.isArray(result.storyboards)) {
      throw new Error('生成的分镜格式不正确')
    }

    // Bug C 修复（同 generateSingleStoryboard 路径）：normalize 每个分镜的
    // characters[].characterId — AI 在批量模式下更容易把 characterName 当 ID 抄
    for (const sb of result.storyboards) {
      if (sb && typeof sb === 'object') {
        sb.characters = normalizeAiCharacters(sb.characters, sceneScript.characters)
      }
    }

    return result as StoryboardGenerationResult
  }

  /**
   * 生成单个分镜
   */
  async generateSingleStoryboard(
    sceneScript: SceneScript,
    shotNumber: number,
    previousStoryboards: StoryboardResult[] = [],
    providerConfigId?: string,
    modelId?: string,
    analysisResult?: { shotCount: number; shotTypes: string[]; notes: string }
  ): Promise<StoryboardResult> {
    // 构建场景剧本描述
    const sceneDescription = `
场景 ${sceneScript.sceneNumber}: ${sceneScript.location}
地点类型: ${sceneScript.locationType}
时间: ${sceneScript.timeOfDay}
天气: ${sceneScript.weather || '未指定'}
场景描述: ${sceneScript.sceneDescription}
氛围: ${sceneScript.mood}
光线: ${sceneScript.lighting || '未指定'}

出场角色（characterId 必须用下方 ID 之一回填到分镜的 characters[].characterId）:
${sceneScript.characters.map(c => `- ID: ${c.characterBindingId ?? c.characterId}, 名称: ${c.characterName}, 表情(${c.expression || '无'}), 动作(${c.action || '无'})`).join('\n')}

旁白: ${sceneScript.narration || '无'}
旁白ID: narration_${sceneScript.sceneNumber}

对话:
${sceneScript.dialogues.map(d => `- ID: ${d.id}, 角色: ${d.characterName}, 内容: "${d.text}", 情感: ${d.emotion || '普通'}`).join('\n')}

动作:
${sceneScript.actions.map(a => `- ID: ${a.id}, 描述: ${a.description}`).join('\n')}
`

    // 构建上下文信息
    let contextInfo = ''

    // 如果有整体分析结果，先加入整体规划信息
    if (analysisResult && analysisResult.shotTypes.length > 0) {
      contextInfo += `整体分镜规划：本场景预计 ${analysisResult.shotCount} 个镜头，建议景别序列为 [${analysisResult.shotTypes.join(', ')}]。`
      if (analysisResult.notes) {
        contextInfo += `规划说明：${analysisResult.notes}`
      }
      contextInfo += '\n\n'
    }

    // 再加入镜头位置信息
    if (shotNumber === 1) {
      contextInfo += '这是场景的第一个镜头（开场镜头），需要建立场景环境，展示空间关系和人物位置。'
    } else if (previousStoryboards.length > 0) {
      const lastStoryboard = previousStoryboards[previousStoryboards.length - 1]
      contextInfo += `上一个镜头（第${lastStoryboard.shotNumber}号）：
- 景别: ${lastStoryboard.shotType}
- 角度: ${lastStoryboard.cameraAngle}
- 运镜: ${lastStoryboard.cameraMovement}
- 主体: ${lastStoryboard.subject || '未指定'}
- 持续时间: ${lastStoryboard.duration}秒

请考虑镜头的衔接和变化，避免重复使用相同的镜头设置，除非有特殊需要。`
    }

    // 替换提示词中的变量
    const prompt = SINGLE_STORYBOARD_GENERATION_PROMPT
      .replace(/{shotNumber}/g, String(shotNumber))
      .replace('{sceneScript}', sceneDescription)
      .replace('{contextInfo}', contextInfo)

    const systemPrompt = '你是一个专业的影视导演和分镜师。请严格按照 JSON 格式输出单个分镜，不要添加任何额外的文字说明或数组包裹。'

    const response = await callAI(prompt, systemPrompt, 2048, providerConfigId, modelId)
    const result = extractJsonFromResponse(response)

    // 验证结果
    if (!result.shotType || !result.cameraAngle || !result.frameDescription) {
      throw new Error('生成的分镜缺少必要字段')
    }

    // 确保 shotNumber 正确
    result.shotNumber = shotNumber

    // 验证并修正 dialogueIds
    // 如果 dialogueIds 为空或包含占位符文本，尝试从场景对话中匹配
    if (!result.dialogueIds || !Array.isArray(result.dialogueIds) || result.dialogueIds.length === 0) {
      result.dialogueIds = []
    } else {
      // 过滤掉占位符文本，只保留实际的对话 ID
      const validDialogueIds = sceneScript.dialogues.map(d => d.id)
      result.dialogueIds = result.dialogueIds.filter((id: string) => validDialogueIds.includes(id))
    }

    // 验证并修正 actionIds
    if (!result.actionIds || !Array.isArray(result.actionIds)) {
      result.actionIds = []
    } else {
      const validActionIds = sceneScript.actions.map(a => a.id)
      result.actionIds = result.actionIds.filter((id: string) => validActionIds.includes(id))
    }

    // Bug C 修复：normalize AI 输出的 characters[].characterId（spec 2026-05-09
    // ep-redesign · e2e report-shot-1.2.md）— 把名字 / 长文 ID / 占位符替换为
    // 真实 binding.id；找不到的保留为空让下游 fallback 接管。
    result.characters = normalizeAiCharacters(result.characters, sceneScript.characters)

    return result as StoryboardResult
  }

  /**
   * 逐个生成分镜（推荐使用此方法）
   * 每个分镜单独生成，任务更小更稳定，可以提供更好的进度反馈
   */
  async generateStoryboardsIncremental(
    sceneScript: SceneScript,
    providerConfigId?: string,
    modelId?: string,
    onProgress?: (shotNumber: number, total: number, storyboard?: StoryboardResult) => void
  ): Promise<StoryboardGenerationResult> {
    // 第一步：分析场景需要的分镜数量
    const analysis = await this.analyzeSceneStoryboardNeeds(sceneScript, providerConfigId, modelId)
    const shotCount = analysis.shotCount

    console.log(`[EpisodeStoryboardGenerator] 场景 ${sceneScript.sceneNumber} 需要 ${shotCount} 个分镜`)
    console.log(`[EpisodeStoryboardGenerator] 分镜类型建议: ${analysis.shotTypes.join(', ')}`)
    console.log(`[EpisodeStoryboardGenerator] 分析说明: ${analysis.notes}`)

    // 第二步：逐个生成分镜
    const storyboards: StoryboardResult[] = []

    for (let i = 1; i <= shotCount; i++) {
      if (onProgress) {
        onProgress(i, shotCount)
      }

      try {
        const storyboard = await this.generateSingleStoryboard(
          sceneScript,
          i,
          storyboards,
          providerConfigId,
          modelId,
          analysis
        )
        storyboards.push(storyboard)

        if (onProgress) {
          onProgress(i, shotCount, storyboard)
        }

        console.log(`[EpisodeStoryboardGenerator] 成功生成第 ${i} 个分镜`)
      } catch (error) {
        console.error(`[EpisodeStoryboardGenerator] 生成第 ${i} 个分镜失败:`, error)
        // 继续尝试生成下一个分镜
      }
    }

    // 如果没有成功生成任何分镜，尝试使用旧方法
    if (storyboards.length === 0) {
      console.warn('[EpisodeStoryboardGenerator] 逐个生成失败，尝试使用批量生成')
      return await this.generateStoryboard(sceneScript, providerConfigId, modelId)
    }

    // 后处理：智能分配对话到各个分镜
    // 如果 AI 没有正确分配对话，我们根据分镜数量平均分配
    this.distributeDialoguesToStoryboards(sceneScript, storyboards)

    return { storyboards }
  }

  /**
   * 批量生成分镜（逐场景生成，每个场景使用逐个分镜生成模式）
   */
  async generateStoryboards(
    scenes: SceneScript[],
    providerConfigId?: string,
    modelId?: string,
    onProgress?: (sceneIndex: number, total: number, shotProgress?: { current: number; total: number }) => void
  ): Promise<Map<string, StoryboardGenerationResult>> {
    const results = new Map<string, StoryboardGenerationResult>()

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]

      if (onProgress) {
        onProgress(i, scenes.length)
      }

      try {
        // 使用逐个分镜生成模式
        const result = await this.generateStoryboardsIncremental(
          scene,
          providerConfigId,
          modelId,
          (shotNumber, shotTotal, _storyboard) => {
            if (onProgress) {
              onProgress(i, scenes.length, { current: shotNumber, total: shotTotal })
            }
          }
        )
        results.set(scene.id, result)
        console.log(`[EpisodeStoryboardGenerator] 场景 ${scene.sceneNumber} 生成了 ${result.storyboards.length} 个分镜`)
      } catch (error) {
        console.error(`生成场景 ${scene.sceneNumber} 的分镜失败:`, error)
        // 继续处理其他场景
      }
    }

    return results
  }

  /**
   * AI 填充分镜空白字段（spec 2026-05-28 扩展）
   * 根据场景内容推荐所有分镜参数，一键填充
   *
   * 覆盖字段：
   * - shotType / cameraAngle / cameraMovement / duration（镜头核心参数）
   * - frameDescription（画面描述）
   * - lensFocalMm / aperture / cameraStyle / lighting（metadata参数）
   * - transitionType / transitionDuration / transitionDirection（转场参数）
   * - keyframeCount（关键帧数）
   */
  async fillStoryboardFields(
    input: {
      shotNumber: number
      sceneContext: string
      location?: string
      timeOfDay?: string
      mood?: string
      existingFields: {
        shotType?: string | null
        cameraAngle?: string | null
        cameraMovement?: string | null
        duration?: number | null
        frameDescription?: string | null
        lensFocalMm?: number | null
        aperture?: string | null
        cameraStyle?: string | null
        lighting?: string | null
        transitionType?: string | null
        transitionDuration?: number | null
        transitionDirection?: string | null
        keyframeCount?: number | null
      }
    },
    providerConfigId?: string,
    modelId?: string
  ): Promise<{
    shotType?: string
    cameraAngle?: string
    cameraMovement?: string
    duration?: number
    frameDescription?: string
    lensFocalMm?: string  // 改为字符串（如 "24mm"）
    aperture?: string
    cameraStyle?: string
    lighting?: string
    transitionType?: string
    transitionDuration?: number
    transitionDirection?: string
    keyframeCount?: number
  }> {
    // 构建填充提示词
    const existingInfo = Object.entries(input.existingFields)
      .filter(([_, v]) => v !== null && v !== '' && v !== undefined)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')

    const fieldsToFill = Object.entries(input.existingFields)
      .filter(([_, v]) => v === null || v === '' || v === undefined)
      .map(([k]) => k)
      .join(', ')

    const prompt = `你是一个专业的影视导演和分镜师。请根据以下场景上下文，为第 ${input.shotNumber} 个分镜推荐合适的镜头参数。

## 场景上下文
${input.sceneContext}

## 场景信息
- 地点：${input.location || '未知'}
- 时间：${input.timeOfDay || '未知'}
- 氛围：${input.mood || '未知'}

## 已有字段（不需要填充）
${existingInfo || '（无）'}

## 需要填充的字段
${fieldsToFill}

## 镜头语言说明

### 景别（shotType）
- extreme_long: 大远景 - 极远距离，展示宏大场景
- long: 远景 - 展示完整场景，人物较小
- full: 全景 - 人物全身，展示动作
- medium: 中景 - 人物膝盖以上，展示互动
- medium_close: 中近景 - 人物腰部以上，常用对话场景
- close: 近景 - 人物胸部以上，展示表情
- extreme_close: 特写 - 人物面部，展示情感
- detail: 细节特写 - 物品或局部细节

### 镜头角度（cameraAngle）
- eye_level: 平视 - 客观中立
- high: 俯拍 - 显渺小或弱势
- low: 仰拍 - 显高大或强势
- dutch: 斜角 - 不安或混乱
- birds_eye: 鸟瞰 - 全局视角

### 镜头运动（cameraMovement）- 使用 25 命名预设
- basic 类：static（固定）、push_in（推近）、pull_out（拉远）、pan_left（左摇）、pan_right（右摇）、tilt_up（上仰）、tilt_down（下俯）
- narrative 类：reveal_push（揭示推近）、reveal_pull（揭示拉远）、long_take_tracking（长镜头跟拍）、master_shot_push（大师推近）、spiral_up（螺旋上升）、pov（主观视角）、ots_left（OTS左过肩）、ots_right（OTS右过肩）
- dynamic 类：whip_pan_left（甩镜左）、whip_pan_right（甩镜右）、crash_zoom（冲击变焦）、rack_focus（焦点切换）、dolly_zoom（移动变焦）
- special 类：slow_motion_static（慢动作固定）、time_lapse_pan（延时摇镜）、freeze_frame（定格帧）、impact_zoom（冲击变焦）

### 焦距（lensFocalMm）- 字符串（必须带mm单位）
- 24mm: 超广角 - 空间感强，适合场景
- 35mm: 广角 - 自然视角，适合全景/中景
- 50mm: 标准 - 最接近人眼视角
- 85mm: 人像焦距 - 适合特写/近景
- 125mm: 长焦 - 压缩空间，适合远距离特写

### 光圈（aperture）- 字符串
- f/1.8: 极大光圈 - 极浅景深，梦幻效果
- f/2.8: 大光圈 - 浅景深，突出主体
- f/4: 中等光圈 - 平衡景深
- f/8: 小光圈 - 较深景深，清晰细节
- f/11: 极小光圈 - 深景深，全景清晰

### 相机风格（cameraStyle）- 字符串
- cinematic: 电影感 - 电影级色彩+颗粒感
- digital: 数码 - 清晰/锐利/现代
- film_35mm: 胶片35mm - 柔和颗粒+复古色调
- vintage: 复古 - 老照片质感

### 打光（lighting）- 字符串（必须从以下预设中选择）
- rembrandt: 伦勃朗光 - 45°主光+鼻影投到对侧脸颊
- three_point: 三点照明 - 主光+辅光+轮廓光
- butterfly: 蝴蝶光 - 正前方高位主光→鼻下蝴蝶状阴影
- split: 分割光 - 90°侧光→半亮半暗
- rim_backlight: 逆光轮廓 - 主光在背后→主体边缘发光
- flat_softbox: 平铺柔光 - 正前方大柔光箱→无阴影
- golden_hour: 黄金时刻 - 日出/日落柔和暖光
- blue_hour: 蓝调时刻 - 日落后/日出前的冷蓝调
- noir_hard: 黑色电影硬光 - 强烈对比+百叶窗投影
- cyberpunk_neon: 赛博朋克霓虹 - 紫粉霓虹+反射+雨夜
- cozy_candle: 温暖烛光 - 低色温+跳动光斑
- cold_clinical: 冷峻医院 - 高色温日光灯+无影

### 转场类型（transitionType）
- cut: 硬切 - 快速切换
- fade: 淡入淡出 - 缓慢过渡
- dissolve: 叠化 - 柔和融合
- wipe: 划像 - 方向性过渡
- slide: 滑动 - 平移过渡
- zoom: 缩放转场 - 空间压缩
- whip: 甩镜 - 快速转场

### 转场时长（transitionDuration）- 数字（毫秒）
- 硬切：0
- 淡入淡出：500-1000
- 叠化：300-800
- 其他：200-500

### 转场方向（transitionDirection）
- left: 向左
- right: 向右
- up: 向上
- down: 向下

### 关键帧数（keyframeCount）- 数字（1-9）
- static（固定）：2-3 帧
- 简单运镜（推/拉/摇）：3-5 帧
- 复杂运镜（跟拍/螺旋）：5-7 帧
- 特殊运镜：5-9 帧

## 分镜设计原则

1. **开场镜头（shotNumber=1）**：用远景或全景建立场景
2. **对话镜头**：常用中景或近景，交替使用正反打
3. **情感镜头**：近景或特写强调情感变化
4. **动作镜头**：全景或中景展示动作细节
5. **节奏控制**：快节奏用短镜头（2-3秒），慢节奏用长镜头（5-8秒）
6. **焦距匹配**：人像特写用85mm，场景全景用35mm
7. **光圈匹配**：突出主体用大光圈f/2.8，展示环境用小光圈f/8
8. **打光匹配**：压抑氛围用noir_hard，温馨用golden_hour或cozy_candle，紧张用blue_hour或cold_clinical

## 输出要求

请只输出需要填充的字段，输出 JSON 格式：
{
  "shotType": "建议的景别（英文值）",
  "cameraAngle": "建议的角度（英文值）",
  "cameraMovement": "建议的运镜预设（英文值）",
  "duration": 建议的时长（秒，数字）,
  "frameDescription": "画面描述（格式：【场景】...\\n【人物】...\\n【动作】...\\n【氛围】...）",
  "lensFocalMm": "焦距（字符串，必须带mm单位，如'85mm'）",
  "aperture": "光圈值（字符串，如f/2.8）",
  "cameraStyle": "相机风格（英文值，如cinematic）",
  "lighting": "打光风格（英文预设值，如blue_hour）",
  "transitionType": "转场类型（英文值）",
  "transitionDuration": 转场时长（毫秒，数字）,
  "transitionDirection": "转场方向（英文值）",
  "keyframeCount": 关键帧数（数字1-9）
}

如果某个字段不适合填充或已有值足够，可以不输出该字段。

请直接输出 JSON，不要添加任何解释说明。`

    const systemPrompt = '你是一个专业的影视导演。请根据场景内容推荐分镜参数，严格按照 JSON 格式输出。'

    const response = await callAI(prompt, systemPrompt, 4096, providerConfigId, modelId)
    const result = extractJsonFromResponse(response)

    // 确保返回的值符合预期格式
    const output: any = {}

    // 镜头核心参数
    if (result.shotType && typeof result.shotType === 'string') output.shotType = result.shotType
    if (result.cameraAngle && typeof result.cameraAngle === 'string') output.cameraAngle = result.cameraAngle
    if (result.cameraMovement && typeof result.cameraMovement === 'string') output.cameraMovement = result.cameraMovement
    if (result.duration && typeof result.duration === 'number') output.duration = result.duration
    if (result.frameDescription && typeof result.frameDescription === 'string') output.frameDescription = result.frameDescription

    // metadata参数（焦距/光圈/相机风格/打光）- 焦距需要转换格式
    if (result.lensFocalMm) {
      // AI 可能返回数字或字符串，需要转换为预设格式（如 "24mm"）
      let lensValue = result.lensFocalMm
      if (typeof lensValue === 'number') {
        lensValue = `${lensValue}mm`
      } else if (typeof lensValue === 'string' && !lensValue.endsWith('mm')) {
        lensValue = `${lensValue}mm`
      }
      // 验证是否为有效预设值
      const validLensValues = ['24mm', '35mm', '50mm', '85mm', '125mm']
      if (validLensValues.includes(lensValue)) {
        output.lensFocalMm = lensValue
      }
    }
    if (result.aperture && typeof result.aperture === 'string') output.aperture = result.aperture
    if (result.cameraStyle && typeof result.cameraStyle === 'string') output.cameraStyle = result.cameraStyle
    if (result.lighting && typeof result.lighting === 'string') output.lighting = result.lighting

    // 转场参数
    if (result.transitionType && typeof result.transitionType === 'string') output.transitionType = result.transitionType
    if (result.transitionDuration && typeof result.transitionDuration === 'number') output.transitionDuration = result.transitionDuration
    if (result.transitionDirection && typeof result.transitionDirection === 'string') output.transitionDirection = result.transitionDirection

    // 关键帧数
    if (result.keyframeCount && typeof result.keyframeCount === 'number') output.keyframeCount = result.keyframeCount

    console.log('[EpisodeStoryboardGenerator] AI填充返回:', output)
    return output
  }
}
