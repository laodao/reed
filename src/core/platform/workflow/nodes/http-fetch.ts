/**
 * 节点共享 HTTP 执行（C5 从 http-request 抽出）
 * @module core/platform/workflow/nodes/http-fetch
 * @description http-request / tool-call / oas-tool 共用：超时封顶、取消信号合并、
 *              响应统一 { status, body, json?, headers } 输出形状。
 *
 *              响应处理模式（responseType）：
 *              - auto（默认）：按 content-type 判断——文本/JSON 走 body/json，二进制落盘 filePath
 *              - text / json：强制按文本/JSON 处理（JSON 解析失败不报错，json 为 undefined）
 *              - base64：二进制响应转 base64 字符串（小 payload 内联用，Web/桌面通吃）
 *              - file：二进制响应落盘（大文件推荐；落盘目录 outputDir，缺省 dataPath/workflow-media/http）
 *
 *              二进制与文本统一走 response-body 限长读取（评审 #100）：默认 50MB 上限，
 *              有 content-length 在读流前拒绝，无声明头时流式累计超限即中止。
 */

import * as fs from 'fs'
import * as path from 'path'
import { getPathProvider } from '@core/interfaces/path.interface'
import { WORKFLOW_LIMITS } from '@shared/types/workflow.types'
import { workflowRuntimeParams } from '@shared/utils/workflow-runtime-params'
import { validateOutboundUrl } from '@core/utils/outbound-url'
import { readBodyWithLimit } from './response-body'
import { outboundFetch } from '@core/utils/net-fetch'

export type HttpResponseType = 'auto' | 'text' | 'json' | 'base64' | 'file'

export interface HttpFetchInput {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
  /** 响应处理模式（缺省 auto） */
  responseType?: HttpResponseType
  /** file 模式的落盘目录（缺省 dataPath/workflow-media/http） */
  outputDir?: string
}

export interface HttpFetchOutput {
  status: number
  /** 文本模式下的响应体（二进制模式为空串） */
  body: string
  json?: unknown
  headers: Record<string, string>
  /** 二进制响应（base64 模式）：base64 字符串 */
  base64?: string
  /** 二进制响应（base64 模式）：data:<mime>;base64,...（可直接接保存资产节点） */
  dataUrl?: string
  /** 二进制响应（file/auto 模式）：落盘绝对路径 */
  filePath?: string
  /** 二进制响应：MIME 类型（来自 content-type 头） */
  mimeType?: string
  /** 二进制响应：字节数 */
  sizeBytes?: number
}

/** 按 content-type 判断是否为二进制内容（文本/JSON/XML/表单 之外视为二进制） */
function isBinaryContentType(contentType: string): boolean {
  const ct = contentType.split(';')[0].trim().toLowerCase()
  if (!ct) return false
  if (ct.startsWith('text/')) return false
  if (ct === 'application/json' || ct.endsWith('+json')) return false
  if (ct === 'application/xml' || ct.endsWith('+xml')) return false
  if (ct === 'application/x-www-form-urlencoded') return false
  if (ct === 'application/javascript') return false
  return true
}

/** 常见 MIME → 扩展名（落盘文件命名用，让 save-asset 能按扩展名自动分类） */
const MIME_EXT: Record<string, string> = {
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac',
  'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/opus': 'opus',
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/svg+xml': 'svg', 'image/bmp': 'bmp',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  'application/pdf': 'pdf', 'application/zip': 'zip',
}

function extForMime(mimeType: string): string {
  const key = mimeType.split(';')[0].trim().toLowerCase()
  return MIME_EXT[key] ?? 'bin'
}

/**
 * 执行请求。网络层错误返回 error 字符串（节点语义失败，可走重试/fail 边）。
 */
/** 重定向最大跟随跳数（每跳过 SSRF 闸门；防重定向环与跳板链） */
const MAX_REDIRECTS = 5

