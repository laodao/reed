/**
 * agent-runtime 模块内共用异步工具（深度 review：loop 与 registry 两份 withTimeout
 * 复制粘贴且已漂移 unref 行为——收口一份）
 * @module core/platform/agent-runtime/runtime/async
 */

/** 墙钟超时 + signal 中止（注意：超时不中止底层执行——仅切断等待，副作用由工具自身幂等保证） */
export function withTimeout<T>(p: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
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
