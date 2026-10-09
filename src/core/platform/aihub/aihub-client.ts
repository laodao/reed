/**
 * AI Hub HTTP 客户端
 * @module platform/aihub/client
 * @description ai-hub 账号/计费/模型/任务类请求的唯一出口。
 *              边界：LLM 聊天请求不经过本 client（走 OpenAICompatibleProvider）。
 *
 *              - 每个请求注入 Authorization: Bearer <jwt>（jwt 为空时不注入，用于 login/register）
 *              - 信封端点（/api/*、/v1/tasks*、/v1/*\/generations）统一解包 {code,message,data}，
 *                code !== 0 抛 AihubError
 *              - OpenAI 裸格式端点（/v1/models）不解包，直接返回 JSON
 *              - HTTP 401 抛 AihubHttpError(401)，由调用方（auth service）处理会话失效
 */

import type { AihubEnvelope } from './aihub.types'

/** ai-hub 业务错误（信封 code !== 0 或网络/协议异常） */
export class AihubError extends Error {
  readonly code: number
  readonly traceId?: string

  constructor(code: number, message: string, traceId?: string) {
    super(message)
    this.name = 'AihubError'
    this.code = code
    this.traceId = traceId
  }
}

/** ai-hub HTTP 层错误（非 2xx；401 供会话失效判定） */
export class AihubHttpError extends Error {
  readonly status: number
  readonly body: string

  constructor(status: number, body: string) {
    super(`AI Hub 请求失败: HTTP ${status}`)
    this.name = 'AihubHttpError'
    this.status = status
    this.body = body
  }
}

export interface AihubRequestOptions {
  /** 网关地址（不含 /v1 版本段） */
  gatewayUrl: string
  /** 请求路径（含 / 前缀，如 /api/account/login、/v1/models） */
  path: string
  /** Bearer JWT；缺省/空串不注入（登录/注册） */
  jwt?: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** JSON body（对象）；GET 请求忽略 */
  body?: unknown
  /** 超时毫秒；缺省 15s */
  timeoutMs?: number
}

/** 规整网关地址：去尾部斜杠与 /v1 版本段（调用方 path 自带版本段） */
export function normalizeGatewayUrl(gatewayUrl: string): string {
  return (gatewayUrl || '').trim().replace(/\/+$/, '').replace(/\/v1$/, '')
}

/** 请求基础封装：超时 + JSON 序列化 + Bearer 注入，返回解析后的 JSON */
async function rawRequest<T = unknown>(opts: AihubRequestOptions): Promise<T> {
  const base = normalizeGatewayUrl(opts.gatewayUrl)
  if (!base) throw new AihubError(-1, '未配置 AI Hub 网关地址')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000)
  let res: Response
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (opts.jwt) headers['Authorization'] = `Bearer ${opts.jwt}`
    res = await fetch(`${base}${opts.path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined && (opts.method ?? 'GET') !== 'GET'
        ? JSON.stringify(opts.body)
        : undefined,
      signal: controller.signal
    })
  } catch (e) {
    const msg = e instanceof Error && e.name === 'AbortError'
      ? `AI Hub 请求超时（${opts.timeoutMs ?? 15_000}ms）`
      : `无法连接 AI Hub 网关（${base}）`
    throw new AihubError(-1, msg, e instanceof Error ? e.message : undefined)
  } finally {
    clearTimeout(timer)
  }

  const text = await res.text()
  if (!res.ok) {
    throw new AihubHttpError(res.status, text)
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new AihubError(-1, `AI Hub 返回了非 JSON 响应（${opts.path}）`)
  }
}

/**
 * 信封端点请求：解包 {code,message,data}；code !== 0 抛 AihubError。
 * 适用：/api/account/*、/api/v1/me/*、/v1/tasks*、/v1/images|videos|music/generations。
 */
export async function aihubRequest<T = unknown>(opts: AihubRequestOptions): Promise<T> {
  const envelope = await rawRequest<AihubEnvelope<T>>(opts)
  if (envelope && typeof envelope === 'object' && 'code' in envelope) {
    if (envelope.code !== 0) {
      throw new AihubError(envelope.code, envelope.message || 'AI Hub 请求失败', envelope.trace_id)
    }
    return envelope.data as T
  }
  // 容错：端点未按信封返回时原样透传（与手册示例的行为差异交给调用方处理）
  return envelope as T
}

/**
 * OpenAI 裸格式端点请求（/v1/models）：不解包信封，直接返回 JSON。
 * 注意 /v1/models 返回 {object:"list", data:[...]}，不是统一信封。
 */
export async function aihubOpenAIRequest<T = unknown>(opts: AihubRequestOptions): Promise<T> {
  return rawRequest<T>(opts)
}
