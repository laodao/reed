/**
 * 提供商模板服务
 * @module platform/services/provider-template
 * @description 管理 AI 提供商模板和配置
 */

import type { ProviderTemplate, ModelDefinition, ModelType, UserProviderConfig } from '@shared/types/provider-template.types'
import { getSecureStorage, type ISecureStorage } from '@core/interfaces/storage.interface'
import { createProvider } from '@core/platform/providers/llm'
// 统一能力解析（落库/声明字段优先，缺失按模型名兜底）——本服务不再维护第二套猜测规则
import { resolveCapabilities } from '@core/platform/providers/llm/model-capability'

/**
 * 阿里百炼 Token Plan（订阅套餐，个人版/团队版共用端点）文本/推理模型清单
 *
 * 来源：官方《Token Plan 个人版 概述》「支持的模型」表，仅取其中**文本/推理类**——
 * 官方《更多工具》明确 `compatible-mode` 与 `apps/anthropic` 两个端点「仅文本生成类」，
 * 图像（qwen-image-3.0-pro / wan2.7-image）、语音、视频模型不属于本模板能力范围。
 *
 * 规格与能力逐项取自各模型官方明细页（上下文长度 / 最大输出长度 / Function Calling / 视觉理解），
 * 无一项为推测值；带日期后缀的模型（-0813 / -0731）为其基础模型的日期快照，规格沿用基础模型。
 */
const BAILIAN_TOKEN_PLAN_TEXT_MODELS: ModelDefinition[] = [
  // ===== 千问（官方标注：推理模型、视觉理解、文本生成）=====
  { id: 'qwen3.8-max', name: 'qwen3.8-max', type: 'multimodal', contextWindow: 1_000_000, maxOutputTokens: 131_072, features: ['chat', 'streaming'], supportsThinking: true, supportsTools: true },
  { id: 'qwen3.8-flash', name: 'qwen3.8-flash', type: 'multimodal', contextWindow: 1_000_000, maxOutputTokens: 131_072, features: ['chat', 'streaming'], supportsThinking: true, supportsTools: true },
  // 官方标注：推理模型、文本生成（不含视觉理解）
  { id: 'qwen3.7-max', name: 'qwen3.7-max', type: 'text', contextWindow: 1_000_000, maxOutputTokens: 131_072, features: ['chat', 'streaming'], supportsThinking: true, supportsTools: true },
  { id: 'qwen3.7-plus', name: 'qwen3.7-plus', type: 'multimodal', contextWindow: 1_000_000, maxOutputTokens: 131_072, features: ['chat', 'streaming'], supportsThinking: true, supportsTools: true },
  { id: 'qwen3.6-flash', name: 'qwen3.6-flash', type: 'multimodal', contextWindow: 1_000_000, maxOutputTokens: 65_536, features: ['chat', 'streaming'], supportsThinking: true, supportsTools: true },
  // ===== DeepSeek（官方标注：推理模型、文本生成）=====
  { id: 'deepseek-v4-pro', name: 'deepseek-v4-pro', type: 'text', contextWindow: 1_000_000, maxOutputTokens: 393_216, features: ['chat', 'streaming'], supportsThinking: true, supportsTools: true },
  { id: 'deepseek-v4-pro-0813', name: 'deepseek-v4-pro-0813', type: 'text', contextWindow: 1_000_000, maxOutputTokens: 393_216, features: ['chat', 'streaming'], supportsThinking: true, supportsTools: true },
  { id: 'deepseek-v4-flash-0731', name: 'deepseek-v4-flash-0731', type: 'text', contextWindow: 1_000_000, maxOutputTokens: 393_216, features: ['chat', 'streaming'], supportsThinking: true, supportsTools: true },
  // ===== 智谱 AI（官方标注：推理模型、文本生成）=====
  { id: 'glm-5.2', name: 'glm-5.2', type: 'text', contextWindow: 1_048_576, maxOutputTokens: 131_072, features: ['chat', 'streaming'], supportsThinking: true, supportsTools: true }
]

/** 取一份 Token Plan 模型清单副本（两张协议模板各自持有，避免共享可变数组） */
function cloneTokenPlanTextModels(): ModelDefinition[] {
  return BAILIAN_TOKEN_PLAN_TEXT_MODELS.map((m) => ({ ...m, features: [...m.features] }))
}

