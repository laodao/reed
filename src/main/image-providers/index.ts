/**
 * 图像 Provider 模块入口
 * @module image-providers
 * @description 图像生成 Provider 的工厂和导出
 */

import type {
  ImageProviderConfig,
  ImageProvider as IImageProvider,
  ImageProviderType
} from '../../shared/types/image-provider.types'
import { BaseImageProvider } from './base-image-provider'

// SDK Provider 导入
import { OpenAIImageProvider } from './sdk/openai-image.provider'

// 保留旧的实现
import { BailianImageProvider } from './bailian-image.provider'

// 导出基类
export { BaseImageProvider }

// 导出 SDK Provider
export * from './sdk'

// 导出旧实现
export { BailianImageProvider }

/**
 * Provider 类映射表
 * 注意：百炼平台暂不支持官方 SDK 图像生成，保留手动签名实现
 */
const PROVIDER_CLASSES: Record<string, new (config: ImageProviderConfig) => BaseImageProvider> = {
  // 百炼平台使用旧的手动签名实现
  bailian: BailianImageProvider,
  // OpenAI DALL-E 使用官方 SDK
  openai: OpenAIImageProvider
}

/**
 * Provider 信息定义
 */
export const IMAGE_PROVIDER_DEFINITIONS: Record<ImageProviderType, {
  type: ImageProviderType
  name: string
  description: string
  requiresApiKey: boolean
}> = {
  bailian: {
    type: 'bailian',
    name: '百炼平台',
    description: '阿里云百炼平台，支持通义万相图像生成模型',
    requiresApiKey: true
  },
  volcengine: {
    type: 'volcengine',
    name: '火山引擎',
    description: '火山引擎图像生成服务',
    requiresApiKey: true
  },
  minimax: {
    type: 'minimax',
    name: 'Minimax',
    description: 'Minimax 图像生成服务',
    requiresApiKey: true
  },
  zhipu: {
    type: 'zhipu',
    name: '智谱 AI',
    description: '智谱 AI 图像生成服务',
    requiresApiKey: true
  },
  custom: {
    type: 'custom',
    name: '自定义 Provider',
    description: '自定义图像生成 Provider',
    requiresApiKey: true
  }
}

/**
 * 创建图像 Provider 实例
 *
 * @param type - Provider 类型
 * @param config - Provider 配置
 * @returns Provider 实例
 * @throws 如果 Provider 类型不支持
 */
export function createImageProvider(
  type: ImageProviderType,
  config: ImageProviderConfig
): BaseImageProvider {
  const ProviderClass = PROVIDER_CLASSES[type]

  if (!ProviderClass) {
    throw new Error(`不支持的图像 Provider 类型: ${type}`)
  }

  return new ProviderClass(config)
}

/**
 * 获取所有可用的 Provider 类型
 *
 * @returns Provider 类型列表
 */
export function getAvailableProviderTypes(): ImageProviderType[] {
  return Object.keys(PROVIDER_CLASSES) as ImageProviderType[]
}

/**
 * 获取 Provider 定义
 *
 * @param type - Provider 类型
 * @returns Provider 定义
 */
export function getProviderDefinition(type: ImageProviderType) {
  return IMAGE_PROVIDER_DEFINITIONS[type]
}

/**
 * 检查 Provider 是否已实现
 *
 * @param type - Provider 类型
 * @returns 是否已实现
 */
export function isProviderImplemented(type: ImageProviderType): boolean {
  return type in PROVIDER_CLASSES
}
