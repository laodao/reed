/**
 * 事件系统参数解析（纯函数）
 * @module shared/utils/event-params
 *
 * 事件总线 / 归档作业是**进程级单例**，只在启动装配时读一次参数
 * （设置页把这些项标为"改动需重启客户端"）。因此这里**不做持有者**——
 * 加一个没有任何"运行时现读点"的持有者等于引入无用机制；
 * 直接在装配处调用本函数从 settings 解析即可，口径仍与设置页一致（走登记表）。
 */

import { SETTINGS_KEYS } from '../constants/settings-keys'
import { EVENT_SYSTEM_PARAMS } from '../constants/module-params/event-system.params'
import {
  EVENT_PARAMS_DEFAULTS,
  type EventRuntimeParams,
} from '../types/event-params.types'
import { pickNumericFields } from './param-holder'
import { resolveModuleParams } from './module-params'

/** 从 settings 载荷解析事件系统参数（按键给出；缺失/非法回落内置默认） */
export function eventParamsFromSettings(
  rawByKey: Record<string, unknown>,
): EventRuntimeParams {
  const tree = resolveModuleParams(EVENT_SYSTEM_PARAMS, rawByKey).trees
  return {
    bus: pickNumericFields(tree[SETTINGS_KEYS.eventBus], EVENT_PARAMS_DEFAULTS.bus),
    archive: pickNumericFields(tree[SETTINGS_KEYS.eventArchive], EVENT_PARAMS_DEFAULTS.archive),
  }
}
