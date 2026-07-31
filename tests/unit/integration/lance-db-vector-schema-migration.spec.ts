/**
 * 步骤0 阶段8：LanceDB schema 迁移端到端测试（验收 0.3，最高风险点）
 * @description 用真实临时 lancedb 目录验证：
 *   1. 旧 vectors 表（5 列，无 projectId）→ ensureVectorSchema 迁移 → 9 列 + 数据保留
 *   2. 二次启动跳过（schema_meta 版本标记）
 *   3. searchByMetadata 在新 schema 上工作
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as lancedb from '@lancedb/lancedb'
import { LanceDBService } from '@core/services/lance-db.service'

let tmpDir: string

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-lance-test-'))
})

afterAll(() => {
  // 清理临时目录
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    /* 忽略 */
  }
  // 重置单例
  ;(LanceDBService as any).instance = undefined
})

/**
 * 在指定 dataPath 的 lancedb 子目录里建一个旧 schema（5 列）的 vectors 表。
 * 注意：initialize 内部用 path.join(dataPath, 'lancedb')，所以这里也必须用同样的路径。
 */
async function buildOldSchemaLance(dataPath: string, rowCount = 3): Promise<void> {
  const lancePath = path.join(dataPath, 'lancedb')
  const conn = await lancedb.connect(lancePath)
  const oldRecords = Array.from({ length: rowCount }, (_, i) => ({
    id: `old_${i}`,
    chunkId: `chunk_${i}`,
    knowledgeBaseId: 'kb_legacy',
    vector: [0.1 * i, 0.2 * i, 0.3 * i, 0.4 * i],
    createdAt: new Date().toISOString(),
  }))
  await conn.createTable('vectors', oldRecords as any, { mode: 'overwrite' })
}

describe('LanceDB schema 迁移（验收 0.3）', () => {
  it('旧 5 列 vectors 表 → ensureVectorSchema 迁移到 9 列 + 数据保留', async () => {
    ;(LanceDBService as any).instance = undefined
    const dataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-migrate-'))
    try {
      await buildOldSchemaLance(dataPath, 3)

      const svc = LanceDBService.getInstance()
      await svc.initialize(dataPath) // initialize 内部会调 ensureVectorSchema

      // 迁移后表存在且行数一致（数据保留）
      const stats = await svc.getStats()
      expect(stats.totalVectors).toBe(3)

      // 旧 KB 数据 projectId 为 null → countByProject 返回 0（隔离验证）
      const lwCount = await svc.countByProject('any_project')
      expect(lwCount).toBe(0)

      // 迁移后能 searchByMetadata（新 schema 列存在）
      const results = await svc.searchByMetadata([0.1, 0.2, 0.3, 0.4], { projectId: 'p1' }, 5)
      // 旧数据 projectId=null，按 p1 过滤应返回 0 条
      expect(results).toHaveLength(0)
    } finally {
      fs.rmSync(dataPath, { recursive: true, force: true })
    }
  })

  it('二次 initialize 跳过迁移（schema_meta 版本标记）', async () => {
    const dataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-idempotent-'))
    try {
      ;(LanceDBService as any).instance = undefined
      await buildOldSchemaLance(dataPath, 2)

      const svc1 = LanceDBService.getInstance()
      await svc1.initialize(dataPath)
      const stats1 = await svc1.getStats()
      expect(stats1.totalVectors).toBe(2)

      // 第二次初始化（已是新 schema + 版本标记）→ 不应再迁移，数据不丢
      ;(LanceDBService as any).instance = undefined
      const svc2 = LanceDBService.getInstance()
      await svc2.initialize(dataPath)
      const stats2 = await svc2.getStats()
      expect(stats2.totalVectors).toBe(2)
    } finally {
      fs.rmSync(dataPath, { recursive: true, force: true })
    }
  })

  it('新库（无 vectors 表）initialize 不报错', async () => {
    ;(LanceDBService as any).instance = undefined
    const newTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-empty-'))
    try {
      const svc = LanceDBService.getInstance()
      await svc.initialize(newTmp)
      // 空库，stats 为 0
      const stats = await svc.getStats()
      expect(stats.totalVectors).toBe(0)
    } finally {
      fs.rmSync(newTmp, { recursive: true, force: true })
    }
  })
})
