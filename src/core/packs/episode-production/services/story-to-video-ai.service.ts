/**
 * @deprecated 本文件已拆分到 modules/episode-production/narrative/ai/*
 *             保留 deprecated re-export 兼容现有 import；
 *             消费方 import 路径会在后续 task / phase 切换。
 */

import type {
  SceneScript,
  FullScriptGenerationResult,
  UploadedCharacter,
  UploadedLocation,
  UploadedItem
} from '@shared/types/story-to-video.types'
import type { AssetRosterForScript } from '@shared/types/episode-production'
import { callAI, callAIWithContinue, extractJsonFromResponse } from '@core/platform/episode-production/narrative/ai/_helpers'
import { EpisodeScriptGenerator } from '@core/platform/episode-production/narrative/ai/script-generator'
import { EpisodeStoryboardGenerator } from '@core/platform/episode-production/narrative/ai/storyboard-generator'

export * from '@core/platform/episode-production/narrative/ai/types'
export { EpisodeScriptGenerator } from '@core/platform/episode-production/narrative/ai/script-generator'
export { EpisodeStoryboardGenerator } from '@core/platform/episode-production/narrative/ai/storyboard-generator'

export type {
  ScriptGenerationResult,
  SceneGenerationResult,
  StoryboardGenerationResult,
  StoryboardResult,
  GenerationStreamEvent,
  EpisodeProductionTask,
  StoryToVideoTask
} from '@core/platform/episode-production/narrative/ai/types'

// ==================== 场景拆分提示词（仅 facade 使用） ====================

const SCENE_SPLIT_PROMPT = `你是一个专业的视频脚本分析师。请将以下小说章节内容拆分为多个场景。

## 拆分原则

1. 地点变化应拆分为新场景
2. 时间跳跃应拆分为新场景
3. 主要角色组合变化应考虑拆分
4. 情感氛围显著变化可拆分
5. 每个场景应有明确的视觉焦点

## 输出格式（必须严格遵循）

\`\`\`json
{
  "scenes": [
    {
      "sceneNumber": 1,
      "location": "地点名称",
      "locationType": "exterior",
      "timeOfDay": "morning",
      "weather": "sunny",
      "sceneDescription": "详细场景描述，包含：空间布局（形状、大小、出入口方位）、主要陈设（家具位置、装饰）、环境细节（材质、色调）、关键视觉元素（窗户、灯光位置）",
      "mood": "氛围",
      "lighting": "光线描述（光源位置、明暗分布）",
      "characters": ["角色名1", "角色名2"],
      "keyEvents": ["事件描述"],
      "originalText": "原文片段",
      "narration": "旁白文本",
      "dialogues": [
        {"character": "角色名", "text": "对话内容", "emotion": "情感"}
      ]
    }
  ]
}
\`\`\`

## 章节内容

{chapterContent}`

const CHARACTER_IDENTIFICATION_PROMPT = `你是一位专业的文学分析师和剧本编剧，擅长从文本中识别和分析角色。请从以下文本中识别出所有重要的角色。

## 输出要求

请输出 JSON 格式的角色列表，严格遵循以下格式：

{
  "characters": [
    {
      "name": "角色名称",
      "description": "角色的简要描述，包括外貌特征、性格特点、身份背景等",
      "role": "角色定位，可选值：protagonist（主角）、supporting（配角）、antagonist（反派）、minor（次要角色）",
      "age": 年龄（数字，如果文本中有明确年龄或可推断的大致年龄，如 25、30；无法推断则不填或填 null）,
      "gender": 性别（男/女/其他，无法推断则不填）,
      "race": 人种或种族（如：东亚人、欧洲人、非洲人、或虚构种族如半人马；无法推断则不填）
    }
  ]
}

## 识别原则

1. **主角识别**：故事的核心人物，推动主要情节发展，出场频率最高
2. **配角识别**：与主角有重要互动，对情节有显著影响但非核心
3. **反派识别**：与主角对立的角色，制造冲突或障碍
4. **次要角色识别**：短暂出场但有名字或特定身份的角色
5. **忽略**：无名无姓的路人、群体描述（如"村民们"）不计入

## 分析文本

{textContent}

## 输出

请直接输出 JSON 格式的结果，不要添加任何额外的文字说明。`

const LOCATION_IDENTIFICATION_PROMPT = `你是一位专业的文学分析师和剧本编剧，擅长从文本中识别和分析场景地点。请从以下文本中识别出所有重要的地点。

## 输出要求

请输出 JSON 格式的地点列表，严格遵循以下格式：

{
  "locations": [
    {
      "name": "地点名称",
      "description": "地点的简要描述，包括环境特征、氛围、主要元素等",
      "type": "地点类型，可选值：city（城市）、village（村庄）、mountain（山脉）、palace（宫殿）、forest（森林）、sea（海域）、building（建筑）、other（其他）"
    }
  ]
}

## 识别原则

1. **主要地点**：故事发生的主要场景，多次出现或重要事件发生地
2. **次要地点**：短暂出现但有名称或特征的地点
3. **忽略**：模糊的空间描述（如"远方"、"某处"）不计入
4. **合并**：同一地点的不同描述应合并为一个条目

## 分析文本

{textContent}

## 输出

请直接输出 JSON 格式的结果，不要添加任何额外的文字说明。`

