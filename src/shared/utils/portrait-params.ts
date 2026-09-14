/**
 * 画像参数持有者（进程级；启动注入 + settings 保存后重注入）
 * @module shared/utils/portrait-params
 *
 * 与其它模块参数持有者同构（共用 `param-holder` 工厂）。
 * settings 键：`portrait:image`。解析走登记表（`PORTRAIT_PARAMS`），与设置页同一口径。
 */

import { SETTINGS_KEYS } from '../constants/settings-keys'
import { PORTRAIT_PARAMS } from '../constants/module-params/portrait.params'
import {
  PORTRAIT_DEFAULTS,
  PORTRAIT_LIMITS,
  type PortraitRuntimeParams,
} from '../types/portrait-params.types'
import { createParamHolder, pickNumericFields } from './param-holder'
import { resolveModuleParams } from './module-params'

const holder = createParamHolder({
  defaults: PORTRAIT_DEFAULTS,
  limits: PORTRAIT_LIMITS,
})

/** 读当前生效值（使用点现读；未注入时即内置默认 = 改造前的常量） */
export function portraitParams(): PortraitRuntimeParams {
  return holder.get() as PortraitRuntimeParams
}

/** 注入生效值（非法项保留原值、超限夹取） */
export function setPortraitParams(patch: Partial<PortraitRuntimeParams>): PortraitRuntimeParams {
  return holder.set(patch) as PortraitRuntimeParams
}

/** 测试隔离用：回到内置默认 */
export function resetPortraitParams(): void {
  holder.reset()
}

/** 从 settings 载荷解析（键 `portrait:image`） */
export function portraitParamsFromSettings(rawByKey: Record<string, unknown>): PortraitRuntimeParams {
  const tree = resolveModuleParams(PORTRAIT_PARAMS, rawByKey).trees
  return {
    image: pickNumericFields(tree[SETTINGS_KEYS.portraitImage], PORTRAIT_DEFAULTS.image),
  }
}

/** 便捷：全身合成强度（0~1 小数形态；调用 ImageService 的口径不变） */
export function portraitFullBodyStrength(): number {
  return portraitParams().image.fullBodyStrengthPercent / 100
}

/** 便捷：面部/变体强度（0~1 小数形态） */
export function portraitFaceStrength(): number {
  return portraitParams().image.faceStrengthPercent / 100
}
