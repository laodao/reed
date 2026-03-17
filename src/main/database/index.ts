/**
 * 数据库管理器
 * @module database/index
 * @description 使用 sql.js 管理 SQLite 数据库
 */

import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { SettingsRepository } from './repositories/settings.repository'
import { ApiKeyRepository } from './repositories/api-key.repository'
import { DialogRepository } from './repositories/dialog.repository'
import { MessageRepository } from './repositories/message.repository'
import { RoleRepository } from './repositories/role.repository'
import { ImageRepository } from './repositories/image.repository'
import { ProviderConfigRepository } from './repositories/provider-config.repository'

/**
 * 数据库管理器
 */
export class DatabaseManager {
  private static instance: DatabaseManager
  private db: SqlJsDatabase | null = null
  private SQL: SqlJsStatic | null = null
  private dbPath: string

  // 仓库实例
  public settings: SettingsRepository | null = null
  public apiKeys: ApiKeyRepository | null = null
  public dialogs: DialogRepository | null = null
  public messages: MessageRepository | null = null
  public roles: RoleRepository | null = null
  public images: ImageRepository | null = null
  public providerConfigs: ProviderConfigRepository | null = null

  private constructor() {
    const userDataPath = app.getPath('userData')
    this.dbPath = path.join(userDataPath, 'the_bot.db')
  }

  /**
   * 获取单例实例
   */
  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager()
    }
    return DatabaseManager.instance
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    // 初始化 sql.js - 在 Electron 中直接读取 WASM 文件
    // 尝试多个可能的路径
    const possiblePaths = [
      // 编译后: out/main/ -> the_bot/node_modules
      path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
      // 备选: out/main/ -> out -> the_bot -> node_modules
      path.join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
      // 开发模式: src/main -> the_bot/node_modules
      path.join(__dirname, '..', '..', '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
    ]

    let wasmPath: string | null = null
    for (const p of possiblePaths) {
      console.log('Trying path:', p)
      if (fs.existsSync(p)) {
        wasmPath = p
        break
      }
    }

    if (!wasmPath) {
      throw new Error('Could not find sql-wasm.wasm in any of the expected locations')
    }

    console.log('Loading WASM from:', wasmPath)

    const wasmBinary = fs.readFileSync(wasmPath)

    this.SQL = await initSqlJs({
      wasmBinary
    })

    // 尝试加载现有数据库
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath)
      this.db = new this.SQL.Database(buffer)
    } else {
      this.db = new this.SQL.Database()
    }

    // 初始化表结构
    this.initTables()

    // 初始化仓库
    this.initRepositories()
  }

  /**
   * 初始化表结构
   */
  private initTables(): void {
    if (!this.db) return

    // 设置表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // API密钥表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS api_keys (
        provider TEXT PRIMARY KEY,
        encrypted_key TEXT NOT NULL,
        endpoint TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 角色表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        system_prompt TEXT,
        avatar TEXT,
        is_builtin INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 对话表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS dialogs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        model_id TEXT NOT NULL,
        role_id TEXT,
        system_prompt TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        message_count INTEGER DEFAULT 0,
        FOREIGN KEY (role_id) REFERENCES roles(id)
      )
    `)

    // 消息表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        dialog_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        model_id TEXT,
        tokens_used INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dialog_id) REFERENCES dialogs(id) ON DELETE CASCADE
      )
    `)

    // 图片表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        dialog_id TEXT,
        message_id TEXT,
        file_path TEXT NOT NULL,
        file_name TEXT,
        file_size INTEGER,
        mime_type TEXT,
        width INTEGER,
        height INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dialog_id) REFERENCES dialogs(id) ON DELETE CASCADE,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
      )
    `)

    // 提供商配置表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS provider_configs (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        name TEXT NOT NULL,
        api_key_encrypted TEXT,
        base_url TEXT,
        custom_headers TEXT,
        custom_params TEXT,
        custom_models TEXT,
        enabled_models TEXT,
        is_enabled INTEGER DEFAULT 1,
        is_default INTEGER DEFAULT 0,
        last_tested DATETIME,
        test_result TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    this.save()
  }

  /**
   * 初始化仓库
   */
  private initRepositories(): void {
    if (!this.db) return

    this.settings = new SettingsRepository(this.db, this)
    this.apiKeys = new ApiKeyRepository(this.db, this)
    this.dialogs = new DialogRepository(this.db, this)
    this.messages = new MessageRepository(this.db, this)
    this.roles = new RoleRepository(this.db, this)
    this.images = new ImageRepository(this.db, this)
    this.providerConfigs = new ProviderConfigRepository(this.db, this)
  }

  /**
   * 保存数据库到文件
   */
  save(): void {
    if (!this.db) return

    const data = this.db.export()
    const buffer = Buffer.from(data)
    const dir = path.dirname(this.dbPath)

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(this.dbPath, buffer)
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.save()
      this.db.close()
      this.db = null
    }
  }

  /**
   * 获取数据库实例
   */
  getDatabase(): SqlJsDatabase | null {
    return this.db
  }
}

// 导出单例获取函数
export const getDatabaseManager = (): DatabaseManager => DatabaseManager.getInstance()
