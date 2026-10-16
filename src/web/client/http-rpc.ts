/**
 * Web 端 IPC over HTTP
 * @module web/client/http-rpc
 * @description 用 fetch 把 ipc.invoke(channel, ...args) 翻译成 POST /api/ipc/<channel>
 *              请求体 { args: [...] }，响应体 { ok, data, error }。
 */

export class HttpRpcError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly channel: string,
  ) {
    super(message)
  }
}

let baseUrl = ''

/**
 * 设置 API 基址。默认空串（同源）。
 */
export function configureRpcBase(url: string): void {
  baseUrl = url.replace(/\/$/, '')
}

export async function rpcInvoke<T = unknown>(
  channel: string,
  ...args: unknown[]
): Promise<T> {
  const resp = await fetch(`${baseUrl}/api/ipc/${encodeURIComponent(channel)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ args }),
  })
  let body: any
  try {
    body = await resp.json()
  } catch {
    throw new HttpRpcError(`非 JSON 响应（status=${resp.status}）`, resp.status, channel)
  }
  if (!resp.ok || !body.ok) {
    throw new HttpRpcError(body?.error ?? `请求失败 (${resp.status})`, resp.status, channel)
  }
  return body.data as T
}
