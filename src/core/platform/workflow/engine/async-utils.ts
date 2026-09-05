/**
 * 工作流模块异步工具（模块内唯一实现）
 * @module core/platform/workflow/engine/async-utils
 * @description signal 感知的 sleep 与轮询、错误信息提取——引擎与节点共用。
 */

/** 可中断 sleep：onAbort='resolve' 供引擎重试路径（醒后自查 aborted），'reject' 供节点中断 */
export function sleepAbortable(
  ms: number,
  signal: AbortSignal,
  onAbort: 'resolve' | 'reject' = 'resolve'
): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(finish, ms)
    function finish() {
      clearTimeout(t)
      signal.removeEventListener('abort', onAbort)
      resolve()
    }
    function onAbort() {
      clearTimeout(t)
      if (onAbort === 'reject') reject(new Error('已取消'))
      else resolve()
    }
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** 信号感知轮询：间隔期取消即时响应（内部用 sleepAbortable，不等满一个 interval） */
export async function pollUntil<T>(
  check: () => Promise<T | undefined>,
  opts: { intervalMs: number; timeoutMs: number; signal: AbortSignal }
): Promise<T> {
  const deadline = Date.now() + opts.timeoutMs
  while (Date.now() < deadline) {
    if (opts.signal.aborted) throw new Error('已取消')
    const result = await check()
    if (result !== undefined) return result
    await sleepAbortable(opts.intervalMs, opts.signal, 'reject').catch(() => {
      throw new Error('已取消')
    })
  }
  throw new Error('等待超时')
}

/** 错误信息提取（模块内唯一实现） */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
