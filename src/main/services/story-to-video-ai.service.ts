/**
 * 剧集制作 AI 服务
 * @module services/story-to-video-ai.service
 * @description 处理剧集制作模块的 AI 生成功能
 */

import { BrowserWindow } from 'electron'
import { getDatabaseManager } from '../database'
import { createProvider } from '../providers'
import { PROVIDER_TEMPLATES } from './provider-template.service'
import { SecureStorageService } from './secure-storage.service'
import type { ProviderTemplate, UserProviderConfig, ChatContext } from '../../shared/types'
import type {
  SceneScript,
  Storyboard,
  Dialogue,
  ActionDescription,
  SceneCharacter,
  ShotType,
  CameraAngle,
  CameraMovement,
  TransitionConfig,
  StoryboardCharacter
} from '../../shared/types/story-to-video.types'

/**
 * 生成任务类型
 */
export type StoryToVideoTask =
  | 'script'       // 剧本生成
  | 'scenes'       // 场景拆分
  | 'storyboard'   // 分镜生成

/**
 * 剧本生成结果
 */
export interface ScriptGenerationResult {
  synopsis: string
  scenes: SceneGenerationResult[]
}

/**
 * 场景生成结果
 */
export interface SceneGenerationResult {
  sceneNumber: number
  location: string
  locationType: 'interior' | 'exterior' | 'mixed'
  timeOfDay: string
  weather?: string
  sceneDescription: string
  mood: string
  lighting?: string
  characters: SceneCharacter[]
  originalText: string
  narration: string
  dialogues: Dialogue[]
  actions: ActionDescription[]
}

/**
 * 分镜生成结果
 */
export interface StoryboardGenerationResult {
  storyboards: StoryboardResult[]
}

/**
 * 分镜结果
 */
export interface StoryboardResult {
  shotNumber: number
  shotType: ShotType
  cameraAngle: CameraAngle
  cameraMovement: CameraMovement
  movementDuration?: number
  frameDescription: string
  subject?: string
  composition?: string
  duration: number
  transition: TransitionConfig
  narrationId?: string
  dialogueIds: string[]
  actionIds: string[]
  characters: StoryboardCharacter[]
}

/**
 * 流式生成事件
 */
export interface GenerationStreamEvent {
  type: 'start' | 'content' | 'done' | 'error'
  content?: string
  data?: any
  error?: string
}

// ==================== AI 提示词模板 ====================

/**
 * 剧本生成提示词
 */
const SCRIPT_GENERATION_PROMPT = `你是一个专业的影视编剧。请将以下小说章节内容转换为专业的视频剧本。

## 输出要求

请输出 JSON 格式的剧本，包含以下内容：

1. **章节梗概**：50-100字概括本章内容
2. **场景列表**：按地点和时间划分场景
3. **每个场景包含**：
   - 地点名称和类型（interior=内景/exterior=外景/mixed=混合）
   - 时间（morning/noon/afternoon/evening/night/dawn/dusk）
   - 天气（可选：sunny/cloudy/rainy/snowy/foggy/stormy）
   - 场景描述（视觉呈现）
   - 氛围（紧张/温馨/悲伤等）
   - 光线描述（可选）
   - 出场角色及其状态
   - 对话列表（含情感标注）
   - 旁白（用于场景衔接和背景说明）
   - 动作描述

## 拆分原则

1. **地点变化**应拆分为新场景
2. **时间跳跃**应拆分为新场景
3. **主要角色组合变化**可考虑拆分
4. **情感氛围显著变化**可拆分
5. 每个场景应有明确的**视觉焦点**

## 对话处理原则

1. 保留原文关键对话，可适当润色
2. 为每句对话标注情感
3. 标注说话时的动作或表情
4. 适当添加停顿和节奏控制

## 输出格式（必须严格遵循）

\`\`\`json
{
  "synopsis": "章节梗概",
  "scenes": [
    {
      "sceneNumber": 1,
      "location": "地点名称",
      "locationType": "exterior",
      "timeOfDay": "morning",
      "weather": "sunny",
      "sceneDescription": "场景视觉描述",
      "mood": "氛围",
      "lighting": "光线描述",
      "characters": [
        {
          "characterId": "使用提供的角色ID",
          "characterName": "角色名称",
          "position": "center",
          "expression": "表情",
          "action": "动作",
          "outfit": "服装描述",
          "props": ["道具1", "道具2"]
        }
      ],
      "originalText": "原文片段",
      "narration": "旁白文本",
      "dialogues": [
        {
          "id": "dlg_1",
          "characterId": "角色ID",
          "characterName": "角色名称",
          "text": "对话内容",
          "emotion": "情感",
          "volume": "normal",
          "pace": "normal",
          "pause": 0
        }
      ],
      "actions": [
        {
          "id": "act_1",
          "characterId": "角色ID",
          "description": "动作描述",
          "timing": "before",
          "duration": 2
        }
      ]
    }
  ]
}
\`\`\`

## 可用角色列表

{characters}

## 章节内容

{chapterContent}`

