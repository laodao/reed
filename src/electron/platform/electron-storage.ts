/**
 * Electron 安全存储实现
 * @module electron/platform/electron-storage
 * @description 使用 Electron safeStorage 实现 ISecureStorage 接口
 */

import { safeStorage } from 'electron'
import crypto from 'crypto'
import type { ISecureStorage } from '@core/interfaces/storage.interface'

/**
 * Electron 安全存储实现
 * 使用 Electron 的 safeStorage API 进行加密，不可用时回退到 crypto
 */
export class ElectronSecureStorage implements ISecureStorage {
  private masterKey: Buffer | null = null
  private initialized: boolean = false

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
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * 加密数据
   * @param data - 要加密的明文数据
   * @returns 加密后的 Base64 字符串
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
      console.error('[ElectronSecureStorage] 加密失败:', error)
      throw error
    }
  }

  /**
   * 解密数据
   * @param encryptedData - 加密的 Base64 字符串
   * @returns 解密后的明文
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
      console.error('[ElectronSecureStorage] 解密失败:', error)
      throw error
    }
  }

  /**
   * 检查加密是否可用
   */
  isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable() || this.masterKey !== null
  }

  /**
   * 生成主密钥（回退方案）
   */
  private generateMasterKey(): Buffer {
    return crypto.randomBytes(32)
  }

  /**
   * 使用密钥加密（回退方案）
   */
  private encryptWithKey(data: string): string {
    if (!this.masterKey) {
      throw new Error('Master key not available')
    }

    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', this.masterKey, iv)
    let encrypted = cipher.update(data, 'utf8', 'base64')
    encrypted += cipher.final('base64')

    // 将 IV 和加密数据合并
    return iv.toString('base64') + ':' + encrypted
  }

  /**
   * 使用密钥解密（回退方案）
   */
  private decryptWithKey(encryptedData: string): string {
    if (!this.masterKey) {
      throw new Error('Master key not available')
    }

    const parts = encryptedData.split(':')
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format')
    }

    const iv = Buffer.from(parts[0], 'base64')
    const encrypted = parts[1]

    const decipher = crypto.createDecipheriv('aes-256-cbc', this.masterKey, iv)
    let decrypted = decipher.update(encrypted, 'base64', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  }
}
