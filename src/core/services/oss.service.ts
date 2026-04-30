/**
 * OSS 上传服务
 * @module services/oss.service
 * @description 提供统一的图床/OSS文件上传服务，支持阿里云OSS和火山引擎TOS
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
// electron-log replaced by console for cross-platform compatibility
const log = console
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

// 配置 electron-log
log.transports.console.level = false
const logger = log.scope('OSSService')

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
        config = repo.getById(request.configId)
      } else {
        config = repo.getDefault()
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
      const secureStorage = getSecureStorage()
      if (!secureStorage.isInitialized()) {
        await secureStorage.initialize()
      }
      const accessKeySecret = secureStorage.decrypt(config.accessKeySecret)

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

      // 构建签名和请求
      const endpoint = config.endpoint || `https://oss-${config.region}.aliyuncs.com`
      const bucketUrl = `${endpoint.replace('https://', `https://${config.bucket}.`)}`
      const url = `${bucketUrl}/${cloudPath}`

      // 获取内容类型
      const contentType = this.getContentType(ext)

      // 生成签名
      const date = new Date().toUTCString()
      const signature = this.generateAliyunSignature(
        'PUT',
        cloudPath,
        config.accessKeyId,
        accessKeySecret,
        config.bucket,
        date,
        contentType
      )

      logger.info('[OSSService] 上传到阿里云 OSS:', { bucket: config.bucket, path: cloudPath })

      // 发送请求
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'Date': date,
          'Authorization': signature
        },
        body: fileBuffer
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('[OSSService] 阿里云上传失败:', response.status, errorText)
        return {
          success: false,
          error: `上传失败: ${response.status} ${errorText}`
        }
      }

      // 返回公网 URL
      const publicUrl = config.customDomain
        ? `https://${config.customDomain}/${cloudPath}`
        : url

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

      // 构建请求 URL
      const endpoint = config.endpoint || `https://tos-${config.region}.volces.com`
      const url = `${endpoint}/${config.bucket}/${cloudPath}`

      // 获取内容类型
      const contentType = this.getContentType(ext)

      // 生成签名
      const date = new Date().toUTCString()
      const signature = this.generateVolcengineSignature(
        'PUT',
        cloudPath,
        config.accessKeyId,
        accessKeySecret,
        config.bucket,
        date,
        contentType
      )

      logger.info('[OSSService] 上传到火山引擎 TOS:', { bucket: config.bucket, path: cloudPath })

      // 发送请求
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'Date': date,
          'Authorization': signature
        },
        body: fileBuffer
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('[OSSService] 火山引擎上传失败:', response.status, errorText)
        return {
          success: false,
          error: `上传失败: ${response.status} ${errorText}`
        }
      }

      // 返回公网 URL
      const publicUrl = config.customDomain
        ? `https://${config.customDomain}/${cloudPath}`
        : url

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
   * 生成阿里云 OSS 签名
   */
  private generateAliyunSignature(
    method: string,
    objectPath: string,
    accessKeyId: string,
    accessKeySecret: string,
    bucket: string,
    date: string,
    contentType: string
  ): string {
    // 简化的签名算法，实际生产环境建议使用 OSS SDK
    const stringToSign = `${method}\n\n${contentType}\n${date}\n/${bucket}/${objectPath}`
    const hmac = crypto.createHmac('sha1', accessKeySecret)
    hmac.update(stringToSign)
    const signature = hmac.digest('base64')
    return `OSS ${accessKeyId}:${signature}`
  }

  /**
   * 生成火山引擎 TOS 签名
   */
  private generateVolcengineSignature(
    method: string,
    objectPath: string,
    accessKeyId: string,
    accessKeySecret: string,
    bucket: string,
    date: string,
    contentType: string
  ): string {
    // 简化的签名算法
    const stringToSign = `${method}\n\n${contentType}\n${date}\n/${bucket}/${objectPath}`
    const hmac = crypto.createHmac('sha1', accessKeySecret)
    hmac.update(stringToSign)
    const signature = hmac.digest('base64')
    return `TOS ${accessKeyId}:${signature}`
  }

  /**
   * 测试 OSS 连接
   */
  async testConnection(configId: string): Promise<OSSTestResult> {
    try {
      const repo = this.getRepository()
      const config = repo.getById(configId)

      if (!config) {
        return { success: false, message: '配置不存在' }
      }

      // 解密密钥
      const secureStorage = getSecureStorage()
      if (!secureStorage.isInitialized()) {
        await secureStorage.initialize()
      }
      const accessKeySecret = secureStorage.decrypt(config.accessKeySecret)

      // 尝试获取 Bucket 信息来验证连接
      if (config.provider === 'aliyun') {
        return await this.testAliyunConnection(config as AliyunOSSConfig, accessKeySecret)
      } else if (config.provider === 'volcengine') {
        return await this.testVolcengineConnection(config as VolcengineTOSConfig, accessKeySecret)
      }

      return { success: false, message: '不支持的提供商' }
    } catch (error: any) {
      return { success: false, message: error.message || '测试失败' }
    }
  }

  /**
   * 测试阿里云连接
   */
  private async testAliyunConnection(config: AliyunOSSConfig, accessKeySecret: string): Promise<OSSTestResult> {
    try {
      const endpoint = config.endpoint || `https://oss-${config.region}.aliyuncs.com`
      const date = new Date().toUTCString()

      const stringToSign = `GET\n\n\n${date}\n/${config.bucket}/`
      const hmac = crypto.createHmac('sha1', accessKeySecret)
      hmac.update(stringToSign)
      const signature = hmac.digest('base64')

      const response = await fetch(`${endpoint}/${config.bucket}/?max-keys=1`, {
        method: 'GET',
        headers: {
          'Date': date,
          'Authorization': `OSS ${config.accessKeyId}:${signature}`
        }
      })

      if (response.ok) {
        return { success: true, message: '连接成功，Bucket 可访问' }
      }

      return { success: false, message: `连接失败: ${response.status}` }
    } catch (error: any) {
      return { success: false, message: `连接失败: ${error.message}` }
    }
  }

  /**
   * 测试火山引擎连接
   */
  private async testVolcengineConnection(config: VolcengineTOSConfig, accessKeySecret: string): Promise<OSSTestResult> {
    try {
      const endpoint = config.endpoint || `https://tos-${config.region}.volces.com`
      const date = new Date().toUTCString()

      const stringToSign = `GET\n\n\n${date}\n/${config.bucket}/`
      const hmac = crypto.createHmac('sha1', accessKeySecret)
      hmac.update(stringToSign)
      const signature = hmac.digest('base64')

      const response = await fetch(`${endpoint}/${config.bucket}/?max-keys=1`, {
        method: 'GET',
        headers: {
          'Date': date,
          'Authorization': `TOS ${config.accessKeyId}:${signature}`
        }
      })

      if (response.ok) {
        return { success: true, message: '连接成功，Bucket 可访问' }
      }

      return { success: false, message: `连接失败: ${response.status}` }
    } catch (error: any) {
      return { success: false, message: `连接失败: ${error.message}` }
    }
  }
}