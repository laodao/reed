/**
 * ComfyUI 生成网关 视频 Provider
 * @module platform/providers/video/sdk/comfyui-video.provider
 * @description 对接局域网 gen_gateway（ComfyUI 生成网关，文档见 gen-gateway-api.md）：
 *   调用 MiniMax-H3 参考图生视频（自带配音/环境声的 MP4）。
 *   端点：POST /api/video（异步返回 task_id）→ GET /api/task/{id}（轮询）→ /api/file 下载产物。
 *   设计：与火山 Seedance 同构——generateVideo 返回 taskId（异步），
 *   VideoService.startPollingTask 每 5s 轮询 getTaskStatus，completed 后下载落盘。
 *   三段式提示词由上游（工作流拆解 LLM）生成，provider 只做协议适配与图片直传。
 */

import * as fs from 'fs'
import * as path from 'path'
import { getPathProvider } from '@core/interfaces/path.interface'
import type {
  VideoProviderConfig,
  VideoModel,
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoTaskStatus,
  GeneratedVideo
} from '@shared/types/video-provider.types'
import { BaseVideoProvider } from '../base-video-provider'

/** 网关视频任务创建响应 */
interface GatewayVideoSubmitResponse {
  ok?: boolean
  task_id?: string
  error?: string
}

/** 网关任务状态响应 */
interface GatewayVideoTaskResponse {
  ok?: boolean
  status?: 'running' | 'done' | 'error'
  kind?: string
  path?: string
  url?: string
  error?: string | null
}

/** 把网关相对下载路径拼成完整 URL */
function absoluteFileUrl(baseUrl: string, urlOrPath: string): string {
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath
  return `${baseUrl.replace(/\/+$/, '')}/${urlOrPath.replace(/^\/+/, '')}`
}

export class ComfyUIVideoProvider extends BaseVideoProvider {
  constructor(config: VideoProviderConfig) {
    super(config)
  }

  get id(): string {
    return 'comfyui'
  }

  get name(): string {
    return 'ComfyUI 生成网关（本地视频）'
  }

  /** 无密钥：局域网自建网关，已配置即视为可用 */
  isConfigured(): boolean {
    return !!this.config.baseUrl
  }

  protected getDefaultBaseUrl(): string {
    return 'http://127.0.0.1:8190'
  }

  async getModels(): Promise<VideoModel[]> {
    return [
      {
        id: 'h3',
        name: 'MiniMax-H3 图生视频（自带配音）',
        providerId: this.id,
        providerName: this.name,
        features: {
          textToVideo: true,
          imageToVideo: true,
          videoToVideo: false,
          maxDuration: 15,
          supportedResolutions: ['480x864', '704x1248'],
          supportedAspectRatios: ['9:16', '16:9'],
        },
      },
    ]
  }

