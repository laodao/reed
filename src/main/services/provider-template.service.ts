/**
 * 提供商模板服务
 * @module services/provider-template
 * @description 管理 AI 提供商模板和配置
 */

import type { ProviderTemplate, ModelDefinition, ModelType } from '../../shared/types/provider-template.types'
import { getDatabaseManager } from '../database/index'
import { SecureStorageService } from './secure-storage.service'
import { createProvider } from '../providers'

/**
 * 预定义的提供商模板
 */
export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  // OpenAI 兼容格式提供商
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'OpenAI 官方 API，支持 GPT-4、GPT-3.5、DALL-E 等模型',
    category: 'openai-compatible',
    capabilities: ['chat', 'image'],
    icon: '🟢',
    isOfficial: true,
    apiConfig: {
      baseUrl: 'https://api.openai.com',
      authType: 'bearer',
      authHeader: 'Authorization',
      authPrefix: 'Bearer ',
      requestFormat: 'openai',
      chatEndpoint: '/v1/chat/completions',
      modelsEndpoint: '/v1/models'
    },
    supportedParams: {
      stream: true,
      temperature: true,
      maxTokens: true,
      topP: true,
      custom: []
    },
    // 模型列表从 API 动态获取
    models: [],
    allowCustomModels: true
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek API，性价比高的国产大模型',
    category: 'openai-compatible',
    capabilities: ['chat'],
    icon: '🔵',
    isOfficial: true,
    apiConfig: {
      baseUrl: 'https://api.deepseek.com',
      authType: 'bearer',
      authHeader: 'Authorization',
      authPrefix: 'Bearer ',
      requestFormat: 'openai',
      chatEndpoint: '/v1/chat/completions',
      modelsEndpoint: '/v1/models'
    },
    supportedParams: {
      stream: true,
      temperature: true,
      maxTokens: true,
      topP: true,
      custom: []
    },
    // 模型列表从 API 动态获取
    models: [],
    allowCustomModels: true
  },
  // 智谱AI（合并原 GLM 对话和 CogView 图像生成）
  {
    id: 'zhipu',
    name: '智谱AI',
    description: '智谱AI 大模型平台，支持 GLM 对话模型和 CogView 图像生成',
    category: 'openai-compatible',
    capabilities: ['chat', 'image'],
    icon: '🟣',
    isOfficial: true,
    apiConfig: {
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      authType: 'bearer',
      authHeader: 'Authorization',
      authPrefix: 'Bearer ',
      requestFormat: 'openai',
      chatEndpoint: '/chat/completions',
      modelsEndpoint: '/models'
    },
    supportedParams: {
      stream: true,
      temperature: true,
      maxTokens: true,
      topP: true,
      custom: []
    },
    // 模型列表从 API 动态获取
    models: [],
    allowCustomModels: true,
    // 图像生成参数
    imageParams: [
      {
        key: 'negativePrompt',
        label: '负向提示词',
        type: 'string',
        description: '指定不希望出现在图像中的元素'
      },
      {
        key: 'style',
        label: '风格',
        type: 'select',
        options: ['auto', 'photography', 'portrait', '3d', 'anime', 'chinese_painting'],
        default: 'auto',
        description: '图像生成风格'
      },
      {
        key: 'size',
        label: '尺寸',
        type: 'select',
        options: ['512x512', '1024x1024', '1024x768', '768x1024'],
        default: '1024x1024',
        description: '图像尺寸'
      }
    ]
  },
  // 阿里百炼平台（合并原通义千问对话和通义万相图像生成）
  {
    id: 'bailian',
    name: '阿里百炼平台',
    description: '阿里云百炼平台，支持通义千问对话模型和通义万相图像生成',
    category: 'openai-compatible',
    capabilities: ['chat', 'image'],
    icon: '🟠',
    isOfficial: true,
    apiConfig: {
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      imageBaseUrl: 'https://bailian.cn-beijing.aliyuncs.com',
      authType: 'bearer',
      authHeader: 'Authorization',
      authPrefix: 'Bearer ',
      requestFormat: 'openai',
      chatEndpoint: '/chat/completions',
      modelsEndpoint: '/models',
      imageAuthType: 'custom'
    },
    supportedParams: {
      stream: true,
      temperature: true,
      maxTokens: true,
      topP: true,
      custom: []
    },
    // 模型列表从 API 动态获取
    models: [],
    allowCustomModels: true,
    // 图像生成参数
    imageParams: [
      {
        key: 'negativePrompt',
        label: '负向提示词',
        type: 'string',
        description: '指定不希望出现在图像中的元素'
      },
      {
        key: 'style',
        label: '风格',
        type: 'select',
        options: ['auto', 'photography', 'portrait', '3d', 'anime', 'oil_painting', 'watercolor', 'sketch', 'chinese_painting', 'digital_art'],
        default: 'auto',
        description: '图像生成风格'
      },
      {
        key: 'quality',
        label: '质量',
        type: 'select',
        options: ['standard', 'hd'],
        default: 'standard',
        description: '图像生成质量'
      },
      {
        key: 'size',
        label: '尺寸',
        type: 'select',
        options: ['512x512', '1024x1024', '1024x768', '768x1024', '2048x2048'],
        default: '1024x1024',
        description: '图像尺寸'
      }
    ]
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    description: '月之暗面 Kimi 模型',
    category: 'openai-compatible',
    capabilities: ['chat'],
    icon: '🌙',
    isOfficial: true,
    apiConfig: {
      baseUrl: 'https://api.moonshot.cn/v1',
      authType: 'bearer',
      authHeader: 'Authorization',
      authPrefix: 'Bearer ',
      requestFormat: 'openai',
      chatEndpoint: '/chat/completions',
      modelsEndpoint: '/models'
    },
    supportedParams: {
      stream: true,
      temperature: true,
      maxTokens: true,
      topP: true,
      custom: []
    },
    // 模型列表从 API 动态获取
    models: [],
    allowCustomModels: true
  },
  // 火山引擎（支持对话和图像生成）
  {
    id: 'volcengine',
    name: '火山引擎',
    description: '火山引擎方舟平台，支持豆包等对话模型和图像生成',
    category: 'openai-compatible',
    capabilities: ['chat', 'image'],
    icon: '🌋',
    isOfficial: true,
    apiConfig: {
      // 数据面 API（对话）
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      // 管控面 API（模型列表等管理功能）
      managementBaseUrl: 'https://ark.cn-beijing.volcengineapi.com',
      authType: 'bearer',
      authHeader: 'Authorization',
      authPrefix: 'Bearer ',
      requestFormat: 'openai',
      chatEndpoint: '/chat/completions',
      // 模型列表需要 Access Key 签名认证
      requiresAccessKeyForModels: true
    },
    supportedParams: {
      stream: true,
      temperature: true,
      maxTokens: true,
      topP: true,
      custom: []
    },
    // 模型列表从 API 动态获取（需要 Access Key）
    models: [],
    allowCustomModels: true,
    // 图像生成参数
    imageParams: [
      {
        key: 'negativePrompt',
        label: '负向提示词',
        type: 'string',
        description: '指定不希望出现在图像中的元素'
      },
      {
        key: 'style',
        label: '风格',
        type: 'select',
        options: ['auto', 'photography', 'portrait', '3d', 'anime', 'oil_painting'],
        default: 'auto',
        description: '图像生成风格'
      },
      {
        key: 'size',
        label: '尺寸',
        type: 'select',
        options: ['512x512', '1024x1024', '1024x768', '768x1024'],
        default: '1024x1024',
        description: '图像尺寸'
      }
    ]
  },
  // MiniMax
  {
    id: 'minimax',
    name: 'MiniMax',
    description: 'MiniMax 大模型平台，支持对话和图像生成',
    category: 'openai-compatible',
    capabilities: ['chat', 'image'],
    icon: '✨',
    isOfficial: true,
    apiConfig: {
      baseUrl: 'https://api.minimax.chat',
      authType: 'bearer',
      authHeader: 'Authorization',
      authPrefix: 'Bearer ',
      requestFormat: 'openai',
      chatEndpoint: '/v1/chat/completions',
      modelsEndpoint: '/v1/models'
    },
    supportedParams: {
      stream: true,
      temperature: true,
      maxTokens: true,
      topP: true,
      custom: []
    },
    // 模型列表从 API 动态获取
    models: [],
    allowCustomModels: true,
    // 图像生成参数
    imageParams: [
      {
        key: 'negativePrompt',
        label: '负向提示词',
        type: 'string',
        description: '指定不希望出现在图像中的元素'
      },
      {
        key: 'style',
        label: '风格',
        type: 'select',
        options: ['auto', 'photography', 'portrait', 'anime', 'digital_art'],
        default: 'auto',
        description: '图像生成风格'
      },
      {
        key: 'size',
        label: '尺寸',
        type: 'select',
        options: ['512x512', '1024x1024', '1024x768', '768x1024'],
        default: '1024x1024',
        description: '图像尺寸'
      }
    ]
  },
  // Anthropic 格式
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Anthropic Claude 系列模型',
    category: 'anthropic',
    capabilities: ['chat'],
    icon: '🟤',
    isOfficial: true,
    apiConfig: {
      baseUrl: 'https://api.anthropic.com',
      authType: 'api-key',
      authHeader: 'x-api-key',
      authPrefix: '',
      requestFormat: 'anthropic',
      chatEndpoint: '/v1/messages',
      defaultHeaders: {
        'anthropic-version': '2023-06-01'
      }
    },
    supportedParams: {
      stream: true,
      temperature: true,
      maxTokens: true,
      topP: true,
      topK: true,
      custom: []
    },
    // Anthropic 没有 models API，模型需要手动配置
    models: [],
    allowCustomModels: true
  },
  // Google 格式
  {
    id: 'google',
    name: 'Google AI',
    description: 'Google Gemini 系列模型',
    category: 'google',
    capabilities: ['chat'],
    icon: '🔷',
    isOfficial: true,
    apiConfig: {
      baseUrl: 'https://generativelanguage.googleapis.com',
      authType: 'query',
      authHeader: '',
      authPrefix: '',
      queryAuthKey: 'key',
      requestFormat: 'google',
      chatEndpoint: '/v1beta/models/{model}:generateContent'
    },
    supportedParams: {
      stream: true,
      temperature: true,
      maxTokens: true,
      topP: true,
      topK: true,
      custom: []
    },
    // Google 没有 models API，模型需要手动配置
    models: [],
    allowCustomModels: true
  },
  // 自定义模型
  {
    id: 'custom-model',
    name: '自定义模型',
    description: '自定义 API 端点，支持 OpenAI 兼容接口或自定义服务',
    category: 'custom',
    capabilities: ['chat', 'image'],
    icon: '⚙️',
    isOfficial: false,
    apiConfig: {
      baseUrl: '',
      authType: 'bearer',
      authHeader: 'Authorization',
      authPrefix: 'Bearer ',
      requestFormat: 'openai',
      chatEndpoint: '/v1/chat/completions',
      modelsEndpoint: '/v1/models'
    },
    supportedParams: {
      stream: true,
      temperature: true,
      maxTokens: true,
      topP: true,
      custom: [
        {
          key: 'negativePrompt',
          label: '负向提示词',
          type: 'string',
          description: '指定不希望出现在生成结果中的元素（适用于图像生成）'
        },
        {
          key: 'size',
          label: '图像尺寸',
          type: 'select',
          options: ['512x512', '1024x1024', '1024x768', '768x1024', '2048x2048'],
          default: '1024x1024',
          description: '图像生成尺寸'
        }
      ]
    },
    models: [],
    allowCustomModels: true
  }
]

