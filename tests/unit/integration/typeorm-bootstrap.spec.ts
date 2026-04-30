/**
 * 集成测试：模拟 DatabaseManager 启动路径
 * 1. 用 raw SQL 在临时 sqlite 文件上创建现有 schema（模拟旧用户）
 * 2. 创建 TypeORM DataSource 指向同一文件
 * 3. 跑漂移检查 → 期望 ok=true（Entity 严格对齐 raw DDL）
 * 4. 用 ApiKeyRepository 读写
 *
 * 这个测试覆盖 Electron 端"better-sqlite3 + TypeORM 并存"的关键路径。
 */

import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDataSource } from '@core/database/data-source'
import { checkSchemaDrift } from '@core/database/schema-drift'
import { ApiKeyRepository } from '@core/database/repositories/api-key.repository'
import { SettingsRepository } from '@core/database/repositories/settings.repository'

const RAW_DDL_API_KEYS = `
  CREATE TABLE IF NOT EXISTS api_keys (
    provider TEXT PRIMARY KEY,
    encrypted_key TEXT NOT NULL,
    endpoint TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`

const RAW_DDL_SETTINGS = `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`

describe('TypeORM bootstrap 集成（带 raw DDL 的 sqlite 文件）', () => {
  let tmpDir: string
  let dbPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'the-bot-test-'))
    dbPath = join(tmpDir, 'the_bot.db')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('现有 raw DDL 创建的 api_keys 表与 ApiKeyEntity 0 漂移，且能读写', async () => {
    const rawDb = new Database(dbPath)
    rawDb.prepare(RAW_DDL_API_KEYS).run()
    rawDb.close()

    const ds = await createDataSource({
      config: { type: 'sqlite', database: dbPath, enableWal: true },
    })

    try {
      const report = await checkSchemaDrift(ds)
      expect(report.missingColumns).toEqual([])
      expect(report.typeMismatches).toEqual([])
      expect(report.ok).toBe(true)

      const repo = new ApiKeyRepository(ds)
      await repo.save('openai', 'enc-key', 'https://api.openai.com')
      const got = await repo.get('openai')
      expect(got).toEqual({
        encryptedKey: 'enc-key',
        endpoint: 'https://api.openai.com',
      })
      expect(await repo.exists('openai')).toBe(true)
      await repo.delete('openai')
      expect(await repo.exists('openai')).toBe(false)
    } finally {
      await ds.destroy()
    }
  })

  it('现有 raw DDL 创建的 settings 表与 SettingsEntity 0 漂移，且能读写 JSON', async () => {
    const rawDb = new Database(dbPath)
    rawDb.prepare(RAW_DDL_SETTINGS).run()
    rawDb.close()

    const ds = await createDataSource({
      config: { type: 'sqlite', database: dbPath, enableWal: true },
    })

    try {
      const report = await checkSchemaDrift(ds)
      expect(report.missingColumns).toEqual([])
      expect(report.typeMismatches).toEqual([])
      expect(report.ok).toBe(true)

      const repo = new SettingsRepository(ds)
      await repo.set('theme', 'dark')
      await repo.set('cfg', { font: 'noto', size: 14 })
      expect(await repo.get('theme')).toBe('dark')
      expect(await repo.get('cfg')).toEqual({ font: 'noto', size: 14 })
      expect(await repo.getAll()).toEqual({
        theme: 'dark',
        cfg: { font: 'noto', size: 14 },
      })
    } finally {
      await ds.destroy()
    }
  })

  it('两张表共存场景（api_keys + settings）漂移检查全 ok', async () => {
    const rawDb = new Database(dbPath)
    rawDb.prepare(RAW_DDL_API_KEYS).run()
    rawDb.prepare(RAW_DDL_SETTINGS).run()
    rawDb.close()

    const ds = await createDataSource({
      config: { type: 'sqlite', database: dbPath, enableWal: true },
    })

    try {
      const report = await checkSchemaDrift(ds)
      expect(report.ok).toBe(true)
      expect(report.missingColumns).toEqual([])
      expect(report.typeMismatches).toEqual([])
    } finally {
      await ds.destroy()
    }
  })

  it('search_engine_configs raw DDL 与 SearchEngineConfigEntity 0 漂移', async () => {
    const rawDb = new Database(dbPath)
    rawDb.prepare(`
      CREATE TABLE IF NOT EXISTS search_engine_configs (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        name TEXT NOT NULL,
        api_key_encrypted TEXT,
        extra_config TEXT,
        max_results INTEGER DEFAULT 5,
        is_enabled INTEGER DEFAULT 1,
        is_default INTEGER DEFAULT 0,
        last_tested DATETIME,
        test_result TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run()
    rawDb.close()

    const ds = await createDataSource({
      config: { type: 'sqlite', database: dbPath, enableWal: true },
    })

    try {
      const report = await checkSchemaDrift(ds)
      expect(report.missingColumns).toEqual([])
      expect(report.typeMismatches).toEqual([])
      expect(report.ok).toBe(true)
    } finally {
      await ds.destroy()
    }
  })

  it('表不存在场景（新装用户）漂移检查放行（让 synchronize 建表）', async () => {
    const ds = await createDataSource({
      config: { type: 'sqlite', database: dbPath, enableWal: false },
    })
    try {
      const report = await checkSchemaDrift(ds)
      expect(report.ok).toBe(true)
      expect(report.missingColumns).toEqual([])
    } finally {
      await ds.destroy()
    }
  })
})