export async function executeHttpFetch(
  input: HttpFetchInput,
  cancelSignal: AbortSignal
): Promise<{ ok: true; output: HttpFetchOutput } | { ok: false; error: string }> {
  // SSRF 防护：url 用户可控（可经 {{模板}} 由运行输入注入），
  // 拒绝非 http/https 协议与内网/环回/保留地址（Web 端多租户必需）
  const guard = validateOutboundUrl(input.url)
  if (!guard.ok) {
    return { ok: false, error: `URL 校验失败：${guard.reason}` }
  }
  const timeout = Math.min(
    input.timeoutMs ?? workflowRuntimeParams().crawl.httpRequestTimeoutMs,
    WORKFLOW_LIMITS.httpTimeoutMs,
  )
  // 运行取消信号 + 超时信号合并
  const signal = AbortSignal.any([cancelSignal, AbortSignal.timeout(timeout)])
  // 重定向逐跳校验（总收口 review P2-3）：fetch 默认 follow 且不再过闸门——公网
  // 域名 302 跳内网/环回可绕 SSRF 防护（agent 工具把 URL 来源放宽到模型输出后被
  // 放大）。manual 跟随 ≤MAX_REDIRECTS 跳，每跳 Location 重过 validateOutboundUrl
  let currentUrl = input.url
  let currentBody = input.body && input.method !== 'GET' ? input.body : undefined
  let res: Response
  try {
    for (let hop = 0; ; hop++) {
      res = await outboundFetch()(currentUrl, {
        method: input.method,
        headers: input.headers ?? {},
        body: currentBody,
        redirect: 'manual',
        signal,
      })
      if (res.status < 300 || res.status >= 400) break
      const location = res.headers.get('location')
      if (!location) break
      if (hop >= MAX_REDIRECTS) {
        return { ok: false, error: `重定向超过 ${MAX_REDIRECTS} 跳上限：${currentUrl}` }
      }
      const nextUrl = new URL(location, currentUrl).toString()
      const nextGuard = validateOutboundUrl(nextUrl)
      if (!nextGuard.ok) {
        return { ok: false, error: `重定向目标未过 SSRF 闸门（${location}）：${nextGuard.reason}` }
      }
      currentUrl = nextUrl
      currentBody = undefined // 303/302 对 POST 的语义降级为 GET；简化：重定向后不带体
    }
  } catch (e) {
    return { ok: false, error: `请求失败: ${e instanceof Error ? e.message : String(e)}` }
  }

  const contentType = res.headers.get('content-type') ?? ''
  const mimeType = contentType.split(';')[0].trim() || 'application/octet-stream'
  const headers: Record<string, string> = {}
  res.headers.forEach((v, k) => {
    headers[k] = v
  })

  // 决定模式：显式指定 > auto 按 content-type 判断
  const mode: HttpResponseType = input.responseType ?? 'auto'
  const binaryMode = mode === 'base64' || mode === 'file' || (mode === 'auto' && isBinaryContentType(contentType))

  if (binaryMode) {
    // 评审 #100：响应体限长读取，恶意/超大响应不再全量入内存
    let buf: Buffer
    try {
      buf = await readBodyWithLimit(res)
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
    if (mode === 'base64') {
      const base64 = buf.toString('base64')
      return {
        ok: true,
        output: {
          status: res.status,
          body: '',
          headers,
          base64,
          dataUrl: `data:${mimeType};base64,${base64}`,
          mimeType,
          sizeBytes: buf.length,
        },
      }
    }
    // file 模式（含 auto 命中二进制）：落盘，节点只输出几十字节的路径
    const dir = input.outputDir ?? path.join(getPathProvider().getDataPath(), 'workflow-media', 'http')
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, `http-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extForMime(mimeType)}`)
    fs.writeFileSync(filePath, buf)
    return {
      ok: true,
      output: {
        status: res.status,
        body: '',
        headers,
        filePath,
        mimeType,
        sizeBytes: buf.length,
      },
    }
  }

  // 文本 / JSON 模式（评审 #100：限长读取）
  let body: string
  try {
    body = (await readBodyWithLimit(res)).toString('utf8')
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  let json: unknown
  if (mode !== 'text') {
    try {
      json = JSON.parse(body)
    } catch {
      json = undefined
    }
  }
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
