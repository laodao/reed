/**
 * 提供商模板常量
 * @module core/constants/provider-templates
 * @description 预定义的 AI 提供商模板配置
 */

import type { ProviderTemplate } from '@shared/types/provider-template.types'

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
    models: [],
    allowCustomModels: true
  },
  // 智谱AI
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
      imageBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      imageEndpoint: '/images/generations',
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
    models: [],
    allowCustomModels: true,
    imageParams: [
      { key: 'negativePrompt', label: '负向提示词', type: 'string', description: '指定不希望出现在图像中的元素' },
      { key: 'style', label: '风格', type: 'select', options: ['auto', 'photography', 'portrait', '3d', 'anime', 'chinese_painting'], default: 'auto', description: '图像生成风格' },
      { key: 'size', label: '尺寸', type: 'select', options: ['512x512', '1024x1024', '1024x768', '768x1024'], default: '1024x1024', description: '图像尺寸' }
    ]
  },
  // 阿里百炼平台
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
      imageBaseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
      imageTaskEndpoint: 'https://dashscope.aliyuncs.com/api/v1/tasks',
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
    models: [],
    allowCustomModels: true,
    imageParams: [
      { key: 'negativePrompt', label: '负向提示词', type: 'string', description: '指定不希望出现在图像中的元素' },
      { key: 'style', label: '风格', type: 'select', options: ['auto', 'photography', 'portrait', '3d', 'anime', 'oil_painting', 'watercolor', 'sketch', 'chinese_painting', 'digital_art'], default: 'auto', description: '图像生成风格' },
      { key: 'quality', label: '质量', type: 'select', options: ['standard', 'hd'], default: 'standard', description: '图像生成质量' },
      { key: 'size', label: '尺寸', type: 'select', options: ['512x512', '1024x1024', '1024x768', '768x1024', '2048x2048'], default: '1024x1024', description: '图像尺寸' }
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
    models: [],
    allowCustomModels: true
  },
  // 火山引擎
  {
    id: 'volcengine',
    name: '火山引擎',
    description: '火山引擎方舟平台，支持豆包等对话模型和图像生成',
    category: 'openai-compatible',
    capabilities: ['chat', 'image'],
    icon: '🌋',
    isOfficial: true,
    apiConfig: {
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      imageBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3/images/generations',
      managementBaseUrl: 'https://ark.cn-beijing.volcengineapi.com',
      authType: 'bearer',
      authHeader: 'Authorization',
      authPrefix: 'Bearer ',
      requestFormat: 'openai',
      chatEndpoint: '/chat/completions',
      requiresAccessKeyForModels: true
    },
    supportedParams: {
      stream: true,
      temperature: true,
      maxTokens: true,
      topP: true,
      custom: []
    },
    models: [],
    allowCustomModels: true,
    imageParams: [
      { key: 'negativePrompt', label: '负向提示词', type: 'string', description: '指定不希望出现在图像中的元素' },
      { key: 'style', label: '风格', type: 'select', options: ['auto', 'photography', 'portrait', '3d', 'anime', 'oil_painting'], default: 'auto', description: '图像生成风格' },
      { key: 'size', label: '尺寸', type: 'select', options: ['512x512', '1024x1024', '1024x768', '768x1024'], default: '1024x1024', description: '图像尺寸' }
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
      imageBaseUrl: 'https://api.minimax.chat/v1/images/generations',
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
    allowCustomModels: true,
    imageParams: [
      { key: 'negativePrompt', label: '负向提示词', type: 'string', description: '指定不希望出现在图像中的元素' },
      { key: 'style', label: '风格', type: 'select', options: ['auto', 'photography', 'portrait', 'anime', 'digital_art'], default: 'auto', description: '图像生成风格' },
      { key: 'size', label: '尺寸', type: 'select', options: ['512x512', '1024x1024', '1024x768', '768x1024'], default: '1024x1024', description: '图像尺寸' }
    ]
  },
  // Anthropic
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
    models: [],
    allowCustomModels: true
  },
  // Google
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
        { key: 'negativePrompt', label: '负向提示词', type: 'string', description: '指定不希望出现在生成结果中的元素（适用于图像生成）' },
        { key: 'size', label: '图像尺寸', type: 'select', options: ['512x512', '1024x1024', '1024x768', '768x1024', '2048x2048'], default: '1024x1024', description: '图像生成尺寸' }
      ]
    },
    models: [],
    allowCustomModels: true
  }
]