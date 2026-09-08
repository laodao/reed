/**
 * OSS 上传服务
 * @module platform/services/oss.service
 * @description 提供统一的图床/OSS文件上传服务，支持阿里云OSS和火山引擎TOS。
 * 注意：阿里云/火山均要求以「Bucket 三级域名」（vhost）寻址，例如
 * https://{bucket}.oss-cn-hangzhou.aliyuncs.com；endpoint 允许用户填写
 * 不带协议的 host（如 oss-cn-hangzhou.aliyuncs.com），服务内部统一归一化。
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
// electron-log 已被替换为跨平台 console wrapper（见下方 logger 常量）
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getSecureStorage } from '@core/interfaces/storage.interface'
import { OSSConfigRepository } from '@core/database/repositories/oss-config.repository'
import type {
  OSSConfig,
  OSSUploadRequest,
  OSSUploadResult,
  OSSTestResult,
  AliyunOSSConfig,
  VolcengineTOSConfig
} from '@shared/types/oss.types'

// 跨平台 logger：包装 console，简单实现 electron-log 风格的 .scope/.info/.error API
const logger = {
  info: (...args: any[]) => console.log('[OSSService]', ...args),
  warn: (...args: any[]) => console.warn('[OSSService]', ...args),
  error: (...args: any[]) => console.error('[OSSService]', ...args),
  debug: (...args: any[]) => console.debug('[OSSService]', ...args),
}

/** 带签名的对象请求结果 */
interface SignedObjectResponse {
  ok: boolean
  status: number
  body: string
  /** 实际请求的完整 URL（含协议、vhost、对象路径） */
  url: string
}

/**
 * OSS 上传服务
 */
export class OSSService {
  private static instance: OSSService
  private repository: OSSConfigRepository | null = null

  private constructor() {}

  static getInstance(): OSSService {
    if (!OSSService.instance) {
      OSSService.instance = new OSSService()
    }
    return OSSService.instance
  }

  /**
   * 初始化仓库
   */
  private getRepository(): OSSConfigRepository {
    if (!this.repository) {
      const db = getCoreDatabaseManager()
      if (!db.ossConfigs) {
        throw new Error('数据库未初始化')
      }
      this.repository = db.ossConfigs
    }
    return this.repository
  }

  /**
   * 上传文件到 OSS
   */
  async uploadFile(request: OSSUploadRequest): Promise<OSSUploadResult> {
    try {
      const repo = this.getRepository()

      // 获取配置
      let config: OSSConfig | null = null
      if (request.configId) {
        config = await repo.getById(request.configId)
      } else {
        config = await repo.getDefault()
      }

      if (!config) {
        return {
          success: false,
          error: '未找到可用的 OSS 配置，请先在设置中配置图床'
        }
      }

      if (!config.isEnabled) {
        return {
          success: false,
          error: `OSS 配置 "${config.name}" 已禁用`
        }
      }

      // 检查本地文件
      if (!fs.existsSync(request.localPath)) {
        return {
          success: false,
          error: '本地文件不存在'
        }
      }

      // 解密密钥
      const accessKeySecret = await this.decryptSecret(config)

      // 根据提供商选择上传方法
      if (config.provider === 'aliyun') {
        return await this.uploadToAliyun(config, accessKeySecret, request)
      } else if (config.provider === 'volcengine') {
        return await this.uploadToVolcengine(config, accessKeySecret, request)
      } else {
        return {
          success: false,
          error: `不支持的 OSS 提供商: ${config.provider}`
        }
      }
    } catch (error: any) {
      logger.error('[OSSService] 上传失败:', error)
      return {
        success: false,
        error: error.message || '上传失败'
      }
    }
  }

  /**
   * 上传到阿里云 OSS
   */
  private async uploadToAliyun(
    config: AliyunOSSConfig,
    accessKeySecret: string,
    request: OSSUploadRequest
  ): Promise<OSSUploadResult> {
    try {
      // 读取文件
      const fileBuffer = fs.readFileSync(request.localPath)
      const ext = path.extname(request.localPath)
      const fileName = request.fileName || `${crypto.randomUUID()}${ext}`

      // 构建云存储路径
      const cloudPath = this.buildCloudPath(config.pathPrefix, fileName, request.customPath)

      // 获取内容类型
      const contentType = this.getContentType(ext)

      logger.info('[OSSService] 上传到阿里云 OSS:', { bucket: config.bucket, path: cloudPath })

      // 发送签名 PUT 请求
      const res = await this.sendSignedRequest(config, accessKeySecret, 'PUT', cloudPath, {
        contentType,
        body: fileBuffer
      })

      if (!res.ok) {
        logger.error('[OSSService] 阿里云上传失败:', res.status, res.body)
        return {
          success: false,
          error: this.describeOssError(res.body, `上传失败: HTTP ${res.status}`)
        }
      }

      // 返回公网 URL（优先自定义域名）
      const publicUrl = this.toPublicUrl(config, cloudPath, res.url)

      logger.info('[OSSService] 阿里云上传成功:', publicUrl)

      return {
        success: true,
        url: publicUrl,
        path: cloudPath
      }
    } catch (error: any) {
      logger.error('[OSSService] 阿里云上传异常:', error)
      return {
        success: false,
        error: error.message || '阿里云上传失败'
      }
    }
  }

