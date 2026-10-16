/**
 * 事件载荷安全守卫（纯函数）
 * @module core/platform/services/event-system/payload-guard
 * @description 设计规格：10-event-system.md §8。
 *              - payload 顶层键命中密钥模式 → 拒绝发布（fail-fast 抛错给生产者，
 *                不静默脱敏——静默会产生"看似发布成功"的幻觉）
 *              - 深层嵌套键只做 warn 扫描
 *              - 序列化后超上限 → 拒绝并提示改用引用形态 { ref: { kind, id } }
 *
 * 两个阈值（体积 / 扫描深度）自 2026-09-13 起走「参数设置」配置链：设置页「事件系统」Tab →
 * settings 表 `agent:budget.guards.maxEventPayloadBytes` / `.maxDeepScanDepth` →
 * 启动时注入 `shared/utils/runtime-limits`（改完需重启客户端，设置页已如实提示）。
 * 下面导出的常量是**内置默认值**（= 改造前写死的 64KB / 8），解析失败时兜底。
 */

import { createLogger } from '@core/utils/logger'
import { runtimeLimits } from '@shared/utils/runtime-limits'

const logger = createLogger('EventPayloadGuard')

/** 密钥键名模式（§8）：顶层命中即拒绝 */
export const SECRET_KEY_PATTERN =
  /pass(word)?|secret|token|api[_-]?key|credential|private[_-]?key/i

/** payload 序列化上限的内置默认值（§8，64KB；可被设置页覆盖） */
export const MAX_PAYLOAD_BYTES = 64 * 1024

/** 载荷违规（密钥键名 / 超上限 / 不可序列化等生产者 bug），fail-fast */
export class EventPayloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EventPayloadError'
  }
}

/** 嵌套扫描最大深度的内置默认值（防循环引用栈溢出；可被设置页覆盖） */
const DEEP_SCAN_MAX_DEPTH = 8

/** 取生效的事件载荷体积上限（未注入时为内置默认） */
function maxPayloadBytes(): number {
  const v = runtimeLimits().maxEventPayloadBytes
  return Number.isFinite(v) && v > 0 ? v : MAX_PAYLOAD_BYTES
}

/** 取生效的嵌套扫描深度（未注入时为内置默认） */
function deepScanMaxDepth(): number {
  const v = runtimeLimits().maxEventScanDepth
  return Number.isFinite(v) && v > 0 ? v : DEEP_SCAN_MAX_DEPTH
}

/**
 * 发布前校验载荷。违规抛 EventPayloadError；深层密钥键名仅 warn。
 * @returns 序列化后的 JSON 字符串（调用方落库复用，避免二次 stringify）
 */
export function assertPayloadSafe(payload: unknown): string {
  let json: string
  try {
    json = JSON.stringify(payload ?? null)
  } catch (e) {
    throw new EventPayloadError(
      `[EventBus] payload 不可序列化（含循环引用或 BigInt）：${e instanceof Error ? e.message : e}`,
    )
  }
  const limit = maxPayloadBytes()
  const bytes = Buffer.byteLength(json, 'utf8')
  if (bytes > limit) {
    throw new EventPayloadError(
      `[EventBus] payload 超过 ${limit / 1024}KB 上限（实际 ${Math.ceil(bytes / 1024)}KB）——` +
        `请改用引用形态 { ref: { kind, id } }（10-event-system §8）`,
    )
  }
  if (payload !== null && typeof payload === 'object') {
    // 顶层键：命中即拒绝（fail-fast）
    for (const key of Object.keys(payload as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        throw new EventPayloadError(
          `[EventBus] payload 顶层键 "${key}" 命中密钥模式，拒绝发布（10-event-system §8：不静默脱敏）`,
        )
      }
    }
    // 深层嵌套键：只 warn
    warnDeepSecretKeys(payload as Record<string, unknown>, '', 0, deepScanMaxDepth())
  }
  return json
}

function warnDeepSecretKeys(value: unknown, path: string, depth: number, maxDepth: number): void {
  if (depth >= maxDepth || value === null || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key
    if (SECRET_KEY_PATTERN.test(key)) {
      logger.warn(`[EventBus] payload 嵌套键 "${childPath}" 命中密钥模式（仅告警，请尽快剔除）`)
    }
    warnDeepSecretKeys(child, childPath, depth + 1, maxDepth)
  }
}
