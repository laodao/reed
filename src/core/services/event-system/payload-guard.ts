/**
 * 事件载荷安全守卫（纯函数）
 * @module core/services/event-system/payload-guard
 * @description 设计规格：10-event-system.md §8。
 *              - payload 顶层键命中密钥模式 → 拒绝发布（fail-fast 抛错给生产者，
 *                不静默脱敏——静默会产生"看似发布成功"的幻觉）
 *              - 深层嵌套键只做 warn 扫描
 *              - 序列化后超 64KB → 拒绝并提示改用引用形态 { ref: { kind, id } }
 */

import { createLogger } from '@core/utils/logger'

const logger = createLogger('EventPayloadGuard')

/** 密钥键名模式（§8）：顶层命中即拒绝 */
export const SECRET_KEY_PATTERN =
  /pass(word)?|secret|token|api[_-]?key|credential|private[_-]?key/i

/** payload 序列化上限（§8，默认 64KB） */
export const MAX_PAYLOAD_BYTES = 64 * 1024

/** 载荷违规（密钥键名 / 超上限 / 不可序列化等生产者 bug），fail-fast */
export class EventPayloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EventPayloadError'
  }
}

/** 嵌套扫描的最大深度（防循环引用栈溢出；循环本身由 JSON.stringify 拦截） */
const DEEP_SCAN_MAX_DEPTH = 8

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
      `[EventBus] payload 不可序列化（含循环引用或 BigInt）：${e instanceof Error ? e.message : e}`
    )
  }
  const bytes = Buffer.byteLength(json, 'utf8')
  if (bytes > MAX_PAYLOAD_BYTES) {
    throw new EventPayloadError(
      `[EventBus] payload 超过 ${MAX_PAYLOAD_BYTES / 1024}KB 上限（实际 ${Math.ceil(bytes / 1024)}KB）——` +
        `请改用引用形态 { ref: { kind, id } }（10-event-system §8）`
    )
  }
  if (payload !== null && typeof payload === 'object') {
    // 顶层键：命中即拒绝（fail-fast）
    for (const key of Object.keys(payload as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        throw new EventPayloadError(
          `[EventBus] payload 顶层键 "${key}" 命中密钥模式，拒绝发布（10-event-system §8：不静默脱敏）`
        )
      }
    }
    // 深层嵌套键：只 warn
    warnDeepSecretKeys(payload as Record<string, unknown>, '', 0)
  }
  return json
}

function warnDeepSecretKeys(value: unknown, path: string, depth: number): void {
  if (depth >= DEEP_SCAN_MAX_DEPTH || value === null || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key
    if (SECRET_KEY_PATTERN.test(key)) {
      logger.warn(`[EventBus] payload 嵌套键 "${childPath}" 命中密钥模式（仅告警，请尽快剔除）`)
    }
    warnDeepSecretKeys(child, childPath, depth + 1)
  }
}