/**
 * 阿里百炼 Token Plan 使用须知（官方硬约束，配置界面逐条展示）
 */
const BAILIAN_TOKEN_PLAN_USAGE_NOTES: string[] = [
  'API Key 以 sk-sp- 开头，与按量计费（sk-）、Coding Plan 的密钥及 Base URL 完全隔离，不可混用',
  '仅支持华北2（北京）地域；个人版按 7 天窗口限额（Lite 2500 / Standard 10000 / Pro 40000 Credits），团队版按月总额度',
  '官方限定：仅可在 AI 编程/智能体工具中交互式使用，不支持工作流平台与自定义应用后端批量调用；请勿把套餐密钥用于本应用的批量自动化任务，否则可能被暂停订阅或封禁',
  '订阅到期后重新购买会更换 API Key，需在百炼控制台「我的订阅」重新获取并更新此处配置'
]

/**
 * 预定义的提供商模板
 */
export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  // OpenAI 兼容格式提供商
  {
    id: 'openai',
    siteUrl: 'https://openai.com',
    name: 'OpenAI',
    description: 'OpenAI 官方 API，支持 GPT-4、GPT-3.5、DALL-E 等模型',
    category: 'openai-compatible',
    capabilities: ['chat', 'image'],
    icon: '🟢',
    isOfficial: true,
    apiConfig: {
      baseUrl: 'https://api.openai.com/v1',
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
    id: 'deepseek',
    siteUrl: 'https://www.deepseek.com',
    name: 'DeepSeek',
    description: 'DeepSeek API，性价比高的国产大模型',
    category: 'openai-compatible',
    capabilities: ['chat'],
    icon: '🔵',
    isOfficial: true,
    apiConfig: {
      baseUrl: 'https://api.deepseek.com/v1',
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
  // 智谱AI（合并原 GLM 对话和 CogView 图像生成）
  {
    id: 'zhipu',
    siteUrl: 'https://www.zhipuai.cn',
    name: '智谱AI',
    description: '智谱AI 大模型平台，支持 GLM 对话模型和 CogView 图像生成',
    category: 'openai-compatible',
    capabilities: ['chat', 'image'],
    icon: '🟣',
    isOfficial: true,
    apiConfig: {
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      // 图像生成使用同一基础 URL，但端点不同
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
    siteUrl: 'https://bailian.console.aliyun.com',
    name: '阿里百炼平台',
    description: '阿里云百炼平台，支持通义千问对话模型和通义万相图像生成',
    category: 'openai-compatible',
    capabilities: ['chat', 'image'],
    icon: '🟠',
    isOfficial: true,
    apiConfig: {
      // 文本对话使用 OpenAI 兼容模式
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      // 图像生成使用独立的 API（完整 URL，不需要追加端点）
      imageBaseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
      // 图像任务查询端点
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
  // 阿里百炼 Token Plan（订阅套餐）：与上面的「阿里百炼平台」按量计费**完全隔离**——
  // 专属 Base URL（token-plan.cn-beijing.maas.aliyuncs.com）+ sk-sp- 专属密钥，两者不可混用。
  // 官方文档：https://help.aliyun.com/zh/model-studio/token-plan-personal-quick-start
  {
    id: 'bailian-token-plan',
    siteUrl: 'https://bailian.console.aliyun.com',
    name: '阿里百炼 Token Plan',
    description: '阿里云百炼订阅套餐（个人版/团队版），Credits 计量；专属 Base URL + sk-sp- 专属密钥（OpenAI 兼容协议）',
    category: 'openai-compatible',
    capabilities: ['chat'],
    icon: '🟠',
    isOfficial: true,
    apiConfig: {
      baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
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
    models: cloneTokenPlanTextModels(),
    allowCustomModels: true,
    apiKeyPrefix: 'sk-sp-',
    usageNotes: [...BAILIAN_TOKEN_PLAN_USAGE_NOTES]
  },
  // 同一套餐的 Anthropic 协议端点（apps/anthropic），供 Claude 协议链路使用；
  // Anthropic SDK 会自行在 baseURL 后拼 /v1/messages，故 baseUrl 不含版本段
  {
    id: 'bailian-token-plan-anthropic',
    siteUrl: 'https://bailian.console.aliyun.com',
    name: '阿里百炼 Token Plan（Anthropic 兼容）',
    description: '同上套餐的 Anthropic 协议端点（apps/anthropic），供 Claude 协议（tool use / thinking）链路使用',
    category: 'anthropic',
    capabilities: ['chat'],
    icon: '🟠',
    isOfficial: true,
    apiConfig: {
      baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic',
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
    // Anthropic 协议无模型列表接口，预置清单即唯一来源
    models: cloneTokenPlanTextModels(),
    allowCustomModels: true,
    apiKeyPrefix: 'sk-sp-',
    usageNotes: [...BAILIAN_TOKEN_PLAN_USAGE_NOTES]
  },
  {
    id: 'moonshot',
    siteUrl: 'https://www.moonshot.cn',
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
    siteUrl: 'https://www.volcengine.com',
    name: '火山引擎',
    description: '火山引擎方舟平台，支持豆包等对话模型和图像生成',
    category: 'openai-compatible',
    capabilities: ['chat', 'image'],
    icon: '🌋',
    isOfficial: true,
    apiConfig: {
      // 数据面 API（对话）
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      // 图像生成 API（火山引擎图像服务）
      imageBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3/images/generations',
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
    siteUrl: 'https://platform.minimaxi.com',
    name: 'MiniMax',
    description: 'MiniMax 大模型平台，支持对话和图像生成',
    category: 'openai-compatible',
    capabilities: ['chat', 'image'],
    icon: '✨',
    isOfficial: true,
    apiConfig: {
      baseUrl: 'https://api.minimax.chat',
      // 图像生成 API
      imageBaseUrl: 'https://api.minimax.chat/v1/images/generations',
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
    siteUrl: 'https://www.anthropic.com',
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
    siteUrl: 'https://gemini.google.com',
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
      chatEndpoint: '/chat/completions',
      modelsEndpoint: '/models'
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
  },
  // ComfyUI 生成网关（本地/局域网自建，图片+视频，免密钥）：文档 gen-gateway-api.md
  {
    id: 'comfyui',
    siteUrl: '',
    name: 'ComfyUI 生成网关',
    description: '局域网自建 ComfyUI 生成网关（Krea2/Flux Kontext 图片、MiniMax-H3 视频），无需 API Key',
    category: 'custom',
    capabilities: ['image'],
    icon: '🎨',
    isOfficial: false,
    apiConfig: {
      baseUrl: '',
      imageBaseUrl: 'http://127.0.0.1:8190',
      videoBaseUrl: 'http://127.0.0.1:8190',
      authType: 'none',
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
      custom: []
    },
    models: [
      { id: 'krea2', name: 'Krea2 文生图', type: 'image', contextWindow: 0, maxOutputTokens: 0, features: ['image'] },
      { id: 'flux-kontext', name: 'Flux Kontext 参考图生图', type: 'image', contextWindow: 0, maxOutputTokens: 0, features: ['image'] },
      { id: 'h3', name: 'MiniMax-H3 图生视频（自带配音）', type: 'video', contextWindow: 0, maxOutputTokens: 0, features: ['video'] }
    ],
    allowCustomModels: true
  },
  // llama.cpp 本地推理（llama-server，OpenAI 兼容端点，缺省免密钥）：与 comfyui 同为本地自建服务
  {
    id: 'llamacpp',
    siteUrl: 'https://github.com/ggml-org/llama.cpp',
    name: 'llama.cpp',
    description: '本地 llama.cpp 推理服务（llama-server），OpenAI 兼容端点，无需 API 密钥',
    category: 'openai-compatible',
    capabilities: ['chat'],
    icon: '🦙',
    isOfficial: false,
    apiConfig: {
      // llama-server 默认监听 127.0.0.1:8080，OpenAI 兼容端点挂在 /v1 下；
      // baseUrl 含版本段与 validateBaseUrl 的约定一致，joinUrl 会去重双侧 /v1
      baseUrl: 'http://127.0.0.1:8080/v1',
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
    // 模型列表从 /v1/models 动态获取（返回当前加载的模型），也允许手动添加自定义模型 ID
    models: [],
    allowCustomModels: true,
    // llama-server 缺省不启用密钥认证（--api-key 时才需要），密钥可留空
    apiKeyOptional: true,
    usageNotes: [
      '默认地址 http://127.0.0.1:8080/v1，对应 llama-server -m 模型文件.gguf 的缺省启动参数；自定义端点请以 /v1 结尾（如 http://192.168.1.10:8080/v1）',
      '在「模型管理」页签点击「从 API 刷新」获取当前加载模型的 ID；服务未启动时刷新会失败，属正常现象',
      '服务器以 --api-key 参数启动时才需要填写 API 密钥，否则可留空',
      '思考类模型建议加 --jinja --reasoning-format deepseek 启动，思维链会进入 reasoning_content，不混入正文',
      '/v1/models 不返回上下文长度，模型默认按 8K/4K 显示；可在「模型管理」编辑为实际上下文大小'
    ]
  }
]

/**
 * 判断模板是否允许空 API 密钥（免密钥提供商：显式声明 apiKeyOptional，
 * 或认证类型为 none 的本地服务）。配置界面必填校验与各调用链的空密钥挡板统一走此判定，
 * 避免每处各写一套条件漂移。
 */
export function isApiKeyOptional(template?: Pick<ProviderTemplate, 'apiKeyOptional' | 'apiConfig'> | null): boolean {
  if (!template) return false
  return template.apiKeyOptional === true || template.apiConfig?.authType === 'none'
}

/**
 * 提供商模板服务
 */
export class ProviderTemplateService {
  // 懒加载：模块顶层 new ProviderTemplateService() 时 SecureStorage 尚未注册，
  // 改为首次访问时再解析全局 accessor。避免启动顺序耦合。
  private _secureStorage: ISecureStorage | null = null
  private get secureStorage(): ISecureStorage {
    if (!this._secureStorage) {
      this._secureStorage = getSecureStorage()
    }
    return this._secureStorage
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

    // 检查是否需要 API 密钥（免密钥提供商如 llama.cpp 可留空）
    if (!isApiKeyOptional(template) && !config.apiKey) {
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

      // 检查模型列表是否为空
      if (!models || models.length === 0) {
        return {
          success: false,
          message: '连接成功但未获取到任何模型，请检查 API 地址是否正确'
        }
      }

      // 转换为 ModelDefinition 格式，并自动识别模型能力
      const modelDefinitions: ModelDefinition[] = models
        .filter((m) => m && m.id)  // 过滤掉无效的模型
        .map((m) => {
        const modelId = m.id.toLowerCase()

        // 模板预置声明优先：官方文档给定的能力/规格比按模型名猜更准，
        // 且 Anthropic 协议端点没有 /models 接口——预置清单是唯一来源。
        // 例：qwen3.8-max 官方支持视觉理解，但模型名里没有 vl，纯字符串推断会漏判。
        const declared = template.models?.find((tm) => tm.id.toLowerCase() === modelId)

        // 类型：模板显式声明优先，未声明才按模型名兜底
        const type = declared?.type ?? this.detectModelType(modelId)

        // 其余能力：声明字段优先，缺失字段按模型名兜底（复用统一能力解析，避免两套规则分叉）
        const caps = resolveCapabilities(m.id, declared)

        // 规格：模板声明了有效值则用之（官方明细页数值），否则沿用 provider 返回的兜底值
        const contextWindow = declared?.contextWindow && declared.contextWindow > 0
          ? declared.contextWindow
          : m.contextWindow
        const maxOutputTokens = declared?.maxOutputTokens && declared.maxOutputTokens > 0
          ? declared.maxOutputTokens
          : m.maxTokens

        // 调试日志
        console.log(`[testConnection] 模型: ${m.id}, 类型: ${type}, 思考: ${caps.supportsThinking}, 搜索: ${caps.supportsWebSearch}, 工具: ${caps.supportsTools}, 声明来源: ${declared ? '模板' : '按名推断'}`)

        return {
          id: m.id,
          name: m.name,
          type,
          contextWindow,
          maxOutputTokens,
          features: ['chat', 'streaming'],
          supportsThinking: caps.supportsThinking,
          supportsWebSearch: caps.supportsWebSearch,
          supportsTools: caps.supportsTools
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
   * 检测模型类型
   * @param modelId - 模型 ID（小写）
   * @returns ModelType
   * @description 仅作为「模板未声明能力」时的兜底；声明优先见 testConnection
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
