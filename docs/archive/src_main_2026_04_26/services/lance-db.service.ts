/**
 * LanceDB 向量数据库服务
 * @module services/lance-db.service
 * @description 封装 LanceDB 向量数据库操作，提供高效的向量存储和检索能力
 */

import * as lancedb from '@lancedb/lancedb'
import type { Table, Connection } from '@lancedb/lancedb'
import * as path from 'path'
import * as fs from 'fs'

/**
 * 向量记录结构
 * 注意：LanceDB 不支持 Date 类型，使用字符串存储日期
 */
export interface VectorRecord {
  id: string
  chunkId: string
  knowledgeBaseId: string
  vector: number[]
  createdAt: string  // ISO 格式日期字符串
}

/**
 * 向量搜索结果
 */
export interface VectorSearchResult {
  chunkId: string
  score: number
}

/**
 * LanceDB 服务
 * 单例模式，管理向量数据库连接和操作
 */
export class LanceDBService {
  private static instance: LanceDBService
  private connection: Connection | null = null
  private table: Table | null = null
  private dbPath: string | null = null
  private readonly TABLE_NAME = 'vectors'
  private tableDimension: number | null = null  // 当前表的向量维度

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): LanceDBService {
    if (!LanceDBService.instance) {
      LanceDBService.instance = new LanceDBService()
    }
    return LanceDBService.instance
  }

  /**
   * 初始化数据库连接
   * @param dataPath 数据存储路径
   */
  async initialize(dataPath: string): Promise<void> {
    try {
      // 设置 LanceDB 存储路径
      this.dbPath = path.join(dataPath, 'lancedb')

      // 确保目录存在
      if (!fs.existsSync(this.dbPath)) {
        fs.mkdirSync(this.dbPath, { recursive: true })
      }

      // 连接数据库
      this.connection = await lancedb.connect(this.dbPath)

      // 检查表是否存在
      const tableNames = await this.connection.tableNames()

      if (tableNames.includes(this.TABLE_NAME)) {
        // 打开现有表
        this.table = await this.connection.openTable(this.TABLE_NAME)
        // 获取现有表的向量维度
        const stats = await this.table.countRows()
        if (stats > 0) {
          // 从第一条记录获取维度
          try {
            const sample = await this.table.query().limit(1).toArray()
            if (sample.length > 0 && sample[0].vector) {
              this.tableDimension = sample[0].vector.length
              console.log(`[LanceDBService] 已打开现有向量表，维度: ${this.tableDimension}`)
            }
          } catch (e) {
            console.warn('[LanceDBService] 无法获取样本向量，跳过维度检测')
          }
        } else {
          console.log('[LanceDBService] 已打开现有向量表（空表）')
        }
      } else {
        console.log('[LanceDBService] 向量表不存在，将在第一次插入时创建')
      }

      console.log('[LanceDBService] 初始化完成:', this.dbPath)
    } catch (error: any) {
      console.error('[LanceDBService] 初始化失败:', error)
      throw error
    }
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.connection !== null
  }

  /**
   * 检查表是否存在
   */
  hasTable(): boolean {
    return this.table !== null
  }

  /**
   * 确保已初始化
   */
  private ensureInitialized(): void {
    if (!this.isInitialized()) {
      throw new Error('LanceDB 未初始化，请先调用 initialize()')
    }
  }

  /**
   * 确保表存在
   */
  private ensureTableExists(): void {
    if (!this.table) {
      throw new Error('向量表不存在，请先插入数据')
    }
  }

  /**
   * 插入向量记录
   * @param records 向量记录数组
   */
  async insertVectors(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) return

    try {
      // 如果表不存在，根据第一个向量的维度创建
      if (!this.table) {
        const dimension = records[0].vector.length
        console.log(`[LanceDBService] 创建新向量表，维度: ${dimension}`)

        // 创建带正确维度的初始记录
        const initialRecord: VectorRecord = {
          id: '__schema_placeholder__',
          chunkId: '__placeholder__',
          knowledgeBaseId: '__placeholder__',
          vector: new Array(dimension).fill(0),
          createdAt: new Date().toISOString()
        }

        this.table = await this.connection!.createTable(this.TABLE_NAME, [initialRecord], {
          mode: 'overwrite'
        })

        // 删除占位记录
        await this.table.delete("id = '__schema_placeholder__'")
        this.tableDimension = dimension
        console.log(`[LanceDBService] 向量表创建完成，维度: ${dimension}`)
      }

      // 检查向量维度是否匹配
      const insertDimension = records[0].vector.length
      if (this.tableDimension !== null && insertDimension !== this.tableDimension) {
        console.warn(`[LanceDBService] 警告: 插入向量维度 ${insertDimension} 与表维度 ${this.tableDimension} 不匹配`)
        // 维度不匹配时，需要重建表（这会丢失数据，但在开发阶段是可接受的）
        console.log('[LanceDBService] 重建向量表以适应新维度...')
        await this.recreateTableWithDimension(insertDimension)
      }

      await this.table!.add(records)
      console.log(`[LanceDBService] 已插入 ${records.length} 条向量记录`)
    } catch (error: any) {
      console.error('[LanceDBService] 插入向量失败:', error)
      throw error
    }
  }

  /**
   * 使用新维度重建向量表
   * @param dimension 新的向量维度
   */
  private async recreateTableWithDimension(dimension: number): Promise<void> {
    if (!this.connection) return

    console.log(`[LanceDBService] 重建向量表，新维度: ${dimension}`)

    // 删除旧表
    try {
      await this.connection.dropTable(this.TABLE_NAME)
    } catch {
      // 忽略删除错误
    }

    // 创建新表
    const initialRecord: VectorRecord = {
      id: '__schema_placeholder__',
      chunkId: '__placeholder__',
      knowledgeBaseId: '__placeholder__',
      vector: new Array(dimension).fill(0),
      createdAt: new Date().toISOString()
    }

    this.table = await this.connection.createTable(this.TABLE_NAME, [initialRecord], {
      mode: 'overwrite'
    })

    // 删除占位记录
    await this.table.delete("id = '__schema_placeholder__'")
    this.tableDimension = dimension
    console.log(`[LanceDBService] 向量表重建完成`)
  }

  /**
   * 向量相似度搜索
   * @param knowledgeBaseId 知识库 ID
   * @param queryVector 查询向量
   * @param topK 返回结果数量
   * @returns 搜索结果数组
   */
  async searchSimilar(
    knowledgeBaseId: string,
    queryVector: number[],
    topK: number
  ): Promise<VectorSearchResult[]> {
    this.ensureInitialized()

    // 表不存在则返回空结果
    if (!this.table) {
      console.log('[LanceDBService] 表不存在，返回空搜索结果')
      return []
    }

    try {
      // 使用 LanceDB 的向量搜索
      const results = await this.table!
        .search(queryVector)
        .where(`knowledgeBaseId = '${knowledgeBaseId}'`)
        .limit(topK)
        .toArray()

      // 转换结果格式
      return results.map((item: any) => ({
        chunkId: item.chunkId,
        score: item._distance !== undefined ? 1 - item._distance : item.score || 0
      }))
    } catch (error: any) {
      console.error('[LanceDBService] 向量搜索失败:', error)
      return []
    }
  }

  /**
   * 根据切片 ID 删除向量
   * @param chunkId 切片 ID
   */
  async deleteByChunkId(chunkId: string): Promise<void> {
    this.ensureInitialized()
    if (!this.table) return

    try {
      await this.table!.delete(`chunkId = '${chunkId}'`)
      console.log(`[LanceDBService] 已删除切片 ${chunkId} 的向量`)
    } catch (error: any) {
      console.error('[LanceDBService] 删除向量失败:', error)
      throw error
    }
  }

  /**
   * 根据切片 ID 列表删除向量
   * @param chunkIds 切片 ID 列表
   */
  async deleteByChunkIds(chunkIds: string[]): Promise<void> {
    this.ensureInitialized()
    if (!this.table || chunkIds.length === 0) return

    try {
      // 构建 IN 条件
      const inClause = chunkIds.map(id => `'${id}'`).join(',')
      await this.table!.delete(`chunkId IN (${inClause})`)
      console.log(`[LanceDBService] 已删除 ${chunkIds.length} 个切片的向量`)
    } catch (error: any) {
      console.error('[LanceDBService] 批量删除向量失败:', error)
      throw error
    }
  }

  /**
   * 根据文档 ID 删除向量
   * 注意：需要先查询该文档下所有切片 ID，再删除
   * @param chunkIds 文档关联的切片 ID 列表
   */
  async deleteByDocumentId(chunkIds: string[]): Promise<void> {
    await this.deleteByChunkIds(chunkIds)
  }

  /**
   * 根据知识库 ID 删除所有向量
   * @param knowledgeBaseId 知识库 ID
   */
  async deleteByKnowledgeBaseId(knowledgeBaseId: string): Promise<void> {
    this.ensureInitialized()
    if (!this.table) return

    try {
      await this.table!.delete(`knowledgeBaseId = '${knowledgeBaseId}'`)
      console.log(`[LanceDBService] 已删除知识库 ${knowledgeBaseId} 的所有向量`)
    } catch (error: any) {
      console.error('[LanceDBService] 删除知识库向量失败:', error)
      throw error
    }
  }

  /**
   * 统计知识库的向量数量
   * @param knowledgeBaseId 知识库 ID
   * @returns 向量数量
   */
  async countByKnowledgeBaseId(knowledgeBaseId: string): Promise<number> {
    this.ensureInitialized()
    if (!this.table) return 0

    try {
      // 使用 filter 过滤后统计
      const results = await this.table!
        .query()
        .where(`knowledgeBaseId = '${knowledgeBaseId}'`)
        .toArray()

      return results.length
    } catch (error: any) {
      console.error('[LanceDBService] 统计向量数量失败:', error)
      return 0
    }
  }

  /**
   * 检查切片是否有向量
   * @param chunkId 切片 ID
   * @returns 是否存在
   */
  async hasVector(chunkId: string): Promise<boolean> {
    this.ensureInitialized()
    if (!this.table) return false

    try {
      const results = await this.table!
        .query()
        .where(`chunkId = '${chunkId}'`)
        .limit(1)
        .toArray()

      return results.length > 0
    } catch (error: any) {
      console.error('[LanceDBService] 检查向量失败:', error)
      return false
    }
  }

  /**
   * 根据切片 ID 获取向量
   * @param chunkId 切片 ID
   * @returns 向量记录或 null
   */
  async getVectorByChunkId(chunkId: string): Promise<VectorRecord | null> {
    this.ensureInitialized()
    if (!this.table) return null

    try {
      const results = await this.table!
        .query()
        .where(`chunkId = '${chunkId}'`)
        .limit(1)
        .toArray()

      if (results.length > 0) {
        return results[0] as VectorRecord
      }
      return null
    } catch (error: any) {
      console.error('[LanceDBService] 获取向量失败:', error)
      return null
    }
  }

  /**
   * 获取数据库路径
   */
  getDbPath(): string | null {
    return this.dbPath
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    // LanceDB 没有显式的 close 方法
    // 连接会在进程退出时自动清理
    this.connection = null
    this.table = null
    console.log('[LanceDBService] 已关闭连接')
  }

  /**
   * 获取表统计信息
   */
  async getStats(): Promise<{ totalVectors: number }> {
    this.ensureInitialized()
    if (!this.table) return { totalVectors: 0 }

    try {
      const totalVectors = await this.table!.countRows()
      return { totalVectors }
    } catch (error: any) {
      console.error('[LanceDBService] 获取统计信息失败:', error)
      return { totalVectors: 0 }
    }
  }
}

// 导出单例获取函数
export const getLanceDBService = (): LanceDBService => LanceDBService.getInstance()