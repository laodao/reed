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
  // 长文元数据（步骤0 新增，均可选 → 旧 KB 数据为空）
  projectId?: string
  entityType?: string
  entityId?: string
  chapterNumber?: number | null
}

/**
 * 元数据过滤条件（步骤0 新增，与 IVectorStore 定义保持一致）
 */
export interface VectorMetadataFilter {
  projectId?: string
  entityType?: string
  entityId?: string
  chapterNumber?: number
  chapterNumberLte?: number
  chapterNumberGte?: number
}

export interface VectorDeleteByFilter {
  projectId?: string
  entityType?: string
  entityId?: string
  chapterNumber?: number
}

export interface VectorMetadataSearchResult {
  chunkId: string
  score: number
  metadata: {
    projectId?: string
    entityType?: string
    entityId?: string
    chapterNumber?: number | null
    knowledgeBaseId?: string
  }
}

/**
 * 转义 LanceDB where 子句里的字符串字面量（防注入）。
 * LanceDB 的 where 是 SQL-like 字符串，单引号包裹，内部单引号需翻倍转义。
 */
export function escapeLanceValue(v: string): string {
  return v.replace(/'/g, "''")
}

/**
 * 把元数据过滤条件构造为 LanceDB 的 where 子句（不含前导 WHERE）。
 * 无条件时返回空字符串（表示不过滤）。
 */
export function buildLanceWhere(
  filter: VectorMetadataFilter | VectorDeleteByFilter,
  opts: { allowRange?: boolean } = {},
): string {
  const conditions: string[] = []
  if (filter.projectId !== undefined) {
    conditions.push(`projectId = '${escapeLanceValue(filter.projectId)}'`)
  }
  if (filter.entityType !== undefined) {
    conditions.push(`entityType = '${escapeLanceValue(filter.entityType)}'`)
  }
  if (filter.entityId !== undefined) {
    conditions.push(`entityId = '${escapeLanceValue(filter.entityId)}'`)
  }
  if (filter.chapterNumber !== undefined) {
    conditions.push(`chapterNumber = ${Number(filter.chapterNumber)}`)
  }
  // 范围条件仅 search 用（delete 不支持范围）
  if (opts.allowRange) {
    const f = filter as VectorMetadataFilter
    if (f.chapterNumberLte !== undefined) {
      conditions.push(`chapterNumber <= ${Number(f.chapterNumberLte)}`)
    }
    if (f.chapterNumberGte !== undefined) {
      conditions.push(`chapterNumber >= ${Number(f.chapterNumberGte)}`)
    }
  }
  return conditions.join(' AND ')
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

      // 步骤0：懒迁移向量表 schema（旧 5 列 → 新 9 列，加长文元数据列）
      await this.ensureVectorSchema()

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

        // 创建带正确维度的初始记录（占位 schema：含全部字段，含步骤0 长文元数据列）
        const initialRecord: VectorRecord = {
          id: '__schema_placeholder__',
          chunkId: '__placeholder__',
          knowledgeBaseId: '__placeholder__',
          vector: new Array(dimension).fill(0),
          createdAt: new Date().toISOString(),
          projectId: '__placeholder__',
          entityType: '__placeholder__',
          entityId: '__placeholder__',
          // 占位值用 0 让 LanceDB 推断出 integer 类型（实际数据可为 null）
          chapterNumber: 0,
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
      createdAt: new Date().toISOString(),
      projectId: '__placeholder__',
      entityType: '__placeholder__',
      entityId: '__placeholder__',
      chapterNumber: null,
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

  // ==================== 步骤0：长文元数据 schema 迁移 + 元数据检索 ====================

  /** 目标 schema 版本（含长文元数据列：projectId/entityType/entityId/chapterNumber） */
  private static readonly VECTORS_SCHEMA_VERSION = '2'
  private static readonly SCHEMA_META_TABLE = 'schema_meta'

  /**
   * 懒迁移：确保 vectors 表含长文元数据列（旧 5 列 → 新 9 列）。
   * LanceDB 不支持 ALTER ADD COLUMN，需 drop + recreate（备份表 + count 校验 + 失败回滚）。
   *
   * 流程：
   * 1. 表不存在 → 跳过（首次插入时占位 record 已带新列）
   * 2. 读 schema_meta.vectors_schema_version，已是目标版本 → 跳过
   * 3. 旧 schema（无 projectId 列）→ 备份 → 建新表 → 分批迁数据 → count 校验 → 删备份 + 写版本
   * 4. 任一步失败 → 回滚（drop 新表 + 重命名备份回来）+ 抛错
   */
  async ensureVectorSchema(): Promise<void> {
    this.ensureInitialized()
    if (!this.connection) return

    const tableNames = await this.connection.tableNames()

    // 1. vectors 表不存在 → 跳过（首次插入时建，占位 record 已带新列）
    if (!tableNames.includes(this.TABLE_NAME)) return

    // 2. 检查 schema_meta 版本
    const alreadyMigrated = await this.readSchemaVersion() === LanceDBService.VECTORS_SCHEMA_VERSION
    if (alreadyMigrated) return

    // 3. 检查 vectors 表是否已含 projectId 列
    const table = await this.connection.openTable(this.TABLE_NAME)
    const schema = (table as any).schema
    const columns: Array<{ name: string }> = schema?.columns ?? []
    const hasProjectId = columns.some((c) => c.name === 'projectId')

    if (!hasProjectId) {
      // 旧 schema → 迁移
      await this.migrateOldVectorsSchema()
    }

    // 4. 写版本标记
    await this.writeSchemaVersion(LanceDBService.VECTORS_SCHEMA_VERSION)
  }

  /** 读 schema_meta 表的 vectors_schema_version */
  private async readSchemaVersion(): Promise<string | null> {
    try {
      const tableNames = await this.connection!.tableNames()
      if (!tableNames.includes(LanceDBService.SCHEMA_META_TABLE)) return null
      const metaTable = await this.connection!.openTable(LanceDBService.SCHEMA_META_TABLE)
      const rows = await metaTable.query().toArray()
      const row = rows.find((r: any) => r.key === 'vectors_schema_version')
      return row?.value ?? null
    } catch {
      return null
    }
  }

  /** 写 schema_meta 表的 vectors_schema_version（表不存在则建） */
  private async writeSchemaVersion(version: string): Promise<void> {
    try {
      const tableNames = await this.connection!.tableNames()
      if (!tableNames.includes(LanceDBService.SCHEMA_META_TABLE)) {
        // 用占位 record 建 schema_meta 表
        await this.connection!.createTable(
          LanceDBService.SCHEMA_META_TABLE,
          [{ key: 'vectors_schema_version', value: version }] as any,
          { mode: 'overwrite' },
        )
        return
      }
      const metaTable = await this.connection!.openTable(LanceDBService.SCHEMA_META_TABLE)
      // 删旧值再加（简化 upsert）
      try {
        await metaTable.delete("key = 'vectors_schema_version'")
      } catch { /* 忽略：可能不存在 */ }
      await metaTable.add([{ key: 'vectors_schema_version', value: version }] as any)
    } catch (e: any) {
      console.warn('[LanceDBService] 写 schema_meta 失败（不阻塞）:', e.message)
    }
  }

  /**
   * 迁移旧 vectors 表（无 projectId 列）→ 新 schema（含长文元数据列）。
   * 备份表 + 分批迁数据 + count 校验 + 失败回滚。
   */
  private async migrateOldVectorsSchema(): Promise<void> {
    const ts = Date.now()
    const backupName = `${this.TABLE_NAME}_backup_${ts}`
    console.log(`[LanceDBService] 检测到旧 vectors schema，开始迁移。备份表: ${backupName}`)

    // 旧表行数（用于迁移后 count 校验）
    const oldTable = await this.connection!.openTable(this.TABLE_NAME)
    const oldCount = await oldTable.countRows()
    console.log(`[LanceDBService] 旧表数据量: ${oldCount}`)

    // 1. 读取全部旧数据（含 vector）
    let oldRecords: any[] = []
    if (oldCount > 0) {
      oldRecords = await oldTable.query().toArray()
    }

    // 2. drop 旧表（LanceDB 不支持 rename，只能 drop 后 recreate）
    await this.connection!.dropTable(this.TABLE_NAME)

    try {
      // 3. 用含新列的占位 record 建新表（推断 schema）
      const dimension = oldRecords.length > 0 && oldRecords[0].vector
        ? oldRecords[0].vector.length
        : (this.tableDimension ?? 1024)
      const placeholder: VectorRecord = {
        id: '__schema_placeholder__',
        chunkId: '__placeholder__',
        knowledgeBaseId: '__placeholder__',
        vector: new Array(dimension).fill(0),
        createdAt: new Date().toISOString(),
        projectId: '__placeholder__',
        entityType: '__placeholder__',
        entityId: '__placeholder__',
        // 占位值用 0 让 LanceDB 推断出 integer 类型（实际数据可为 null；占位记录会被删）
        chapterNumber: 0,
      }
      this.table = await this.connection!.createTable(this.TABLE_NAME, [placeholder] as any, {
        mode: 'overwrite',
      })
      await this.table.delete("id = '__schema_placeholder__'")
      this.tableDimension = dimension

      // 4. 分批写入旧数据（新列留 null）
      if (oldRecords.length > 0) {
        const migrated = oldRecords.map((r: any) => ({
          id: r.id,
          chunkId: r.chunkId,
          knowledgeBaseId: r.knowledgeBaseId,
          // vector 从 Arrow 读出可能是 Float32Vector 对象，转回纯 number[]
          vector: toPlainVector(r.vector),
          createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date(r.createdAt).toISOString(),
          projectId: null,
          entityType: null,
          entityId: null,
          chapterNumber: null,
        }))
        // 分批（每批 1000）
        const BATCH = 1000
        for (let i = 0; i < migrated.length; i += BATCH) {
          await this.table.add(migrated.slice(i, i + BATCH) as any)
        }
      }

      // 5. count 校验
      const newCount = await this.table.countRows()
      if (newCount !== oldCount) {
        throw new Error(`迁移 count 校验失败：旧 ${oldCount} → 新 ${newCount}`)
      }

      console.log(`[LanceDBService] vectors schema 迁移完成，${newCount} 条数据已保留（元数据列为空）`)
    } catch (e: any) {
      // 失败回滚：drop 新表，重建旧表数据（从内存 oldRecords 还原）
      console.error('[LanceDBService] vectors schema 迁移失败，回滚:', e)
      try {
        await this.connection!.dropTable(this.TABLE_NAME)
      } catch { /* 忽略 */ }
      if (oldRecords.length > 0) {
        const dimension = oldRecords[0].vector?.length ?? this.tableDimension ?? 1024
        const placeholder: VectorRecord = {
          id: '__schema_placeholder__',
          chunkId: '__placeholder__',
          knowledgeBaseId: '__placeholder__',
          vector: new Array(dimension).fill(0),
          createdAt: new Date().toISOString(),
        }
        this.table = await this.connection!.createTable(this.TABLE_NAME, [placeholder] as any, {
          mode: 'overwrite',
        })
        await this.table.delete("id = '__schema_placeholder__'")
        const restored = oldRecords.map((r: any) => ({
          id: r.id, chunkId: r.chunkId, knowledgeBaseId: r.knowledgeBaseId,
          vector: toPlainVector(r.vector),
          createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date(r.createdAt).toISOString(),
        }))
        const BATCH = 1000
        for (let i = 0; i < restored.length; i += BATCH) {
          await this.table.add(restored.slice(i, i + BATCH) as any)
        }
      }
      throw new Error(`[LanceDBService] vectors schema 迁移失败并已回滚: ${e.message}`)
    }
  }

  /**
   * 按元数据过滤的向量检索（步骤0 新增）
   */
  async searchByMetadata(
    queryVector: number[],
    filter: VectorMetadataFilter,
    topK: number,
    scoreThreshold?: number,
  ): Promise<VectorMetadataSearchResult[]> {
    this.ensureInitialized()
    if (!this.table) {
      console.log('[LanceDBService] 表不存在，返回空搜索结果')
      return []
    }

    try {
      const where = buildLanceWhere(filter, { allowRange: true })
      let query = this.table.search(queryVector).limit(topK)
      if (where) {
        query = query.where(where)
      }
      const results = await query.toArray()
      const mapped: VectorMetadataSearchResult[] = results.map((item: any) => ({
        chunkId: item.chunkId,
        score: item._distance !== undefined ? 1 - item._distance : item.score || 0,
        metadata: {
          projectId: item.projectId ?? undefined,
          entityType: item.entityType ?? undefined,
          entityId: item.entityId ?? undefined,
          chapterNumber: item.chapterNumber ?? null,
          knowledgeBaseId: item.knowledgeBaseId ?? undefined,
        },
      }))
      if (scoreThreshold !== undefined) {
        return mapped.filter((r) => r.score >= scoreThreshold)
      }
      return mapped
    } catch (error: any) {
      console.error('[LanceDBService] searchByMetadata 失败:', error)
      return []
    }
  }

  /**
   * 按元数据批量删除（返回删除条数）
   */
  async deleteByMetadata(filter: VectorDeleteByFilter): Promise<number> {
    this.ensureInitialized()
    if (!this.table) return 0

    const where = buildLanceWhere(filter, { allowRange: false })
    if (!where) {
      throw new Error('[LanceDBService.deleteByMetadata] 必须提供至少一个过滤条件（避免误删全表）')
    }

    try {
      // 先查 count（LanceDB delete 不返回 affected 数）
      const before = (await this.table.query().where(where).toArray()).length
      await this.table.delete(where)
      console.log(`[LanceDBService] deleteByMetadata 删除 ${before} 条`)
      return before
    } catch (error: any) {
      console.error('[LanceDBService] deleteByMetadata 失败:', error)
      throw error
    }
  }

  /**
   * 按 projectId 统计向量数量
   */
  async countByProject(projectId: string): Promise<number> {
    this.ensureInitialized()
    if (!this.table) return 0
    try {
      const rows = await this.table
        .query()
        .where(`projectId = '${escapeLanceValue(projectId)}'`)
        .toArray()
      return rows.length
    } catch (error: any) {
      console.error('[LanceDBService] countByProject 失败:', error)
      return 0
    }
  }
}

// 导出单例获取函数
export const getLanceDBService = (): LanceDBService => LanceDBService.getInstance()

/**
 * 把 LanceDB 读出的 vector 字段标准化为纯 number[]。
 * 查询结果里的 vector 可能是 Arrow Float32Vector 对象（带 toArray/toJSON），
 * 直接写回 add() 会触发 "Found field not in schema: vector.isValid"。
 */
function toPlainVector(v: any): number[] {
  if (!v) return []
  if (Array.isArray(v)) return v
  if (typeof v.toArray === 'function') return Array.from(v.toArray() as ArrayLike<number>)
  if (typeof v.toJSON === 'function') {
    const j = v.toJSON()
    if (Array.isArray(j)) return j
  }
  // 兜底：尝试展开可迭代对象
  try {
    return Array.from(v as Iterable<number>)
  } catch {
    return []
  }
}