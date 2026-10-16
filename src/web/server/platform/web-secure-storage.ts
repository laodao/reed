/**
 * Web 端安全存储
 * @module web/server/platform/web-secure-storage
 * @description 实现 ISecureStorage：服务端用 AES-256-GCM 自管理密钥
 *              （从环境变量 SECURE_STORAGE_KEY 读取 base64 32-byte 密钥；
 *               未提供时启动期生成随机密钥并写入 root/secure-key 文件）。
 *
 *              注：Web 端是服务端集中存储 API key 等敏感信息，与 Electron
 *              的 safeStorage（OS 级密钥）方案在威胁模型上不同；这里靠
 *              文件系统 + 部署侧管理密钥。
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import type { ISecureStorage } from '@core/interfaces/storage.interface'
import { registerSecureStorage } from '@core/interfaces/storage.interface'

export interface WebSecureStorageConfig {
  /** 服务根数据目录；密钥文件 secure-key 写在这里 */
  rootDataPath: string
}

export class WebSecureStorage implements ISecureStorage {
  private static instance: WebSecureStorage | null = null
  private masterKey: Buffer | null = null
  private initialized = false
  private rootDataPath: string

  private constructor(config: WebSecureStorageConfig) {
    this.rootDataPath = config.rootDataPath
  }

  static getInstance(config?: WebSecureStorageConfig): WebSecureStorage {
    if (!WebSecureStorage.instance) {
      if (!config) throw new Error('[WebSecureStorage] 首次调用必须传入 config')
      WebSecureStorage.instance = new WebSecureStorage(config)
      registerSecureStorage(() => WebSecureStorage.instance!)
    }
    return WebSecureStorage.instance
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    // 1. 优先从环境变量读
    const envKey = process.env.SECURE_STORAGE_KEY
    if (envKey) {
      try {
        const buf = Buffer.from(envKey, 'base64')
        if (buf.length === 32) {
          this.masterKey = buf
          this.initialized = true
          return
        }
      } catch {
        // ignore，回落到文件
      }
    }

    // 2. 从文件读，没有就生成一个
    const keyFile = path.join(this.rootDataPath, 'secure-key')
    if (!fs.existsSync(this.rootDataPath)) {
      fs.mkdirSync(this.rootDataPath, { recursive: true })
    }
    if (fs.existsSync(keyFile)) {
      const data = fs.readFileSync(keyFile)
      if (data.length === 32) {
        this.masterKey = data
        this.initialized = true
        console.log(`[WebSecureStorage] 复用已有 master key: ${keyFile}`)
        return
      }
    }
    // 新生成 master key：以前用旧 key 加密的 provider apiKey 等密文将无法解密！
    // 显眼提示用户，避免不知情切了 DATA_ROOT 后茫然撞上"Unsupported state"错误。
    this.masterKey = crypto.randomBytes(32)
    fs.writeFileSync(keyFile, this.masterKey, { mode: 0o600 })
    this.initialized = true
    console.warn(
      `\n[WebSecureStorage] ⚠ 新生成 master key 写到 ${keyFile}\n` +
        `  如果数据库里已存在用旧 master key 加密的 apiKey 等密文，` +
        `从这里开始解密都会报 "Unsupported state or unable to authenticate data"。\n` +
        `  常见原因：DATA_ROOT 环境变量与之前启动不一致；secure-key 文件被删/覆盖；` +
        `多个不同 cwd 的进程并存。\n` +
        `  修复：在「设置 → AI 模型配置」逐个重填 API key（写入会用当前 master key 重加密）。\n`,
    )
  }

  isInitialized(): boolean {
    return this.initialized
  }

  isEncryptionAvailable(): boolean {
    return this.masterKey !== null
  }

  encrypt(data: string): string {
    if (!this.masterKey) throw new Error('SecureStorage not initialized')
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv)
    let encrypted = cipher.update(data, 'utf8', 'base64')
    encrypted += cipher.final('base64')
    const authTag = cipher.getAuthTag()
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`
  }

  decrypt(encryptedData: string): string {
    if (!this.masterKey) throw new Error('SecureStorage not initialized')
    const parts = encryptedData.split(':')
    if (parts.length !== 3) throw new Error('Invalid encrypted data format')
    const [ivB64, authTagB64, payloadB64] = parts
    const iv = Buffer.from(ivB64!, 'base64')
    const authTag = Buffer.from(authTagB64!, 'base64')
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv)
    decipher.setAuthTag(authTag)
    let decrypted = decipher.update(payloadB64!, 'base64', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  }
}
