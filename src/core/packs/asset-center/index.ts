/**
 * 资产中心内置业务包（后端接线）
 * @module core/packs/asset-center
 * @description 物理收拢式：handler 已搬入包目录（./handlers/asset.handler，
 *              18 个 asset:* channel），本包在 activate 时调用其
 *              registerAssetHandlers()。
 *              通用资产服务层（@core/platform/assets：asset.service/asset-storage/
 *              asset-registry 等）被工作流 save-asset/read-asset 节点与其他包
 *              （episode-production 等）共用，留在原地不搬——本包收编的是
 *              "资产中心"这个用户界面对应的 IPC 与 UI。
 *              manifest 的 id/name/version 与前端骨架（renderer/packs/asset-center）
 *              保持一致。
 *
 *              归属说明：handler 全部 18 个 channel 均为 asset:* 前缀，单前缀完整覆盖。
 *
 *              禁用语义本期到"IPC 守卫统一拦截 asset:*"为止——handler 注册保留、
 *              服务单例不卸载（工作流节点仍可直接落资产），故 activate 不返回 disposer。
 */

import { registerAssetHandlers } from './handlers/asset.handler'
import type { PackDefinition } from '../registry'

export const assetCenterPack: PackDefinition = {
  manifest: {
    id: 'asset-center',
    name: '资产管理',
    version: '1.0.0',
    description: '工作流成果统一沉淀——按分类查看、预览、复用',
    contributions: {
      ipcChannelPrefixes: ['asset:'],
    },
  },
  activate() {
    registerAssetHandlers()
  },
}
