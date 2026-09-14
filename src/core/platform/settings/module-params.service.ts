/**
 * 模块参数读取服务（宿主侧；解析逻辑在 shared）
 * @module core/platform/settings/module-params.service
 *
 * 「参数设置」的**统一读取入口**：宿主想知道"我的参数现在生效值是多少"，走这里，
 * 不自己写 clamp、不自己拼默认值。
 *
 * 解析（内置默认 → 覆盖 → 硬上限夹取 → 跨字段修正 + 说明）在 `@shared/utils/module-params`
 * ——**主进程与设置页共用同一份**，避免"页面显示 40、实际跑 30"。
 * 本文件只负责**从 settings 读取并兜底**：配置缺失/读失败/格式坏都回落内置默认
 * （配置坏了绝不能让功能跑不起来），并给出原因说明。
 */

import {
  getModuleParams,
  MODULE_PARAMS,
} from '@shared/constants/module-params'
import type {
  ModuleParamDefinition,
  ModuleParamRawMap,
  ResolvedModuleParams,
} from '@shared/types/module-params.types'
import { moduleParamSettingsKeys, resolveModuleParams } from '@shared/utils/module-params'

/** 读取 settings 的最小端口（结构类型，避免 platform 依赖数据库层） */
export interface ModuleParamsSettingsPort {
  get(key: string): Promise<unknown>
}

/** 把某个模块需要的 settings 载荷读齐（读失败按"没配"处理并记说明） */
export async function loadModuleParamRaw(
  port: ModuleParamsSettingsPort | null | undefined,
  def: ModuleParamDefinition,
): Promise<{ raw: ModuleParamRawMap; notes: string[] }> {
  const keys = moduleParamSettingsKeys(def)
  if (!port) return { raw: {}, notes: [`settings 不可用，${def.name} 参数全部使用内置默认`] }
  const raw: ModuleParamRawMap = {}
  const notes: string[] = []
  for (const key of keys) {
    try {
      raw[key] = await port.get(key)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      notes.push(`读取 ${key} 失败（${msg}），该键下的参数使用内置默认`)
      raw[key] = null
    }
  }
  return { raw, notes }
}

/**
 * 解析一个模块的生效参数。
 * @param port settings 读取端口（Electron 的 `db.settings`）
 * @param key 模块标识（`MODULE_PARAMS` 里的 `key`）
 */
export async function loadModuleParams(
  port: ModuleParamsSettingsPort | null | undefined,
  key: string,
): Promise<ResolvedModuleParams> {
  const def = getModuleParams(key)
  if (!def) {
    return {
      moduleKey: key,
      values: {},
      trees: {},
      touched: {},
      notes: [`未登记的模块参数「${key}」`],
      groups: [],
    }
  }
  const { raw, notes } = await loadModuleParamRaw(port, def)
  const resolved = resolveModuleParams(def, raw)
  return { ...resolved, notes: [...notes, ...resolved.notes] }
}

/** 解析全部模块的生效参数（设置页/诊断页一次性取齐） */
export async function loadAllModuleParams(
  port: ModuleParamsSettingsPort | null | undefined,
): Promise<ResolvedModuleParams[]> {
  const out: ResolvedModuleParams[] = []
  for (const def of MODULE_PARAMS) out.push(await loadModuleParams(port, def.key))
  return out
}

/**
 * 取某模块的**生效值树**（宿主最常用的形态：直接拿结构）。
 * @example
 * ```ts
 * const params = await loadModuleParamTree<{ maxDurationMs?: number }>(db.settings, 'workflow')
 * ```
 */
export async function loadModuleParamTree<T extends Record<string, unknown>>(
  port: ModuleParamsSettingsPort | null | undefined,
  key: string,
): Promise<T> {
  const def = getModuleParams(key)
  if (!def) return {} as T
  const resolved = await loadModuleParams(port, key)
  return (resolved.trees[def.settingsKey] ?? {}) as T
}
