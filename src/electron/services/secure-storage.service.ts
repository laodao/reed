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
   *
   * 主密钥「有文件就加载」——即使 safeStorage 可用也要加载：库里可能同时存在
   * 旧环境（无密钥环）写入的自定义 AES 密文，回退解密依赖它。
   * 只有「safeStorage 不可用且无密钥文件」才新生成主密钥。
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    this.masterKey = this.loadMasterKeyFromFile()
    if (!this.masterKey && !safeStorage.isEncryptionAvailable()) {
      // 回退方案：持久化主密钥（load-or-generate）。
      // 早期版本每次启动随机生成，重启后所有已加密数据（如 API Key）永久无法解密。
      this.masterKey = this.generateAndPersistMasterKey()
    }
    this.initialized = true
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
   *
   * 回退链：库里可能同时存在两种密文——safeStorage 密文（有密钥环环境写入）
   * 与自定义 AES 密文（无密钥环环境写入）。加密后端随运行环境切换（换机器/
   * 桌面会话/Electron 升级都会变），只试当前激活方式会让另一环境的存量密文
   * 永久报「Invalid encrypted data format」。先试当前方式，失败再试另一条，
   * 全部失败才抛错（错误里带上每种尝试的原始原因）。
   */
  decrypt(encryptedData: string): string {
    if (!this.initialized) {
      throw new Error('SecureStorage not initialized')
    }

    const attempts: string[] = []

    if (safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(Buffer.from(encryptedData, 'base64'))
      } catch (error) {
        attempts.push(`safeStorage: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    if (this.masterKey) {
      try {
        return this.decryptWithKey(encryptedData)
      } catch (error) {
        attempts.push(`master-key: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    console.error('[SecureStorage] 解密失败，已尝试:', attempts.join(' | '))
    throw new Error(
      `API 密钥无法解密（密文可能来自缺少对应密钥的另一运行环境），请到 设置→AI 模型配置 重新编辑该提供商并重新输入密钥（已尝试：${attempts.length > 0 ? attempts.join('；') : '无可用解密方式'}）`,
    )
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

  /** userData 下的主密钥文件路径 */
  private get keyPath(): string {
    return path.join(app.getPath('userData'), 'secure-key')
  }

  /**
   * 从文件加载主密钥（只读，绝不生成）。
   * 文件缺失 → null（safeStorage 不可用时由调用方决定是否生成）；
   * 内容损坏（解出非 32 字节）→ null 并记日志，不覆盖旧文件。
   */
  private loadMasterKeyFromFile(): Buffer | null {
    try {
      const key = Buffer.from(fs.readFileSync(this.keyPath, 'utf8').trim(), 'base64')
      if (key.length === 32) {
        return key
      }
      console.error('[SecureStorage] secure-key 内容损坏（非 32 字节），忽略（旧自定义加密数据将无法回退解密）')
    } catch {
      /* ENOENT：首次运行无密钥文件，正常 */
    }
    return null
  }

  /** 生成新主密钥并持久化到 userData/secure-key（权限 0600） */
  private generateAndPersistMasterKey(): Buffer {
    const key = crypto.randomBytes(32)
    fs.writeFileSync(this.keyPath, key.toString('base64'), { encoding: 'utf8', mode: 0o600 })
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
