/**
 * 缓存服务
 * @module platform/services/cache.service
 * @description 提供内存缓存和磁盘缓存功能
 */

import * as fs from 'fs'
import * as path from 'path'
import { getPathProvider } from '@core/interfaces/path.interface'

/**
 * 缓存项
 */
interface CacheItem<T> {
  data: T
  createdAt: number
  expiresAt: number
  hits: number
}

/**
 * 缓存配置
 */
interface CacheConfig {
  maxMemoryItems: number    // 内存最大缓存项数
  defaultTTL: number        // 默认过期时间（毫秒）
  diskCachePath?: string    // 磁盘缓存路径
}

/**
 * 默认缓存配置
 */
const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxMemoryItems: 1000,
  defaultTTL: 3600000 // 1 小时
}

/**
 * 缓存服务
 */
export class CacheService {
  private static instance: CacheService

  private memoryCache: Map<string, CacheItem<any>> = new Map()
  private config: CacheConfig
  private diskCachePath: string
  private stats = {
    hits: 0,
    misses: 0,
    writes: 0,
    evictions: 0
  }

  private constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config }
    this.diskCachePath = config.diskCachePath || path.join(getPathProvider().getUserDataPath(), 'cache')

    // 确保磁盘缓存目录存在
    if (!fs.existsSync(this.diskCachePath)) {
      fs.mkdirSync(this.diskCachePath, { recursive: true })
    }

    // 定期清理过期缓存
    setInterval(() => this.cleanupExpired(), 60000) // 每分钟清理一次
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: Partial<CacheConfig>): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService(config)
    }
    return CacheService.instance
  }

  /**
   * 生成缓存键
   */
  static createKey(...parts: string[]): string {
    return parts.join(':')
  }

  /**
   * 获取缓存
   */
  get<T>(key: string): T | null {
    const item = this.memoryCache.get(key)

    if (!item) {
      // 尝试从磁盘缓存读取
      const diskItem = this.getFromDisk<T>(key)
      if (diskItem) {
        // 将磁盘缓存加载到内存
        this.memoryCache.set(key, diskItem)
        this.stats.hits++
        return diskItem.data
      }

      this.stats.misses++
      return null
    }

    // 检查是否过期
    if (Date.now() > item.expiresAt) {
      this.memoryCache.delete(key)
      this.stats.misses++
      return null
    }

    item.hits++
    this.stats.hits++
    return item.data
  }

  /**
   * 设置缓存
   */
  set<T>(key: string, data: T, ttl?: number, persistToDisk: boolean = false): void {
    const now = Date.now()
    const expiresAt = now + (ttl || this.config.defaultTTL)

    const item: CacheItem<T> = {
      data,
      createdAt: now,
      expiresAt,
      hits: 0
    }

    // 检查是否需要淘汰
    if (this.memoryCache.size >= this.config.maxMemoryItems) {
      this.evictLRU()
    }

    this.memoryCache.set(key, item)
    this.stats.writes++

    // 可选：持久化到磁盘
    if (persistToDisk) {
      this.saveToDisk(key, item)
    }
  }

  /**
   * 删除缓存
   */
  delete(key: string): boolean {
    const deleted = this.memoryCache.delete(key)

    // 删除磁盘缓存
    const diskPath = this.getDiskPath(key)
    if (fs.existsSync(diskPath)) {
      fs.unlinkSync(diskPath)
    }

    return deleted
  }

  /**
   * 检查缓存是否存在
   */
  has(key: string): boolean {
    const item = this.memoryCache.get(key)
    if (!item) return false

    if (Date.now() > item.expiresAt) {
      this.memoryCache.delete(key)
      return false
    }

    return true
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.memoryCache.clear()
    this.stats = { hits: 0, misses: 0, writes: 0, evictions: 0 }
  }

  /**
   * 获取缓存统计
   */
  getStats(): typeof this.stats & { size: number; hitRate: number } {
    const total = this.stats.hits + this.stats.misses
    return {
      ...this.stats,
      size: this.memoryCache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0
    }
  }

  /**
   * 获取或计算（如果不存在则计算并缓存）
   */
  async getOrCompute<T>(
    key: string,
    computeFn: () => Promise<T>,
    ttl?: number,
    persistToDisk: boolean = false
  ): Promise<T> {
    const cached = this.get<T>(key)
    if (cached !== null) {
      return cached
    }

    const data = await computeFn()
    this.set(key, data, ttl, persistToDisk)
    return data
  }

  // ==================== 私有方法 ====================

  /**
   * 淘汰最近最少使用的缓存项
   */
  private evictLRU(): void {
    let minHits = Infinity
    let lruKey: string | null = null

    for (const [key, item] of this.memoryCache) {
      if (item.hits < minHits) {
        minHits = item.hits
        lruKey = key
      }
    }

    if (lruKey) {
      this.memoryCache.delete(lruKey)
      this.stats.evictions++
    }
  }

  /**
   * 清理过期缓存
   */
  private cleanupExpired(): void {
    const now = Date.now()
    let cleaned = 0

    for (const [key, item] of this.memoryCache) {
      if (now > item.expiresAt) {
        this.memoryCache.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(`[Cache] 清理了 ${cleaned} 个过期缓存项`)
    }
  }

  /**
   * 获取磁盘缓存路径
   */
  private getDiskPath(key: string): string {
    // 对 key 进行安全编码
    const safeKey = Buffer.from(key).toString('base64').replace(/[+/=]/g, '_')
    return path.join(this.diskCachePath, `${safeKey}.cache`)
  }

  /**
   * 保存到磁盘
   */
  private saveToDisk<T>(key: string, item: CacheItem<T>): void {
    try {
      const diskPath = this.getDiskPath(key)
      const data = JSON.stringify(item)
      fs.writeFileSync(diskPath, data, 'utf-8')
    } catch (error) {
      console.error('[Cache] 保存磁盘缓存失败:', error)
    }
  }

  /**
   * 从磁盘读取
   */
  private getFromDisk<T>(key: string): CacheItem<T> | null {
    try {
      const diskPath = this.getDiskPath(key)
      if (!fs.existsSync(diskPath)) return null

      const data = fs.readFileSync(diskPath, 'utf-8')
      const item = JSON.parse(data) as CacheItem<T>

      // 检查是否过期
      if (Date.now() > item.expiresAt) {
        fs.unlinkSync(diskPath)
        return null
      }

      return item
    } catch (error) {
      return null
    }
  }
}

// ==================== 预定义缓存命名空间 ====================

export const CacheNamespaces = {
  AI_RESPONSE: 'ai:response',       // AI 响应缓存
  IMAGE_PROMPT: 'image:prompt',     // 图像生成 Prompt 缓存
  SCRIPT_DATA: 'script:data',       // 剧本数据缓存
  STORYBOARD: 'storyboard:data',    // 分镜数据缓存
  USER_PREFERENCE: 'user:pref'      // 用户偏好缓存
} as const

/**
 * AI 响应缓存辅助函数
 */
export function getCachedAIResponse<T>(
  modelId: string,
  prompt: string,
  computeFn: () => Promise<T>,
  ttl: number = 3600000 // 1 小时
): Promise<T> {
  const cache = CacheService.getInstance()
  const key = CacheService.createKey(
    CacheNamespaces.AI_RESPONSE,
    modelId,
    // 对 prompt 进行简化 hash
    Buffer.from(prompt).toString('base64').slice(0, 32)
  )

  return cache.getOrCompute(key, computeFn, ttl, true)
}