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

    const systemPrompt = `你是一位专业的小说创作顾问。请根据用户的想法，生成一个完整的故事概要。

你必须返回一个完整的 JSON 对象，包含以下所有字段（一个都不能少）：
- title: 故事标题
- storyType: 故事类型（wuxia/xianxia/xuanhuan/kehuan/xuanyi/dushi/yanqing/lishi/other）
- summary: 故事摘要（500字左右）
- coreConflict: 核心冲突（300字左右）
- keyCharacters: 关键角色数组（必须包含主角、重要配角、反派等关键人物，不能为空数组！）
- keyLocations: 主要场景数组（必须包含故事发生的主要地点，不能为空数组！）
- estimatedChapters: 预估章节数

**关于角色生成**：
- 仔细阅读故事内容，识别所有重要人物
- 必须包含：主角、重要配角、反派/对立角色
- 反派/对立角色是推动剧情的关键，必须包含在角色列表中
- 角色数量根据故事需要确定，确保覆盖故事的主要人物

每个角色必须包含：name(姓名), role(主角/配角/反派/中立), brief(150字内描述), importance(main/secondary/minor)
每个场景必须包含：name(名称), type(类型), brief(150字内描述), importance(main/secondary/minor)

**JSON 格式示例**：
{
  "title": "暗线追凶",
  "storyType": "other",
  "summary": "故事摘要内容...",
  "coreConflict": "核心冲突内容...",
  "keyCharacters": [
    {"name": "林锋", "role": "主角", "brief": "前警员，因坚持调查真相被迫离职，六年后重启调查", "importance": "main"},
    {"name": "陈雪", "role": "配角", "brief": "警局法医，暗中协助林锋，提供关键证据分析", "importance": "secondary"},
    {"name": "老局长", "role": "反派", "brief": "警局高层，暗中操控案件，是六年前的真凶", "importance": "main"}
  ],
  "keyLocations": [
    {"name": "0714案发现场", "type": "城市", "brief": "六年前的凶杀案发生地，遗留关键线索", "importance": "main"},
    {"name": "警局档案室", "type": "建筑", "brief": "存放旧案卷宗，林锋在此发现矛盾细节", "importance": "secondary"}
  ],
  "estimatedChapters": 24
}

请直接输出 JSON，不要有任何其他文字。`

    const prompt = `请根据以下想法，生成一个故事概要：

${input}

请严格按照 JSON 格式模板返回，确保所有字段都填写完整。`

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

      // 打印AI返回的原始内容
      console.log('[LongWritingAIService] AI返回原始内容长度:', result.length)
      console.log('[LongWritingAIService] AI返回原始内容:', result)

      // 尝试解析 JSON
      try {
        // 先清理可能的多余内容
        let jsonStr = result.trim()

        // 移除可能的 markdown 代码块标记
        if (jsonStr.includes('```json')) {
          jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '')
        } else if (jsonStr.includes('```')) {
          jsonStr = jsonStr.replace(/```\s*/g, '')
        }

        // 找到第一个 { 和最后一个 } 的位置
        const firstBrace = jsonStr.indexOf('{')
        const lastBrace = jsonStr.lastIndexOf('}')

        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          const jsonContent = jsonStr.substring(firstBrace, lastBrace + 1)
          console.log('[LongWritingAIService] 提取的JSON内容:', jsonContent)
          const data = JSON.parse(jsonContent)
          console.log('[LongWritingAIService] 解析后的数据:', JSON.stringify(data, null, 2))
          console.log('[LongWritingAIService] keyCharacters:', data.keyCharacters)
          console.log('[LongWritingAIService] keyLocations:', data.keyLocations)
          return { success: true, data }
        }

        // 如果找不到完整JSON，尝试正则匹配
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0])
          return { success: true, data }
        }

        // 如果无法解析为 JSON，返回原始文本
        return { success: true, data: { summary: result } }
      } catch (parseError: any) {
        console.error('[LongWritingAIService] JSON 解析失败:', parseError.message)
        // 解析失败，返回原始内容
        return { success: true, data: { summary: result, parseError: parseError.message } }
      }
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

你必须返回 JSON 数组格式，每个角色必须严格按照以下顺序包含所有字段，不得遗漏任何字段：
1. name - 角色名称
2. gender - 性别（male/female/other）
3. age - 年龄
4. height - 身高(cm)
5. weight - 体重(kg)
6. race - 人种（asian/european/other）
7. occupation - 职业
8. position - 职务
9. rolePosition - 角色定位（protagonist/supporting/antagonist/minor）
10. appearance - 外貌描述（必须包含脸型、肤色描述）
11. background - 背景故事
12. personality - 性格特点
13. abilities - 能力特长
14. majorEvents - 角色在故事中的主要事件（这是必需字段，描述该角色参与的关键剧情）

示例返回格式：
[{"name":"张三","gender":"male","age":28,"height":175,"weight":70,"race":"asian","occupation":"剑客","position":"掌门弟子","rolePosition":"protagonist","appearance":"瓜子脸，小麦色皮肤，剑眉星目","background":"出身寒门，自幼被掌门收养","personality":"沉稳内敛，重情重义","abilities":"剑法高超，轻功卓越","majorEvents":"在门派大比中击败宿敌，揭开身世之谜"}]

请确保每个角色都包含全部14个字段，尤其是majorEvents字段不能遗漏。`

    // 构建提示词上下文
    const storyTypeNames: Record<string, string> = {
      wuxia: '武侠', xianxia: '仙侠', xuanhuan: '玄幻', kehuan: '科幻',
      xuanyi: '悬疑', dushi: '都市', yanqing: '言情', lishi: '历史', other: '其他'
    }
    const storyTypeName = storyTypeNames[overview.storyType] || overview.storyType || '未指定'

    // 构建关键角色信息
    let keyCharactersInfo = ''
    if (overview.keyCharacters && overview.keyCharacters.length > 0) {
      keyCharactersInfo = overview.keyCharacters.map(c =>
        `${c.name}（${c.role}，${c.brief}）`
      ).join('、')
    }

    // 构建主要场景信息
    let keyLocationsInfo = ''
    if (overview.keyLocations && overview.keyLocations.length > 0) {
      keyLocationsInfo = overview.keyLocations.map(l =>
        `${l.name}（${l.brief}）`
      ).join('、')
    }

    const prompt = `请根据以下故事概要，生成建议的角色：

故事标题：${overview.title || '未命名'}
故事类型：${storyTypeName}
核心构思：${overview.coreIdea || '未指定'}
故事摘要：${overview.summary || '未指定'}
核心冲突：${overview.coreConflict || '未指定'}
${keyCharactersInfo ? `关键角色：${keyCharactersInfo}` : ''}
${keyLocationsInfo ? `主要场景：${keyLocationsInfo}` : ''}

请返回 JSON 数组，确保每个角色都包含所有必需字段。`

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

  /**
   * 生成技能和物品类型配置
   */
  async generateSkillItemTypes(
    window: BrowserWindow,
    eventId: string,
    projectId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getDatabaseManager()

    // 获取故事概要
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    const storyType = overview?.storyType || 'other'

    const systemPrompt = `你是一位专业的小说世界观设计师。请根据故事类型，生成适合的技能类型和物品类型配置。
你的回复必须是 JSON 对象格式，包含两个字段：
- skillTypes: 技能类型数组，每个类型包含 code（英文编码）和 name（中文名称）
- itemTypes: 物品类型数组，每个类型包含 code（英文编码）和 name（中文名称）

示例：
{
  "skillTypes": [
    {"code": "martial", "name": "武功"},
    {"code": "magic", "name": "法术"}
  ],
  "itemTypes": [
    {"code": "weapon", "name": "武器"},
    {"code": "artifact", "name": "神器"}
  ]
}

注意：code 使用英文小写，name 使用中文。每种类型生成3-6个即可。`

    const prompt = `故事标题：${overview?.title || '未命名'}
故事类型：${storyType}
故事摘要：${overview?.summary || '未指定'}

请根据故事类型和内容，生成适合的技能类型和物品类型配置。`

    try {
      const result = await this.callAIStream(window, eventId, prompt, systemPrompt, undefined, providerConfigId, modelId)

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

  /**
   * 只生成技能建议
   */
  async generateSkillsOnly(
    window: BrowserWindow,
    eventId: string,
    projectId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getDatabaseManager()

    // 获取故事概要、角色和已配置的技能类型
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    const characters = await dbManager.lwCharacters?.getByProjectId(projectId) || []
    const skillTypes = dbManager.lwTypeConfig?.getSkillTypeConfigs(projectId) || []
    const skillLevelsMap: Record<string, any[]> = {}

    for (const type of skillTypes) {
      const levels = dbManager.lwTypeConfig?.getSkillLevels(projectId, type.code) || []
      skillLevelsMap[type.code] = levels
    }

    const skillTypesInfo = skillTypes.map(t => {
      const levels = skillLevelsMap[t.code] || []
      return `${t.name}(${t.code}): 等级包括 ${levels.map(l => l.name).join('、') || '未配置'}`
    }).join('\n')

    const systemPrompt = `你是一位专业的小说创作顾问。请根据故事概要和现有配置，生成具体的技能设定。
你的回复必须是 JSON 对象格式，包含一个 skills 字段：
{
  "skills": [
    {
      "name": "技能名称",
      "type": "类型编码（使用已有类型）",
      "level": "等级编码（使用已有等级）",
      "system": "所属体系/门派",
      "description": "技能描述"
    }
  ]
}

注意：
1. type 和 level 必须使用已有配置中的编码
2. 生成5-10个技能即可
3. 每个技能要有独特的名称和描述`

    const characterNames = characters.map(c => c.name).join('、')
    const prompt = `故事标题：${overview?.title || '未命名'}
故事摘要：${overview?.summary || '未指定'}
已有角色：${characterNames || '暂无'}

已配置的技能类型：
${skillTypesInfo || '暂无配置'}

请生成适合的技能设定（只返回JSON）：`

    try {
      const result = await this.callAIStream(window, eventId, prompt, systemPrompt, undefined, providerConfigId, modelId)

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

  /**
   * 只生成物品建议
   */
  async generateItemsOnly(
    window: BrowserWindow,
    eventId: string,
    projectId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getDatabaseManager()

    // 获取故事概要、角色和已配置的物品类型
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    const characters = await dbManager.lwCharacters?.getByProjectId(projectId) || []
    const itemTypes = dbManager.lwTypeConfig?.getItemTypeConfigs(projectId) || []
    const itemLevelsMap: Record<string, any[]> = {}

    for (const type of itemTypes) {
      const levels = dbManager.lwTypeConfig?.getItemLevels(projectId, type.code) || []
      itemLevelsMap[type.code] = levels
    }

    const itemTypesInfo = itemTypes.map(t => {
      const levels = itemLevelsMap[t.code] || []
      return `${t.name}(${t.code}): 等级包括 ${levels.map(l => l.name).join('、') || '未配置'}`
    }).join('\n')

    const systemPrompt = `你是一位专业的小说创作顾问。请根据故事概要和现有配置，生成具体的物品设定。
你的回复必须是 JSON 对象格式，包含一个 items 字段：
{
  "items": [
    {
      "name": "物品名称",
      "type": "类型编码（使用已有类型）",
      "level": "等级编码（使用已有等级）",
      "description": "物品描述"
    }
  ]
}

注意：
1. type 和 level 必须使用已有配置中的编码
2. 生成5-10个物品即可
3. 每个物品要有独特的名称和描述`

    const characterNames = characters.map(c => c.name).join('、')
    const prompt = `故事标题：${overview?.title || '未命名'}
故事摘要：${overview?.summary || '未指定'}
已有角色：${characterNames || '暂无'}

已配置的物品类型：
${itemTypesInfo || '暂无配置'}

请生成适合的物品设定（只返回JSON）：`

    try {
      const result = await this.callAIStream(window, eventId, prompt, systemPrompt, undefined, providerConfigId, modelId)

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
   * 生成章节预写（人物、时间、地点、事件概要）
   */
  async generateChapterPrewrite(
    window: BrowserWindow,
    eventId: string,
    projectId: string,
    outlineId: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getDatabaseManager()

    // 获取相关数据
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    const background = await dbManager.lwBackgrounds?.getByProjectId(projectId)
    const outline = await dbManager.lwOutlines?.getById(outlineId)
    const characters = await dbManager.lwCharacters?.getByProjectId(projectId) || []
    const locations = await dbManager.lwLocations?.getByProjectId(projectId) || []
    const plots = await dbManager.lwPlots?.getByProjectId(projectId) || []

    if (!outline) {
      return { success: false, error: '大纲节点不存在' }
    }

    // 获取相关角色和地点信息
    const involvedCharacters = (outline.involvedCharacters || [])
      .map(id => characters.find(c => c.id === id))
      .filter(Boolean)

    const involvedLocations = (outline.involvedLocations || [])
      .map(id => locations.find(l => l.id === id))
      .filter(Boolean)

    // 查找相关情节
    const relevantPlots = plots.filter(p =>
      p.title?.includes(outline.name) ||
      outline.summary?.includes(p.title)
    )

    const systemPrompt = `你是一位专业的小说创作顾问。请根据章节大纲信息，生成章节预写提纲。

预写提纲需要包含：
1. 【时间】章节发生的时间背景
2. 【地点】场景设置和地点描述
3. 【人物】参与的角色及其状态
4. 【事件】将要发生的核心事件
5. 【冲突】可能的矛盾或冲突点
6. 【情感】情感基调和氛围

请用清晰的条目格式输出，不要输出 JSON，直接输出预写内容。`

    const characterInfo = involvedCharacters.map(c =>
      `${c!.name}（${c!.rolePosition === 'protagonist' ? '主角' : c!.rolePosition === 'antagonist' ? '反派' : '配角'}，${c!.personality || '性格待定'}）`
    ).join('、')

    const locationInfo = involvedLocations.map(l =>
      `${l!.name}（${l!.type}，${l!.description || '待描述'}）`
    ).join('、')

    const plotInfo = relevantPlots.map(p => `${p.title}: ${p.summary}`).join('\n')

    const prompt = `故事标题：${overview?.title || '未命名'}
故事摘要：${overview?.summary || '未指定'}
时代背景：${background?.eraDescription || '未指定'}

章节名称：${outline.name}
章节概要：${outline.summary || '未指定'}
预估字数：${outline.estimatedWords || 3000}字

涉及角色：${characterInfo || '暂无指定'}
涉及地点：${locationInfo || '暂无指定'}
相关情节：
${plotInfo || '暂无相关情节'}

请为这个章节生成预写提纲：`

    try {
      const result = await this.callAIStream(window, eventId, prompt, systemPrompt, undefined, providerConfigId, modelId)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

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

    // 计算章节序号（用于获取相关记忆）
    const chapterNumber = this.calculateChapterNumber(siblings, outlineId)

    // 获取记忆上下文
    const memoryContext = await this.getMemoryContext(projectId, chapterNumber)

    // 获取实体状态上下文
    const involvedEntities: Array<{ type: string; id: string }> = []

    // 添加涉及的角色
    for (const charId of outline.involvedCharacters || []) {
      involvedEntities.push({ type: 'character', id: charId })
    }

    // 添加涉及的地点
    for (const locId of outline.involvedLocations || []) {
      involvedEntities.push({ type: 'location', id: locId })
    }

    const entityStateContext = await this.getEntityStateContext(projectId, chapterNumber, involvedEntities)

    // 获取预写内容（如果存在）
    const prewrite = await dbManager.lwPrewrites?.getByOutlineId(outlineId)
    const prewriteSection = prewrite?.content ? `\n\n【预写提纲】\n${prewrite.content}\n` : ''

    const systemPrompt = `你是一位专业的网络小说作家。请根据大纲节点信息，撰写章节内容。
要求：
1. 内容要生动有趣，情节紧凑
2. 注意人物性格的一致性
3. 场景描写要具体
4. 对话要符合人物特点
5. 控制字数在目标范围内
${prewrite?.content ? '6. 参考预写提纲，但可以灵活发挥\n' : ''}直接输出章节内容，不需要标题、不需要额外说明。`

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
${previousContext || '这是开篇'}${prewriteSection}${memoryContext}${entityStateContext}

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
   * 计算章节序号
   */
  private calculateChapterNumber(outlines: any[], targetId: string): number {
    let count = 0
    for (const outline of outlines) {
      if (outline.nodeType === 'chapter') {
        count++
      }
      if (outline.id === targetId) {
        return count
      }
    }
    return count || 1
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
    field: 'eraDescription' | 'socialStructure' | 'techLevel' | 'specialRules' | 'factionDistribution' | 'geographicOrientation',
    eraType: string,
    content: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getDatabaseManager()

    // 获取故事概要作为上下文
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)

    const fieldLabels: Record<string, string> = {
      eraDescription: '时代描述',
      socialStructure: '社会结构',
      techLevel: '技术水平',
      specialRules: '特殊规则',
      factionDistribution: '势力分布',
      geographicOrientation: '地理方位'
    }

    // 不同字段的润色提示
    const fieldPrompts: Record<string, string> = {
      eraDescription: '请扩展成详细的时代背景描述，内容控制在 200-400 字。',
      socialStructure: '请扩展成详细的社会结构描述，包括阶层划分、社会制度、权力结构等，内容控制在 200-400 字。',
      techLevel: '请扩展成详细的技术水平描述，包括主要技术特点、科技发展程度、对生活的影响等，内容控制在 200-400 字。',
      specialRules: '请扩展成详细的世界规则描述，包括具体的等级划分、能力体系、限制条件、特殊法则等，内容控制在 300-500 字。',
      factionDistribution: '请扩展成详细的势力分布描述，包括各势力的地理位置、势力范围、相互关系、主要冲突等，内容控制在 300-500 字。',
      geographicOrientation: '请扩展成详细的地理方位描述，包括各区域的气候特点、地形地貌、标志性地理特征等，内容控制在 300-500 字。'
    }

    const systemPrompt = `你是一位专业的小说创作顾问，擅长丰富和润色故事背景设定。
请根据用户提供的故事概要和简要描述，扩展成更加详细、生动的背景设定。

要求：
1. 背景设定必须与故事概要紧密相关，为故事服务
2. 保持原文核心意图，不要偏离主题
3. 增加细节和氛围感，让设定更加具体
4. 语言要有画面感，适合小说创作使用
5. 根据不同字段的特点进行针对性扩展

直接输出润色后的内容，不需要标题、不需要额外说明。`

    const eraTypeLabels: Record<string, string> = {
      ancient: '古代',
      modern: '现代',
      future: '未来',
      fictional: '架空'
    }

    // 构建故事概要上下文
    const overviewContext = overview ? `
【故事标题】${overview.title || '未命名'}
【故事类型】${overview.storyType || '未指定'}
【故事摘要】${overview.summary || '未指定'}
【核心冲突】${overview.coreConflict || '未指定'}
${overview.keyCharacters?.length ? `【关键角色】${overview.keyCharacters.map((c: any) => c.name).join('、')}` : ''}
${overview.keyLocations?.length ? `【主要场景】${overview.keyLocations.map((l: any) => l.name).join('、')}` : ''}
` : ''

    const prompt = `请根据以下故事信息，润色${fieldLabels[field] || '背景设定'}：

${overviewContext}
【时代类型】${eraTypeLabels[eraType] || eraType}
【原始描述】${content}

${fieldPrompts[field] || '请扩展成详细的描述，内容控制在 200-400 字。'}

注意：背景设定要与故事内容相呼应，为故事发展提供支撑。`

    try {
      const result = await this.callAIStream(window, eventId, prompt, systemPrompt, 1024, providerConfigId, modelId)

      return { success: true, data: { content: result } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ==================== 地点生成 ====================

  /**
   * AI 生成地点建议
   */
  async generateLocations(
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

    // 获取背景设定
    const background = await dbManager.lwBackgrounds?.getByProjectId(projectId)

    // 获取已有地图
    const maps = await dbManager.lwMaps?.getByProjectId(projectId) || []

    // 获取已有地点
    const existingLocations = await dbManager.lwLocations?.getByProjectId(projectId) || []

    const systemPrompt = `你是一位专业的小说世界观设计师，擅长设计丰富多彩的地点设定。
请根据用户提供的信息，生成适合故事背景的地点建议。

**重要**：请控制回复长度，总字数不超过1500字。

你的回复必须是纯 JSON 数组格式（不要包含 \`\`\`json 标记），每个地点包含以下字段：
{
  "name": "地点名称",
  "type": "地点类型，可选值：city/village/mountain/palace/forest/sea/building/other",
  "importance": "重要程度，可选值：main/important/auxiliary",
  "description": "地点描述（50-100字，说明地点的特点、氛围、在故事中的作用）",
  "suggestedMapId": "建议关联的地图ID（从已有地图中选择，如果没有合适的可不填）"
}

地点类型说明：
- city: 城市
- village: 村庄
- mountain: 山脉
- palace: 宫殿
- forest: 森林
- sea: 海域
- building: 建筑
- other: 其他

重要程度说明：
- main: 主要地点（故事核心场景，多次出现）
- important: 重要地点（关键情节发生地）
- auxiliary: 辅助地点（背景或过场场景）

生成原则：
1. 根据地理方位描述生成符合世界观的地点
2. 地点应该有明确的功能和故事意义
3. 不要重复已有地点
4. 建议生成 3-6 个地点
5. 如果有地图，尽量为地点匹配合适的地图

请直接输出 JSON 数组，不要有任何额外文字。`

    // 构建地图信息
    const mapInfo = maps.map(m => `${m.name}(${m.id})-${m.orientation || '方位未指定'}`).join('、')

    // 构建已有地点信息
    const existingLocationInfo = existingLocations.map(l => `${l.name}(${l.type})`).join('、')

    // 构建背景信息
    let backgroundInfo = ''
    if (background) {
      if (background.eraDescription) backgroundInfo += `时代描述：${background.eraDescription}\n`
      if (background.geographicOrientation) backgroundInfo += `地理方位：${background.geographicOrientation}\n`
      if (background.factionDistribution) backgroundInfo += `势力分布：${background.factionDistribution}\n`
    }

    const prompt = `请根据以下信息生成地点建议：

【故事标题】${overview.title || '未命名'}
【故事类型】${overview.storyType || '未指定'}
【故事摘要】${overview.summary || '未指定'}

【背景设定】
${backgroundInfo || '暂无'}

【已有地图】${mapInfo || '暂无'}

【已有地点】${existingLocationInfo || '暂无'}

请生成适合这个故事的地点建议。如果有地图，请为每个地点建议合适的地图关联。直接返回 JSON 数组格式的结果。`

    try {
      const result = await this.callAIStream(window, eventId, prompt, systemPrompt, 2048, providerConfigId, modelId)

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

  // ==================== 势力生成 ====================

  /**
   * AI 生成势力建议
   */
  async generateFactions(
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

    // 获取背景设定
    const background = await dbManager.lwBackgrounds?.getByProjectId(projectId)

    // 获取已有地点
    const locations = await dbManager.lwLocations?.getByProjectId(projectId) || []

    // 获取已有势力
    const existingFactions = await dbManager.lwFactions?.getByProjectId(projectId) || []

    const systemPrompt = `你是一位专业的小说世界观设计师，擅长设计丰富多彩的势力设定。
请根据用户提供的信息，生成适合故事背景的势力建议。

**重要**：请控制回复长度，总字数不超过1500字。

你的回复必须是纯 JSON 数组格式（不要包含 \`\`\`json 标记），每个势力包含以下字段：
{
  "factionType": "势力类型，可选值：country/camp/sect",
  "name": "势力名称",
  "suggestedLocationName": "建议关联的地点名称（从已有地点中选择，如果没有合适的可不填）",
  "description": "势力描述（50-100字，说明势力的特点、主要成员、在故事中的作用）"
}

势力类型说明：
- country: 国别（国家、王国、帝国等）
- camp: 阵营（正派、反派、中立阵营等）
- sect: 门派（宗门、教派、帮派等）

生成原则：
1. 根据势力分布描述生成符合世界观的势力
2. 势力应该有明确的定位和故事意义
3. 不要重复已有势力
4. 势力名称要与故事类型匹配
5. 建议生成 3-6 个势力
6. 如果有地点，尽量为势力建议合适的所在地

请直接输出 JSON 数组，不要有任何额外文字。`

    // 构建地点信息
    const locationInfo = locations.map(l => `${l.name}(${l.id})`).join('、')

    // 构建已有势力信息
    const existingFactionInfo = existingFactions.map(f => `${f.name}(${f.factionType === 'country' ? '国别' : f.factionType === 'camp' ? '阵营' : '门派'})`).join('、')

    // 构建背景信息
    let backgroundInfo = ''
    if (background) {
      if (background.eraDescription) backgroundInfo += `时代描述：${background.eraDescription}\n`
      if (background.factionDistribution) backgroundInfo += `势力分布：${background.factionDistribution}\n`
      if (background.specialRules) backgroundInfo += `特殊规则：${background.specialRules}\n`
    }

    const prompt = `请根据以下信息生成势力建议：

【故事标题】${overview.title || '未命名'}
【故事类型】${overview.storyType || '未指定'}
【故事摘要】${overview.summary || '未指定'}

【背景设定】
${backgroundInfo || '暂无'}

【已有地点】${locationInfo || '暂无'}

【已有势力】${existingFactionInfo || '暂无'}

请生成适合这个故事的势力建议。如果有地点，请为每个势力建议合适的所在地。直接返回 JSON 数组格式的结果。`

    try {
      const result = await this.callAIStream(window, eventId, prompt, systemPrompt, 2048, providerConfigId, modelId)

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

  // ==================== 地图数据生成 ====================

  /**
   * 生成地图数据
   */
  async generateMapData(
    window: BrowserWindow,
    eventId: string,
    projectId: string,
    mapId: string,
    userPrompt: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getDatabaseManager()

    // 获取故事概要
    const overview = await dbManager.lwStoryOverviews?.getByProjectId(projectId)
    if (!overview) {
      return { success: false, error: '请先创建故事概要' }
    }

    // 获取背景设定
    const background = await dbManager.lwBackgrounds?.getByProjectId(projectId)

    // 获取已有地点
    const locations = await dbManager.lwLocations?.getByProjectId(projectId) || []

    // 获取已有势力
    const factions = await dbManager.lwFactions?.getByProjectId(projectId) || []

    // 获取地图信息
    const map = mapId ? await dbManager.lwMaps?.getById(mapId) : null

    const systemPrompt = `你是一位专业的小说世界观设计师，擅长设计丰富多彩的地图设定。
请根据用户提供的信息，生成详细的地图数据。

**重要**：请控制回复长度，总字数不超过1000字。

你的回复必须是纯 JSON 格式（不要包含 \`\`\`json 标记），包含以下字段：
{
  "regions": [
    {
      "name": "区域名称",
      "description": "区域描述（50-100字）",
      "features": ["特征1", "特征2"]
    }
  ],
  "landmarks": [
    {
      "name": "地标名称",
      "type": "地标类型（如城市、山脉、河流等）",
      "description": "地标描述（30-50字）"
    }
  ],
  "terrain": [
    {
      "type": "地形类型",
      "description": "地形描述",
      "area": "分布区域"
    }
  ],
  "climate": "气候特征描述",
  "resources": ["资源1", "资源2", "资源3"],
  "conflicts": [
    {
      "type": "冲突类型",
      "description": "冲突描述",
      "parties": ["冲突方1", "冲突方2"]
    }
  ]
}

请直接输出 JSON 对象，不要有任何额外文字。`

    // 构建地点信息
    const locationInfo = locations.map(l => `${l.name}（${l.type}）`).join('、')

    // 构建势力信息
    const factionInfo = factions.map(f => `${f.name}（${f.factionType === 'country' ? '国别' : f.factionType === 'camp' ? '阵营' : '门派'}）`).join('、')

    // 构建背景信息
    let backgroundInfo = ''
    if (background) {
      if (background.eraDescription) backgroundInfo += `时代：${background.eraDescription}\n`
      if (background.socialStructure) backgroundInfo += `社会结构：${background.socialStructure}\n`
      if (background.techLevel) backgroundInfo += `技术水平：${background.techLevel}\n`
    }

    const prompt = `请根据以下信息生成地图数据：

【故事标题】${overview.title || '未命名'}
【故事类型】${overview.storyType || '未指定'}
【故事摘要】${overview.summary || '未指定'}

【背景设定】
${backgroundInfo || '暂无'}

【已有地点】${locationInfo || '暂无'}

【已有势力】${factionInfo || '暂无'}

${map ? `【地图名称】${map.name}
【地图方位】${map.orientation || '未指定'}
【地图特点】${map.characteristics || '未指定'}` : ''}

【用户需求】
${userPrompt || '请根据故事背景生成合适的地图数据'}

请生成详细的地图数据，包含区域、地标、地形、气候、资源和冲突信息。直接返回 JSON 格式的结果。`

    try {
      const result = await this.callAIStream(window, eventId, prompt, systemPrompt, 2048, providerConfigId, modelId)

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

  // ==================== 记忆提取 ====================

  /**
   * 从预写内容中提取记忆
   */
  async extractMemories(
    window: BrowserWindow,
    eventId: string,
    projectId: string,
    outlineId: string,
    prewriteContent: string,
    chapterNumber: number,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getDatabaseManager()

    // 获取项目中的角色、地点、物品、势力等信息，用于实体匹配
    const characters = await dbManager.lwCharacters?.getByProjectId(projectId) || []
    const locations = await dbManager.lwLocations?.getByProjectId(projectId) || []
    const skills = await dbManager.lwSkills?.getByProjectId(projectId) || []
    const items = await dbManager.lwItems?.getByProjectId(projectId) || []
    const factions = await dbManager.lwFactions?.getByProjectId(projectId) || []

    // 构建实体参考列表
    const entityReference = {
      characters: characters.map(c => ({ id: c.id, name: c.name })),
      locations: locations.map(l => ({ id: l.id, name: l.name })),
      skills: skills.map(s => ({ id: s.id, name: s.name })),
      items: items.map(i => ({ id: i.id, name: i.name })),
      factions: factions.map(f => ({ id: f.id, name: f.name }))
    }

    const systemPrompt = `你是一位专业的小说创作顾问。请从章节预写内容中提取关键记忆信息。

**重要**：请控制回复长度，总字数不超过1500字。

你的回复必须是纯 JSON 数组格式（不要包含 \`\`\`json 标记），每条记忆包含以下字段：
- memoryType: 记忆类型，可选值：
  - character_event（角色事件：角色的重要经历、成长、变化）
  - location_event（地点事件：地点的重要变化、发现）
  - item_event（物品事件：物品的获得、失去、变化）
  - relationship_change（关系变化：角色间关系的建立、改变、破裂）
  - faction_event（势力事件：势力的兴衰、更替、冲突）
  - general（一般事件：其他重要情节）
- title: 简短标题（10-20字）
- description: 详细描述（50-100字，说明事件的来龙去脉）
- involvedEntities: 涉及的实体数组，格式：[{type, id, name}]
  - type 可选：character/location/item/skill/faction
  - id 使用提供的实体列表中的 ID
  - name 使用实体的名称
- importance: 重要程度
  - critical（关键：改变故事走向的重大事件，如主角突破、重要角色死亡、势力覆灭）
  - normal（重要：有长期影响的情节，如学到新技能、结交盟友、获得重要物品）
  - minor（次要：有记录价值但影响有限，如日常互动、小冲突）

提取原则：
1. 只提取有长期影响的信息，不要提取临时性的对话或场景描写
2. 重点关注：角色成长、关系变化、物品得失、势力变动、重要发现
3. 每个事件独立成条，避免重复
4. 如果预写内容中没有值得记录的事件，返回空数组 []

请直接输出 JSON 数组，不要有任何额外文字。`

    const prompt = `【已知实体参考】
角色：${entityReference.characters.map(c => `${c.name}(${c.id})`).join('、') || '无'}
地点：${entityReference.locations.map(l => `${l.name}(${l.id})`).join('、') || '无'}
技能：${entityReference.skills.map(s => `${s.name}(${s.id})`).join('、') || '无'}
物品：${entityReference.items.map(i => `${i.name}(${i.id})`).join('、') || '无'}
势力：${entityReference.factions.map(f => `${f.name}(${f.id})`).join('、') || '无'}

【章节预写内容】
${prewriteContent}

请从以上预写内容中提取关键记忆信息。直接返回 JSON 数组格式的结果。`

    try {
      const result = await this.callAIStream(window, eventId, prompt, systemPrompt, 2048, providerConfigId, modelId)

      // 尝试解析 JSON 数组
      const jsonMatch = result.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])
        return { success: true, data }
      }

      // 如果没有匹配到数组，可能没有提取到记忆
      return { success: true, data: [] }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 获取章节生成时的记忆上下文
   */
  private async getMemoryContext(projectId: string, chapterNumber: number): Promise<string> {
    const dbManager = getDatabaseManager()
    const memories = await dbManager.lwMemories?.getMemoriesBeforeChapter(projectId, chapterNumber) || []

    if (memories.length === 0) {
      return ''
    }

    // 按重要程度分组
    const criticalMemories = memories.filter(m => m.importance === 'critical')
    const normalMemories = memories.filter(m => m.importance === 'normal')
    const minorMemories = memories.filter(m => m.importance === 'minor')

    // 构建记忆上下文
    let context = '\n\n【重要记忆】请确保以下情节要点在写作中保持一致：\n'

    // 关键记忆
    if (criticalMemories.length > 0) {
      context += '\n【关键事件】\n'
      criticalMemories.forEach(m => {
        context += `- [${this.getMemoryTypeLabel(m.memoryType)}] ${m.title}：${m.description}\n`
      })
    }

    // 重要记忆
    if (normalMemories.length > 0) {
      context += '\n【重要情节】\n'
      normalMemories.slice(0, 10).forEach(m => {
        context += `- [${this.getMemoryTypeLabel(m.memoryType)}] ${m.title}：${m.description}\n`
      })
      if (normalMemories.length > 10) {
        context += `  ... 还有 ${normalMemories.length - 10} 条记忆\n`
      }
    }

    // 次要记忆（只显示最近几条）
    if (minorMemories.length > 0) {
      context += '\n【其他参考】\n'
      minorMemories.slice(-5).forEach(m => {
        context += `- ${m.title}\n`
      })
    }

    return context
  }

  /**
   * 获取记忆类型标签
   */
  private getMemoryTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      character_event: '角色',
      location_event: '地点',
      item_event: '物品',
      relationship_change: '关系',
      faction_event: '势力',
      skill_event: '技能',
      general: '事件'
    }
    return labels[type] || '事件'
  }

  // ==================== 实体状态提取 ====================

  /**
   * 从章节正文中提取实体状态快照
   */
  async extractEntityStates(
    window: BrowserWindow,
    eventId: string,
    projectId: string,
    outlineId: string,
    chapterContent: string,
    chapterNumber: number,
    involvedEntities: Array<{ type: string; id: string; name: string }>,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getDatabaseManager()

    // 获取每个实体在上一章节的状态
    const previousStates: Array<{ entity: any; state: any }> = []
    for (const entity of involvedEntities) {
      const prevState = await dbManager.lwEntityStates?.getEntityStateAtChapter(
        projectId,
        entity.type as any,
        entity.id,
        chapterNumber - 1
      )
      previousStates.push({
        entity,
        state: prevState
      })
    }

    const systemPrompt = `你是一位专业的小说创作顾问。请分析章节正文内容，提取涉及实体的最新状态。

**重要**：请控制回复长度，总字数不超过2000字。

## 实体类型说明
- character（角色）：存活状态、当前位置、掌握技能、持有物品、人际关系、身体状态
- location（地点）：状态（正常/毁坏/发现中）、归属势力、重要特征变化
- item（物品）：持有者、状态（完好/损坏/丢失）、当前位置
- faction（势力）：领导者、状态（兴盛/衰落/覆灭）、控制区域变化
- skill（技能）：掌握者列表、传承情况、等级分布

## 输出格式
返回 JSON 数组，每个实体一条记录：
{
  "entityType": "character/location/item/faction/skill",
  "entityId": "实体ID",
  "entityName": "实体名称",
  "stateSummary": "完整的状态摘要描述（100-200字，包含所有关键状态信息）",
  "keyChanges": ["本章节导致的关键变化列表"]
}

## 状态摘要原则
1. 状态是"最新结果"，不是"过程描述"——如"已死亡"而非"第2章受伤，第3章死亡"
2. 状态摘要应完整，包含该实体当前所有关键信息
3. 如果实体在本章节无变化，但有上一状态，则继承上一状态并补充新变化
4. 如果实体首次出现且无上一状态，从章节内容和设定信息推断初始状态
5. keyChanges 只记录本章节新增的变化，便于追溯

请直接输出 JSON 数组，不要有任何额外文字。`

    // 构建上一状态信息
    const previousStatesInfo = previousStates
      .filter(s => s.state)
      .map(s => `【${s.entity.name}】（第${s.state.chapterNumber}章状态）：${s.state.stateSummary}`)
      .join('\n')

    const prompt = `【章节正文内容】
${chapterContent.substring(0, 6000)}${chapterContent.length > 6000 ? '...(内容已截断)' : ''}

【涉及的实体】
${involvedEntities.map(e => `- ${e.name}（类型：${e.type}，ID：${e.id}）`).join('\n')}

【实体上一章节状态】
${previousStatesInfo || '无历史状态'}

请分析以上章节内容，为涉及的实体生成状态快照。如果一个实体在本章节没有变化且没有上一状态，可以不输出该实体。直接返回 JSON 数组格式的结果。`

    try {
      const result = await this.callAIStream(window, eventId, prompt, systemPrompt, 3000, providerConfigId, modelId)

      // 尝试解析 JSON 数组
      const jsonMatch = result.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])
        return { success: true, data }
      }

      // 如果没有匹配到数组，可能没有提取到状态变化
      return { success: true, data: [] }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 获取章节生成时的实体状态上下文
   */
  async getEntityStateContext(
    projectId: string,
    chapterNumber: number,
    involvedEntities: Array<{ type: string; id: string }>
  ): Promise<string> {
    const dbManager = getDatabaseManager()

    if (!involvedEntities || involvedEntities.length === 0) {
      return ''
    }

    // 获取每个实体在上一章节的状态
    const states: Array<{ entity: any; state: any }> = []
    for (const entity of involvedEntities) {
      const state = await dbManager.lwEntityStates?.getEntityStateAtChapter(
        projectId,
        entity.type as any,
        entity.id,
        chapterNumber - 1
      )
      if (state) {
        states.push({ entity, state })
      }
    }

    if (states.length === 0) {
      return ''
    }

    // 按实体类型分组
    const byType: Record<string, typeof states> = {
      character: [],
      location: [],
      item: [],
      faction: [],
      skill: []
    }

    for (const item of states) {
      byType[item.state.entityType]?.push(item)
    }

    // 构建状态上下文
    let context = '\n\n【重要：实体状态一致性】请确保以下实体状态在写作中保持一致：\n'

    // 角色状态
    if (byType.character.length > 0) {
      context += '\n【角色状态】\n'
      byType.character.forEach(s => {
        context += `- ${s.state.entityName}：${s.state.stateSummary}\n`
      })
    }

    // 地点状态
    if (byType.location.length > 0) {
      context += '\n【地点状态】\n'
      byType.location.forEach(s => {
        context += `- ${s.state.entityName}：${s.state.stateSummary}\n`
      })
    }

    // 物品状态
    if (byType.item.length > 0) {
      context += '\n【物品状态】\n'
      byType.item.forEach(s => {
        context += `- ${s.state.entityName}：${s.state.stateSummary}\n`
      })
    }

    // 势力状态
    if (byType.faction.length > 0) {
      context += '\n【势力状态】\n'
      byType.faction.forEach(s => {
        context += `- ${s.state.entityName}：${s.state.stateSummary}\n`
      })
    }

    // 技能状态
    if (byType.skill.length > 0) {
      context += '\n【技能状态】\n'
      byType.skill.forEach(s => {
        context += `- ${s.state.entityName}：${s.state.stateSummary}\n`
      })
    }

    context += '\n【注意事项】\n'
    context += '1. 已死亡的角色不能再出现\n'
    context += '2. 已学会的技能不能再"初学"\n'
    context += '3. 已获得的物品不能再"首次获得"\n'
    context += '4. 已建立的关系不能忽略\n'
    context += '5. 状态变化需要合乎逻辑\n'

    return context
  }

  // ==================== 章节实体识别 ====================

  /**
   * 从章节正文中自动识别涉及的实体（角色、地点等）
   * 用于在没有手动设置涉及实体时自动识别
   */
  async recognizeChapterEntities(
    window: BrowserWindow,
    eventId: string,
    projectId: string,
    chapterContent: string,
    providerConfigId?: string,
    modelId?: string
  ): Promise<GenerateResponse> {
    const dbManager = getDatabaseManager()

    // 获取项目中的所有角色、地点和物品
    const characters = dbManager.lwCharacters?.getByProjectId(projectId) || []
    const locations = dbManager.lwLocations?.getByProjectId(projectId) || []
    const items = dbManager.lwItems?.getByProjectId(projectId) || []

    const systemPrompt = `你是一位专业的小说内容分析师。请分析章节正文，识别其中涉及的角色和地点。

**重要**：请控制回复长度，总字数不超过500字。

## 任务说明
1. 对照项目角色库和地点库，识别章节中出现的角色和地点
2. 即使角色/地点只是被提及（没有实际出场），只要章节内容中有提及就应该列出
3. 使用精确匹配：只识别确实存在于项目库中的角色和地点

## 输出格式
返回 JSON 对象：
{
  "characters": ["角色ID1", "角色ID2", ...],
  "locations": ["地点ID1", "地点ID2", ...],
  "events": ["事件1简述", "事件2简述", ...]
}

如果某个类别没有识别到，返回空数组即可。请直接输出 JSON，不要有任何额外文字。`

    // 构建角色和地点列表
    const characterList = characters.map(c => `- ${c.name}（ID: ${c.id}）`).join('\n')
    const locationList = locations.map(l => `- ${l.name}（ID: ${l.id}）`).join('\n')

    const prompt = `【项目角色库】
${characterList || '无'}

【项目地点库】
${locationList || '无'}

【章节正文内容】
${chapterContent.substring(0, 6000)}${chapterContent.length > 6000 ? '...(内容已截断)' : ''}

请分析以上章节内容，识别其中涉及的角色和地点，并简要列出发生的事件。直接返回 JSON 格式的结果。`

    try {
      const result = await this.callAIStream(window, eventId, prompt, systemPrompt, 1500, providerConfigId, modelId)

      // 尝试解析 JSON
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      let recognizedCharacters: any[] = []
      let recognizedLocations: any[] = []
      let events: string[] = []

      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])
        // 转换为完整的实体信息
        recognizedCharacters = (data.characters || []).map((id: string) => {
          const char = characters.find(c => c.id === id)
          return char ? { id: char.id, name: char.name } : null
        }).filter(Boolean)

        recognizedLocations = (data.locations || []).map((id: string) => {
          const loc = locations.find(l => l.id === id)
          return loc ? { id: loc.id, name: loc.name } : null
        }).filter(Boolean)

        events = data.events || []
      }

      // 检测新实体
      let newEntities = null
      try {
        const { LwEntityDetectionService } = await import('./lw-entity-detection.service')
        newEntities = await LwEntityDetectionService.detectNewEntities(
          projectId,
          chapterContent,
          undefined, // sourceOutlineId - 暂时不知道，可以后续补充
          undefined  // chapterNumber - 暂时不知道
        )

        // 如果检测到新实体，发送事件通知前端
        if (newEntities && (
          newEntities.newCharacters.length > 0 ||
          newEntities.newLocations.length > 0 ||
          newEntities.newItems.length > 0
        )) {
          window.webContents.send(`longwriting:new-entities-detected:${eventId}`, {
            type: 'new_entities',
            newEntities
          })
        }
      } catch (err) {
        console.error('[LongWritingAI] 新实体检测失败:', err)
        // 新实体检测失败不影响主流程
      }

      return {
        success: true,
        data: {
          characters: recognizedCharacters,
          locations: recognizedLocations,
          events,
          newEntities: newEntities ? {
            newCharacters: newEntities.newCharacters,
            newLocations: newEntities.newLocations,
            newItems: newEntities.newItems
          } : null
        }
      }
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