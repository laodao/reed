/**
 * 安全存储接口
 * @module core/interfaces/storage
 * @description 平台无关的加密存储抽象
 */

/**
 * 安全存储接口
 * 用于加密和解密敏感数据（如 API 密钥）
 */
export interface ISecureStorage {
  /**
   * 初始化安全存储
   */
  initialize(): Promise<void>

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean

  /**
   * 加密数据
   * @param data - 要加密的明文数据
   * @returns 加密后的字符串
   */
  encrypt(data: string): string

  /**
   * 解密数据
   * @param encryptedData - 加密的字符串
   * @returns 解密后的明文
   */
  decrypt(encryptedData: string): string

  /**
   * 检查加密是否可用
   */
  isEncryptionAvailable(): boolean
}