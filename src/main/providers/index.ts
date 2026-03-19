/**
 * AI Provider 工厂
 * @module providers/index
 * @description Provider 实例工厂，根据模板创建对应的 Provider 实例
 */

import type { BaseProvider, ProviderConfig, StreamCallback } from './base-provider'
import type { ProviderTemplate, UserProviderConfig } from '../../shared/types'

// SDK Provider 导入
import { OpenAISdkProvider } from './sdk/openai-sdk-provider'
import { AnthropicSdkProvider } from './sdk/anthropic-sdk-provider'
import { GoogleSdkProvider } from './sdk/google-sdk-provider'

// 备用 Provider 导入（用于不支持 SDK 的情况）
import { OpenAICompatibleProvider } from './openai-compatible-provider'

// 导出基类和类型
export * from './base-provider'
export * from './sdk'

/**
 * OpenAI 兼容平台配置
 * 这些平台使用 OpenAI 兼容 API，可以用 OpenAI SDK 调用
 */
const OPENAI_COMPATIBLE_CONFIGS: Record<string, { baseUrl: string; name: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', name: 'OpenAI' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', name: 'DeepSeek' },
  glm: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', name: '智谱 GLM' },
  qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', name: '通义千问' },
  moonshot: { baseUrl: 'https://api.moonshot.cn/v1', name: 'Moonshot' },
  minimax: { baseUrl: 'https://api.minimax.chat/v1', name: 'Minimax' }
}

/**
 * 已注册的 Provider 构造函数映射（旧版，保留兼容性）
 */
const providerRegistry = new Map<string, new (config: ProviderConfig) => BaseProvider>()

/**
 * 注册 Provider（旧版，保留兼容性）
 */
export function registerProvider(id: string, providerClass: new (config: ProviderConfig) => BaseProvider): void {
  providerRegistry.set(id, providerClass)
}

/**
 * 创建 Provider 实例
 *
 * 根据模板 ID 创建对应的 Provider 实例：
 * - OpenAI 兼容平台使用 OpenAI SDK
 * - Anthropic 使用官方 SDK
 * - Google 使用官方 SDK
 * - 其他平台使用旧的 OpenAI 兼容实现
 *
 * @param templateId - 模板 ID
 * @param config - Provider 配置
 * @param template - 模板定义（可选）
 * @param userConfig - 用户配置（可选）
 * @returns Provider 实例
 */
export function createProvider(
  templateId: string,
  config: ProviderConfig,
  template?: ProviderTemplate,
  userConfig?: UserProviderConfig
): BaseProvider {
  // 检查是否是 OpenAI 兼容平台
  if (templateId in OPENAI_COMPATIBLE_CONFIGS) {
    const { baseUrl, name } = OPENAI_COMPATIBLE_CONFIGS[templateId]
    return new OpenAISdkProvider(
      config,
      templateId,
      name,
      baseUrl,
      template,
      userConfig
    )
  }

  // Anthropic 使用官方 SDK
  if (templateId === 'anthropic') {
    return new AnthropicSdkProvider(config, template, userConfig)
  }

  // Google 使用官方 SDK
  if (templateId === 'google') {
    return new GoogleSdkProvider(config, template, userConfig)
  }

  // 其他平台使用旧的 OpenAI 兼容实现
  // 这里需要提供必要的参数
  const baseUrl = config.baseUrl || template?.apiConfig.baseUrl || ''
  const name = template?.name || templateId

  return new OpenAICompatibleProvider(
    config,
    templateId,
    name,
    baseUrl,
    template,
    userConfig
  )
}

/**
 * 获取 Provider 实例（旧版接口，保留兼容性）
 */
export function getProviderInstance(providerId: string, apiKey: string, endpoint?: string): BaseProvider | null {
  const ProviderClass = providerRegistry.get(providerId)
  if (!ProviderClass) {
    return null
  }

  const config: ProviderConfig = {
    apiKey,
    baseUrl: endpoint
  }

  return new ProviderClass(config)
}

/**
 * 获取所有已注册的 Provider ID
 */
export function getRegisteredProviders(): string[] {
  return Array.from(providerRegistry.keys())
}

/**
 * 获取支持的模板 ID 列表
 */
export function getSupportedTemplateIds(): string[] {
  return [
    ...Object.keys(OPENAI_COMPATIBLE_CONFIGS),
    'anthropic',
    'google'
  ]
}
