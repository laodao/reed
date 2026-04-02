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
import { TranslationRepository } from './repositories/translation.repository'
import { VoiceRepository } from './repositories/voice.repository'
import { ClonedVoiceRepository } from './repositories/cloned-voice.repository'
import { KnowledgeBaseRepository } from './repositories/knowledge-base.repository'
import { KbDocumentRepository } from './repositories/kb-document.repository'
import { KbChunkRepository } from './repositories/kb-chunk.repository'
import { KbVectorRepository } from './repositories/kb-vector.repository'
import { KbInvertedIndexRepository } from './repositories/kb-inverted-index.repository'
import { PortraitProjectRepository } from './repositories/portrait-project.repository'
import { PortraitCharacterRepository } from './repositories/portrait-character.repository'
import { PortraitVariantRepository } from './repositories/portrait-variant.repository'
import { SearchEngineConfigRepository } from './repositories/search-engine-config.repository'
import { LwProjectRepository } from './repositories/lw-project.repository'
import { LwStoryOverviewRepository } from './repositories/lw-story-overview.repository'
import { LwCharacterRepository } from './repositories/lw-character.repository'
import { LwOutlineRepository } from './repositories/lw-outline.repository'
import { LwChapterRepository } from './repositories/lw-chapter.repository'
import { LwBackgroundRepository } from './repositories/lw-background.repository'
import { LwLocationRepository } from './repositories/lw-location.repository'
import { LwPlotRepository } from './repositories/lw-plot.repository'
import { LwSkillRepository } from './repositories/lw-skill.repository'
import { LwItemRepository } from './repositories/lw-item.repository'
import { LwMaterialRepository } from './repositories/lw-material.repository'
import { LwGlobalSettingsRepository } from './repositories/lw-global-settings.repository'
import { LwDictionaryRepository } from './repositories/lw-dictionary.repository'
import { DataPathService } from '../services/data-path.service'
import { LanceDBService } from '../services/lance-db.service'

/**
 * 数据库管理器
 * 使用 better-sqlite3 实现，每次写入都实时持久化到磁盘
 */
export class DatabaseManager {
  private static instance: DatabaseManager
  public db: Database.Database | null = null
  private dbPath: string

  // 仓库实例
  public settings: SettingsRepository | null = null
  public apiKeys: ApiKeyRepository | null = null
  public dialogs: DialogRepository | null = null
  public messages: MessageRepository | null = null
  public roles: RoleRepository | null = null
  public images: ImageRepository | null = null
  public providerConfigs: ProviderConfigRepository | null = null
  public translations: TranslationRepository | null = null
  public voices: VoiceRepository | null = null
  public clonedVoices: ClonedVoiceRepository | null = null
  public knowledgeBases: KnowledgeBaseRepository | null = null
  public kbDocuments: KbDocumentRepository | null = null
  public kbChunks: KbChunkRepository | null = null
  public kbVectors: KbVectorRepository | null = null
  public kbInvertedIndex: KbInvertedIndexRepository | null = null
  public portraitProjects: PortraitProjectRepository | null = null
  public portraitCharacters: PortraitCharacterRepository | null = null
  public portraitVariants: PortraitVariantRepository | null = null
  public searchEngineConfigs: SearchEngineConfigRepository | null = null
  public lwProjects: LwProjectRepository | null = null
  public lwStoryOverviews: LwStoryOverviewRepository | null = null
  public lwCharacters: LwCharacterRepository | null = null
  public lwOutlines: LwOutlineRepository | null = null
  public lwChapters: LwChapterRepository | null = null
  public lwBackgrounds: LwBackgroundRepository | null = null
  public lwLocations: LwLocationRepository | null = null
  public lwPlots: LwPlotRepository | null = null
  public lwSkills: LwSkillRepository | null = null
  public lwItems: LwItemRepository | null = null
  public lwMaterials: LwMaterialRepository | null = null
  public lwGlobalSettings: LwGlobalSettingsRepository | null = null
  public lwDictionary: LwDictionaryRepository | null = null

