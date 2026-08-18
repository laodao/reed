/**
 * 节点共享 HTTP 执行（C5 从 http-request 抽出）
 * @module core/modules/workflow/nodes/http-fetch
 * @description http-request 与 oas-tool 共用：超时封顶、取消信号合并、
 *              响应统一 { status, body, json?, headers } 输出形状。
 */

import { WORKFLOW_DEFAULTS, WORKFLOW_LIMITS } from '@shared/types/workflow.types'

export interface HttpFetchInput {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}

export interface HttpFetchOutput {
  status: number
  body: string
  json?: unknown
  headers: Record<string, string>
}

/**
 * 执行请求。网络层错误返回 error 字符串（节点语义失败，可走重试/fail 边）。
 */
export async function executeHttpFetch(
  input: HttpFetchInput,
  cancelSignal: AbortSignal
): Promise<{ ok: true; output: HttpFetchOutput } | { ok: false; error: string }> {
  const timeout = Math.min(input.timeoutMs ?? WORKFLOW_DEFAULTS.httpRequestTimeoutMs, WORKFLOW_LIMITS.httpTimeoutMs)
  // 运行取消信号 + 超时信号合并
  const signal = AbortSignal.any([cancelSignal, AbortSignal.timeout(timeout)])
  let res: Response
  try {
    res = await fetch(input.url, {
      method: input.method,
      headers: input.headers ?? {},
      body: input.body && input.method !== 'GET' ? input.body : undefined,
      signal,
    })
  } catch (e) {
    return { ok: false, error: `请求失败: ${e instanceof Error ? e.message : String(e)}` }
  }
  const body = await res.text()
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    json = undefined
  }
  const headers: Record<string, string> = {}
  res.headers.forEach((v, k) => {
    headers[k] = v
  })
  return {
    ok: true,
    output: {
      status: res.status,
      body,
      ...(json !== undefined ? { json } : {}),
      headers,
    },
  }
}
