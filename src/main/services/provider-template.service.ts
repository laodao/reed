/**
 * 提供商模板服务
 * @module services/provider-template
 * @description 管理 AI 提供商模板和配置
 */

import type { ProviderTemplate, ModelDefinition } from '../../shared/types/provider-template.types'
import { getDatabaseManager } from '../database/index'
import { SecureStorageService } from './secure-storage.service'

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
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        features: ['chat', 'vision', 'function-calling', 'streaming'],
        inputPrice: 5,
        outputPrice: 15
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        contextWindow: 128000,
        maxOutputTokens: 16384,
        features: ['chat', 'vision', 'function-calling', 'streaming'],
        inputPrice: 0.15,
        outputPrice: 0.6
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        features: ['chat', 'vision', 'function-calling', 'streaming'],
        inputPrice: 10,
        outputPrice: 30
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        contextWindow: 16385,
        maxOutputTokens: 4096,
        features: ['chat', 'function-calling', 'streaming'],
        inputPrice: 0.5,
        outputPrice: 1.5
      }
    ],
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
    models: [
      {
        id: 'deepseek-chat',
        name: 'DeepSeek Chat',
        contextWindow: 64000,
        maxOutputTokens: 4096,
        features: ['chat', 'function-calling', 'streaming'],
        inputPrice: 0.14,
        outputPrice: 0.28
      },
      {
        id: 'deepseek-coder',
        name: 'DeepSeek Coder',
        contextWindow: 64000,
        maxOutputTokens: 4096,
        features: ['chat', 'function-calling', 'streaming'],
        inputPrice: 0.14,
        outputPrice: 0.28
      },
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek Reasoner',
        contextWindow: 64000,
        maxOutputTokens: 4096,
        features: ['chat', 'streaming'],
        inputPrice: 0.55,
        outputPrice: 2.19
      }
    ],
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
    models: [
      {
        id: 'glm-4-plus',
        name: 'GLM-4 Plus',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        features: ['chat', 'function-calling', 'streaming'],
        inputPrice: 50,
        outputPrice: 50
      },
      {
        id: 'glm-4-air',
        name: 'GLM-4 Air',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        features: ['chat', 'function-calling', 'streaming'],
        inputPrice: 1,
        outputPrice: 1
      },
      {
        id: 'glm-4-flash',
        name: 'GLM-4 Flash',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        features: ['chat', 'function-calling', 'streaming'],
        inputPrice: 0.1,
        outputPrice: 0.1
      }
    ],
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
    models: [
      {
        id: 'qwen-turbo',
        name: '通义千问 Turbo',
        contextWindow: 128000,
        maxOutputTokens: 6144,
        features: ['chat', 'function-calling', 'streaming'],
        inputPrice: 0.3,
        outputPrice: 0.6
      },
      {
        id: 'qwen-plus',
        name: '通义千问 Plus',
        contextWindow: 128000,
        maxOutputTokens: 6144,
        features: ['chat', 'function-calling', 'streaming'],
        inputPrice: 0.8,
        outputPrice: 2
      },
      {
        id: 'qwen-max',
        name: '通义千问 Max',
        contextWindow: 32000,
        maxOutputTokens: 8192,
        features: ['chat', 'function-calling', 'streaming'],
        inputPrice: 20,
        outputPrice: 60
      }
    ],
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
    models: [
      {
        id: 'moonshot-v1-8k',
        name: 'Moonshot V1 8K',
        contextWindow: 8192,
        maxOutputTokens: 4096,
        features: ['chat', 'streaming'],
        inputPrice: 12,
        outputPrice: 12
      },
      {
        id: 'moonshot-v1-32k',
        name: 'Moonshot V1 32K',
        contextWindow: 32768,
        maxOutputTokens: 4096,
        features: ['chat', 'streaming'],
        inputPrice: 24,
        outputPrice: 24
      },
      {
        id: 'moonshot-v1-128k',
        name: 'Moonshot V1 128K',
        contextWindow: 131072,
        maxOutputTokens: 4096,
        features: ['chat', 'streaming'],
        inputPrice: 60,
        outputPrice: 60
      }
    ],
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
  {
    id: 'ollama',
    name: 'Ollama',
    description: '本地部署的 Ollama 模型服务',
    category: 'ollama',
    icon: '🦙',
    isOfficial: true,
    apiConfig: {
      baseUrl: 'http://localhost:11434',
      authType: 'none',
      authHeader: '',
      authPrefix: '',
      requestFormat: 'ollama',
      chatEndpoint: '/api/chat',
      modelsEndpoint: '/api/tags'
    },
    supportedParams: {
      stream: true,
      temperature: true,
      maxTokens: true,
      topP: true,
      topK: true,
      custom: []
    },
    models: [],
    allowCustomModels: true
  },
  // 自定义 OpenAI 兼容
  {
    id: 'openai-compatible-custom',
    name: '自定义 OpenAI 兼容',
    description: '自定义的 OpenAI 兼容 API 端点',
    category: 'openai-compatible',
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
      custom: []
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

    const baseUrl = config.baseUrl || template.apiConfig.baseUrl
    if (!baseUrl) {
      return { success: false, message: '请提供 API 端点' }
    }

    // 检查是否需要 API 密钥
    if (template.apiConfig.authType !== 'none' && !config.apiKey) {
      return { success: false, message: '请提供 API 密钥' }
    }

    try {
      // 尝试获取模型列表
      const models = await this.fetchModels(template, baseUrl, config.apiKey)
      return {
        success: true,
        message: '连接成功',
        models
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
   * 从 API 获取模型列表
   * @param template - 模板
   * @param baseUrl - 基础 URL
   * @param apiKey - API 密钥
   * @returns Promise<ModelDefinition[]>
   */
  private async fetchModels(
    template: ProviderTemplate,
    baseUrl: string,
    apiKey?: string
  ): Promise<ModelDefinition[]> {
    if (!template.apiConfig.modelsEndpoint) {
      return template.models
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    // 添加认证头
    if (template.apiConfig.authType !== 'none' && apiKey) {
      if (template.apiConfig.authType === 'bearer' || template.apiConfig.authType === 'api-key') {
        headers[template.apiConfig.authHeader] = `${template.apiConfig.authPrefix || ''}${apiKey}`
      }
    }

    let url = `${baseUrl}${template.apiConfig.modelsEndpoint}`

    // 处理查询参数认证
    if (template.apiConfig.authType === 'query' && apiKey && template.apiConfig.queryAuthKey) {
      url += `?${template.apiConfig.queryAuthKey}=${apiKey}`
    }

    const response = await fetch(url, {
      method: 'GET',
      headers
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()

    // 解析不同 API 的模型列表格式
    return this.parseModelsResponse(template.category, data)
  }

  /**
   * 解析模型列表响应
   * @param category - 模板分类
   * @param data - 响应数据
   * @returns ModelDefinition[]
   */
  private parseModelsResponse(category: string, data: unknown): ModelDefinition[] {
    const models: ModelDefinition[] = []

    switch (category) {
      case 'openai-compatible': {
        // OpenAI 格式: { data: [{ id: string, ... }] }
        const openaiData = data as { data?: Array<{ id: string }> }
        if (openaiData.data && Array.isArray(openaiData.data)) {
          openaiData.data.forEach((model) => {
            models.push({
              id: model.id,
              name: model.id,
              contextWindow: 8192,
              maxOutputTokens: 4096,
              features: ['chat', 'streaming']
            })
          })
        }
        break
      }
      case 'ollama': {
        // Ollama 格式: { models: [{ name: string, ... }] }
        const ollamaData = data as { models?: Array<{ name: string }> }
        if (ollamaData.models && Array.isArray(ollamaData.models)) {
          ollamaData.models.forEach((model) => {
            models.push({
              id: model.name,
              name: model.name,
              contextWindow: 8192,
              maxOutputTokens: 4096,
              features: ['chat', 'streaming']
            })
          })
        }
        break
      }
      case 'google': {
        // Google 格式: { models: [{ name: string, ... }] }
        const googleData = data as { models?: Array<{ name: string }> }
        if (googleData.models && Array.isArray(googleData.models)) {
          googleData.models.forEach((model) => {
            const modelId = model.name.replace('models/', '')
            models.push({
              id: modelId,
              name: modelId,
              contextWindow: 8192,
              maxOutputTokens: 4096,
              features: ['chat', 'streaming']
            })
          })
        }
        break
      }
    }

    return models
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