/**
 * 场景拆分提示词
 */
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
      "sceneDescription": "场景视觉描述",
      "mood": "氛围",
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

/**
 * 分镜生成提示词
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

## 输出格式（必须严格遵循）

\`\`\`json
{
  "storyboards": [
    {
      "shotNumber": 1,
      "shotType": "long",
      "cameraAngle": "eye_level",
      "cameraMovement": "static",
      "frameDescription": "画面详细描述",
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
 * 剧集制作 AI 服务
 */
export class StoryToVideoAIService {
  private static instance: StoryToVideoAIService

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

  /**
   * 获取提供商配置
   */
  private async getProviderConfig(providerConfigId?: string): Promise<{
    config: UserProviderConfig
    template: ProviderTemplate
    apiKey: string
  } | null> {
    const dbManager = getDatabaseManager()
    if (!dbManager.providerConfigs) {
      return null
    }

    let config: UserProviderConfig | null = null

    // 如果指定了提供商配置 ID，优先使用
    if (providerConfigId) {
      config = await dbManager.providerConfigs.getById(providerConfigId)
    }

    // 如果没有指定或找不到，尝试获取默认提供商
    if (!config) {
      config = await dbManager.providerConfigs.getDefault()
    }

    // 如果没有默认，获取第一个启用的
    if (!config) {
      const enabledConfigs = await dbManager.providerConfigs.getEnabled()
      if (enabledConfigs.length > 0) {
        config = enabledConfigs[0]
      }
    }

    if (!config || !config.apiKey) {
      return null
    }

    // 获取模板
    const template = PROVIDER_TEMPLATES.find(t => t.id === config!.templateId)
    if (!template) {
      return null
    }

    // 解密 API 密钥
    const secureStorage = SecureStorageService.getInstance()
    if (!secureStorage.isInitialized()) {
      await secureStorage.initialize()
    }
    const apiKey = secureStorage.decrypt(config.apiKey)

    return { config, template, apiKey }
  }

  /**
   * 调用 AI 生成
   */
  private async callAI(
    prompt: string,
    systemPrompt: string,
    maxTokens: number = 8192,
    providerConfigId?: string,
    modelId?: string
  ): Promise<string> {
    const providerInfo = await this.getProviderConfig(providerConfigId)
    if (!providerInfo) {
      throw new Error('未配置 AI 提供商，请先在设置中添加提供商配置')
    }

    const { config, template, apiKey } = providerInfo

    // 确定使用的模型
    const effectiveModelId = modelId || config.defaultModel

    // 创建 Provider 实例
    const provider = createProvider(
      template.id,
      {
        apiKey,
        baseUrl: config.baseUrl,
        defaultModel: effectiveModelId
      },
      template,
      config
    )

    // 构建消息上下文
    const context: ChatContext = {
      systemPrompt: systemPrompt,
      messages: [
        { role: 'user', content: prompt }
      ]
    }

    // 调用 AI（非流式）
    const result = await provider.chatSync(context, { maxTokens })

    console.log('[StoryToVideoAI] AI 调用完成, maxTokens:', maxTokens)

    if (!result.success) {
      throw new Error(result.error || 'AI 调用失败')
    }

    return result.content || ''
  }

  /**
   * 从 AI 响应中提取 JSON
   */
  private extractJsonFromResponse(response: string): any {
    console.log('[StoryToVideoAI] AI 响应长度:', response.length)
    console.log('[StoryToVideoAI] AI 响应前500字符:', response.substring(0, 500))

    // 清理响应内容
    let cleanedResponse = response.trim()

    // 尝试提取 ```json ... ``` 中的内容
    const jsonMatch = cleanedResponse.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      try {
        return this.parseJsonString(jsonMatch[1].trim())
      } catch (e) {
        console.warn('[StoryToVideoAI] 解析 ```json``` 块失败:', e)
      }
    }

    // 尝试提取 ``` ... ``` 中的内容
    const codeMatch = cleanedResponse.match(/```\s*([\s\S]*?)\s*```/)
    if (codeMatch) {
      try {
        return this.parseJsonString(codeMatch[1].trim())
      } catch (e) {
        console.warn('[StoryToVideoAI] 解析 ``` 块失败:', e)
      }
    }

