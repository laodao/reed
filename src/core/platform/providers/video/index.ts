/**
 * 视频 Provider 模块入口
 * @module video-providers
 * @description 视频生成 Provider 的工厂和导出
 */

import type {
  VideoProviderConfig,
  VideoProviderType
} from '@shared/types/video-provider.types'
import { BaseVideoProvider } from './base-video-provider'

// SDK Provider 导入
import { VolcengineVideoProvider } from './sdk/volcengine-video.provider'
import { BailianVideoProvider } from './sdk/bailian-video.provider'

// 导出基类
export { BaseVideoProvider }

// 导出 SDK Provider
export * from './sdk'

/**
 * Provider 类映射表
 */
const PROVIDER_CLASSES: Record<string, new (config: VideoProviderConfig) => BaseVideoProvider> = {
  volcengine: VolcengineVideoProvider,
  bailian: BailianVideoProvider,
  dashscope: BailianVideoProvider  // dashscope 使用相同的 Provider（百炼平台的 Bearer Token 认证）
}

/**
 * Provider 信息定义
 */
export const VIDEO_PROVIDER_DEFINITIONS: Record<VideoProviderType, {
  type: VideoProviderType
  name: string
  description: string
  requiresApiKey: boolean
}> = {
  bailian: {
    type: 'bailian',
    name: '阿里云百炼',
    description: '阿里云百炼平台视频生成服务（通义万相）',
    requiresApiKey: true
  },
  dashscope: {
    type: 'dashscope',
    name: 'DashScope',
    description: '阿里云 DashScope 视频生成服务（通义万相）',
    requiresApiKey: true
  },
  volcengine: {
    type: 'volcengine',
    name: '火山引擎',
    description: '火山引擎 Vidol 视频生成服务',
    requiresApiKey: true
  },
  runway: {
    type: 'runway',
    name: 'Runway',
    description: 'Runway Gen-3 视频生成服务',
    requiresApiKey: true
  },
  pika: {
    type: 'pika',
    name: 'Pika',
    description: 'Pika Labs 视频生成服务',
    requiresApiKey: true
  },
  kling: {
    type: 'kling',
    name: '可灵',
    description: '快手可灵视频生成服务',
    requiresApiKey: true
  },
  luma: {
    type: 'luma',
    name: 'Luma',
    description: 'Luma Dream Machine 视频生成服务',
    requiresApiKey: true
  },
  minimax: {
    type: 'minimax',
    name: 'Minimax',
    description: 'Minimax 视频生成服务',
    requiresApiKey: true
  },
  zhipu: {
    type: 'zhipu',
    name: '智谱 AI',
    description: '智谱 CogVideoX 视频生成服务',
    requiresApiKey: true
  },
  custom: {
    type: 'custom',
    name: '自定义 Provider',
    description: '自定义视频生成 Provider',
    requiresApiKey: true
  }
}

/**
 * 创建视频 Provider 实例
 *
 * @param type - Provider 类型
 * @param config - Provider 配置
 * @returns Provider 实例
 * @throws 如果 Provider 类型不支持
 */
export function createVideoProvider(
  type: VideoProviderType,
  config: VideoProviderConfig
): BaseVideoProvider {
  const ProviderClass = PROVIDER_CLASSES[type]

  if (!ProviderClass) {
    throw new Error(`不支持的视频 Provider 类型: ${type}`)
  }

  return new ProviderClass(config)
}

/**
 * 获取所有可用的 Provider 类型
 *
 * @returns Provider 类型列表
 */
export function getAvailableProviderTypes(): VideoProviderType[] {
  return Object.keys(PROVIDER_CLASSES) as VideoProviderType[]
}

/**
 * 获取 Provider 定义
 *
 * @param type - Provider 类型
 * @returns Provider 定义
 */
export function getProviderDefinition(type: VideoProviderType) {
  return VIDEO_PROVIDER_DEFINITIONS[type]
}

/**
 * 检查 Provider 是否已实现
 *
 * @param type - Provider 类型
 * @returns 是否已实现
 */
export function isProviderImplemented(type: VideoProviderType): boolean {
  return type in PROVIDER_CLASSES
}