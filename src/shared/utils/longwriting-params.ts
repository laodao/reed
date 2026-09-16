/**
 * 长文写作参数持有者（进程级；启动注入 + settings 保存后重注入）
 * @module shared/utils/longwriting-params
 *
 * 与其它模块参数持有者同构（共用 `param-holder` 工厂）：默认 → settings 覆盖 → 硬上限夹取 →
 * 分组一致性修正 → 使用点现读；保存后由 `settings-reload` 重注入，不必重启。
 *
 * 两个 settings 键：`longwriting:writing`（章节生成主链）、`longwriting:storyRoom`（故事研讨室）。
 * 解析走登记表（`LONGWRITING_PARAMS` 的 `resolveModuleParams`），与设置页同一口径。
 *
 * 注：`param-holder` 只承载**数字**参数；本模块登记表里的参数全部是数字。
 */

import { SETTINGS_KEYS } from '../constants/settings-keys'
import { LONGWRITING_PARAMS } from '../constants/module-params/longwriting.params'
import {
  LONGWRITING_DEFAULTS,
  LONGWRITING_LIMITS,
  type LongwritingRuntimeParams,
} from '../types/longwriting-params.types'
import { createParamHolder, pickNumericFields } from './param-holder'
import { resolveModuleParams } from './module-params'

const holder = createParamHolder({
  defaults: LONGWRITING_DEFAULTS,
  limits: LONGWRITING_LIMITS,
  /**
   * 研讨室一致性护栏：单次压缩轮数不得大于摘要触发轮数。
   * 否则 `summarizedTurn + batch` 会越过当前轮号，水位跳到未来 → 中间轮次永远不会被摘要。
   * 设置页解析时做同样修正并给出说明（`longwriting.params.ts` 的 crossFieldGuard）。
   */
  normalize: (groups) => {
    const room = groups.storyRoom
    if (room && room.summaryBatchTurns > room.summaryThresholdTurns) {
      room.summaryBatchTurns = room.summaryThresholdTurns
    }
  },
})

/** 读当前生效值（使用点现读；未注入时即内置默认 = 改造前的常量） */
export function longwritingParams(): LongwritingRuntimeParams {
  return holder.get()
}

/** 注入生效值（非法项保留原值、超限夹取、分组一致性修正） */
export function setLongwritingParams(
  patch: Partial<LongwritingRuntimeParams>,
): LongwritingRuntimeParams {
  return holder.set(patch)
}

/** 测试隔离用：回到内置默认 */
export function resetLongwritingParams(): void {
  holder.reset()
}

/** 从 settings 载荷解析（按键给出：`longwriting:writing` / `longwriting:storyRoom`） */
export function longwritingParamsFromSettings(
  rawByKey: Record<string, unknown>,
): LongwritingRuntimeParams {
  const tree = resolveModuleParams(LONGWRITING_PARAMS, rawByKey).trees
  return {
    writing: pickNumericFields(tree[SETTINGS_KEYS.longwritingWriting], LONGWRITING_DEFAULTS.writing),
    storyRoom: pickNumericFields(
      tree[SETTINGS_KEYS.longwritingStoryRoom],
      LONGWRITING_DEFAULTS.storyRoom,
    ),
  }
}
