/**
 * ComfyUI 生成网关 图像 Provider
 * @module platform/providers/image/sdk/comfyui-image.provider
 * @description 对接局域网 gen_gateway（ComfyUI 生成网关，文档见 gen-gateway-api.md）：
 *   - 无 refs → Krea2 文生图（size: square/portrait/landscape）
 *   - 1 张 refs → Flux Kontext 参考图生图（指令式：保持图中主体按 prompt 改造）
 *   网关产物先落盘到服务器 gen_output/…，再经 /api/file 下载到本地。
 *
 *   设计：本 provider 只负责把统一 ImageGenerationRequest 适配成网关协议并下载产物，
 *   复用 ImageService 的存档/历史/能力校验体系，与 dashscope/volcengine 对等。
 */

import * as fs from 'fs'
import * as http from 'http'
import * as https from 'https'
import type {
  ImageProviderConfig,
  ImageModel,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageTaskStatus,
  GeneratedImage
} from '@shared/types/image-provider.types'
import { BaseImageProvider, collectReferences } from '../base-image-provider'

/** 网关图片接口响应 */
interface GatewayImageResponse {
  ok?: boolean
  path?: string
  url?: string
  error?: string
}

/** 生成排队等待上限：ComfyUI 单队列被 H3 视频任务占用时，/api/image 需在队尾等数分钟起 */
const IMAGE_REQUEST_TIMEOUT_MS = 30 * 60_000

/**
 * POST JSON（node:http 实现，**无 undici 响应头超时**）。
 *
 * 背景（2026-10-08 实跑踩坑）：全局 fetch 基于 undici，响应头默认 300 秒超时——
 * ComfyUI 队列被 H3 视频任务占用时，同步接口 /api/image 在队尾等待会超过 5 分钟，
 * undici 以 UND_ERR_HEADERS_TIMEOUT 掐断（报"fetch failed"），图像必败。
 * node:http 无响应头超时，整体上限由 deadline 控制（默认 30 分钟）。
 */
export function postJsonOverHttp(
  url: string,
  payload: Record<string, unknown>,
  timeoutMs = IMAGE_REQUEST_TIMEOUT_MS,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const body = JSON.stringify(payload)
    const reqModule = target.protocol === 'https:' ? https : http
    const req = reqModule.request(
      target,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          clearTimeout(timer)
          resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf-8') })
        })
        res.on('error', reject)
      },
    )
    const timer = setTimeout(() => {
      req.destroy(new Error(`网关响应超时（等待 ${(timeoutMs / 60_000).toFixed(0)} 分钟，ComfyUI 队列可能被视频任务长期占用）`))
    }, timeoutMs)
    req.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    req.write(body)
    req.end()
  })
}

/** 宽高 → 网关 size 档位 */
function sizeFor(width: number, height: number): 'square' | 'portrait' | 'landscape' {
  if (!width || !height) return 'portrait'
  if (width === height) return 'square'
  return width > height ? 'landscape' : 'portrait'
}

/** 把网关相对下载路径拼成完整 URL（/api/file?p=... → http://host:8190/api/file?p=...） */
function absoluteFileUrl(baseUrl: string, urlOrPath: string): string {
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath
  return `${baseUrl.replace(/\/+$/, '')}/${urlOrPath.replace(/^\/+/, '')}`
}

export class ComfyUIImageProvider extends BaseImageProvider {
  constructor(config: ImageProviderConfig) {
    super(config)
  }

  get id(): string {
    return 'comfyui'
  }

  get name(): string {
    return 'ComfyUI 生成网关（本地图片）'
  }

  /** 无密钥：网关为局域网自建服务，isConfigured 只需 baseUrl */
  isConfigured(): boolean {
    return !!this.config.baseUrl
  }

  getDefaultBaseUrl(): string {
    return 'http://127.0.0.1:8190'
  }

  async getModels(): Promise<ImageModel[]> {
    return [
      {
        id: 'krea2',
        name: 'Krea2 文生图',
        providerId: this.id,
        providerName: this.name,
        features: {
          textToImage: true,
          imageToImage: false,
          imageEdit: false,
          maxResolution: '1024x1024',
          supportedSizes: ['512x512', '1024x1024', '896x1152', '1344x768'],
        },
      },
      {
        id: 'flux-kontext',
        name: 'Flux Kontext 参考图生图',
        providerId: this.id,
        providerName: this.name,
        features: {
          textToImage: false,
          imageToImage: true,
          imageEdit: true,
          maxResolution: '1024x1024',
          supportedSizes: ['512x512', '1024x1024'],
        },
      },
    ]
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    try {
      const baseUrl = this.buildUrl('')
      // 网关 Kontext 为单图模式：多参考图会被 HTTP 400 拒绝，只取第一张（关键帧管线把
      // 最重要的资产参考图排在前面，见 keyframe-generation collectReferenceImages）
      const refs = collectReferences(request).slice(0, 1)
      const payload: Record<string, unknown> = {
        prompt: request.prompt,
        size: sizeFor(request.width, request.height),
      }
      // 参考图：本地绝对路径 → base64 data URL（网关跨机器，文档明确支持 data URL 直传）
      if (refs.length > 0) {
        const b64Refs: string[] = []
        for (const ref of refs) {
          if (/^data:image\//.test(ref)) {
            b64Refs.push(ref)
          } else if (/^https?:\/\//.test(ref) || fs.existsSync(ref)) {
            const data = ref.startsWith('data:') ? ref : fs.existsSync(ref)
              ? `data:image/png;base64,${fs.readFileSync(ref).toString('base64')}`
              : ref
            if (data) b64Refs.push(data)
          }
        }
        if (b64Refs.length > 0) payload.refs = b64Refs
      }

      // node:http 实现：ComfyUI 队列被视频任务占用时 /api/image 排队可达数分钟，
      // 全局 fetch（undici）的 300 秒响应头超时会将其掐断（见 postJsonOverHttp 注释）
      const { status, text } = await postJsonOverHttp(`${baseUrl}/api/image`, payload)
      if (status < 200 || status >= 300) {
        return { success: false, error: `网关返回 HTTP ${status}: ${text.slice(0, 300)}` }
      }
      let data: GatewayImageResponse
      try {
        data = JSON.parse(text)
      } catch {
        return { success: false, error: `网关响应不是 JSON: ${text.slice(0, 200)}` }
      }
      if (!data.ok || !data.url) {
        return { success: false, error: data.error || '网关未返回图片地址' }
      }
      // 返回完整下载 URL（ImageService 统一 fetch 落盘存档）
      const full = absoluteFileUrl(baseUrl, data.url)
      const image: GeneratedImage = { url: full }
      return { success: true, images: [image] }
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async getTaskStatus(_taskId: string): Promise<ImageTaskStatus> {
    // 网关图片接口为同步返回，无异步任务
    return { taskId: _taskId, status: 'failed', error: 'ComfyUI 网关图片为同步接口，不支持任务查询' }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const baseUrl = this.buildUrl('')
      const resp = await fetch(`${baseUrl}/api/file?p=__probe__`, { method: 'GET' })
      // 探活：网关可达即可（404/400 均说明服务在线）
      void resp
      return { success: true, message: `ComfyUI 网关可达：${baseUrl}` }
    } catch (error: unknown) {
      return {
        success: false,
        message: `连接失败: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  protected buildHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json' }
  }

  protected buildUrl(endpoint: string): string {
    const baseUrl = this.config.baseUrl || this.getDefaultBaseUrl()
    return `${baseUrl.replace(/\/+$/, '')}${endpoint}`
  }
}
