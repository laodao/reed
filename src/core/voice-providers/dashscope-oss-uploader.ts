/**
 * DashScope 临时 OSS 上传器
 * @module voice-providers/dashscope-oss-uploader
 *
 * DashScope（阿里云百炼）的多模态接口要求音频/图像 / 视频以**公网 URL** 方式提供。
 * 平台为开发者提供了一个临时 OSS 桶（dashscope-instant），通过 2 步协议上传：
 *
 *   1. GET /api/v1/uploads?action=getPolicy&model={target_model}
 *      → 返回 PostObject 凭证（policy / signature / oss_access_key_id / upload_host /
 *        upload_dir / x_oss_object_acl / x_oss_forbid_overwrite）
 *      → 凭证有效期 300s
 *   2. POST {upload_host} multipart with policy + file
 *      → 上传成功后用 `oss://{upload_dir}/{filename}` 作为后续 API 的 URL
 *      → 文件 URL 有效期 48h（过期不影响已经创建的复刻 / enrollment 任务，
 *        因为服务端已把样本提取入模型）
 *
 * 调用 DashScope multimodal API 时，使用 oss:// URL 必须带请求头：
 *
 *   X-DashScope-OssResourceResolve: enable
 *
 * QPS 限制：100，单账号 + 模型维度。本应用单用户场景几乎不会触发。
 *
 * 参考：
 * - https://help.aliyun.com/zh/model-studio/get-temporary-file-url
 * - 已有同协议实现：src/core/video-providers/sdk/bailian-video.provider.ts
 *   (private uploadToBailianTemp)。本模块独立出来后，未来可让 video provider 也复用。
 *
 * 设计文档：docs/superpowers/specs/2026-05-07-voice-cloning-design.md §5.2
 */

import * as fs from 'fs'
import * as path from 'path'

/**
 * DashScope getPolicy 接口的 data 字段结构
 */
interface DashScopeUploadPolicyData {
  policy: string
  signature: string
  upload_dir: string
  upload_host: string
  oss_access_key_id: string
  x_oss_object_acl: string
  x_oss_forbid_overwrite: string
  expire_in_seconds?: number
}

interface DashScopeUploadPolicyResponse {
  request_id?: string
  data?: DashScopeUploadPolicyData
  code?: string
  message?: string
}

/**
 * 上传错误：含可识别的 stage 和 status code，方便上层 service 区分错误类型回滚。
 */
export class DashScopeUploadError extends Error {
  constructor(
    message: string,
    public readonly stage: 'policy' | 'oss-upload' | 'fs',
    public readonly statusCode?: number,
  ) {
    super(message)
    this.name = 'DashScopeUploadError'
  }
}

/**
 * 简化版 fetch 抽象 — 单测时可注入 mock。
 * 默认走 globalThis.fetch（Node 18+ 原生）。
 */
export type FetchLike = typeof fetch

export interface DashScopeOssUploaderOptions {
  /**
   * 自定义 fetch 实现（仅供单测注入；生产环境用全局 fetch）。
   */
  fetchImpl?: FetchLike
  /**
   * 自定义 base URL（默认走北京端点）。可改 dashscope-intl.aliyuncs.com 走国际端。
   */
  baseUrl?: string
}

/**
 * DashScope 临时 OSS 上传器。
 *
 * 用法：
 * ```ts
 * const uploader = new DashScopeOssUploader(apiKey)
 * const ossUrl = await uploader.uploadFile('/path/to/sample.wav', 'cosyvoice-v3.5-plus')
 * // ossUrl === 'oss://dashscope-instant/.../sample.wav'
 * ```
 *
 * 注意：上传成功后，调 enrollment / multimodal API 时**必须**带请求头
 * `X-DashScope-OssResourceResolve: enable`，否则服务端无法解析 oss:// URL。
 */
export class DashScopeOssUploader {
  private static readonly DEFAULT_BASE_URL =
    'https://dashscope.aliyuncs.com/api/v1'

  private readonly fetchImpl: FetchLike
  private readonly baseUrl: string

  constructor(
    private readonly apiKey: string,
    options: DashScopeOssUploaderOptions = {},
  ) {
    if (!apiKey || !apiKey.trim()) {
      throw new Error('DashScopeOssUploader: apiKey is required')
    }
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.baseUrl = options.baseUrl ?? DashScopeOssUploader.DEFAULT_BASE_URL
  }

