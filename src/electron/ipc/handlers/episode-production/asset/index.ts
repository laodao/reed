/**
 * episode-production · 资产域 IPC handler barrel
 * @module electron/ipc/handlers/episode-production/asset
 * @description 资产相关 register 函数的统一出口；上层注册中心 import 此 barrel。
 */

export { registerCharacterAssetHandlers } from './character-asset.handler'
export { registerLocationAssetHandlers } from './location-asset.handler'
export { registerItemAssetHandlers } from './item-asset.handler'
export { registerVoiceAssetHandlers } from './voice-asset.handler'
export { registerAssetImageHandlers } from './asset-image.handler'
export { registerDerivationHandlers } from './derivation.handler'
export { registerImportHandlers } from './import.handler'