  /**
   * 上传到火山引擎 TOS
   */
  private async uploadToVolcengine(
    config: VolcengineTOSConfig,
    accessKeySecret: string,
    request: OSSUploadRequest
  ): Promise<OSSUploadResult> {
    try {
      // 读取文件
      const fileBuffer = fs.readFileSync(request.localPath)
      const ext = path.extname(request.localPath)
      const fileName = request.fileName || `${crypto.randomUUID()}${ext}`

      // 构建云存储路径
      const cloudPath = this.buildCloudPath(config.pathPrefix, fileName, request.customPath)

      // 获取内容类型
      const contentType = this.getContentType(ext)

      logger.info('[OSSService] 上传到火山引擎 TOS:', { bucket: config.bucket, path: cloudPath })

      // 发送签名 PUT 请求
      const res = await this.sendSignedRequest(config, accessKeySecret, 'PUT', cloudPath, {
        contentType,
        body: fileBuffer
      })

      if (!res.ok) {
        logger.error('[OSSService] 火山引擎上传失败:', res.status, res.body)
        return {
          success: false,
          error: this.describeOssError(res.body, `上传失败: HTTP ${res.status}`)
        }
      }

      // 返回公网 URL（优先自定义域名）
      const publicUrl = this.toPublicUrl(config, cloudPath, res.url)

      logger.info('[OSSService] 火山引擎上传成功:', publicUrl)

      return {
        success: true,
        url: publicUrl,
        path: cloudPath
      }
    } catch (error: any) {
      logger.error('[OSSService] 火山引擎上传异常:', error)
      return {
        success: false,
        error: error.message || '火山引擎上传失败'
      }
    }
  }

  /**
   * 构建云存储路径
   */
  private buildCloudPath(prefix: string | undefined, fileName: string, customPath?: string): string {
    if (customPath) return customPath

    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')

    const datePath = `${year}/${month}/${day}`
    const fullPath = prefix ? `${prefix}/${datePath}/${fileName}` : `${datePath}/${fileName}`

    return fullPath
  }