  private constructor() {
    // 默认使用 userData 路径，后续会在 initialize 中更新
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
    // 先初始化 DataPathService，获取自定义数据路径
    const dataPathService = DataPathService.getInstance()
    await dataPathService.initialize()

    // 使用 DataPathService 获取数据路径
    const dataPath = dataPathService.getDataPath()
    this.dbPath = path.join(dataPath, 'the_bot.db')

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

    // 初始化 LanceDB 向量数据库
    await this.initializeLanceDB(dataPath)

    // 初始化内置角色
    await this.initBuiltinRoles()

    // 初始化长文写作全局设置
    this.initGlobalSettings()

    // 初始化长文写字典
    this.initDictionary()

    console.log('[DatabaseManager] 数据库初始化完成:', this.dbPath)
  }

  /**
   * 初始化 LanceDB 向量数据库
   */
  private async initializeLanceDB(dataPath: string): Promise<void> {
    try {
      const lanceDB = LanceDBService.getInstance()
      await lanceDB.initialize(dataPath)
      console.log('[DatabaseManager] LanceDB 初始化完成')
    } catch (error: any) {
      console.error('[DatabaseManager] LanceDB 初始化失败:', error)
      // LanceDB 初始化失败不影响主数据库功能
    }
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

    // 翻译历史表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS translations (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        source_language TEXT NOT NULL,
        target_language TEXT NOT NULL,
        source_text TEXT,
        target_text TEXT,
        source_file TEXT,
        source_file_name TEXT,
        target_file TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        favorite INTEGER NOT NULL DEFAULT 0,
        word_count INTEGER NOT NULL DEFAULT 0,
        provider_id TEXT,
        model_id TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL
      )
    `)

    // 创建翻译索引
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_translations_created_at ON translations(created_at DESC)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_translations_type ON translations(type)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_translations_favorite ON translations(favorite)`)

    // 语音记录表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS voice_records (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        input_text TEXT,
        output_audio_path TEXT,
        voice_id TEXT,
        voice_name TEXT,
        language TEXT,
        speed REAL DEFAULT 1.0,
        pitch REAL DEFAULT 0,
        volume REAL DEFAULT 1.0,
        emotion TEXT,
        style TEXT,
        duration INTEGER,
        input_audio_path TEXT,
        output_text TEXT,
        provider_id TEXT,
        model_id TEXT,
        favorite INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at TEXT NOT NULL
      )
    `)

    // 创建语音记录索引
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_voice_records_created_at ON voice_records(created_at DESC)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_voice_records_type ON voice_records(type)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_voice_records_favorite ON voice_records(favorite)`)

    // 复刻声音表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cloned_voices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'training',
        sample_audio_path TEXT,
        sample_duration INTEGER,
        voice_id TEXT,
        preview_audio_path TEXT,
        provider_id TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT
      )
    `)

    // 创建复刻声音索引
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_cloned_voices_status ON cloned_voices(status)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_cloned_voices_created_at ON cloned_voices(created_at DESC)`)

    // ==================== 知识库相关表 ====================

    // 知识库表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_bases (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        embedding_model TEXT NOT NULL,
        embedding_provider TEXT NOT NULL,
        embedding_dimension INTEGER NOT NULL DEFAULT 1536,
        embedding_config TEXT,
        document_count INTEGER DEFAULT 0,
        vector_count INTEGER DEFAULT 0,
        total_size INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_knowledge_bases_created_at ON knowledge_bases(created_at DESC)`)

    // 知识库文档表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kb_documents (
        id TEXT PRIMARY KEY,
        knowledge_base_id TEXT NOT NULL,
        name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        chunk_count INTEGER DEFAULT 0,
        error_message TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_documents_knowledge_base_id ON kb_documents(knowledge_base_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_documents_status ON kb_documents(status)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_documents_created_at ON kb_documents(created_at DESC)`)

    // 文档切片表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kb_chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        knowledge_base_id TEXT NOT NULL,
        content TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        start_offset INTEGER,
        end_offset INTEGER,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES kb_documents(id) ON DELETE CASCADE,
        FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_chunks_document_id ON kb_chunks(document_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_chunks_knowledge_base_id ON kb_chunks(knowledge_base_id)`)

    // 向量存储表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kb_vectors (
        id TEXT PRIMARY KEY,
        chunk_id TEXT NOT NULL,
        knowledge_base_id TEXT NOT NULL,
        vector BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chunk_id) REFERENCES kb_chunks(id) ON DELETE CASCADE,
        FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_vectors_chunk_id ON kb_vectors(chunk_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_vectors_knowledge_base_id ON kb_vectors(knowledge_base_id)`)

    // 倒排索引表（用于 BM25 关键词检索）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kb_inverted_index (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        term TEXT NOT NULL,
        chunk_id TEXT NOT NULL,
        knowledge_base_id TEXT NOT NULL,
        term_frequency INTEGER DEFAULT 1,
        positions TEXT,
        FOREIGN KEY (chunk_id) REFERENCES kb_chunks(id) ON DELETE CASCADE,
        FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_inverted_index_term ON kb_inverted_index(term)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_inverted_index_chunk_id ON kb_inverted_index(chunk_id)`)
    this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_inverted_index_unique ON kb_inverted_index(term, chunk_id)`)

    // ==================== 人像设计相关表 ====================

    // 人物项目表（项目仅作为容器）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS portrait_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_portrait_projects_created_at ON portrait_projects(created_at DESC)`)

    // 人物角色表（属于项目）- 先检查是否需要迁移
    // 检查是否存在旧的 portrait_projects 表结构（包含 prompt 字段）
    const portraitProjectColumns = this.db.prepare("PRAGMA table_info(portrait_projects)").all() as { name: string }[]
    const portraitProjectColumnNames = portraitProjectColumns.map(col => col.name)

    // 如果旧表存在 prompt 字段，说明需要迁移
    if (portraitProjectColumnNames.includes('prompt')) {
      console.log('[DatabaseManager] 检测到旧版 portrait_projects 表，开始迁移...')

      // 先迁移 portrait_variants 表（如果有旧数据）
      const variantColumns = this.db.prepare("PRAGMA table_info(portrait_variants)").all() as { name: string }[]
      const variantColumnNames = variantColumns.map(col => col.name)

      if (variantColumnNames.includes('project_id') && !variantColumnNames.includes('character_id')) {
        // 添加 character_id 列
        this.db.exec('ALTER TABLE portrait_variants ADD COLUMN character_id TEXT')

        // 创建临时角色数据用于迁移
        // 为每个旧项目创建临时角色 ID 映射
        this.db.exec(`
          UPDATE portrait_variants
          SET character_id = 'char_' || project_id
          WHERE character_id IS NULL
        `)

        console.log('[DatabaseManager] portrait_variants 表迁移完成')
      }

      // 检查 portrait_characters 表是否存在
      const characterTableExists = this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='portrait_characters'"
      ).get()

      if (!characterTableExists) {
        // 创建新的 portrait_characters 表
        this.db.exec(`
          CREATE TABLE portrait_characters (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL,
            gender TEXT NOT NULL DEFAULT 'male',
            age INTEGER NOT NULL DEFAULT 25,
            height INTEGER NOT NULL DEFAULT 170,
            weight INTEGER NOT NULL DEFAULT 65,
            race TEXT NOT NULL DEFAULT 'asian',
            description TEXT,
            prompt TEXT,
            reference_images TEXT,
            provider_id TEXT,
            model_id TEXT,
            config TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES portrait_projects(id) ON DELETE CASCADE
          )
        `)
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_portrait_characters_project_id ON portrait_characters(project_id)`)

        // 迁移数据：为每个旧项目创建一个默认角色
        this.db.exec(`
          INSERT INTO portrait_characters (id, project_id, name, gender, age, height, weight, race, prompt, reference_images, provider_id, model_id, config, created_at, updated_at)
          SELECT
            'char_' || id as id,
            id as project_id,
            name,
            'male' as gender,
            25 as age,
            170 as height,
            65 as weight,
            'asian' as race,
            prompt,
            reference_images,
            provider_id,
            model_id,
            config,
            created_at,
            updated_at
          FROM portrait_projects
        `)

        console.log('[DatabaseManager] portrait_characters 表创建并数据迁移完成')
      }

      // 最后，重建 portrait_projects 表（移除不需要的字段）
      this.db.exec(`
        CREATE TABLE portrait_projects_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)

      this.db.exec(`
        INSERT INTO portrait_projects_new (id, name, description, created_at, updated_at)
        SELECT id, name, description, created_at, updated_at FROM portrait_projects
      `)

      this.db.exec('DROP TABLE portrait_projects')
      this.db.exec('ALTER TABLE portrait_projects_new RENAME TO portrait_projects')
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_portrait_projects_created_at ON portrait_projects(created_at DESC)`)

      console.log('[DatabaseManager] portrait_projects 表重构完成')
    }

    // 创建 portrait_characters 表（如果不存在）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS portrait_characters (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        gender TEXT NOT NULL DEFAULT 'male',
        age INTEGER NOT NULL DEFAULT 25,
        height INTEGER NOT NULL DEFAULT 170,
        weight INTEGER NOT NULL DEFAULT 65,
        race TEXT NOT NULL DEFAULT 'asian',
        description TEXT,
        prompt TEXT,
        reference_images TEXT,
        provider_id TEXT,
        model_id TEXT,
        config TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES portrait_projects(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_portrait_characters_project_id ON portrait_characters(project_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_portrait_characters_created_at ON portrait_characters(created_at DESC)`)

    // 人物变体表（属于角色）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS portrait_variants (
        id TEXT PRIMARY KEY,
        character_id TEXT NOT NULL,
        type TEXT NOT NULL,
        parent_id TEXT,
        angle TEXT NOT NULL,
        image_path TEXT NOT NULL,
        prompt TEXT NOT NULL,
        config TEXT,
        variant_info TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (character_id) REFERENCES portrait_characters(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_portrait_variants_character_id ON portrait_variants(character_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_portrait_variants_type ON portrait_variants(type)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_portrait_variants_created_at ON portrait_variants(created_at DESC)`)

    // ==================== 搜索引擎配置相关表 ====================

    // 搜索引擎配置表
    this.db.exec(`
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
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_search_engine_configs_template_id ON search_engine_configs(template_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_search_engine_configs_created_at ON search_engine_configs(created_at DESC)`)

    // ==================== 长文写作相关表 ====================

    // 长文写作项目表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        stage TEXT NOT NULL,
        progress INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_projects_created_at ON lw_projects(created_at DESC)`)

    // 故事概要表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_story_overviews (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        story_type TEXT,
        title TEXT,
        summary TEXT,
        core_conflict TEXT,
        theme TEXT,
        estimated_chapters INTEGER,
        is_locked INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
      )
    `)

    // 时代背景表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_story_backgrounds (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        era_type TEXT,
        era_description TEXT,
        social_structure TEXT,
        tech_level TEXT,
        special_rules TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
      )
    `)

    // 地点表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_story_locations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT,
        description TEXT,
        importance TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_locations_project_id ON lw_story_locations(project_id)`)

    // 故事情节表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_story_plots (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        plot_order INTEGER DEFAULT 0,
        involved_characters TEXT,
        involved_locations TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_plots_project_id ON lw_story_plots(project_id)`)

    // 角色表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_story_characters (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        portrait_id TEXT,
        name TEXT NOT NULL,
        gender TEXT,
        age INTEGER,
        appearance TEXT,
        background TEXT,
        personality TEXT,
        abilities TEXT,
        role_position TEXT,
        major_events TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE,
        FOREIGN KEY (portrait_id) REFERENCES portrait_variants(id) ON DELETE SET NULL
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_characters_project_id ON lw_story_characters(project_id)`)

    // 角色关系表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_character_relations (
        id TEXT PRIMARY KEY,
        character_id TEXT NOT NULL,
        related_character_id TEXT NOT NULL,
        relation_type TEXT,
        relation_description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (character_id) REFERENCES lw_story_characters(id) ON DELETE CASCADE,
        FOREIGN KEY (related_character_id) REFERENCES lw_story_characters(id) ON DELETE CASCADE
      )
    `)

    // 技能表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_story_skills (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT,
        level TEXT,
        description TEXT,
        system TEXT,
        character_ids TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_skills_project_id ON lw_story_skills(project_id)`)

    // 物品表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_story_items (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT,
        level TEXT,
        description TEXT,
        owner_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE,
        FOREIGN KEY (owner_id) REFERENCES lw_story_characters(id) ON DELETE SET NULL
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_items_project_id ON lw_story_items(project_id)`)

    // 大纲表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_story_outlines (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        parent_id TEXT,
        name TEXT NOT NULL,
        level INTEGER DEFAULT 1,
        node_type TEXT,
        summary TEXT,
        involved_characters TEXT,
        involved_locations TEXT,
        status TEXT DEFAULT 'pending',
        estimated_words INTEGER,
        order_index INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES lw_story_outlines(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_outlines_project_id ON lw_story_outlines(project_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_outlines_parent_id ON lw_story_outlines(parent_id)`)

    // 章节内容表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_story_chapters (
        id TEXT PRIMARY KEY,
        outline_id TEXT NOT NULL,
        content TEXT,
        word_count INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (outline_id) REFERENCES lw_story_outlines(id) ON DELETE CASCADE
      )
    `)

    // 章节版本表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_chapter_versions (
        id TEXT PRIMARY KEY,
        chapter_id TEXT NOT NULL,
        content TEXT NOT NULL,
        version_type TEXT,
        word_count INTEGER,
        is_locked INTEGER DEFAULT 0,
        version_number INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chapter_id) REFERENCES lw_story_chapters(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_versions_chapter_id ON lw_chapter_versions(chapter_id)`)

    // 素材表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_story_materials (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT,
        source TEXT,
        content TEXT,
        status TEXT DEFAULT 'pending',
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        used INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_materials_project_id ON lw_story_materials(project_id)`)

    // 设计对话记录表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_design_conversations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        messages TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_conversations_project_id ON lw_design_conversations(project_id)`)

    // 全局配置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_global_settings (
        id TEXT PRIMARY KEY,
        story_types TEXT,
        styles TEXT,
        target_readers TEXT,
        skill_types TEXT,
        skill_levels TEXT,
        item_types TEXT,
        item_levels TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 长文写字典分类表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_dictionary_category (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 长文写字典表（独立存储各类配置项）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_dictionary (
        id TEXT PRIMARY KEY,
        category_code TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(category_code, code)
      )
    `)

    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_lw_dictionary_category ON lw_dictionary(category_code)
    `)

    // 迁移字典表结构
    this.migrateDictionaryTables()

    // 执行其他数据库迁移
    this.runMigrations()

    // 检查 portrait_characters 表是否需要修改字段约束
    this.migratePortraitCharactersNullable()

    // 检查 portrait_variants 表是否需要移除 project_id 列
    this.migratePortraitVariantsRemoveProjectId()
  }

  /**
   * 迁移字典表结构（从旧结构迁移到新结构）
   */
  private migrateDictionaryTables(): void {
    if (!this.db) return

    // 检查 lw_dictionary 表是否存在旧结构（有 category 和 value 字段）
    const dictTableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lw_dictionary'").get()
    if (dictTableExists) {
      const columns = this.db.prepare("PRAGMA table_info(lw_dictionary)").all() as { name: string }[]
      const hasOldCategory = columns.some(col => col.name === 'category')
      const hasNewCategoryCode = columns.some(col => col.name === 'category_code')

      // 如果有旧的 category 字段但没有新的 category_code 字段，需要重建表
      if (hasOldCategory && !hasNewCategoryCode) {
        console.log('[DatabaseManager] 迁移字典表结构...')

        // 删除旧表
        this.db.exec('DROP TABLE IF EXISTS lw_dictionary')
        this.db.exec('DROP TABLE IF EXISTS lw_dictionary_category')

        // 创建新的分类表
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS lw_dictionary_category (
            id TEXT PRIMARY KEY,
            code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `)

        // 创建新的字典表
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS lw_dictionary (
            id TEXT PRIMARY KEY,
            category_code TEXT NOT NULL,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(category_code, code)
          )
        `)

        // 创建索引
        this.db.exec(`
          CREATE INDEX IF NOT EXISTS idx_lw_dictionary_category ON lw_dictionary(category_code)
        `)

        console.log('[DatabaseManager] 字典表结构迁移完成')
      }
    }

    // 检查分类数据是否正确（name字段是否为数字，如果是说明之前的插入顺序有误）
    this.fixDictionaryCategoryData()
  }

  /**
   * 修复分类数据（如果 name 是数字，说明之前插入顺序错误）
   */
  private fixDictionaryCategoryData(): void {
    if (!this.db) return

    const categoryTableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lw_dictionary_category'").get()
    if (!categoryTableExists) return

    // 检查是否有错误数据（name 是数字或以数字开头）
    const wrongData = this.db.prepare(`
      SELECT * FROM lw_dictionary_category WHERE name GLOB '[0-9]*'
    `).all() as any[]

    if (wrongData.length > 0) {
      console.log('[DatabaseManager] 检测到分类数据错误，正在修复...', wrongData.length, '条')

      // 删除所有数据重新初始化
      this.db.exec('DELETE FROM lw_dictionary')
      this.db.exec('DELETE FROM lw_dictionary_category')

      console.log('[DatabaseManager] 分类数据已清除，将重新初始化')
    }
  }

  /**
   * 迁移 portrait_characters 表，使 provider_id、model_id、prompt 可为空
   */
  private migratePortraitCharactersNullable(): void {
    if (!this.db) return

    // 检查 portrait_characters 表是否存在
    const tableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='portrait_characters'").get()
    if (!tableExists) return

    // 获取表结构
    const columns = this.db.prepare("PRAGMA table_info(portrait_characters)").all() as { name: string; notnull: number }[]
    const providerIdCol = columns.find(col => col.name === 'provider_id')
    const modelIdCol = columns.find(col => col.name === 'model_id')
    const promptCol = columns.find(col => col.name === 'prompt')

    // 如果字段已经是可空的，则不需要迁移
    if (providerIdCol && providerIdCol.notnull === 0 && modelIdCol && modelIdCol.notnull === 0) {
      return
    }

    console.log('[DatabaseManager] 迁移 portrait_characters 表，使 provider_id、model_id、prompt 可为空...')

    // 重建表
    this.db.exec(`
      CREATE TABLE portrait_characters_new (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        gender TEXT NOT NULL DEFAULT 'male',
        age INTEGER NOT NULL DEFAULT 25,
        height INTEGER NOT NULL DEFAULT 170,
        weight INTEGER NOT NULL DEFAULT 65,
        race TEXT NOT NULL DEFAULT 'asian',
        description TEXT,
        prompt TEXT,
        reference_images TEXT,
        provider_id TEXT,
        model_id TEXT,
        config TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES portrait_projects(id) ON DELETE CASCADE
      )
    `)

    // 复制数据
    this.db.exec(`
      INSERT INTO portrait_characters_new (id, project_id, name, gender, age, height, weight, race, description, prompt, reference_images, provider_id, model_id, config, created_at, updated_at)
      SELECT id, project_id, name, gender, age, height, weight, race, description, prompt, reference_images, provider_id, model_id, config, created_at, updated_at
      FROM portrait_characters
    `)

    // 删除旧表
    this.db.exec('DROP TABLE portrait_characters')

    // 重命名新表
    this.db.exec('ALTER TABLE portrait_characters_new RENAME TO portrait_characters')

    // 重建索引
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_portrait_characters_project_id ON portrait_characters(project_id)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_portrait_characters_created_at ON portrait_characters(created_at DESC)')

    console.log('[DatabaseManager] portrait_characters 表迁移完成')
  }

  /**
   * 迁移 portrait_variants 表，移除旧的 project_id 列
   */
  private migratePortraitVariantsRemoveProjectId(): void {
    if (!this.db) return

    // 检查 portrait_variants 表是否存在
    const tableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='portrait_variants'").get()
    if (!tableExists) return

    // 获取表结构
    const columns = this.db.prepare("PRAGMA table_info(portrait_variants)").all() as { name: string }[]
    const columnNames = columns.map(col => col.name)

    // 如果不存在 project_id 列，则不需要迁移
    if (!columnNames.includes('project_id')) {
      return
    }

    console.log('[DatabaseManager] 迁移 portrait_variants 表，移除 project_id 列...')

    // 创建新表（不含 project_id）
    this.db.exec(`
      CREATE TABLE portrait_variants_new (
        id TEXT PRIMARY KEY,
        character_id TEXT NOT NULL,
        type TEXT NOT NULL,
        parent_id TEXT,
        angle TEXT NOT NULL,
        image_path TEXT NOT NULL,
        prompt TEXT NOT NULL,
        config TEXT,
        variant_info TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (character_id) REFERENCES portrait_characters(id) ON DELETE CASCADE
      )
    `)

    // 检查是否有 character_id 列来决定数据复制方式
    if (columnNames.includes('character_id')) {
      // 复制数据（包含 character_id）
      this.db.exec(`
        INSERT INTO portrait_variants_new (id, character_id, type, parent_id, angle, image_path, prompt, config, variant_info, created_at)
        SELECT id, character_id, type, parent_id, angle, image_path, prompt, config, variant_info, created_at
        FROM portrait_variants
      `)
    } else {
      // 旧表没有 character_id，这种情况应该不会发生，但以防万一
      // 需要根据 project_id 创建一个临时 character_id
      this.db.exec(`
        INSERT INTO portrait_variants_new (id, character_id, type, parent_id, angle, image_path, prompt, config, variant_info, created_at)
        SELECT id, 'char_' || project_id, type, parent_id, angle, image_path, prompt, config, variant_info, created_at
        FROM portrait_variants
      `)
    }

    // 删除旧表
    this.db.exec('DROP TABLE portrait_variants')

    // 重命名新表
    this.db.exec('ALTER TABLE portrait_variants_new RENAME TO portrait_variants')

    // 重建索引
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_portrait_variants_character_id ON portrait_variants(character_id)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_portrait_variants_type ON portrait_variants(type)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_portrait_variants_created_at ON portrait_variants(created_at DESC)')

    console.log('[DatabaseManager] portrait_variants 表迁移完成')
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
    if (!dialogColumnNames.includes('knowledge_base_ids')) {
      this.db.exec('ALTER TABLE dialogs ADD COLUMN knowledge_base_ids TEXT')
    }
    if (!dialogColumnNames.includes('web_search_config')) {
      this.db.exec('ALTER TABLE dialogs ADD COLUMN web_search_config TEXT')
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
    if (!providerConfigColumnNames.includes('short_id')) {
      this.db.exec('ALTER TABLE provider_configs ADD COLUMN short_id TEXT')
    }
    // 添加 models 字段
    if (!providerConfigColumnNames.includes('models')) {
      this.db.exec('ALTER TABLE provider_configs ADD COLUMN models TEXT')
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

    // 添加图像/视频/语音 API URL 字段到 provider_configs
    if (!providerConfigColumnNames.includes('image_base_url')) {
      this.db.exec('ALTER TABLE provider_configs ADD COLUMN image_base_url TEXT')
    }
    if (!providerConfigColumnNames.includes('video_base_url')) {
      this.db.exec('ALTER TABLE provider_configs ADD COLUMN video_base_url TEXT')
    }
    if (!providerConfigColumnNames.includes('audio_base_url')) {
      this.db.exec('ALTER TABLE provider_configs ADD COLUMN audio_base_url TEXT')
    }

    // 检查 lw_story_overviews 表是否需要添加新字段
    const overviewColumns = this.db.prepare("PRAGMA table_info(lw_story_overviews)").all() as { name: string }[]
    const overviewColumnNames = overviewColumns.map(col => col.name)

    if (!overviewColumnNames.includes('core_idea')) {
      this.db.exec('ALTER TABLE lw_story_overviews ADD COLUMN core_idea TEXT')
    }
    if (!overviewColumnNames.includes('style')) {
      this.db.exec('ALTER TABLE lw_story_overviews ADD COLUMN style TEXT')
    }
    if (!overviewColumnNames.includes('target_reader')) {
      this.db.exec('ALTER TABLE lw_story_overviews ADD COLUMN target_reader TEXT')
    }
    if (!overviewColumnNames.includes('estimated_length')) {
      this.db.exec('ALTER TABLE lw_story_overviews ADD COLUMN estimated_length TEXT')
    }
    if (!overviewColumnNames.includes('other_requirements')) {
      this.db.exec('ALTER TABLE lw_story_overviews ADD COLUMN other_requirements TEXT')
    }

    // 检查 lw_global_settings 表是否需要添加 estimated_lengths 字段
    const globalSettingsColumns = this.db.prepare("PRAGMA table_info(lw_global_settings)").all() as { name: string }[]
    const globalSettingsColumnNames = globalSettingsColumns.map(col => col.name)

    if (!globalSettingsColumnNames.includes('estimated_lengths')) {
      this.db.exec('ALTER TABLE lw_global_settings ADD COLUMN estimated_lengths TEXT')
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
    this.translations = new TranslationRepository(this.db)
    this.voices = new VoiceRepository(this.db)
    this.clonedVoices = new ClonedVoiceRepository(this.db)
    this.knowledgeBases = new KnowledgeBaseRepository(this.db)
    this.kbDocuments = new KbDocumentRepository(this.db)
    this.kbChunks = new KbChunkRepository(this.db)
    // KbVectorRepository 使用 LanceDB，不再需要 SQLite 连接
    this.kbVectors = new KbVectorRepository()
    this.kbInvertedIndex = new KbInvertedIndexRepository(this.db)
    this.portraitProjects = new PortraitProjectRepository(this.db)
    this.portraitCharacters = new PortraitCharacterRepository(this.db)
    this.portraitVariants = new PortraitVariantRepository(this.db)
    this.searchEngineConfigs = new SearchEngineConfigRepository(this.db)
    this.lwProjects = new LwProjectRepository(this.db)
    this.lwStoryOverviews = new LwStoryOverviewRepository(this.db)
    this.lwCharacters = new LwCharacterRepository(this.db)
    this.lwOutlines = new LwOutlineRepository(this.db)
    this.lwChapters = new LwChapterRepository(this.db)
    this.lwBackgrounds = new LwBackgroundRepository(this.db)
    this.lwLocations = new LwLocationRepository(this.db)
    this.lwPlots = new LwPlotRepository(this.db)
    this.lwSkills = new LwSkillRepository(this.db)
    this.lwItems = new LwItemRepository(this.db)
    this.lwMaterials = new LwMaterialRepository(this.db)
    this.lwGlobalSettings = new LwGlobalSettingsRepository(this.db)
    this.lwDictionary = new LwDictionaryRepository(this.db)
  }

  /**
   * 初始化内置角色
   */
  private async initBuiltinRoles(): Promise<void> {
    if (!this.roles) return
    await this.roles.initBuiltinRoles()
  }

  /**
   * 初始化长文写作全局设置
   */
  private initGlobalSettings(): void {
    if (!this.lwGlobalSettings) return
    // 获取或创建默认设置，如果不存在则自动创建
    const settings = this.lwGlobalSettings.getOrCreate()
    console.log('[DatabaseManager] 全局设置已初始化')
  }

  /**
   * 初始化长文写字典
   */
  private initDictionary(): void {
    if (!this.lwDictionary) return
    // 初始化默认字典数据
    this.lwDictionary.initializeDefaults()
    console.log('[DatabaseManager] 字典已初始化')
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    // 关闭 SQLite
    if (this.db) {
      this.db.close()
      this.db = null
    }

    // 关闭 LanceDB
    const lanceDB = LanceDBService.getInstance()
    await lanceDB.close()
  }

  /**
   * 获取数据库实例
   */
  getDatabase(): Database.Database | null {
    return this.db
  }

  /**
   * 获取数据库文件路径
   */
  getDbPath(): string {
    return this.dbPath
  }

  /**
   * 获取数据存储路径
   */
  getDataPath(): string {
    return path.dirname(this.dbPath)
  }
}

// 导出单例获取函数
export const getDatabaseManager = (): DatabaseManager => DatabaseManager.getInstance()