/**
 * 长任务节点「提交」阶段瞬时失败内部重试工具（评审 #105，视频/图像共用）
 * @module core/platform/workflow/nodes/retry-submit
 * @description
 *  - 长任务节点（video-gen / image-gen 等）把耗时操作提交给外部服务（ComfyUI
 *    网关 / 云厂商）时，偶发瞬时网络失败：fetch 中断、连接断开、网关 5xx、超时。
 *    这类失败重试一次通常即恢复，不该直接废掉整场运行。
 *  - 本工具只作用于「提交响应」：仅当 resp.success=false 且错误符合瞬时特征时
 *    内部重试（默认最多 2 次尝试 = 首调 + 重试 1 次）。任务提交成功后异步执行
 *    中报 failed 属于真实失败，不在本工具范围内，调用方照常判错。
 */

export const sleepMs = (ms: number): Promise<void> => new Promise(res => setTimeout(res, ms))

/** 瞬时性提交失败特征（网络/连接/网关 5xx/超时）→ 允许内部重试一次 */
export function isTransientSubmitError(error?: string): boolean {
  if (!error) return false
  return /fetch failed|network|ECONN|EHOST|ETIMEDOUT|socket|网关返回 HTTP (5\d\d|0)|\b超时\b/i.test(error)
}

/** 重试所需的最小日志面（与 WorkflowNodeLogger 兼容） */
export interface RetrySubmitLogger {
  warn(message: string, extra?: unknown): void
}

export interface RetrySubmitOptions {
  /** 提交动作名（用于日志用语，如「视频」「图像」） */
  label: string
  logger?: RetrySubmitLogger
  /** 重试间隔毫秒（默认 3000 = 3 秒） */
  retryDelayMs?: number
  /** 最多尝试次数（默认 2 = 首调 + 重试 1 次） */
  maxAttempts?: number
}

/**
 * 对一次性提交做瞬时失败内部重试：
 * 仅当 resp.success=false 且错误符合瞬时特征时，等待 retryDelayMs 后重试，
 * 最多 maxAttempts 次；成功/非瞬时失败原样返回，调用方按既有逻辑判错。
 */
export async function submitWithTransientRetry<T extends { success: boolean; error?: string }>(
  submit: () => Promise<T>,
  opts: RetrySubmitOptions
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 2
  const retryDelayMs = opts.retryDelayMs ?? 3000
  let resp = await submit()
  for (let attempt = 1; attempt < maxAttempts && !resp.success && isTransientSubmitError(resp.error); attempt++) {
    opts.logger?.warn(`${opts.label}提交瞬时失败，${retryDelayMs / 1000} 秒后重试一次`, { error: resp.error })
    await sleepMs(retryDelayMs)
    resp = await submit()
  }
  return resp
}