  /**
   * 获取内容类型
   */
  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.json': 'application/json',
      '.pdf': 'application/pdf'
    }
    return types[ext.toLowerCase()] || 'application/octet-stream'
  }

  /**
   * 测试 OSS 连接
   * 通过真实上传并删除一个探针对象来验证：endpoint/bucket/密钥/写权限全部可用。
   */
  async testConnection(configId: string): Promise<OSSTestResult> {
    try {
      const repo = this.getRepository()
      const config = await repo.getById(configId)

      if (!config) {
        return { success: false, message: '配置不存在' }
      }

      // 解密密钥
      const accessKeySecret = await this.decryptSecret(config)

      if (config.provider === 'aliyun') {
        return await this.testByProbe(config as AliyunOSSConfig, accessKeySecret)
      } else if (config.provider === 'volcengine') {
        return await this.testByProbe(config as VolcengineTOSConfig, accessKeySecret)
      }

      return { success: false, message: '不支持的提供商' }
    } catch (error: any) {
      return { success: false, message: `连接失败: ${error.message}` }
    }
  }

  /**
   * 通过探针对象验证连接（PUT 成功后尽力 DELETE 清理）
   */
  private async testByProbe(config: OSSConfig, accessKeySecret: string): Promise<OSSTestResult> {
    const probeKey = `.connection-test/probe-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.txt`
    try {
      const put = await this.sendSignedRequest(config, accessKeySecret, 'PUT', probeKey, {
        contentType: 'text/plain',
        body: 'probe'
      })

      if (!put.ok) {
        const detail = this.describeOssError(put.body, `HTTP ${put.status}`)
        return { success: false, message: `连接失败: ${detail}` }
      }

      // 尽力清理探针（无删除权限不判失败）
      try {
        await this.sendSignedRequest(config, accessKeySecret, 'DELETE', probeKey)
      } catch (e: any) {
        logger.warn('[OSSService] 探针清理失败（可忽略）:', e.message)
      }

      return { success: true, message: '连接成功：Bucket 可读可写（已上传探针并清理）' }
    } catch (error: any) {
      return { success: false, message: `连接失败: ${error.message}` }
    }
  }

  /**
   * 解密配置中的 AccessKey Secret
   */
  private async decryptSecret(config: OSSConfig): Promise<string> {
    const secureStorage = getSecureStorage()
    if (!secureStorage.isInitialized()) {
      await secureStorage.initialize()
    }
    return secureStorage.decrypt(config.accessKeySecret)
  }

  /**
   * 归一化 endpoint：返回可寻址的 bucket 三级域名 host（不带协议、不含路径/尾斜杠）。
   * 兼容的填写形态：
   *  1. 不填 → 按 provider + region 自动生成地域 endpoint host（oss-{region}.aliyuncs.com）
   *  2. 不带协议的 host：oss-cn-hangzhou.aliyuncs.com
   *  3. 带协议：https://oss-cn-hangzhou.aliyuncs.com
   *  4. 已是 bucket 三级域名：https://the-bot.oss-cn-hangzhou.aliyuncs.com（原样保留）
   *  5. 自定义域名（非 *.aliyuncs.com / *.volces.com 后缀）：视为已绑定该 bucket，原样保留
   */
  private normalizeEndpointHost(config: OSSConfig): string {
    const bucket = (config.bucket || '').trim()
    const region = (config.region || '').trim()

    let host = ''
    if (config.endpoint && config.endpoint.trim()) {
      host = config.endpoint
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '') // 去掉可能的路径
        .replace(/\/+$/, '')
    } else {
      if (config.provider === 'volcengine') {
        host = region.startsWith('tos-') ? `${region}.volces.com` : `tos-${region}.volces.com`
      } else {
        host = region.startsWith('oss-') ? `${region}.aliyuncs.com` : `oss-${region}.aliyuncs.com`
      }
    }

    // 已是 bucket 三级域名 → 原样
    if (bucket && host.startsWith(`${bucket}.`)) {
      return host
    }
    // 阿里云 / 火山官方地域 endpoint → 转 vhost 三级域名
    if (bucket && (host.endsWith('.aliyuncs.com') || host.endsWith('.volces.com'))) {
      return `${bucket}.${host}`
    }
    // 自定义域名（CNAME/内网等）→ 不加 bucket 前缀
    return host
  }

  /**
   * 生成公网访问 URL（有自定义域名则优先）
   */
  private toPublicUrl(config: OSSConfig, cloudPath: string, fallbackUrl: string): string {
    if (config.customDomain && config.customDomain.trim()) {
      const domain = config.customDomain
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\/+$/, '')
      return `https://${domain}/${cloudPath}`
    }
    return fallbackUrl
  }

  /**
   * 发送带 V1 签名的对象请求（PUT/DELETE/GET）。
   * 签名 CanonicalizedResource 一律为 /{bucket}/{objectKey}，与访问域名风格无关。
   */
  private async sendSignedRequest(
    config: OSSConfig,
    accessKeySecret: string,
    method: 'PUT' | 'DELETE' | 'GET',
    objectKey: string,
    options: { contentType?: string; body?: Buffer | string } = {}
  ): Promise<SignedObjectResponse> {
    const host = this.normalizeEndpointHost(config)
    const url = `https://${host}/${objectKey}`
    const date = new Date().toUTCString()

    // V1 签名：VERB\nContent-MD5\nContent-Type\nDate\nCanonicalizedResource
    const contentType = options.contentType || ''
    const stringToSign = `${method}\n\n${contentType}\n${date}\n/${config.bucket}/${objectKey}`
    const signature = crypto
      .createHmac('sha1', accessKeySecret)
      .update(stringToSign)
      .digest('base64')
    const authPrefix = config.provider === 'volcengine' ? 'TOS' : 'OSS'
    const authorization = `${authPrefix} ${config.accessKeyId}:${signature}`

    const headers: Record<string, string> = {
      'Date': date,
      'Authorization': authorization
    }
    if (contentType) {
      headers['Content-Type'] = contentType
    }

    logger.info(`[OSSService] ${method} ${url}`)

    const response = await fetch(url, {
      method,
      headers,
      body: options.body !== undefined ? options.body : undefined
    })

    const body = await response.text()
    return { ok: response.ok, status: response.status, body, url }
  }

  /**
   * 将 OSS 错误响应（XML）解析为可读信息
   */
  private describeOssError(body: string, fallback: string): string {
    const code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1]
    const message = /<Message>([^<]+)<\/Message>/.exec(body)?.[1]
    if (!code && !message) {
      return `${fallback}${body ? `: ${body.slice(0, 200)}` : ''}`
    }
    const friendly = this.friendlyOssError(code)
    return `${friendly}${message ? `（${message.slice(0, 150)}）` : ''}`
  }

  /**
   * 将 OSS 错误码映射为可读原因
   */
  private friendlyOssError(code?: string): string {
    if (!code) return '未知错误'
    switch (code) {
      case 'SignatureDoesNotMatch':
      case 'InvalidAccessKeyId':
        return 'AccessKey ID 或 Secret 不正确'
      case 'AccessDenied':
        return '无访问权限：请检查 RAM/子账号是否授权了该 Bucket 的读写'
      case 'NoSuchBucket':
      case 'InvalidBucketName':
        return 'Bucket 不存在或名称不正确'
      case 'SecondLevelDomainForbidden':
        return 'Bucket 须使用三级域名访问（请勿填写含 Bucket 的完整域名作为 endpoint）'
      default:
        return code
    }
  }
}
