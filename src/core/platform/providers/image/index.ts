/**
 * 图像 Provider 模块入口
 * @module image-providers
 * @description 图像生成 Provider 的工厂和导出
 */

import type {
  ImageProviderConfig,
  ImageProviderType
} from '@shared/types/image-provider.types'
import { BaseImageProvider } from './base-image-provider'

// SDK Provider 导入
import { OpenAIImageProvider } from './sdk/openai-image.provider'
import { VolcengineImageProvider } from './sdk/volcengine-image.provider'
import { ComfyUIImageProvider } from './sdk/comfyui-image.provider'

// DashScope Provider（使用 Bearer Token 认证）
import { DashScopeImageProvider } from './dashscope-image.provider'

// AI Hub 统一网关（account session JWT，任务 API 适配器内同步化）
import { AihubImageProvider } from './aihub-image.provider'

// 保留旧的实现（使用阿里云签名认证）
import { BailianImageProvider } from './bailian-image.provider'

// 导出基类
export { BaseImageProvider }

// 导出 SDK Provider
export * from './sdk'

// 导出 Provider 实现
export { DashScopeImageProvider, BailianImageProvider, VolcengineImageProvider, AihubImageProvider }

/**
 * Provider 类映射表
 * dashscope: 使用 DashScope API（Bearer Token 认证）
 * bailian: 使用百炼平台 API（阿里云签名认证，需要 AccessKeyId:AccessKeySecret）
 * volcengine: 使用火山引擎方舟平台 API（OpenAI 兼容格式）
 * openai: 使用 OpenAI DALL-E API
 * comfyui: 本地 ComfyUI 生成网关（无密钥，baseUrl 指向局域网网关）
 */
const PROVIDER_CLASSES: Record<string, new (config: ImageProviderConfig) => BaseImageProvider> = {
  // DashScope 使用 Bearer Token 认证（推荐）
  dashscope: DashScopeImageProvider,
  // 百炼平台使用阿里云签名认证
  bailian: BailianImageProvider,
  // 火山引擎使用 OpenAI 兼容 API
  volcengine: VolcengineImageProvider,
  // OpenAI DALL-E 使用官方 SDK
  openai: OpenAIImageProvider,
  // ComfyUI 本地生成网关（局域网自建，免密钥）
  comfyui: ComfyUIImageProvider,
  // AI Hub 统一网关（登录物化 JWT 鉴权）
  aihub: AihubImageProvider
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
  dashscope: {
    type: 'dashscope',
    name: 'DashScope (通义万相)',
    description: '阿里云 DashScope 平台，使用 Bearer Token 认证',
    requiresApiKey: true
  },
  bailian: {
    type: 'bailian',
    name: '百炼平台',
    description: '阿里云百炼平台，支持通义万相图像生成模型（需要 AccessKey）',
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
  comfyui: {
    type: 'comfyui',
    name: 'ComfyUI 生成网关',
    description: '局域网自建 ComfyUI 生成网关（Krea2/Flux Kontext），无需 API Key',
    requiresApiKey: false
  },
  aihub: {
    type: 'aihub',
    name: 'AI Hub（统一网关）',
    description: 'AI Hub 统一模型网关（登录即用，按余额计费）',
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