/**
 * 提供商模板服务
 */
export class ProviderTemplateService {
  private secureStorage: SecureStorageService

  constructor() {
    this.secureStorage = new SecureStorageService()
  }

  /**
   * 获取所有模板
   * @returns ProviderTemplate[]
   */
  getAllTemplates(): ProviderTemplate[] {
    return PROVIDER_TEMPLATES
  }

  /**
   * 根据 ID 获取模板
   * @param id - 模板 ID
   * @returns ProviderTemplate | undefined
   */
  getTemplateById(id: string): ProviderTemplate | undefined {
    return PROVIDER_TEMPLATES.find((t) => t.id === id)
  }

  /**
   * 根据分类获取模板
   * @param category - 模板分类
   * @returns ProviderTemplate[]
   */
  getTemplatesByCategory(category: string): ProviderTemplate[] {
    return PROVIDER_TEMPLATES.filter((t) => t.category === category)
  }

  /**
   * 获取官方模板
   * @returns ProviderTemplate[]
   */
  getOfficialTemplates(): ProviderTemplate[] {
    return PROVIDER_TEMPLATES.filter((t) => t.isOfficial)
  }

  /**
   * 测试提供商连接
   * @param config - 配置数据
   * @returns Promise<{ success: boolean; message: string; models?: ModelDefinition[] }>
   */
  async testConnection(config: {
    templateId: string
    apiKey?: string
    accessKeyId?: string
    accessKeySecret?: string
    baseUrl?: string
  }): Promise<{ success: boolean; message: string; models?: ModelDefinition[] }> {
    const template = this.getTemplateById(config.templateId)
    if (!template) {
      return { success: false, message: '模板不存在' }
    }

    // 检查是否需要 API 密钥
    if (template.apiConfig.authType !== 'none' && !config.apiKey) {
      return { success: false, message: '请提供 API 密钥' }
    }

    try {
      // 使用 SDK Provider 获取模型列表
      const provider = createProvider(
        config.templateId,
        {
          apiKey: config.apiKey || '',
          baseUrl: config.baseUrl
        },
        template,
        {
          id: '',
          templateId: config.templateId,
          name: '',
          isEnabled: true,
          isDefault: false,
          createdAt: '',
          updatedAt: '',
          accessKeyId: config.accessKeyId,
          accessKeySecret: config.accessKeySecret
        } as UserProviderConfig
      )

      const models = await provider.getModels()

      // 转换为 ModelDefinition 格式，并自动识别模型能力
      const modelDefinitions: ModelDefinition[] = models.map((m) => {
        const modelId = m.id.toLowerCase()

        // 自动识别模型类型
        const type = this.detectModelType(modelId)

        // 自动识别是否支持深度思考
        const supportsThinking = this.detectThinkingSupport(modelId)

        // 自动识别是否支持联网搜索
        const supportsWebSearch = this.detectWebSearchSupport(modelId)

        // 自动识别是否支持工具调用
        const supportsTools = this.detectToolSupport(modelId)

        // 调试日志
        console.log(`[testConnection] 模型: ${m.id}, 类型: ${type}, 思考: ${supportsThinking}, 搜索: ${supportsWebSearch}, 工具: ${supportsTools}`)

        return {
          id: m.id,
          name: m.name,
          type,
          contextWindow: m.contextWindow,
          maxOutputTokens: m.maxTokens,
          features: ['chat', 'streaming'],
          supportsThinking,
          supportsWebSearch,
          supportsTools
        }
      })

      return {
        success: true,
        message: '连接成功',
        models: modelDefinitions
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      return {
        success: false,
        message: `连接失败: ${errorMessage}`
      }
    }
  }

  /**
   * 检测模型是否支持深度思考
   * @param modelId - 模型 ID（小写）
   * @returns boolean
   */
  private detectThinkingSupport(modelId: string): boolean {
    // DeepSeek R1 / Reasoner
    if (modelId.includes('deepseek-reasoner') || modelId.includes('deepseek-r1')) {
      return true
    }
    // OpenAI o1 / o3 系列
    if (modelId.match(/\bo1[-_]?/) || modelId.match(/\bo3[-_]?/)) {
      return true
    }
    // Claude extended thinking（需要特定配置，暂不自动识别）
    return false
  }

  /**
   * 检测模型是否支持联网搜索
   * @param modelId - 模型 ID（小写）
   * @returns boolean
   */
  private detectWebSearchSupport(modelId: string): boolean {
    // Perplexity sonar 系列
    if (modelId.includes('sonar')) {
      return true
    }
    // 其他内置搜索的模型
    return false
  }

  /**
   * 检测模型类型
   * @param modelId - 模型 ID（小写）
   * @returns ModelType
   */
  private detectModelType(modelId: string): ModelType {
    // 嵌入模型 - 必须最先检查
    if (modelId.includes('embedding') || modelId.includes('embed')) {
      return 'embedding'
    }

    // 重排序模型
    if (modelId.includes('rerank')) {
      return 'rerank'
    }

    // 图像生成模型
    if (modelId.includes('dall-e') ||
        modelId.includes('stable-diffusion') ||
        modelId.includes('midjourney') ||
        modelId.includes('cogview') ||
        modelId.includes('wanx') ||
        modelId.includes('flux') ||
        (modelId.includes('image') && !modelId.includes('vision')) ||
        (modelId.includes('picture') && !modelId.includes('vision'))) {
      return 'image'
    }

    // 视频生成模型
    if (modelId.includes('sora') ||
        modelId.includes('video') ||
        modelId.includes('runway')) {
      return 'video'
    }

    // 音频模型（语音识别、语音合成）
    if (modelId.includes('whisper') ||
        modelId.includes('tts') ||
        modelId.includes('audio') ||
        modelId.includes('speech') ||
        modelId.includes('voice') ||
        modelId.includes('asr')) {
      return 'audio'
    }

    // 多模态模型（支持图像输入）
    // OpenAI GPT-4 系列（带 vision 或 turbo 的，以及 gpt-4o）
    if (modelId.includes('gpt-4o') ||
        modelId.includes('gpt-4-turbo') ||
        modelId.includes('gpt-4-vision') ||
        modelId.includes('gpt-4-1106-vision') ||
        modelId.includes('gpt-4-0125-preview') ||
        modelId.includes('gpt-4-1106-preview')) {
      return 'multimodal'
    }

    // OpenAI o1/o3 系列 - 支持视觉的多模态模型
    if (modelId.match(/\bo1[-_]?/) || modelId.match(/\bo3[-_]?/)) {
      return 'multimodal'
    }

    // Anthropic Claude 3 系列
    if (modelId.includes('claude-3') || modelId.includes('claude-sonnet') || modelId.includes('claude-opus') || modelId.includes('claude-haiku')) {
      return 'multimodal'
    }

    // Google Gemini 系列
    if (modelId.includes('gemini')) {
      return 'multimodal'
    }

    // 阿里通义千问视觉模型
    if (modelId.includes('qwen-vl') || modelId.includes('qwen2-vl') || modelId.includes('qwen2.5-vl')) {
      return 'multimodal'
    }

    // 智谱 GLM-4V 视觉模型
    if (modelId.includes('glm-4v') || modelId.includes('glm-4-vision')) {
      return 'multimodal'
    }

    // Moonshot Moonshot-v1 系列（暂不支持视觉）
    // DeepSeek 系列（不支持视觉）
    // Minimax 系列（暂不支持视觉）

    // 默认为文本模型
    return 'text'
  }

  /**
   * 检测模型是否支持工具调用
   * @param modelId - 模型 ID（小写）
   * @returns boolean
   */
  private detectToolSupport(modelId: string): boolean {
    // OpenAI GPT-3.5/GPT-4 系列支持函数调用
    if (modelId.includes('gpt-3.5') || modelId.includes('gpt-4') || modelId.includes('gpt-4o')) {
      return true
    }

    // OpenAI o1/o3 系列（部分支持工具）
    if (modelId.match(/\bo1[-_]?/) || modelId.match(/\bo3[-_]?/)) {
      return true
    }

    // Anthropic Claude 3 系列支持工具使用
    if (modelId.includes('claude-3') || modelId.includes('claude-sonnet') || modelId.includes('claude-opus') || modelId.includes('claude-haiku')) {
      return true
    }

    // Google Gemini 支持函数调用
    if (modelId.includes('gemini')) {
      return true
    }

    // DeepSeek 支持函数调用（reasoner/r1 系列不支持）
    if (modelId.includes('deepseek') && !modelId.includes('reasoner') && !modelId.includes('r1')) {
      return true
    }

    // 智谱 GLM-4 支持
    if (modelId.includes('glm-4')) {
      return true
    }

    // 通义千问支持
    if (modelId.includes('qwen') && !modelId.includes('vl')) {
      return true
    }

    // Moonshot 支持
    if (modelId.includes('moonshot') || modelId.includes('kimi')) {
      return true
    }

    return false
  }

  /**
   * 从 API 获取模型列表（使用 SDK Provider）
   * @param template - 模板
   * @param baseUrl - 基础 URL
   * @param apiKey - API 密钥
   * @returns Promise<ModelDefinition[]>
   * @deprecated 请使用 testConnection 方法获取模型列表
   */
  private async fetchModels(
    template: ProviderTemplate,
    baseUrl: string,
    apiKey?: string
  ): Promise<ModelDefinition[]> {
    // 使用 SDK Provider 获取模型
    const provider = createProvider(
      template.id,
      {
        apiKey: apiKey || '',
        baseUrl
      },
      template
    )

    const models = await provider.getModels()

    return models.map((m) => ({
      id: m.id,
      name: m.name,
      contextWindow: m.contextWindow,
      maxOutputTokens: m.maxTokens,
      features: ['chat', 'streaming']
    }))
  }

  /**
   * 加密 API 密钥
   * @param apiKey - API 密钥
   * @returns string
   */
  encryptApiKey(apiKey: string): string {
    return this.secureStorage.encrypt(apiKey)
  }

  /**
   * 解密 API 密钥
   * @param encryptedKey - 加密的密钥
   * @returns string
   */
  decryptApiKey(encryptedKey: string): string {
    return this.secureStorage.decrypt(encryptedKey)
  }
}

// 导出单例
export const providerTemplateService = new ProviderTemplateService()
