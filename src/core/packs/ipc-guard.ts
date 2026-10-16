/**
 * IPC 守卫（业务包启停在 IPC 面的执行点）
 * @module core/packs/ipc-guard
 * @description channel → packId 归属由包 manifest 的 contributions.ipcChannelPrefixes
 *              声明，kernel 启动时把"查注册表"的 resolver 绑定进来；bridge-adapter
 *              在注册 handler 时统一包一层 guardIpcHandler，Electron（ipcMain.handle）
 *              与 Web（invokeIpc → registerIpc 表）两条调用路径同时生效。
 *
 *              裁决规则：
 *              - 归属未知（没有任何包声明覆盖该 channel 的前缀）→ 一律放行；
 *              - 归属包 enabled → 放行；
 *              - 归属包 disabled/pending/failed → enforce 模式返回统一错误
 *                `{ success: false, error: { code: PACK_DISABLED, message } }`；
 *                warn 模式只打日志放行（上线前跑一轮抓归属遗漏用）。
 */

import { PACK_DISABLED_ERROR_CODE, type PackState } from '@shared/types/pack.types'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('PackIpcGuard')

export type PackGuardMode = 'warn' | 'enforce'

/** resolver 命中结果：channel 归属的包及其当前状态 */
export interface PackGuardHit {
  packId: string
  state: PackState
}

export type PackGuardResolver = (channel: string) => PackGuardHit | null

/** 禁用包 IPC 调用的统一错误响应（对齐 IpcResponse 惯例的 { success, error } 形态，
 *  error 细化为 { code, message } 以便前端按 code 编程式识别） */
export interface PackDisabledErrorResponse {
  success: false
  error: { code: typeof PACK_DISABLED_ERROR_CODE; message: string }
}

let resolver: PackGuardResolver | null = null
// 默认 enforce：明确属于某包且该包不可用的 channel 直接拦截
let mode: PackGuardMode = 'enforce'

/** kernel 启动时绑定归属裁决器；resetPackSubsystem 时传 null 解绑 */
export function bindPackGuardResolver(r: PackGuardResolver | null): void {
  resolver = r
}

export function setPackGuardMode(m: PackGuardMode): void {
  mode = m
}

export function getPackGuardMode(): PackGuardMode {
  return mode
}

/**
 * 包一层 handler：守卫拦截时返回统一错误（不调用原 handler）。
 * resolver 未绑定（包内核未启动，如单测环境）→ 全部放行。
 */
export function guardIpcHandler(
  channel: string,
  handler: (...args: unknown[]) => unknown | Promise<unknown>,
): (...args: unknown[]) => unknown | Promise<unknown> {
  return async (...args: unknown[]) => {
    const hit = resolver?.(channel) ?? null
    if (hit && hit.state !== 'enabled') {
      const message = `业务包 "${hit.packId}" 当前不可用（状态: ${hit.state}），channel "${channel}" 被拒绝`
      if (mode === 'enforce') {
        const res: PackDisabledErrorResponse = {
          success: false,
          error: { code: PACK_DISABLED_ERROR_CODE, message },
        }
        return res
      }
      logger.warn(`${message}（warn 模式放行）`)
    }
    return handler(...args)
  }
}