    // 尝试直接解析整个响应
    try {
      return this.parseJsonString(cleanedResponse)
    } catch (e) {
      // 尝试找到第一个 { 和最后一个 }
      const start = cleanedResponse.indexOf('{')
      const end = cleanedResponse.lastIndexOf('}')
      if (start !== -1 && end !== -1 && end > start) {
        try {
          const jsonStr = cleanedResponse.substring(start, end + 1)
          console.log('[StoryToVideoAI] 尝试解析提取的 JSON，长度:', jsonStr.length)
          return this.parseJsonString(jsonStr)
        } catch (e2) {
          console.error('[StoryToVideoAI] 解析提取的 JSON 失败:', e2)
          console.error('[StoryToVideoAI] 提取的 JSON 前1000字符:', cleanedResponse.substring(start, Math.min(start + 1000, end + 1)))
        }
      }

      // 输出更详细的错误信息
      console.error('[StoryToVideoAI] 无法解析 AI 响应为 JSON 格式')
      console.error('[StoryToVideoAI] 响应内容（前2000字符）:', cleanedResponse.substring(0, 2000))
      throw new Error('无法解析 AI 响应为 JSON 格式，请检查 AI 模型是否支持 JSON 输出')
    }
  }

  /**
   * 解析 JSON 字符串，处理常见格式问题
   */
  private parseJsonString(jsonStr: string): any {
    // 移除可能存在的注释（JSON 不支持注释，但有些 AI 会添加）
    let cleaned = jsonStr
      // 移除单行注释
      .replace(/\/\/.*$/gm, '')
      // 移除多行注释
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // 移除尾随逗号（JSON 不支持）
      .replace(/,(\s*[}\]])/g, '$1')
      // 修复可能被转义的引号问题
      .replace(/\\'/g, "'")
      // 将中文引号转换为标准双引号（AI 经常在内容中使用中文引号）
      .replace(/"/g, '"')
      .replace(/"/g, '"')

    return JSON.parse(cleaned)
  }

  /**
   * 生成剧本
   */
  async generateScript(
    chapterContent: string,
    characters: Array<{ id: string; name: string; description?: string }>,
    providerConfigId?: string,
    modelId?: string
  ): Promise<ScriptGenerationResult> {
    // 构建角色列表
    const characterList = characters.map(c =>
      `- ID: ${c.id}, 名称: ${c.name}${c.description ? `, 描述: ${c.description}` : ''}`
    ).join('\n')

    // 替换提示词中的变量
    const prompt = SCRIPT_GENERATION_PROMPT
      .replace('{characters}', characterList)
      .replace('{chapterContent}', chapterContent)

    const systemPrompt = '你是一个专业的影视编剧，擅长将小说转换为视频剧本。请严格按照 JSON 格式输出，不要添加任何额外的文字说明。'

    const response = await this.callAI(prompt, systemPrompt, 8192, providerConfigId, modelId)
    const result = this.extractJsonFromResponse(response)

    // 验证结果格式
    if (!result.synopsis || !Array.isArray(result.scenes)) {
      throw new Error('生成的剧本格式不正确，缺少必要字段')
    }

    return result as ScriptGenerationResult
  }

  /**
   * 拆分场景
   */
  async splitScenes(
    chapterContent: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<{ scenes: SceneGenerationResult[] }> {
    // 替换提示词中的变量
    const prompt = SCENE_SPLIT_PROMPT.replace('{chapterContent}', chapterContent)

    const systemPrompt = '你是一个专业的视频脚本分析师。请严格按照 JSON 格式输出，不要添加任何额外的文字说明。'

    const response = await this.callAI(prompt, systemPrompt, 4096, providerConfigId, modelId)
    const result = this.extractJsonFromResponse(response)

    if (!Array.isArray(result.scenes)) {
      throw new Error('生成的场景格式不正确')
    }

    return result
  }

  /**
   * 生成分镜
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

出场角色:
${sceneScript.characters.map(c => `- ${c.characterName}: 表情(${c.expression || '无'}), 动作(${c.action || '无'})`).join('\n')}

旁白: ${sceneScript.narration}

对话:
${sceneScript.dialogues.map(d => `- ${d.characterName}: "${d.text}" (${d.emotion || '普通'})`).join('\n')}

动作:
${sceneScript.actions.map(a => `- ${a.description}`).join('\n')}
`

    // 替换提示词中的变量
    const prompt = STORYBOARD_GENERATION_PROMPT.replace('{sceneScript}', sceneDescription)

    const systemPrompt = '你是一个专业的影视导演和分镜师。请严格按照 JSON 格式输出，不要添加任何额外的文字说明。'

    const response = await this.callAI(prompt, systemPrompt, 4096, providerConfigId, modelId)
    const result = this.extractJsonFromResponse(response)

    if (!Array.isArray(result.storyboards)) {
      throw new Error('生成的分镜格式不正确')
    }

    return result as StoryboardGenerationResult
  }

  /**
   * 批量生成分镜
   */
  async generateStoryboards(
    scenes: SceneScript[],
    providerConfigId?: string,
    modelId?: string,
    onProgress?: (sceneIndex: number, total: number) => void
  ): Promise<Map<string, StoryboardGenerationResult>> {
    const results = new Map<string, StoryboardGenerationResult>()

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]
      if (onProgress) {
        onProgress(i, scenes.length)
      }

      try {
        const result = await this.generateStoryboard(scene, providerConfigId, modelId)
        results.set(scene.id, result)
      } catch (error) {
        console.error(`生成场景 ${scene.sceneNumber} 的分镜失败:`, error)
        // 继续处理其他场景
      }
    }

    return results
  }
}