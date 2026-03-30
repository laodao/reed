/**
 * 长文写作 AI 服务
 * @module services/longwriting-ai.service
 * @description 处理长文写作模块的 AI 生成功能
 */

import { BrowserWindow } from 'electron'
import { getDatabaseManager } from '../database'
import { createProvider } from '../providers'
import { PROVIDER_TEMPLATES } from './provider-template.service'
import { SecureStorageService } from './secure-storage.service'
import type { ProviderTemplate, UserProviderConfig, ChatContext } from '../../shared/types'

/**
 * 生成任务类型
 */
export type GenerationTask =
  | 'story-overview'    // 故事概要
  | 'plots'             // 故事情节
  | 'characters'        // 角色建议
  | 'skills-items'      // 技能物品
  | 'outline-story'     // 故事大纲
  | 'outline-comment'   // 评论大纲
  | 'chapter'           // 章节内容
  | 'section'           // 段落内容
  | 'polish-background' // 润色背景

/**
 * 生成请求参数
 */
export interface GenerateRequest {
  task: GenerationTask
  projectId: string
  prompt?: string
  targetWords?: number
  context?: Record<string, any>
}

/**
 * 生成响应
 */
export interface GenerateResponse {
  success: boolean
  data?: any
  error?: string
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

/**
 * 长文写作 AI 服务
 */
export class LongWritingAIService {
  private static instance: LongWritingAIService

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): LongWritingAIService {
    if (!LongWritingAIService.instance) {
      LongWritingAIService.instance = new LongWritingAIService()
    }
    return LongWritingAIService.instance
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
    systemPrompt?: string,
    maxTokens?: number,
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

    // 构建消息上下文 - 使用 ChatContext 格式
    const context: ChatContext = {
      systemPrompt: systemPrompt,
      messages: [
        { role: 'user', content: prompt }
      ]
    }

    // 调用 AI（非流式）
    const result = await provider.chat(context, {
      maxTokens: maxTokens || 4096
    })

    return result.content
  }

  /**
   * 流式调用 AI 生成
   */
  private async callAIStream(
    window: BrowserWindow,
    eventId: string,
    prompt: string,
    systemPrompt?: string,
    maxTokens?: number,
    providerConfigId?: string,
    modelId?: string
  ): Promise<string> {
    const providerInfo = await this.getProviderConfig(providerConfigId)
    if (!providerInfo) {
      throw new Error('未配置 AI 提供商，请先在设置中添加提供商配置')
    }

    const { config, template, apiKey } = providerInfo

    // 确定使用的模型：优先使用传入的 modelId，其次使用配置中的默认模型
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

    // 构建消息上下文 - 使用 ChatContext 格式
    const context: ChatContext = {
      systemPrompt: systemPrompt,
      messages: [
        { role: 'user', content: prompt }
      ]
    }

    // 发送开始事件
    window.webContents.send(`longwriting:generate:${eventId}`, {
      type: 'start'
    } as GenerationStreamEvent)

    // 流式调用 AI
    let fullContent = ''
    try {
      fullContent = await provider.chatStream(
        context,
        (event) => {
          // Provider 发送 delta 事件，转换为 content 事件发送给前端
          if (event.type === 'delta' && event.content) {
            fullContent += event.content
            window.webContents.send(`longwriting:generate:${eventId}`, {
              type: 'content',
              content: event.content
            } as GenerationStreamEvent)
          }
        },
        undefined,
        { maxTokens: maxTokens || 4096 }
      )

      // 发送完成事件
      window.webContents.send(`longwriting:generate:${eventId}`, {
        type: 'done',
        content: fullContent
      } as GenerationStreamEvent)
    } catch (error: any) {
      // 发送错误事件
      window.webContents.send(`longwriting:generate:${eventId}`, {
        type: 'error',
        error: error.message || 'AI 生成失败'
      } as GenerationStreamEvent)
      throw error
    }

    return fullContent
  }

  // ==================== 故事概要生成 ====================

