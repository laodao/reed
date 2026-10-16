/**
 * agent-runtime 模块内共用异步工具（深度 review：loop 与 registry 两份 withTimeout
 * 复制粘贴且已漂移 unref 行为——收口一份）
 * @module core/platform/agent-runtime/runtime/async
 */

/** abort 感知睡眠（43号 O1 重试退避用）：signal 中止即拒绝（AbortError），否则到点 resolve */
export function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      return
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    t.unref?.()
    const onAbort = () => {
      clearTimeout(t)
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** 墙钟超时 + signal 中止（注意：超时不中止底层执行——仅切断等待，副作用由工具自身幂等保证） */
export function withTimeout<T>(p: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    // 已中止的 signal 永不再触发 abort 事件——立即拒绝（曾挂满墙钟才以 Timeout 收尾）
    if (signal?.aborted) {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      return
    }
    const t = setTimeout(() => reject(Object.assign(new Error('tool timeout'), { name: 'TimeoutError' })), ms)
    t.unref?.() // 工具等待不阻止进程退出
    const onAbort = () => {
      clearTimeout(t)
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    p.then(
      (v) => {
        clearTimeout(t)
        signal?.removeEventListener('abort', onAbort)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        signal?.removeEventListener('abort', onAbort)
        reject(e)
      },
    )
  })
}
