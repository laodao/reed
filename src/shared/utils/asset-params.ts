/**
 * 素材与图片参数持有者（进程级；启动注入 + settings 保存后重注入）
 * @module shared/utils/asset-params
 *
 * 与其它模块参数持有者同构（共用 `param-holder` 工厂）。三个 settings 键：
 * `asset:limits`（素材下载/网页收藏/整页归档）、`favicon:fetch`（站点图标）、
 * `image:polling`（图片任务轮询）。解析走登记表，与设置页同一口径。
 */

import { SETTINGS_KEYS } from '../constants/settings-keys'
import { ASSET_PARAMS } from '../constants/module-params/asset.params'
import {
  ASSET_DEFAULTS,
  ASSET_LIMITS,
  type AssetRuntimeParams,
} from '../types/asset-params.types'
import { createParamHolder, pickNumericFields } from './param-holder'
import { resolveModuleParams } from './module-params'

const holder = createParamHolder({
  defaults: ASSET_DEFAULTS,
  limits: ASSET_LIMITS,
})

/** 读当前生效值（使用点现读；未注入时即内置默认 = 改造前的常量） */
export function assetParams(): AssetRuntimeParams {
  return holder.get() as AssetRuntimeParams
}

/** 注入生效值（非法项保留原值、超限夹取） */
export function setAssetParams(patch: Partial<AssetRuntimeParams>): AssetRuntimeParams {
  return holder.set(patch) as AssetRuntimeParams
}

/** 测试隔离用：回到内置默认 */
export function resetAssetParams(): void {
  holder.reset()
}

/** 从 settings 载荷解析（按键给出三个键） */
export function assetParamsFromSettings(rawByKey: Record<string, unknown>): AssetRuntimeParams {
  const tree = resolveModuleParams(ASSET_PARAMS, rawByKey).trees
  return {
    asset: pickNumericFields(tree[SETTINGS_KEYS.assetLimits], ASSET_DEFAULTS.asset),
    favicon: pickNumericFields(tree[SETTINGS_KEYS.faviconFetch], ASSET_DEFAULTS.favicon),
    image: pickNumericFields(tree[SETTINGS_KEYS.imagePolling], ASSET_DEFAULTS.image),
  }
}
