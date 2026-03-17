/**
 * AI Provider 工厂
 * @module providers/index
 * @description Provider 实例工厂
 */

import type { BaseProvider, ProviderConfig } from './base-provider'

/**
 * 已注册的 Provider 构造函数映射
 */
const providerRegistry = new Map<string, new (config: ProviderConfig) => BaseProvider>()

/**
 * 注册 Provider
 */
export function registerProvider(id: string, providerClass: new (config: ProviderConfig) => BaseProvider): void {
  providerRegistry.set(id, providerClass)
}

/**
 * 获取 Provider 实例
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

// 导出基类
export * from './base-provider'