const ITEM_IDENTIFICATION_PROMPT = `你是一位专业的文学分析师和剧本编剧，擅长从文本中识别和分析关键物品。请从以下文本中识别出所有重要的物品。

## 输出要求

请输出 JSON 格式的物品列表，严格遵循以下格式：

{
  "items": [
    {
      "name": "物品名称",
      "description": "物品的简要描述，包括外观、功能、重要性等",
      "type": "物品类型，可选值：weapon（武器）、artifact（神器）、medicine（丹药）、manual（秘籍）、token（信物）、other（其他）"
    }
  ]
}

## 识别原则

1. **关键物品**：推动情节发展、具有特殊意义或主角使用的物品
2. **次要物品**：有名称或特殊描述的物品
3. **忽略**：普通日常用品、无特殊意义的物品不计入
4. **合并**：同一物品的不同描述应合并为一个条目

## 分析文本

{textContent}

## 输出

请直接输出 JSON 格式的结果，不要添加任何额外的文字说明。`

// ==================== 兼容 class ====================

/**
 * @deprecated 改用 EpisodeScriptGenerator / EpisodeStoryboardGenerator。
 *             保留为 facade 兼容现有调用方。
 */
export class StoryToVideoAIService {
  private static instance: StoryToVideoAIService

  private readonly scriptGen = EpisodeScriptGenerator.getInstance()
  private readonly storyboardGen = EpisodeStoryboardGenerator.getInstance()

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): StoryToVideoAIService {
    if (!StoryToVideoAIService.instance) {
      StoryToVideoAIService.instance = new StoryToVideoAIService()
    }
    return StoryToVideoAIService.instance
  }

  // ---- 委托给 EpisodeScriptGenerator ----

  generateFullScript(
    chapterContent: string,
    roster: AssetRosterForScript,
    providerConfigId?: string,
    modelId?: string
  ): Promise<FullScriptGenerationResult> {
    return this.scriptGen.generateFullScript(chapterContent, roster, providerConfigId, modelId)
  }

  generateScript(
    chapterContent: string,
    roster: AssetRosterForScript,
    providerConfigId?: string,
    modelId?: string
  ) {
    return this.scriptGen.generateScript(chapterContent, roster, providerConfigId, modelId)
  }

  // ---- 委托给 EpisodeStoryboardGenerator ----

  generateStoryboard(
    sceneScript: SceneScript,
    providerConfigId?: string,
    modelId?: string
  ) {
    return this.storyboardGen.generateStoryboard(sceneScript, providerConfigId, modelId)
  }

  generateSingleStoryboard(
    sceneScript: SceneScript,
    shotNumber: number,
    previousStoryboards?: import('@core/platform/episode-production/narrative/ai/types').StoryboardResult[],
    providerConfigId?: string,
    modelId?: string
  ) {
    return this.storyboardGen.generateSingleStoryboard(sceneScript, shotNumber, previousStoryboards, providerConfigId, modelId)
  }

  generateStoryboardsIncremental(
    sceneScript: SceneScript,
    providerConfigId?: string,
    modelId?: string,
    onProgress?: (shotNumber: number, total: number, storyboard?: import('@core/platform/episode-production/narrative/ai/types').StoryboardResult) => void
  ) {
    return this.storyboardGen.generateStoryboardsIncremental(sceneScript, providerConfigId, modelId, onProgress)
  }

  generateStoryboards(
    scenes: SceneScript[],
    providerConfigId?: string,
    modelId?: string,
    onProgress?: (sceneIndex: number, total: number, shotProgress?: { current: number; total: number }) => void
  ) {
    return this.storyboardGen.generateStoryboards(scenes, providerConfigId, modelId, onProgress)
  }

  analyzeSceneStoryboardNeeds = this.storyboardGen.analyzeSceneStoryboardNeeds.bind(this.storyboardGen)

  // ---- 未拆分的方法（保留在 facade 中，后续 task 再迁移） ----

  /**
   * 拆分场景
   */
  async splitScenes(
    chapterContent: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<{ scenes: import('@core/platform/episode-production/narrative/ai/types').SceneGenerationResult[] }> {
    // 替换提示词中的变量
    const prompt = SCENE_SPLIT_PROMPT.replace('{chapterContent}', chapterContent)

    const systemPrompt = '你是一个专业的视频脚本分析师。请严格按照 JSON 格式输出，不要添加任何额外的文字说明。'

    const response = await callAI(prompt, systemPrompt, 4096, providerConfigId, modelId)
    const result = extractJsonFromResponse(response)

    if (!Array.isArray(result.scenes)) {
      throw new Error('生成的场景格式不正确')
    }

    return result
  }

  /**
   * 从上传的长文中识别角色
   * @param textContent 上传的长文内容（仅分析前 5000 字以提高效率）
   * @param providerConfigId AI 提供商配置 ID
   * @param modelId 模型 ID
   * @returns 识别的角色列表
   */
  async identifyCharacters(
    textContent: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<UploadedCharacter[]> {
    // 仅分析前 5000 字以提高效率
    const textToAnalyze = textContent.substring(0, 5000)

    // 替换提示词中的变量
    const prompt = CHARACTER_IDENTIFICATION_PROMPT.replace('{textContent}', textToAnalyze)

    const systemPrompt = '你是一位专业的文学分析师。请从文本中识别角色，严格按照 JSON 格式输出，不要添加任何额外的文字说明。'

    const response = await callAIWithContinue(prompt, systemPrompt, undefined, providerConfigId, modelId)
    const result = extractJsonFromResponse(response)

    // 验证结果格式
    if (!result.characters || !Array.isArray(result.characters)) {
      console.warn('[StoryToVideoAI] 角色识别结果格式不正确，返回空数组')
      return []
    }

    // 转换为 UploadedCharacter 格式（包含 AI 推断的年龄/性别/人种）
    const characters: UploadedCharacter[] = result.characters.map((char: any) => ({
      name: char.name || '未知角色',
      description: char.description,
      role: char.role,
      age: typeof char.age === 'number' ? char.age : undefined,
      gender: char.gender || undefined,
      race: char.race || undefined
    }))

    console.log(`[StoryToVideoAI] 从上传长文中识别了 ${characters.length} 个角色`)
    return characters
  }

  /**
   * 从上传的长文中识别地点
   * @param textContent 上传的长文内容
   * @param providerConfigId 可选的提供商配置ID
   * @param modelId 可选的模型ID
   * @returns 识别的地点列表
   */
  async identifyLocations(
    textContent: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<UploadedLocation[]> {
    // 仅分析前 5000 字以提高效率
    const textToAnalyze = textContent.substring(0, 5000)

    // 替换提示词中的变量
    const prompt = LOCATION_IDENTIFICATION_PROMPT.replace('{textContent}', textToAnalyze)

    const systemPrompt = '你是一位专业的文学分析师。请从文本中识别地点，严格按照 JSON 格式输出，不要添加任何额外的文字说明。'

    const response = await callAIWithContinue(prompt, systemPrompt, undefined, providerConfigId, modelId)
    const result = extractJsonFromResponse(response)

    // 验证结果格式
    if (!result.locations || !Array.isArray(result.locations)) {
      console.warn('[StoryToVideoAI] 地点识别结果格式不正确，返回空数组')
      return []
    }

    // 转换为 UploadedLocation 格式
    const locations: UploadedLocation[] = result.locations.map((loc: any) => ({
      name: loc.name || '未知地点',
      description: loc.description,
      type: loc.type
    }))

    console.log(`[StoryToVideoAI] 从上传长文中识别了 ${locations.length} 个地点`)
    return locations
  }

  /**
   * 从上传的长文中识别物品
   * @param textContent 上传的长文内容
   * @param providerConfigId 可选的提供商配置ID
   * @param modelId 可选的模型ID
   * @returns 识别的物品列表
   */
  async identifyItems(
    textContent: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<UploadedItem[]> {
    // 仅分析前 5000 字以提高效率
    const textToAnalyze = textContent.substring(0, 5000)

    // 替换提示词中的变量
    const prompt = ITEM_IDENTIFICATION_PROMPT.replace('{textContent}', textToAnalyze)

    const systemPrompt = '你是一位专业的文学分析师。请从文本中识别物品，严格按照 JSON 格式输出，不要添加任何额外的文字说明。'

    const response = await callAIWithContinue(prompt, systemPrompt, undefined, providerConfigId, modelId)
    const result = extractJsonFromResponse(response)

    // 验证结果格式
    if (!result.items || !Array.isArray(result.items)) {
      console.warn('[StoryToVideoAI] 物品识别结果格式不正确，返回空数组')
      return []
    }

    // 转换为 UploadedItem 格式
    const items: UploadedItem[] = result.items.map((item: any) => ({
      name: item.name || '未知物品',
      description: item.description,
      type: item.type
    }))

    console.log(`[StoryToVideoAI] 从上传长文中识别了 ${items.length} 个物品`)
    return items
  }
}