  /**
   * 上传本地文件到 DashScope 临时 OSS 桶。
   *
   * @param filePath  本地绝对路径
   * @param model     目标模型（决定凭证作用域），如 'cosyvoice-v3.5-plus'
   * @returns         oss:// URL（可直接放入 enrollment / multimodal API 的 url 字段）
   * @throws DashScopeUploadError 文件不存在 / 凭证获取失败 / OSS 上传失败
   */
  async uploadFile(filePath: string, model: string): Promise<string> {
    if (!filePath) {
      throw new DashScopeUploadError('filePath is required', 'fs')
    }
    if (!model) {
      throw new DashScopeUploadError('model is required', 'policy')
    }
    if (!fs.existsSync(filePath)) {
      throw new DashScopeUploadError(
        `file not found: ${filePath}`,
        'fs',
      )
    }

    // Step 1: 获取上传凭证
    const policy = await this.getUploadPolicy(model)

    // Step 2: 上传到 OSS
    const fileName = path.basename(filePath)
    const key = `${policy.upload_dir}/${fileName}`
    await this.postToOss(filePath, fileName, key, policy)

    return `oss://${key}`
  }

  /** 第一步：获取上传凭证 */
  private async getUploadPolicy(
    model: string,
  ): Promise<DashScopeUploadPolicyData> {
    const url = `${this.baseUrl}/uploads?action=getPolicy&model=${encodeURIComponent(model)}`
    let resp: Response
    try {
      resp = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      })
    } catch (e: any) {
      throw new DashScopeUploadError(
        `获取上传凭证网络错误：${e?.message ?? e}`,
        'policy',
      )
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new DashScopeUploadError(
        `获取上传凭证失败 HTTP ${resp.status}：${text || resp.statusText}`,
        'policy',
        resp.status,
      )
    }

    let json: DashScopeUploadPolicyResponse
    try {
      json = (await resp.json()) as DashScopeUploadPolicyResponse
    } catch (e: any) {
      throw new DashScopeUploadError(
        `上传凭证响应不是合法 JSON：${e?.message ?? e}`,
        'policy',
      )
    }

    if (!json.data || !json.data.upload_host || !json.data.policy) {
      throw new DashScopeUploadError(
        `上传凭证响应缺字段：${json.message ?? JSON.stringify(json).slice(0, 200)}`,
        'policy',
      )
    }
    return json.data
  }

  /** 第二步：用 PostObject 协议上传到 OSS */
  private async postToOss(
    filePath: string,
    fileName: string,
    key: string,
    policy: DashScopeUploadPolicyData,
  ): Promise<void> {
    let buffer: Buffer
    try {
      buffer = fs.readFileSync(filePath)
    } catch (e: any) {
      throw new DashScopeUploadError(
        `读取本地文件失败：${e?.message ?? e}`,
        'fs',
      )
    }

    const fd = new FormData()
    fd.append('OSSAccessKeyId', policy.oss_access_key_id)
    fd.append('Signature', policy.signature)
    fd.append('policy', policy.policy)
    fd.append('x-oss-object-acl', policy.x_oss_object_acl)
    fd.append('x-oss-forbid-overwrite', policy.x_oss_forbid_overwrite)
    fd.append('key', key)
    fd.append('success_action_status', '200')
    fd.append(
      'file',
      new Blob([buffer], { type: guessMimeType(fileName) }),
      fileName,
    )

    let resp: Response
    try {
      resp = await this.fetchImpl(policy.upload_host, {
        method: 'POST',
        body: fd,
      })
    } catch (e: any) {
      throw new DashScopeUploadError(
        `OSS 上传网络错误：${e?.message ?? e}`,
        'oss-upload',
      )
    }

    // OSS PostObject 在 success_action_status=200 时返回 200，否则返回 204
    if (!resp.ok && resp.status !== 204) {
      const text = await resp.text().catch(() => '')
      throw new DashScopeUploadError(
        `OSS 上传失败 HTTP ${resp.status}：${text || resp.statusText}`,
        'oss-upload',
        resp.status,
      )
    }
  }
}

/**
 * 简化版扩展名 → MIME 映射，覆盖音频 / 视频 / 图像主流格式。
 * OSS 接受 application/octet-stream 兜底，但带正确 MIME 让浏览器后续访问更友好。
 */
function guessMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase()
  switch (ext) {
    case '.wav':
      return 'audio/wav'
    case '.mp3':
      return 'audio/mpeg'
    case '.m4a':
      return 'audio/mp4'
    case '.ogg':
      return 'audio/ogg'
    case '.aac':
      return 'audio/aac'
    case '.flac':
      return 'audio/flac'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.mp4':
      return 'video/mp4'
    default:
      return 'application/octet-stream'
  }
}