  /**
   * 生成故事概要
   */
  async generateStoryOverview(
    window: BrowserWindow,
    eventId: string,
    projectId: string,
    input: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getDatabaseManager()

    // 获取项目信息
    const project = await dbManager.lwProjects?.getById(projectId)
    if (!project) {
      return { success: false, error: '项目不存在' }
    }

    const systemPrompt = `你是一位专业的小说创作顾问。请根据用户的想法，生成一个简洁的故事概要。

**重要**：请控制回复长度，总字数不超过800字。

你的回复必须是纯 JSON 格式（不要包含 \`\`\`json 标记），包含以下字段：
- title: 故事标题（简洁有力，不超过10个字）
- storyType: 故事类型（如：xuanxia/kehuan/xuanhuan/lishi/dushi/other）
- summary: 故事摘要（100-200字，简洁明了）
- coreConflict: 核心冲突（50-100字，必须生成，描述故事的主要矛盾和冲突）
- estimatedChapters: 预估章节数（数字）

请直接输出 JSON 对象，不要有任何额外文字。`

    const prompt = `请根据以下想法，生成一个故事概要：

${input}

请直接返回 JSON 格式的结果，不要添加其他说明文字。`

    try {
      const result = await this.callAIStream(
        window,
        eventId,
        prompt,
        systemPrompt,
        undefined,
        providerConfigId,
        modelId
      )

      // 尝试解析 JSON
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])
        return { success: true, data }
      }

      // 如果无法解析为 JSON，返回原始文本
      return { success: true, data: { summary: result } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ==================== 角色建议生成 ====================

  /**
   * 生成角色建议
   */
  async generateCharacters(
    window: BrowserWindow,
    eventId: string,
    projectId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getDatabaseManager()

    // 获取故事概要
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    if (!overview) {
      return { success: false, error: '请先创建故事概要' }
    }

    const systemPrompt = `你是一位专业的小说创作顾问。请根据故事概要，生成3-5个建议的角色。
你的回复应该是 JSON 数组格式，每个角色包含以下字段：
- name: 角色名称
- gender: 性别（male/female/other）
- age: 年龄
- rolePosition: 角色定位（protagonist/supporting/antagonist/minor）
- appearance: 外貌描述
- background: 背景故事
- personality: 性格特点
- abilities: 能力特长`

    const prompt = `请根据以下故事概要，生成建议的角色：

故事标题：${overview.title || '未命名'}
故事类型：${overview.genre || '未指定'}
核心主题：${overview.coreTheme || '未指定'}
故事摘要：${overview.summary || '未指定'}

请直接返回 JSON 数组格式的结果，不要添加其他说明文字。`

    try {
      const result = await this.callAIStream(window, eventId, prompt, systemPrompt, undefined, providerConfigId, modelId)
      console.log(`[LongWritingAI] generateCharacters 内容长度: ${result.length}`)

      // 尝试解析 JSON 数组
      const jsonMatch = result.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[0])
          console.log(`[LongWritingAI] generateCharacters 解析成功, 角色数: ${Array.isArray(data) ? data.length : 0}`)
          return { success: true, data }
        } catch (parseError: any) {
          console.error(`[LongWritingAI] generateCharacters JSON 解析失败:`, parseError.message)
          // 即使服务端解析失败，前端也可能解析成功，所以返回原始内容
          return { success: true, data: result }
        }
      }

      console.log(`[LongWritingAI] generateCharacters 未找到 JSON 数组`)
      return { success: false, error: 'AI 返回格式错误' }
    } catch (error: any) {
      console.error(`[LongWritingAI] generateCharacters 错误:`, error)
      return { success: false, error: error.message }
    }
  }

  // ==================== 技能物品建议生成 ====================

  /**
   * 生成技能物品建议
   */
  async generateSkillsItems(
    window: BrowserWindow,
    eventId: string,
    projectId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getDatabaseManager()

    // 获取故事概要和角色
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    const characters = await dbManager.lwCharacters?.getByProjectId(projectId) || []

    const systemPrompt = `你是一位专业的小说创作顾问。请根据故事概要，生成建议的技能和物品。
你的回复应该是 JSON 对象格式，包含两个字段：
- skills: 技能数组，每个技能包含：name, type(martial/magic/ability/tech/other), level(beginner/intermediate/advanced/master), system, description
- items: 物品数组，每个物品包含：name, type(weapon/artifact/medicine/manual/token/other), level(common/rare/legendary/divine), description`

    const characterNames = characters.map(c => c.name).join('、')
    const prompt = `请根据以下故事概要，生成建议的技能体系和物品：

故事标题：${overview?.title || '未命名'}
故事类型：${overview?.genre || '未指定'}
故事摘要：${overview?.summary || '未指定'}
已有角色：${characterNames || '暂无'}

请直接返回 JSON 对象格式的结果，包含 skills 和 items 两个字段。`

    try {
      const result = await this.callAIStream(window, eventId, prompt, systemPrompt, undefined, providerConfigId, modelId)

      // 尝试解析 JSON
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])
        return { success: true, data }
      }

      return { success: false, error: 'AI 返回格式错误' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ==================== 大纲生成 ====================

  /**
   * 生成故事大纲 - 分步生成，降低JSON解析失败风险
   * 第一步：只生成卷结构
   */
  async generateOutlineStory(
    window: BrowserWindow,
    eventId: string,
    projectId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getDatabaseManager()

    // 获取故事概要、角色、背景
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    const characters = await dbManager.lwCharacters?.getByProjectId(projectId) || []
    const background = await dbManager.lwBackgrounds?.getByProjectId(projectId)

    const characterInfo = characters.slice(0, 5).map(c =>
      `${c.name}（${c.rolePosition === 'protagonist' ? '主角' : c.rolePosition === 'antagonist' ? '反派' : '配角'}）`
    ).join('、')

    // 第一步：生成卷结构（不含章节详情）
    const volumeSystemPrompt = `你是一位专业的小说创作顾问。请根据故事概要，生成卷级别的大纲结构。
你的回复必须是严格的 JSON 数组格式，只包含卷的信息，不要包含章节详情。
格式要求：
[
  {
    "name": "卷名",
    "summary": "卷概要（50-100字）",
    "estimatedWords": 预估字数（数字）
  }
]

注意：
1. 根据故事规模，生成1-3卷
2. 预估字数总计应该与故事概要中的目标字数相近
3. 只返回JSON数组，不要有任何其他文字`

    const volumePrompt = `故事标题：${overview?.title || '未命名'}
核心主题：${overview?.coreTheme || '未指定'}
故事摘要：${overview?.summary || '未指定'}
目标字数：${overview?.targetWords || 100000}字
主要角色：${characterInfo || '暂无'}
时代背景：${background?.eraDescription || '未指定'}

请生成卷级别的大纲结构（只返回JSON数组）：`

    try {
      const result = await this.callAIStream(window, eventId, prompt, systemPrompt, 8192, providerConfigId, modelId)

      const volumeResult = await this.callAIStream(window, eventId, volumePrompt, volumeSystemPrompt, 2048, providerConfigId, modelId)
      const volumes = this.parseJsonArray(volumeResult)

      if (!volumes || volumes.length === 0) {
        return { success: false, error: '生成卷结构失败' }
      }

      // 为每个卷生成章节
      const fullOutline = []
      for (let i = 0; i < volumes.length; i++) {
        const volume = volumes[i]
        window.webContents.send(`longwriting:generate:${eventId}`, {
          type: 'progress',
          content: `正在生成第 ${i + 1} 卷「${volume.name}」的章节...`
        })

        const chapters = await this.generateVolumeChapters(
          window, eventId, projectId, volume, overview, characterInfo, background, providerConfigId, modelId
        )

        fullOutline.push({
          ...volume,
          chapters: chapters || []
        })
      }

      return { success: true, data: fullOutline }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 为单个卷生成章节
   */
  private async generateVolumeChapters(
    window: BrowserWindow,
    eventId: string,
    projectId: string,
    volume: any,
    overview: any,
    characterInfo: string,
    background: any,
    providerConfigId?: string,
    modelId?: string
  ): Promise<any[]> {
    const chapterSystemPrompt = `你是一位专业的小说创作顾问。请为指定的卷生成章节大纲。
你的回复必须是严格的 JSON 数组格式。
格式要求：
[
  {
    "name": "章节名",
    "summary": "章节概要（30-50字）",
    "estimatedWords": 预估字数（数字）,
    "sections": [
      {
        "name": "小节名",
        "summary": "小节概要（20-30字）",
        "estimatedWords": 预估字数（数字）
      }
    ]
  }
]

注意：
1. 每卷生成3-10章
2. 每章2-5节
3. 只返回JSON数组，不要有任何其他文字`

    const chapterPrompt = `故事标题：${overview?.title || '未命名'}
卷名：${volume.name}
卷概要：${volume.summary}
卷预估字数：${volume.estimatedWords}字
主要角色：${characterInfo || '暂无'}

请为本卷生成章节大纲（只返回JSON数组）：`

    try {
      const subEventId = `${eventId}-chapters-${Date.now()}`
      const result = await this.callAIStream(window, subEventId, chapterPrompt, chapterSystemPrompt, 4096, providerConfigId, modelId)
      return this.parseJsonArray(result) || []
    } catch (error) {
      return []
    }
  }

  /**
   * 解析JSON数组，带容错处理
   */
  private parseJsonArray(content: string): any[] | null {
    try {
      // 提取JSON数组
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return null

      let jsonStr = jsonMatch[0]

      // 修复常见的JSON问题
      // 1. 移除注释
      jsonStr = jsonStr.replace(/\/\/.*$/gm, '')
      jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '')

      // 2. 移除末尾逗号
      jsonStr = jsonStr.replace(/,\s*]/g, ']')
      jsonStr = jsonStr.replace(/,\s*}/g, '}')

      // 3. 尝试找到完整的JSON
      let depth = 0
      let endIndex = 0
      for (let i = 0; i < jsonStr.length; i++) {
        if (jsonStr[i] === '[' || jsonStr[i] === '{') depth++
        if (jsonStr[i] === ']' || jsonStr[i] === '}') {
          depth--
          if (depth === 0) {
            endIndex = i + 1
            break
          }
        }
      }

      if (endIndex > 0) {
        jsonStr = jsonStr.substring(0, endIndex)
      }

      const parsed = JSON.parse(jsonStr)
      return Array.isArray(parsed) ? parsed : null
    } catch (error) {
      return null
    }
  }

  /**
   * 生成评论大纲
   */
  async generateOutlineComment(
    window: BrowserWindow,
    eventId: string,
    projectId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getDatabaseManager()

    // 获取故事概要和素材
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    const materials = await dbManager.lwMaterials?.getByProjectId(projectId) || []

    const systemPrompt = `你是一位专业的评论写作顾问。请根据主题和素材，生成一个评论文章大纲。
你的回复应该是 JSON 数组格式，表示段落列表，每个段落包含：
- name: 段落标题
- summary: 段落要点
- estimatedWords: 预估字数

注意：生成4-8个段落，包含引言、主体论证、结论等部分。段落间应该有逻辑递进关系。`

    const materialInfo = materials.slice(0, 5).map(m => m.name).join('、')

    const prompt = `请根据以下信息，生成评论大纲：

评论主题：${overview?.title || '未命名'}
核心观点：${overview?.coreTheme || '未指定'}
目标字数：${overview?.targetWords || 5000}字
已收集素材：${materialInfo || '暂无'}

请直接返回 JSON 数组格式的结果。`

    try {
      const result = await this.callAIStream(window, eventId, prompt, systemPrompt, undefined, providerConfigId, modelId)

      // 尝试解析 JSON 数组
      const jsonMatch = result.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])
        return { success: true, data }
      }

      return { success: false, error: 'AI 返回格式错误' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ==================== 章节内容生成 ====================

  /**
   * 生成章节内容
   */
  async generateChapter(
    window: BrowserWindow,
    eventId: string,
    projectId: string,
    outlineId: string,
    targetWords?: number,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getDatabaseManager()

    // 获取大纲节点
    const outline = await dbManager.lwOutlines?.getById(outlineId)
    if (!outline) {
      return { success: false, error: '大纲节点不存在' }
    }

    // 获取故事上下文
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    const characters = await dbManager.lwCharacters?.getByProjectId(projectId) || []
    const locations = await dbManager.lwLocations?.getByProjectId(projectId) || []

    // 获取前置章节内容（作为上下文）
    const siblings = await dbManager.lwOutlines?.getTreeByProjectId(projectId) || []
    const currentIndex = siblings.findIndex(s => s.id === outlineId)
    const previousOutlines = siblings.slice(0, currentIndex).slice(-3) // 最近3个

    const systemPrompt = `你是一位专业的网络小说作家。请根据大纲节点信息，撰写章节内容。
要求：
1. 内容要生动有趣，情节紧凑
2. 注意人物性格的一致性
3. 场景描写要具体
4. 对话要符合人物特点
5. 控制字数在目标范围内

直接输出章节内容，不需要标题、不需要额外说明。`

    const characterInfo = outline.involvedCharacters.map(id => {
      const char = characters.find(c => c.id === id)
      return char ? `${char.name}：${char.personality || '性格未设定'}` : ''
    }).filter(Boolean).join('\n')

    const locationInfo = outline.involvedLocations.map(id => {
      const loc = locations.find(l => l.id === id)
      return loc ? `${loc.name}：${loc.description || ''}` : ''
    }).filter(Boolean).join('\n')

    const previousContext = previousOutlines.map(o => `【${o.name}】${o.summary}`).join('\n')

    const prompt = `请根据以下信息，撰写章节内容：

故事标题：${overview?.title || '未命名'}
章节名称：${outline.name}
章节概要：${outline.summary}
目标字数：${targetWords || outline.estimatedWords || 3000}字

涉及角色：
${characterInfo || '无特定角色'}

涉及地点：
${locationInfo || '无特定地点'}

前情提要：
${previousContext || '这是开篇'}

请开始撰写章节内容：`

    try {
      const result = await this.callAIStream(
        window,
        eventId,
        prompt,
        systemPrompt,
        Math.min((targetWords || outline.estimatedWords || 3000) * 2, 8192),
        providerConfigId,
        modelId
      )

      return { success: true, data: { content: result } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 生成评论段落内容
   */
  async generateSection(
    window: BrowserWindow,
    eventId: string,
    projectId: string,
    outlineId: string,
    targetWords?: number,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getDatabaseManager()

    // 获取大纲节点
    const outline = await dbManager.lwOutlines?.getById(outlineId)
    if (!outline) {
      return { success: false, error: '大纲节点不存在' }
    }

    // 获取主题和素材
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    const materials = await dbManager.lwMaterials?.getByProjectId(projectId) || []

    const systemPrompt = `你是一位专业的评论文章作者。请根据大纲节点信息，撰写段落内容。
要求：
1. 观点明确，论证有力
2. 引用素材时要自然融入
3. 语言要专业但不晦涩
4. 控制字数在目标范围内

直接输出段落内容，不需要标题、不需要额外说明。`

    const relevantMaterials = materials.filter(m =>
      outline.involvedCharacters?.includes(m.id) || materials.indexOf(m) < 3
    ).slice(0, 3)

    const materialContext = relevantMaterials.map(m =>
      `【${m.name}】\n${m.content?.slice(0, 500) || '内容未加载'}`
    ).join('\n\n')

    const prompt = `请根据以下信息，撰写评论段落：

文章主题：${overview?.title || '未命名'}
核心观点：${overview?.coreTheme || '未指定'}
段落标题：${outline.name}
段落要点：${outline.summary}
目标字数：${targetWords || outline.estimatedWords || 500}字

可用素材：
${materialContext || '无特定素材'}

请开始撰写段落内容：`

    try {
      const result = await this.callAIStream(
        window,
        eventId,
        prompt,
        systemPrompt,
        Math.min((targetWords || outline.estimatedWords || 500) * 2, 4096),
        providerConfigId,
        modelId
      )

      return { success: true, data: { content: result } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ==================== 情节生成 ====================

  /**
   * 生成故事情节
   */
  async generatePlots(
    window: BrowserWindow,
    eventId: string,
    projectId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getDatabaseManager()

    // 获取故事概要
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    if (!overview) {
      return { success: false, error: '请先创建故事概要' }
    }

    // 获取角色列表
    const characters = await dbManager.lwCharacters?.getByProjectId(projectId) || []

    // 获取背景设定
    const background = await dbManager.lwBackgrounds?.getByProjectId(projectId)

    // 获取地点列表
    const locations = await dbManager.lwLocations?.getByProjectId(projectId) || []

    // 获取技能物品
    const skills = await dbManager.lwSkills?.getByProjectId(projectId) || []
    const items = await dbManager.lwItems?.getByProjectId(projectId) || []

    const systemPrompt = `你是一位专业的小说创作顾问。请根据故事概要、背景设定、角色等信息，生成主要的故事情节列表。
你的回复必须是纯 JSON 数组格式（不要包含 \`\`\`json 标记），每个情节包含以下字段：
- title: 情节标题（不超过 15 字）
- summary: 情节概要（50-100 字）
- involvedCharacters: 涉及的角色名称列表（字符串数组）

要求：
1. 情节按时间顺序排列，有起承转合
2. 情节之间要有逻辑关联，考虑背景设定的世界观
3. 情节数量根据预估章节数合理设置（约 10-30 个）
4. 每个情节要明确涉及的角色
5. 充分利用背景设定中的时代、社会结构等元素
6. 可以融入技能、物品等元素增加故事丰富度

请直接输出 JSON 数组，不要有任何额外文字。`

    // 构建角色信息
    const characterInfo = characters.map(c => {
      let info = `${c.name}`
      if (c.role) info += `（${c.role}）`
      if (c.personality) info += `，性格：${c.personality}`
      return info
    }).join('\n')

    // 构建背景信息
    let backgroundInfo = ''
    if (background) {
      if (background.eraDescription) backgroundInfo += `时代：${background.eraDescription}\n`
      if (background.socialStructure) backgroundInfo += `社会结构：${background.socialStructure}\n`
      if (background.techLevel) backgroundInfo += `技术水平：${background.techLevel}\n`
    }

    // 构建地点信息
    const locationInfo = locations.map(l => l.name).join('、')

    // 构建技能物品信息
    const skillInfo = skills.map(s => s.name).join('、')
    const itemInfo = items.map(i => `${i.name}${i.ownerId ? `（持有者：${characters.find(c => c.id === i.ownerId)?.name || '未知'}）` : ''}`).join('、')

    const prompt = `请根据以下故事信息生成主要情节：

【故事标题】${overview.title || '未命名'}
【故事类型】${overview.storyType || '未指定'}
【故事摘要】${overview.summary || '未指定'}
【核心冲突】${overview.coreConflict || '未指定'}
【预估章节】${overview.estimatedChapters || 20} 章

【主要角色】
${characterInfo || '暂无'}

【背景设定】
${backgroundInfo || '暂无'}

【主要地点】${locationInfo || '暂无'}

【技能体系】${skillInfo || '暂无'}

【重要物品】${itemInfo || '暂无'}

请生成 10-30 个主要情节，按时间顺序排列。充分考虑角色性格、背景设定、地点等元素。直接返回 JSON 数组格式的结果。`

    try {
      const result = await this.callAIStream(window, eventId, prompt, systemPrompt, 8192, providerConfigId, modelId)

      // 尝试解析 JSON 数组
      const jsonMatch = result.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])
        return { success: true, data }
      }

      return { success: false, error: 'AI 返回格式错误' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ==================== 背景润色 ====================

  /**
   * 润色背景设定
   */
  async polishBackground(
    window: BrowserWindow,
    eventId: string,
    projectId: string,
    field: 'eraDescription' | 'socialStructure' | 'techLevel',
    eraType: string,
    content: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const fieldLabels: Record<string, string> = {
      eraDescription: '时代描述',
      socialStructure: '社会结构',
      techLevel: '技术水平'
    }

    const systemPrompt = `你是一位专业的小说创作顾问，擅长丰富和润色故事背景设定。
请根据用户提供的简要描述，扩展成更加详细、生动的背景设定。

要求：
1. 保持原文核心意图，不要偏离主题
2. 增加细节和氛围感，让设定更加具体
3. 内容控制在 200-400 字
4. 语言要有画面感，适合小说创作使用

直接输出润色后的内容，不需要标题、不需要额外说明。`

    const eraTypeLabels: Record<string, string> = {
      ancient: '古代',
      modern: '现代',
      future: '未来',
      fictional: '架空'
    }

    const prompt = `请润色以下${fieldLabels[field] || '背景设定'}：

【时代类型】${eraTypeLabels[eraType] || eraType}
【原始描述】${content}

请扩展成详细的描述，内容控制在 200-400 字。`

    try {
      const result = await this.callAIStream(window, eventId, prompt, systemPrompt, 1024, providerConfigId, modelId)

      return { success: true, data: { content: result } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }
}

/**
 * 获取长文写作 AI 服务实例
 */
export const getLongWritingAIService = (): LongWritingAIService =>
  LongWritingAIService.getInstance()