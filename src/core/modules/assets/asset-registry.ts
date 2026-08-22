/**
 * 资产服务注册器
 * @module core/modules/assets/asset-registry
 * @description workflow-boot 装配后注册单例；save-asset/read-asset 节点与 IPC handler 经 getter 取用。
 *              未注册时 getter 抛错（同 getToolService 纪律）。
 */

import { AssetService } from './asset.service'

let _assetService: AssetService | null = null

export function registerAssetService(svc: AssetService): void {
  _assetService = svc
}

export function getAssetService(): AssetService {
  if (!_assetService) {
    throw new Error('资产服务未注册（workflow-boot 装配失败或未调用）')
  }
  return _assetService
}

/** 测试/关停用 */
export function resetAssetService(): void {
  _assetService = null
}
