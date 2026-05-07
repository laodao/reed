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
export { registerPanoramaHandlers } from './panorama.handler'
// FU5-C1 项目级资产聚合（一次性返回 4 类 binding 主图状态 + 图谱细分计数）
export { registerAssetSummaryHandlers } from './asset-summary.handler'
// spec 2026-05-07 · AI 设定反推
export { registerAssetSettingEnrichmentHandlers } from './asset-setting-enrichment.handler'