  /** 图生视频：image 已由 video-gen 节点解析为公网 URL / base64 data URI；网关 refs 支持 data URL 直传 */
  private toRefs(request: VideoGenerationRequest): string[] {
    const refs: string[] = []
    if (!request.image) return refs
    if (
      request.image.startsWith('data:') ||
      request.image.startsWith('http://') ||
      request.image.startsWith('https://')
    ) {
      refs.push(request.image)
      return refs
    }
    // 本地路径：读文件转 base64 data URI（跨机器直传内容）
    const stripped = request.image.replace(/^local-[a-z]+:\/\//i, '').replace(/^file:\/\//, '')
    const abs = path.isAbsolute(stripped) ? stripped : path.resolve(getPathProvider().getDataPath(), stripped)
    if (fs.existsSync(abs)) {
      const ext = path.extname(abs).toLowerCase()
      const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'
      refs.push(`data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`)
    }
    return refs
  }

  /** 时长（秒）→ 总帧数（24fps；文档表格 3s=73、5s=121、10s=241、15s=361 ⇒ frames=秒×24+1；上限 362） */
  private framesFor(duration?: number): number {
    const d = duration && duration > 0 ? Math.round(duration) : 5
    const clamped = Math.max(1, Math.min(15, d))
    return Math.min(362, clamped * 24 + 1)
  }

  /**
   * H3 提示词协议适配：上游 prompt 若已是三段式（含 subject_definitions/summary/
   * retention_analysis 段）则原样透传（尊重 LLM 生成的高质量文案）；
   * 否则按协议骨架组装一次——把镜头描述放入 summary，Picture 1 声明与 refs[0] 对应。
   * 组装不写死任何业务内容，仅补协议必需结构（模型不吃单段 prompt）。
   */
  private toH3Prompt(rawPrompt: string): string {
    const p = (rawPrompt || '').trim()
    const looksStructured =
      p.includes('subject_definitions:') &&
      p.includes('summary:') &&
      p.includes('retention_analysis:')
    if (looksStructured || !p) return p
    return [
      'subject_definitions:',
      'Picture 1 作为 Subject 1（画面主体）外观来源，需保持其画面主体、构图与整体视觉风格；Subject 1 在视频中按画面描述自然运动，不做剧烈形变，画面不含任何文字。',
      '',
      'summary:',
      `[reference generation + audio reference] ${p}。镜头语言简洁，动作单一自然，画面保持与 Picture 1 一致、无文字。`,
      '',
      'retention_analysis:',
      'Subject 1（Picture 1）：fully_preserved - 保持画面主体外观、构图与整体风格，仅产生自然运动。',
    ].join('\n')
  }

  async generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    try {
      if (!request.model) return { success: false, error: '未指定模型' }
      const refs = this.toRefs(request)
      if (refs.length === 0) {
        return { success: false, error: 'H3 为参考图生视频，需要提供首帧参考图（refs 为空）' }
      }
      const portrait = !request.width || !request.height || request.height >= request.width
      const body: Record<string, unknown> = {
        prompt: this.toH3Prompt(request.prompt || ''),
        refs,
        // 评审 #105：画质/步数可由上层（工作流 start 输入）透传；默认 high / steps20 全质量
        quality: request.quality ?? 'high',
        aspect: portrait ? 'portrait' : 'landscape',
        frames: this.framesFor(request.duration),
        steps: request.steps ?? 20, // 20=全质量（3~6 分钟/镜）；4=turbo 提速数倍；网关自动做音频清洗
      }
      const url = this.buildUrl('/api/video')
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        // 评审 #104：提交阶段同样加超时，避免网关连接悬挂导致轮询期任务永久卡死
        signal: AbortSignal.timeout(30_000),
      })
      const text = await resp.text()
      if (!resp.ok) {
        return { success: false, error: `网关返回 HTTP ${resp.status}: ${text.slice(0, 300)}` }
      }
      let data: GatewayVideoSubmitResponse
      try {
        data = JSON.parse(text)
      } catch {
        return { success: false, error: `网关响应不是 JSON: ${text.slice(0, 200)}` }
      }
      if (!data.ok || !data.task_id) {
        return { success: false, error: data.error || '网关未返回任务 ID' }
      }
      console.log(`[${this.id}] H3 任务已创建，taskId:`, data.task_id)
      return { success: true, taskId: data.task_id }
    } catch (error: unknown) {
      return {
        success: false,
        error: `视频生成失败: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  async getTaskStatus(taskId: string): Promise<VideoTaskStatus> {
    try {
      const url = this.buildUrl(`/api/task/${taskId}`)
      // 评审 #104：状态查询加 20s 超时——悬挂的连接在下一轮轮询自动重试，不再静默停拉
      const resp = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(20_000) })
      const text = await resp.text()
      if (!resp.ok) {
        return { taskId, status: 'failed', error: `网关返回 HTTP ${resp.status}: ${text.slice(0, 200)}` }
      }
      const data: GatewayVideoTaskResponse = JSON.parse(text)
      if (data.status === 'done' && data.url) {
        const video: GeneratedVideo = {
          url: absoluteFileUrl(this.config.baseUrl || this.getDefaultBaseUrl(), data.url),
        }
        return { taskId, status: 'completed', video }
      }
      if (data.status === 'error') {
        return { taskId, status: 'failed', error: data.error || 'H3 视频生成失败' }
      }
      return { taskId, status: data.status === 'running' ? 'processing' : 'pending' }
    } catch (error: unknown) {
      return {
        taskId,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const baseUrl = this.buildUrl('')
      // 探活：POST /api/video 用空参应返回 4xx 业务错误而非网络失败
      const resp = await fetch(`${baseUrl}/api/task/__probe__`, { method: 'GET' })
      void resp
      return { success: true, message: `ComfyUI 网关可达：${baseUrl}` }
    } catch (error: unknown) {
      return {
        success: false,
        message: `连接失败: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  /** 网关无鉴权：Content-Type 即可 */
  protected buildHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json' }
  }

  protected buildUrl(endpoint: string): string {
    const baseUrl = this.config.baseUrl || this.getDefaultBaseUrl()
    return `${baseUrl.replace(/\/+$/, '')}${endpoint}`
  }
}
