/**
 * 安全存储服务
 * @module platform/services/secure-storage
 * @description 用于管理加密密钥和加密解密操作，保护敏感数据
 */

import { app, safeStorage } from 'electron'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
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
      // 回退方案：持久化主密钥（load-or-generate）。
      // 早期版本每次启动随机生成，重启后所有已加密数据（如 API Key）永久无法解密。
      this.masterKey = this.loadOrGenerateMasterKey()
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
      const rawMessage = error instanceof Error ? error.message : String(error)
      throw new Error(
        `API 密钥无法解密（可能更换了运行环境），请到 设置→AI 模型配置 重新编辑该提供商并重新输入密钥（原始错误：${rawMessage}）`,
      )
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
   * 加载或生成持久化主密钥（回退方案用）
   *
   * 密钥以 base64 存于 userData/secure-key（权限 0600），重启后仍可解密旧数据。
   * 文件缺失或内容损坏（解出非 32 字节）时重新生成并覆盖。
   * @returns Buffer - 32字节的主密钥
   */
  private loadOrGenerateMasterKey(): Buffer {
    const keyPath = path.join(app.getPath('userData'), 'secure-key')

    try {
      const key = Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'base64')
      if (key.length === 32) {
        return key
      }
      console.error('[SecureStorage] secure-key 内容损坏（非 32 字节），重新生成；旧加密数据将无法解密')
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        console.error('[SecureStorage] 读取 secure-key 失败，重新生成:', error)
      }
    }

    const key = crypto.randomBytes(32)
    fs.writeFileSync(keyPath, key.toString('base64'), { encoding: 'utf8', mode: 0o600 })
    return key
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
