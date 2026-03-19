/**
 * 提供商模板服务
 * @module services/provider-template
 * @description 管理 AI 提供商模板和配置
 */

import type { ProviderTemplate, ModelDefinition } from '../../shared/types/provider-template.types'
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
    description: 'OpenAI 官方 API，支持 GPT-4、GPT-3.5 等模型',
    category: 'openai-compatible',
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
  {
    id: 'glm',
    name: '智谱 GLM',
    description: '智谱 AI GLM 系列模型',
    category: 'openai-compatible',
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
    allowCustomModels: true
  },
  {
    id: 'qwen',
    name: '通义千问',
    description: '阿里云通义千问系列模型',
    category: 'openai-compatible',
    icon: '🟠',
    isOfficial: true,
    apiConfig: {
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
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
  {
    id: 'moonshot',
    name: 'Moonshot',
    description: '月之暗面 Kimi 模型',
    category: 'openai-compatible',
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
  // Anthropic 格式
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Anthropic Claude 系列模型',
    category: 'anthropic',
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
    // Anthropic 没有 models API，使用预定义模型
    models: [
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        contextWindow: 200000,
        maxOutputTokens: 64000,
        features: ['chat', 'vision', 'function-calling', 'streaming'],
        inputPrice: 3,
        outputPrice: 15
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        features: ['chat', 'vision', 'function-calling', 'streaming'],
        inputPrice: 3,
        outputPrice: 15
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        features: ['chat', 'vision', 'function-calling', 'streaming'],
        inputPrice: 0.8,
        outputPrice: 4
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        contextWindow: 200000,
        maxOutputTokens: 4096,
        features: ['chat', 'vision', 'function-calling', 'streaming'],
        inputPrice: 15,
        outputPrice: 75
      }
    ],
    allowCustomModels: true
  },
  // Google 格式
  {
    id: 'google',
    name: 'Google AI',
    description: 'Google Gemini 系列模型',
    category: 'google',
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
    // Google 没有 models API，使用预定义模型
    models: [
      {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        contextWindow: 1048576,
        maxOutputTokens: 8192,
        features: ['chat', 'vision', 'function-calling', 'streaming'],
        inputPrice: 0,
        outputPrice: 0
      },
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        contextWindow: 2097152,
        maxOutputTokens: 8192,
        features: ['chat', 'vision', 'function-calling', 'streaming'],
        inputPrice: 1.25,
        outputPrice: 5
      },
      {
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash',
        contextWindow: 1048576,
        maxOutputTokens: 8192,
        features: ['chat', 'vision', 'function-calling', 'streaming'],
        inputPrice: 0.075,
        outputPrice: 0.3
      }
    ],
    allowCustomModels: true
  },
  // Ollama 本地模型
  // {
  //   id: 'ollama',
  //   name: 'Ollama',
  //   description: '本地部署的 Ollama 模型服务',
  //   category: 'ollama',
  //   icon: '🦙',
  //   isOfficial: true,
  //   apiConfig: {
  //     baseUrl: 'http://localhost:11434',
  //     authType: 'none',
  //     authHeader: '',
  //     authPrefix: '',
  //     requestFormat: 'ollama',
  //     chatEndpoint: '/api/chat',
  //     modelsEndpoint: '/api/tags'
  //   },
  //   supportedParams: {
  //     stream: true,
  //     temperature: true,
  //     maxTokens: true,
  //     topP: true,
  //     topK: true,
  //     custom: []
  //   },
  //   models: [],
  //   allowCustomModels: true
  // },
  // ==================== 图像生成提供商 ====================
  // 百炼平台（阿里云）- 通义万相
  {
    id: 'image-bailian',
    name: '百炼平台 - 通义万相',
    description: '阿里云百炼平台图像生成服务，支持通义万相模型',
    category: 'image',
    icon: '🎨',
    isOfficial: true,
    apiConfig: {
      baseUrl: 'https://bailian.cn-beijing.aliyuncs.com',
      // 百炼平台使用阿里云 ACS3-HMAC-SHA256 签名认证
      // API Key 格式: AccessKeyId:AccessKeySecret
      authType: 'custom',
      authHeader: '',
      authPrefix: '',
      requestFormat: 'custom',
      chatEndpoint: ''
    },
    supportedParams: {
      stream: false,
      temperature: false,
      maxTokens: false,
      topP: false,
      custom: [
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
    models: [
      {
        id: 'wanx-v1',
        name: '通义万相 v1',
        contextWindow: 0,
        maxOutputTokens: 0,
        features: ['text-to-image', 'image-to-image'],
        inputPrice: 0,
        outputPrice: 0
      }
    ],
    allowCustomModels: false
  },
  // 火山引擎 - 豆包
  {
    id: 'image-volcengine',
    name: '火山引擎 - 豆包',
    description: '火山引擎图像生成服务，支持豆包模型',
    category: 'image',
    icon: '🌋',
    isOfficial: true,
    apiConfig: {
      baseUrl: 'https://ark.cn-beijing.volces.com',
      // 火山引擎使用 API Key 认证
      authType: 'bearer',
      authHeader: 'Authorization',
      authPrefix: 'Bearer ',
      requestFormat: 'openai',
      chatEndpoint: ''
    },
    supportedParams: {
      stream: false,
      temperature: false,
      maxTokens: false,
      topP: false,
      custom: [
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
    models: [
      {
        id: 'doubao-image',
        name: '豆包图像生成',
        contextWindow: 0,
        maxOutputTokens: 0,
        features: ['text-to-image'],
        inputPrice: 0,
        outputPrice: 0
      }
    ],
    allowCustomModels: false
  },
  // MiniMax
  {
    id: 'image-minimax',
    name: 'MiniMax',
    description: 'MiniMax 图像生成服务',
    category: 'image',
    icon: '✨',
    isOfficial: true,
    apiConfig: {
      baseUrl: 'https://api.minimax.chat',
      authType: 'bearer',
      authHeader: 'Authorization',
      authPrefix: 'Bearer ',
      requestFormat: 'openai',
      chatEndpoint: ''
    },
    supportedParams: {
      stream: false,
      temperature: false,
      maxTokens: false,
      topP: false,
      custom: [
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
    models: [
      {
        id: 'minimax-image',
        name: 'MiniMax 图像生成',
        contextWindow: 0,
        maxOutputTokens: 0,
        features: ['text-to-image'],
        inputPrice: 0,
        outputPrice: 0
      }
    ],
    allowCustomModels: false
  },
  // 智谱AI - CogView
  {
    id: 'image-zhipu',
    name: '智谱AI - CogView',
    description: '智谱AI 图像生成服务，支持 CogView 模型',
    category: 'image',
    icon: '🖼️',
    isOfficial: true,
    apiConfig: {
      baseUrl: 'https://open.bigmodel.cn',
      authType: 'bearer',
      authHeader: 'Authorization',
      authPrefix: 'Bearer ',
      requestFormat: 'openai',
      chatEndpoint: ''
    },
    supportedParams: {
      stream: false,
      temperature: false,
      maxTokens: false,
      topP: false,
      custom: [
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
    models: [
      {
        id: 'cogview-3',
        name: 'CogView-3',
        contextWindow: 0,
        maxOutputTokens: 0,
        features: ['text-to-image'],
        inputPrice: 0,
        outputPrice: 0
      }
    ],
    allowCustomModels: false
  },
  // 自定义模型
  {
    id: 'custom-model',
    name: '自定义模型',
    description: '自定义 API 端点，支持 OpenAI 兼容接口或自定义图像生成服务',
    category: 'custom',
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
        template
      )

      const models = await provider.getModels()

      // 转换为 ModelDefinition 格式
      const modelDefinitions: ModelDefinition[] = models.map((m) => ({
        id: m.id,
        name: m.name,
        contextWindow: m.contextWindow,
        maxOutputTokens: m.maxTokens,
        features: ['chat', 'streaming']
      }))

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
