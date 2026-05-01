/**
 * 安全存储服务
 * @module services/secure-storage
 * @description 用于管理加密密钥和加密解密操作，保护敏感数据
 */

import { safeStorage } from 'electron'
import crypto from 'crypto'
import type { ISecureStorage } from '@core/interfaces/storage.interface'
import { registerSecureStorage } from '@core/interfaces/storage.interface'

/**
 * 安全存储服务类
 * 用于管理加密密钥和加密解密操作
 *
 * 同时实现 ISecureStorage 接口；首次构造时注册到全局访问器，
 * core 层服务通过 getSecureStorage() 获取实例。
 */
export class SecureStorageService implements ISecureStorage {
  private static instance: SecureStorageService
  private masterKey: Buffer | null = null
  private initialized: boolean = false

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): SecureStorageService {
    if (!SecureStorageService.instance) {
      SecureStorageService.instance = new SecureStorageService()
      registerSecureStorage(() => SecureStorageService.instance)
    }
    return SecureStorageService.instance
  }

  /**
   * 初始化安全存储
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    // 使用 Electron 的 safeStorage 或回退到 crypto
    if (safeStorage.isEncryptionAvailable()) {
      this.initialized = true
    } else {
      // 回退方案：生成一个随机密钥
      this.masterKey = this.generateMasterKey()
      this.initialized = true
    }
  }

  /**
   * 加密数据
   * @param data - 要加密的明文数据
   * @returns string - 加密后的Base64字符串
   */
  encrypt(data: string): string {
    if (!this.initialized) {
      throw new Error('SecureStorage not initialized')
    }

    try {
      if (safeStorage.isEncryptionAvailable()) {
        // 使用 Electron 的 safeStorage
        const encrypted = safeStorage.encryptString(data)
        return encrypted.toString('base64')
      } else {
        // 使用自定义加密
        return this.encryptWithKey(data)
      }
    } catch (error) {
      console.error('加密失败:', error)
      throw error
    }
  }

  /**
   * 解密数据
   * @param encryptedData - 加密的Base64字符串
   * @returns string - 解密后的明文
   */
  decrypt(encryptedData: string): string {
    if (!this.initialized) {
      throw new Error('SecureStorage not initialized')
    }

    try {
      if (safeStorage.isEncryptionAvailable()) {
        // 使用 Electron 的 safeStorage
        const buffer = Buffer.from(encryptedData, 'base64')
        return safeStorage.decryptString(buffer)
      } else {
        // 使用自定义解密
        return this.decryptWithKey(encryptedData)
      }
    } catch (error) {
      console.error('解密失败:', error)
      throw error
    }
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * 检查系统是否支持安全存储
   */
  isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable() || this.masterKey !== null
  }

  /**
   * 生成主密钥
   * @returns Buffer - 32字节的主密钥
   */
  private generateMasterKey(): Buffer {
    return crypto.randomBytes(32)
  }

  /**
   * 使用自定义密钥加密
   */
  private encryptWithKey(data: string): string {
    if (!this.masterKey) {
      throw new Error('Master key not available')
    }

    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv)

    let encrypted = cipher.update(data, 'utf8', 'base64')
    encrypted += cipher.final('base64')

    const authTag = cipher.getAuthTag()

    // 返回格式: iv:authTag:encrypted
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`
  }

  /**
   * 使用自定义密钥解密
   */
  private decryptWithKey(encryptedData: string): string {
    if (!this.masterKey) {
      throw new Error('Master key not available')
    }

    const parts = encryptedData.split(':')
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format')
    }

    const [ivBase64, authTagBase64, encrypted] = parts
    const iv = Buffer.from(ivBase64!, 'base64')
    const authTag = Buffer.from(authTagBase64!, 'base64')

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encrypted!, 'base64', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  }
}

// 注意：曾在此处导出 `secureStorage = SecureStorageService.getInstance()` 单例，
// 这会在模块被 import 时立即调用 registerSecureStorage，从而在 Web 端运行时
// 覆盖 WebSecureStorage 的注册，触发 safeStorage 的 ReferenceError。
// 现已移除该副作用：实例在 Electron 主进程入口显式调用 getInstance() 即可。
