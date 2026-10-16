/**
 * 真实素材库 Provider 装配
 * @module platform/providers/stock
 * @description 素材库（Pexels / Pixabay）工厂与清单：上层只按 id 取 provider，
 *              新增素材库 = 新增一个 BaseStockProvider 子类 + 在此登记。
 */

import type { StockMediaProviderId } from '@shared/types/stock-media.types'
import { BaseStockProvider, type StockProviderConfig } from './base-stock-provider'
import { PexelsStockProvider } from './pexels-stock.provider'
import { PixabayStockProvider } from './pixabay-stock.provider'

export { BaseStockProvider } from './base-stock-provider'
export type { StockProviderConfig } from './base-stock-provider'
export { PexelsStockProvider } from './pexels-stock.provider'
export { PixabayStockProvider } from './pixabay-stock.provider'

/** 素材库清单（顺序=默认择优顺序：Pexels 优先，实测更稳） */
export const STOCK_PROVIDER_IDS: StockMediaProviderId[] = ['pexels', 'pixabay']

/** 素材库展示名（表单/日志用） */
export const STOCK_PROVIDER_NAMES: Record<StockMediaProviderId, string> = {
  pexels: 'Pexels',
  pixabay: 'Pixabay',
}

/** 是否是受支持的素材库 id */
export function isStockProviderId(v: unknown): v is StockMediaProviderId {
  return typeof v === 'string' && (STOCK_PROVIDER_IDS as string[]).includes(v)
}

/** 创建素材库 provider（未知 id 抛错，避免静默走错源） */
export function createStockProvider(
  id: StockMediaProviderId | string,
  config: StockProviderConfig,
): BaseStockProvider {
  switch (id) {
    case 'pexels':
      return new PexelsStockProvider(config)
    case 'pixabay':
      return new PixabayStockProvider(config)
    default:
      throw new Error(`未知素材库 provider：${String(id)}（可选：${STOCK_PROVIDER_IDS.join(' / ')}）`)
  }
}