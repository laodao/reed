/**
 * 数据库管理器
 * @module database/index
 * @description 使用 better-sqlite3 管理 SQLite 数据库（实时持久化）
 */

import Database from 'better-sqlite3'
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
 * 使用 better-sqlite3 实现，每次写入都实时持久化到磁盘
 */
export class DatabaseManager {
  private static instance: DatabaseManager
  private db: Database.Database | null = null
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
    // 确保数据目录存在
    const dir = path.dirname(this.dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // 打开数据库连接（better-sqlite3 会自动创建文件）
    this.db = new Database(this.dbPath)

    // 启用 WAL 模式以获得更好的并发性能
    this.db.pragma('journal_mode = WAL')

    // 初始化表结构
    this.initTables()

    // 初始化仓库
    this.initRepositories()

    // 初始化内置角色
    await this.initBuiltinRoles()

    console.log('[DatabaseManager] 数据库初始化完成:', this.dbPath)
  }

  /**
   * 初始化表结构
   */
  private initTables(): void {
    if (!this.db) return

    // 设置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // API密钥表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        provider TEXT PRIMARY KEY,
        encrypted_key TEXT NOT NULL,
        endpoint TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 角色表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        system_prompt TEXT,
        avatar TEXT,
        is_builtin INTEGER DEFAULT 0,
        default_model_id TEXT,
        default_provider_config_id TEXT,
        auto_reset_model INTEGER DEFAULT 1,
        temperature REAL DEFAULT 0.7,
        top_p REAL DEFAULT 1.0,
        max_context_messages INTEGER DEFAULT 20,
        max_tokens INTEGER DEFAULT 4096,
        enable_stream INTEGER DEFAULT 1,
        custom_params TEXT,
        knowledge_base_ids TEXT,
        knowledge_retrieve_count INTEGER DEFAULT 5,
        knowledge_threshold REAL DEFAULT 0.5,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 对话表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dialogs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        model_id TEXT NOT NULL,
        provider_config_id TEXT,
        role_id TEXT,
        system_prompt TEXT,
        context_config TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        message_count INTEGER DEFAULT 0,
        FOREIGN KEY (role_id) REFERENCES roles(id)
      )
    `)

    // 消息表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        dialog_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        model_id TEXT,
        tokens_used INTEGER,
        attachments TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dialog_id) REFERENCES dialogs(id) ON DELETE CASCADE
      )
    `)

    // 图片表
    this.db.exec(`
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
        prompt TEXT,
        negative_prompt TEXT,
        style TEXT,
        quality TEXT,
        provider_id TEXT,
        model_id TEXT,
        generation_params TEXT,
        seed INTEGER,
        task_id TEXT,
        status TEXT DEFAULT 'completed',
        error_message TEXT,
        favorite INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dialog_id) REFERENCES dialogs(id) ON DELETE CASCADE,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
      )
    `)

    // 提供商配置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS provider_configs (
        id TEXT PRIMARY KEY,
        short_id TEXT,
        template_id TEXT NOT NULL,
        name TEXT NOT NULL,
        api_key_encrypted TEXT,
        access_key_id TEXT,
        access_key_secret_encrypted TEXT,
        base_url TEXT,
        custom_headers TEXT,
        custom_params TEXT,
        custom_models TEXT,
        enabled_models TEXT,
        api_models TEXT,
        is_enabled INTEGER DEFAULT 1,
        is_default INTEGER DEFAULT 0,
        last_tested DATETIME,
        test_result TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 附件表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        type TEXT NOT NULL,
        file_name TEXT,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        mime_type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
      )
    `)

    // 执行数据库迁移
    this.runMigrations()
  }

  /**
   * 执行数据库迁移
   */
  private runMigrations(): void {
    if (!this.db) return

    // 检查 dialogs 表是否需要添加新字段
    const dialogColumns = this.db.prepare("PRAGMA table_info(dialogs)").all() as { name: string }[]
    const dialogColumnNames = dialogColumns.map(col => col.name)

    if (!dialogColumnNames.includes('provider_config_id')) {
      this.db.exec('ALTER TABLE dialogs ADD COLUMN provider_config_id TEXT')
    }
    if (!dialogColumnNames.includes('context_config')) {
      this.db.exec('ALTER TABLE dialogs ADD COLUMN context_config TEXT')
    }

    // 检查 provider_configs 表是否需要添加新字段
    const providerConfigColumns = this.db.prepare("PRAGMA table_info(provider_configs)").all() as { name: string }[]
    const providerConfigColumnNames = providerConfigColumns.map(col => col.name)

    if (!providerConfigColumnNames.includes('access_key_id')) {
      this.db.exec('ALTER TABLE provider_configs ADD COLUMN access_key_id TEXT')
    }
    if (!providerConfigColumnNames.includes('access_key_secret_encrypted')) {
      this.db.exec('ALTER TABLE provider_configs ADD COLUMN access_key_secret_encrypted TEXT')
    }
    if (!providerConfigColumnNames.includes('api_models')) {
      this.db.exec('ALTER TABLE provider_configs ADD COLUMN api_models TEXT')
    }
    if (!providerConfigColumnNames.includes('short_id')) {
      this.db.exec('ALTER TABLE provider_configs ADD COLUMN short_id TEXT')
    }

    // 检查 messages 表是否需要添加新字段
    const messageColumns = this.db.prepare("PRAGMA table_info(messages)").all() as { name: string }[]
    const messageColumnNames = messageColumns.map(col => col.name)

    if (!messageColumnNames.includes('attachments')) {
      this.db.exec('ALTER TABLE messages ADD COLUMN attachments TEXT')
    }
    if (!messageColumnNames.includes('metadata')) {
      this.db.exec('ALTER TABLE messages ADD COLUMN metadata TEXT')
    }

    // 检查 roles 表是否需要添加新字段
    const roleColumns = this.db.prepare("PRAGMA table_info(roles)").all() as { name: string }[]
    const roleColumnNames = roleColumns.map(col => col.name)

    if (!roleColumnNames.includes('default_model_id')) {
      this.db.exec('ALTER TABLE roles ADD COLUMN default_model_id TEXT')
    }
    if (!roleColumnNames.includes('default_provider_config_id')) {
      this.db.exec('ALTER TABLE roles ADD COLUMN default_provider_config_id TEXT')
    }
    if (!roleColumnNames.includes('auto_reset_model')) {
      this.db.exec('ALTER TABLE roles ADD COLUMN auto_reset_model INTEGER DEFAULT 1')
    }
    if (!roleColumnNames.includes('temperature')) {
      this.db.exec('ALTER TABLE roles ADD COLUMN temperature REAL DEFAULT 0.7')
    }
    if (!roleColumnNames.includes('top_p')) {
      this.db.exec('ALTER TABLE roles ADD COLUMN top_p REAL DEFAULT 1.0')
    }
    if (!roleColumnNames.includes('max_context_messages')) {
      this.db.exec('ALTER TABLE roles ADD COLUMN max_context_messages INTEGER DEFAULT 20')
    }
    if (!roleColumnNames.includes('max_tokens')) {
      this.db.exec('ALTER TABLE roles ADD COLUMN max_tokens INTEGER DEFAULT 4096')
    }
    if (!roleColumnNames.includes('enable_stream')) {
      this.db.exec('ALTER TABLE roles ADD COLUMN enable_stream INTEGER DEFAULT 1')
    }
    if (!roleColumnNames.includes('custom_params')) {
      this.db.exec('ALTER TABLE roles ADD COLUMN custom_params TEXT')
    }
    if (!roleColumnNames.includes('knowledge_base_ids')) {
      this.db.exec('ALTER TABLE roles ADD COLUMN knowledge_base_ids TEXT')
    }
    if (!roleColumnNames.includes('knowledge_retrieve_count')) {
      this.db.exec('ALTER TABLE roles ADD COLUMN knowledge_retrieve_count INTEGER DEFAULT 5')
    }
    if (!roleColumnNames.includes('knowledge_threshold')) {
      this.db.exec('ALTER TABLE roles ADD COLUMN knowledge_threshold REAL DEFAULT 0.5')
    }

    // 检查 images 表是否需要添加图像生成相关字段
    const imageColumns = this.db.prepare("PRAGMA table_info(images)").all() as { name: string }[]
    const imageColumnNames = imageColumns.map(col => col.name)

    if (!imageColumnNames.includes('prompt')) {
      this.db.exec('ALTER TABLE images ADD COLUMN prompt TEXT')
    }
    if (!imageColumnNames.includes('negative_prompt')) {
      this.db.exec('ALTER TABLE images ADD COLUMN negative_prompt TEXT')
    }
    if (!imageColumnNames.includes('style')) {
      this.db.exec('ALTER TABLE images ADD COLUMN style TEXT')
    }
    if (!imageColumnNames.includes('quality')) {
      this.db.exec('ALTER TABLE images ADD COLUMN quality TEXT')
    }
    if (!imageColumnNames.includes('provider_id')) {
      this.db.exec('ALTER TABLE images ADD COLUMN provider_id TEXT')
    }
    if (!imageColumnNames.includes('model_id')) {
      this.db.exec('ALTER TABLE images ADD COLUMN model_id TEXT')
    }
    if (!imageColumnNames.includes('generation_params')) {
      this.db.exec('ALTER TABLE images ADD COLUMN generation_params TEXT')
    }
    if (!imageColumnNames.includes('seed')) {
      this.db.exec('ALTER TABLE images ADD COLUMN seed INTEGER')
    }
    if (!imageColumnNames.includes('task_id')) {
      this.db.exec('ALTER TABLE images ADD COLUMN task_id TEXT')
    }
    if (!imageColumnNames.includes('status')) {
      this.db.exec("ALTER TABLE images ADD COLUMN status TEXT DEFAULT 'completed'")
    }
    if (!imageColumnNames.includes('error_message')) {
      this.db.exec('ALTER TABLE images ADD COLUMN error_message TEXT')
    }
    if (!imageColumnNames.includes('favorite')) {
      this.db.exec('ALTER TABLE images ADD COLUMN favorite INTEGER DEFAULT 0')
    }
  }

  /**
   * 初始化仓库
   */
  private initRepositories(): void {
    if (!this.db) return

    this.settings = new SettingsRepository(this.db)
    this.apiKeys = new ApiKeyRepository(this.db)
    this.dialogs = new DialogRepository(this.db)
    this.messages = new MessageRepository(this.db)
    this.roles = new RoleRepository(this.db)
    this.images = new ImageRepository(this.db)
    this.providerConfigs = new ProviderConfigRepository(this.db)
  }

  /**
   * 初始化内置角色
   */
  private async initBuiltinRoles(): Promise<void> {
    if (!this.roles) return
    await this.roles.initBuiltinRoles()
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  /**
   * 获取数据库实例
   */
  getDatabase(): Database.Database | null {
    return this.db
  }
}

// 导出单例获取函数
export const getDatabaseManager = (): DatabaseManager => DatabaseManager.getInstance()