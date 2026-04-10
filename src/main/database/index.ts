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
import { LwTypeConfigRepository } from './repositories/lw-type-config.repository'
import { LwFactionRepository } from './repositories/lw-faction.repository'
import { LwMapRepository } from './repositories/lw-map.repository'
import { LwPrewriteRepository } from './repositories/lw-prewrite.repository'
import { LwMemoryRepository } from './repositories/lw-memory.repository'
import { LwEntityStateRepository } from './repositories/lw-entity-state.repository'
import { LwPlotCharacterRepository } from './repositories/lw-plot-character.repository'
import { LwPlotLocationRepository } from './repositories/lw-plot-location.repository'
import { LwOutlineCharacterRepository } from './repositories/lw-outline-character.repository'
import { LwOutlineLocationRepository } from './repositories/lw-outline-location.repository'
import { LwOutlineItemRepository } from './repositories/lw-outline-item.repository'
import { LwSkillCharacterRepository } from './repositories/lw-skill-character.repository'
import { LwDesignMessageRepository } from './repositories/lw-design-message.repository'
import { LwMemoryEntityRepository } from './repositories/lw-memory-entity.repository'
import { LwTempCharacterTemplateRepository } from './repositories/lw-temp-character-template.repository'
import { LwTempLocationTemplateRepository } from './repositories/lw-temp-location-template.repository'
import { LwProjectModelConfigRepository } from './repositories/lw-project-model-config.repository'
import { LwChapterStateSummaryRepository } from './repositories/lw-chapter-state-summary.repository'
import { DiaryFolderRepository } from './repositories/diary-folder.repository'
import { DiaryEntryRepository } from './repositories/diary-entry.repository'
import { DiaryLinkRepository } from './repositories/diary-link.repository'
import { DiaryAttachmentRepository } from './repositories/diary-attachment.repository'
import { VideoProjectRepository } from './repositories/video-project.repository'
import { VideoEpisodeRepository } from './repositories/video-episode.repository'
import { EpisodeScriptRepository } from './repositories/episode-script.repository'
import { SceneScriptRepository } from './repositories/scene-script.repository'
import { StoryboardRepository } from './repositories/storyboard.repository'
import { CharacterBindingRepository } from './repositories/character-binding.repository'
import { LocationBindingRepository } from './repositories/location-binding.repository'
import { ItemBindingRepository } from './repositories/item-binding.repository'
import { SceneCharacterRepository } from './repositories/scene-character.repository'
import { SceneDialogueRepository } from './repositories/scene-dialogue.repository'
import { SceneActionRepository } from './repositories/scene-action.repository'
import { StoryboardCharacterRepository } from './repositories/storyboard-character.repository'
import { ImageAssetRepository } from './repositories/image-asset.repository'
import { OSSConfigRepository } from './repositories/oss-config.repository'
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
  private lastBackupPath: string | null = null

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
  public lwTypeConfig: LwTypeConfigRepository | null = null
  public lwFactions: LwFactionRepository | null = null
  public lwMaps: LwMapRepository | null = null
  public lwPrewrites: LwPrewriteRepository | null = null
  public lwMemories: LwMemoryRepository | null = null
  public lwEntityStates: LwEntityStateRepository | null = null
  public lwChapterStateSummaries: LwChapterStateSummaryRepository | null = null

  // 新增：符合第三范式的长文写作关联表仓库
  public lwPlotCharacters: LwPlotCharacterRepository | null = null
  public lwPlotLocations: LwPlotLocationRepository | null = null
  public lwOutlineCharacters: LwOutlineCharacterRepository | null = null
  public lwOutlineLocations: LwOutlineLocationRepository | null = null
  public lwOutlineItems: LwOutlineItemRepository | null = null
  public lwSkillCharacters: LwSkillCharacterRepository | null = null
  public lwDesignMessages: LwDesignMessageRepository | null = null
  public lwMemoryEntities: LwMemoryEntityRepository | null = null

  // 临时实体模板仓库
  public lwTempCharacterTemplates: LwTempCharacterTemplateRepository | null = null
  public lwTempLocationTemplates: LwTempLocationTemplateRepository | null = null

  // 项目步骤模型配置仓库
  public lwProjectModelConfigs: LwProjectModelConfigRepository | null = null

  public diaryFolders: DiaryFolderRepository | null = null
  public diaryEntries: DiaryEntryRepository | null = null
  public diaryLinks: DiaryLinkRepository | null = null
  public diaryAttachments: DiaryAttachmentRepository | null = null

  // 剧集制作相关
  public videoProjects: VideoProjectRepository | null = null
  public videoEpisodes: VideoEpisodeRepository | null = null
  public episodeScripts: EpisodeScriptRepository | null = null
  public sceneScripts: SceneScriptRepository | null = null
  public storyboards: StoryboardRepository | null = null
  public characterBindings: CharacterBindingRepository | null = null
  public locationBindings: LocationBindingRepository | null = null
  public itemBindings: ItemBindingRepository | null = null

  // 新增：符合第三范式的子表仓库
  public sceneCharacters: SceneCharacterRepository | null = null
  public sceneDialogues: SceneDialogueRepository | null = null
  public sceneActions: SceneActionRepository | null = null
  public storyboardCharacters: StoryboardCharacterRepository | null = null
  public imageAssets: ImageAssetRepository | null = null

  // OSS 配置仓库
  public ossConfigs: OSSConfigRepository | null = null

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

    // 项目步骤模型配置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_project_model_configs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        provider_config_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        created_at INTEGER,
        updated_at INTEGER,
        UNIQUE(project_id, stage),
        FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
      )
    `)

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
        faction_distribution TEXT,
        geographic_orientation TEXT,
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
        map_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE,
        FOREIGN KEY (map_id) REFERENCES lw_project_maps(id) ON DELETE SET NULL
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_locations_project_id ON lw_story_locations(project_id)`)

    // 势力表（国别/阵营/门派）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_project_factions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        faction_type TEXT NOT NULL,
        name TEXT NOT NULL,
        location_id TEXT,
        description TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE,
        FOREIGN KEY (location_id) REFERENCES lw_story_locations(id) ON DELETE SET NULL
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_factions_project_id ON lw_project_factions(project_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_factions_type ON lw_project_factions(faction_type)`)

    // 地图表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_project_maps (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        orientation TEXT,
        characteristics TEXT,
        image_path TEXT,
        ai_generated_data TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_maps_project_id ON lw_project_maps(project_id)`)

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
        height INTEGER,
        weight INTEGER,
        race TEXT,
        occupation TEXT,
        position TEXT,
        appearance TEXT,
        background TEXT,
        personality TEXT,
        abilities TEXT,
        role_position TEXT,
        importance TEXT DEFAULT 'secondary',
        template_type TEXT,
        generated_image_id TEXT,
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
        involved_items TEXT,
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

    // 项目级别技能类型配置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_project_skill_types (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, code),
        FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
      )
    `)

    // 项目级别物品类型配置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_project_item_types (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, code),
        FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
      )
    `)

    // 技能等级配置表（独立存储每个等级的详情）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_project_skill_levels (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        skill_type_code TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, skill_type_code, code),
        FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
      )
    `)

    // 物品等级配置表（独立存储每个等级的详情）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_project_item_levels (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        item_type_code TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, item_type_code, code),
        FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
      )
    `)

    // 章节预写表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_chapter_prewrites (
        id TEXT PRIMARY KEY,
        outline_id TEXT NOT NULL UNIQUE,
        content TEXT,
        is_confirmed INTEGER DEFAULT 0,
        confirmed_at INTEGER,
        created_at INTEGER,
        updated_at INTEGER,
        FOREIGN KEY (outline_id) REFERENCES lw_story_outlines(id) ON DELETE CASCADE
      )
    `)

    // 故事记忆表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_story_memories (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        source_outline_id TEXT,
        memory_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        involved_entities TEXT,
        chapter_number INTEGER,
        importance TEXT DEFAULT 'normal',
        is_active INTEGER DEFAULT 1,
        created_at INTEGER,
        updated_at INTEGER,
        FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE,
        FOREIGN KEY (source_outline_id) REFERENCES lw_story_outlines(id) ON DELETE SET NULL
      )
    `)

    // 实体状态快照表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_entity_state_snapshots (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        entity_name TEXT NOT NULL,
        chapter_number INTEGER NOT NULL,
        state_summary TEXT NOT NULL,
        key_changes TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
      )
    `)

    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_lw_project_skill_types_project ON lw_project_skill_types(project_id)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_lw_project_item_types_project ON lw_project_item_types(project_id)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_lw_project_skill_levels_project ON lw_project_skill_levels(project_id)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_lw_project_skill_levels_type ON lw_project_skill_levels(skill_type_code)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_lw_project_item_levels_project ON lw_project_item_levels(project_id)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_lw_project_item_levels_type ON lw_project_item_levels(item_type_code)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_lw_chapter_prewrites_outline ON lw_chapter_prewrites(outline_id)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_lw_story_memories_project ON lw_story_memories(project_id)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_lw_story_memories_chapter ON lw_story_memories(chapter_number)
    `)

    // 实体状态快照索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_lw_entity_snapshots_project ON lw_entity_state_snapshots(project_id)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_lw_entity_snapshots_entity ON lw_entity_state_snapshots(entity_type, entity_id)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_lw_entity_snapshots_chapter ON lw_entity_state_snapshots(project_id, chapter_number)
    `)
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_lw_entity_snapshots_unique ON lw_entity_state_snapshots(project_id, entity_type, entity_id, chapter_number)
    `)

    // 章节状态摘要表（记录章节结束时的故事状态）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_chapter_state_summaries (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        outline_id TEXT NOT NULL,
        chapter_number INTEGER NOT NULL,
        story_time TEXT NOT NULL,
        current_location TEXT,
        character_states TEXT,
        pending_events TEXT,
        key_changes TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE,
        FOREIGN KEY (outline_id) REFERENCES lw_story_outlines(id) ON DELETE CASCADE,
        UNIQUE(project_id, outline_id)
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_chapter_summaries_project ON lw_chapter_state_summaries(project_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_chapter_summaries_chapter ON lw_chapter_state_summaries(project_id, chapter_number)`)

    // ===================== 长文写作第三范式关联表 =====================
    // 情节角色关联表（符合第三范式，替代JSON存储）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_plot_characters (
        id TEXT PRIMARY KEY,
        plot_id TEXT NOT NULL,
        character_id TEXT NOT NULL,
        created_at INTEGER,
        UNIQUE(plot_id, character_id),
        FOREIGN KEY (plot_id) REFERENCES lw_story_plots(id) ON DELETE CASCADE,
        FOREIGN KEY (character_id) REFERENCES lw_story_characters(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_plot_characters_plot ON lw_plot_characters(plot_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_plot_characters_character ON lw_plot_characters(character_id)`)

    // 情节地点关联表（符合第三范式）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_plot_locations (
        id TEXT PRIMARY KEY,
        plot_id TEXT NOT NULL,
        location_id TEXT NOT NULL,
        created_at INTEGER,
        UNIQUE(plot_id, location_id),
        FOREIGN KEY (plot_id) REFERENCES lw_story_plots(id) ON DELETE CASCADE,
        FOREIGN KEY (location_id) REFERENCES lw_story_locations(id) ON DELETE SET NULL
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_plot_locations_plot ON lw_plot_locations(plot_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_plot_locations_location ON lw_plot_locations(location_id)`)

    // 大纲角色关联表（符合第三范式，替代JSON存储）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_outline_characters (
        id TEXT PRIMARY KEY,
        outline_id TEXT NOT NULL,
        character_id TEXT NOT NULL,
        created_at INTEGER,
        UNIQUE(outline_id, character_id),
        FOREIGN KEY (outline_id) REFERENCES lw_story_outlines(id) ON DELETE CASCADE,
        FOREIGN KEY (character_id) REFERENCES lw_story_characters(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_outline_characters_outline ON lw_outline_characters(outline_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_outline_characters_character ON lw_outline_characters(character_id)`)

    // 大纲地点关联表（符合第三范式）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_outline_locations (
        id TEXT PRIMARY KEY,
        outline_id TEXT NOT NULL,
        location_id TEXT NOT NULL,
        created_at INTEGER,
        UNIQUE(outline_id, location_id),
        FOREIGN KEY (outline_id) REFERENCES lw_story_outlines(id) ON DELETE CASCADE,
        FOREIGN KEY (location_id) REFERENCES lw_story_locations(id) ON DELETE SET NULL
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_outline_locations_outline ON lw_outline_locations(outline_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_outline_locations_location ON lw_outline_locations(location_id)`)

    // 大纲物品关联表（符合第三范式）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_outline_items (
        id TEXT PRIMARY KEY,
        outline_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        created_at INTEGER,
        UNIQUE(outline_id, item_id),
        FOREIGN KEY (outline_id) REFERENCES lw_story_outlines(id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES lw_story_items(id) ON DELETE SET NULL
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_outline_items_outline ON lw_outline_items(outline_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_outline_items_item ON lw_outline_items(item_id)`)

    // 技能角色关联表（符合第三范式，替代JSON存储）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_skill_characters (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        character_id TEXT NOT NULL,
        created_at INTEGER,
        UNIQUE(skill_id, character_id),
        FOREIGN KEY (skill_id) REFERENCES lw_story_skills(id) ON DELETE CASCADE,
        FOREIGN KEY (character_id) REFERENCES lw_story_characters(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_skill_characters_skill ON lw_skill_characters(skill_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_skill_characters_character ON lw_skill_characters(character_id)`)

    // 设计对话消息表（符合第三范式，替代JSON存储）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_design_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (conversation_id) REFERENCES lw_design_conversations(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_design_messages_conversation ON lw_design_messages(conversation_id)`)

    // 记忆实体关联表（符合第三范式，替代JSON存储）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_memory_entities (
        id TEXT PRIMARY KEY,
        memory_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        entity_name TEXT NOT NULL,
        created_at INTEGER,
        UNIQUE(memory_id, entity_type, entity_id),
        FOREIGN KEY (memory_id) REFERENCES lw_story_memories(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_memory_entities_memory ON lw_memory_entities(memory_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_memory_entities_entity ON lw_memory_entities(entity_type, entity_id)`)

    // ===================== 临时实体模板表 =====================
    // 临时角色模板表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_temp_character_templates (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        gender TEXT NOT NULL DEFAULT 'other',
        age_min INTEGER DEFAULT 20,
        age_max INTEGER DEFAULT 50,
        base_prompt TEXT NOT NULL,
        style_variants TEXT DEFAULT '[]',
        negative_prompt TEXT,
        match_keywords TEXT DEFAULT '[]',
        sort_order INTEGER DEFAULT 0,
        is_default INTEGER DEFAULT 0,
        created_at INTEGER,
        updated_at INTEGER
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_temp_char_templates_type ON lw_temp_character_templates(type)`)

    // 临时地点模板表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lw_temp_location_templates (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        base_prompt TEXT NOT NULL,
        style_variants TEXT DEFAULT '[]',
        negative_prompt TEXT,
        match_keywords TEXT DEFAULT '[]',
        sort_order INTEGER DEFAULT 0,
        is_default INTEGER DEFAULT 0,
        created_at INTEGER,
        updated_at INTEGER
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_temp_loc_templates_type ON lw_temp_location_templates(type)`)

    // ===================== 日记模块表 =====================
    // 日记目录表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS diary_folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id TEXT,
        path TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES diary_folders(id) ON DELETE CASCADE
      )
    `)

    // 日记条目表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS diary_entries (
        id TEXT PRIMARY KEY,
        folder_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        file_path TEXT NOT NULL,
        word_count INTEGER DEFAULT 0,
        tags TEXT,
        frontmatter TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (folder_id) REFERENCES diary_folders(id) ON DELETE CASCADE
      )
    `)

    // 双向链接表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS diary_links (
        id TEXT PRIMARY KEY,
        source_entry_id TEXT NOT NULL,
        target_entry_id TEXT,
        target_title TEXT NOT NULL,
        link_text TEXT,
        anchor TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (source_entry_id) REFERENCES diary_entries(id) ON DELETE CASCADE,
        FOREIGN KEY (target_entry_id) REFERENCES diary_entries(id) ON DELETE CASCADE
      )
    `)

    // 附件表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS diary_attachments (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        mime_type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (entry_id) REFERENCES diary_entries(id) ON DELETE CASCADE
      )
    `)

    // 日记模块索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_diary_folders_parent ON diary_folders(parent_id)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_diary_entries_folder ON diary_entries(folder_id)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_diary_entries_created ON diary_entries(created_at DESC)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_diary_links_source ON diary_links(source_entry_id)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_diary_links_target ON diary_links(target_entry_id)
    `)

    // ===================== 剧集制作模块表 =====================

    // 剧集项目表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS video_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        long_writing_project_id TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        config TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (long_writing_project_id) REFERENCES lw_projects(id) ON DELETE SET NULL
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_video_projects_lw_project_id ON video_projects(long_writing_project_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_video_projects_status ON video_projects(status)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_video_projects_created_at ON video_projects(created_at DESC)`)

    // 角色形象绑定表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS character_bindings (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        long_writing_character_id TEXT NOT NULL,
        portrait_id TEXT,
        generate_config TEXT,
        voice_config TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE,
        FOREIGN KEY (portrait_id) REFERENCES portrait_characters(id) ON DELETE SET NULL
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_character_bindings_project_id ON character_bindings(project_id)`)

    // 地点绑定表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS location_bindings (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        long_writing_location_id TEXT NOT NULL,
        location_name TEXT NOT NULL,
        image_paths TEXT DEFAULT '[]',
        thumbnail_path TEXT,
        generate_config TEXT,
        base_description TEXT,
        style_reference TEXT,
        additional_prompts TEXT,
        time_of_day TEXT,
        weather TEXT,
        generate_images INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE,
        UNIQUE(project_id, long_writing_location_id)
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_location_bindings_project_id ON location_bindings(project_id)`)

    // 物品绑定表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS item_bindings (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        long_writing_item_id TEXT NOT NULL,
        item_name TEXT NOT NULL,
        image_paths TEXT DEFAULT '[]',
        thumbnail_path TEXT,
        generate_config TEXT,
        base_description TEXT,
        style_reference TEXT,
        additional_prompts TEXT,
        generate_images INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE,
        UNIQUE(project_id, long_writing_item_id)
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_item_bindings_project_id ON item_bindings(project_id)`)

    // 剧集表（对应章节）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS video_episodes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        outline_id TEXT NOT NULL,
        episode_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        duration INTEGER DEFAULT 0,
        script_id TEXT,
        audio_tracks TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_video_episodes_project_id ON video_episodes(project_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_video_episodes_outline_id ON video_episodes(outline_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_video_episodes_status ON video_episodes(status)`)

    // 剧本表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS episode_scripts (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        episode_id TEXT NOT NULL,
        outline_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        synopsis TEXT,
        scenes TEXT,
        total_duration INTEGER DEFAULT 0,
        character_appearances TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE,
        FOREIGN KEY (episode_id) REFERENCES video_episodes(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_episode_scripts_episode_id ON episode_scripts(episode_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_episode_scripts_status ON episode_scripts(status)`)

    // 场景剧本表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scene_scripts (
        id TEXT PRIMARY KEY,
        episode_script_id TEXT NOT NULL,
        scene_number INTEGER NOT NULL,
        location TEXT NOT NULL,
        location_type TEXT NOT NULL DEFAULT 'exterior',
        time_of_day TEXT NOT NULL DEFAULT 'morning',
        weather TEXT,
        scene_description TEXT NOT NULL,
        mood TEXT,
        lighting TEXT,
        characters TEXT,
        original_text TEXT,
        narration TEXT,
        dialogues TEXT,
        actions TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (episode_script_id) REFERENCES episode_scripts(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_scene_scripts_episode_script_id ON scene_scripts(episode_script_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_scene_scripts_scene_number ON scene_scripts(episode_script_id, scene_number)`)

    // 分镜表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS storyboards (
        id TEXT PRIMARY KEY,
        scene_script_id TEXT NOT NULL,
        shot_number INTEGER NOT NULL,
        shot_type TEXT NOT NULL DEFAULT 'medium',
        camera_angle TEXT NOT NULL DEFAULT 'eye_level',
        camera_movement TEXT NOT NULL DEFAULT 'static',
        movement_duration REAL,
        frame_description TEXT NOT NULL,
        subject TEXT,
        composition TEXT,
        characters TEXT,
        narration_id TEXT,
        dialogue_ids TEXT,
        action_ids TEXT,
        frame_image TEXT,
        frame_image_id TEXT,
        video_path TEXT,
        duration REAL NOT NULL DEFAULT 3,
        transition TEXT NOT NULL,
        transition_type TEXT,
        transition_duration_ms REAL,
        transition_direction TEXT,
        transition_easing TEXT,
        transition_color TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (scene_script_id) REFERENCES scene_scripts(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_storyboards_scene_script_id ON storyboards(scene_script_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_storyboards_shot_number ON storyboards(scene_script_id, shot_number)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_storyboards_status ON storyboards(status)`)

    // 数据库迁移：为现有的 storyboards 表添加 video_path 字段（如果不存在）
    try {
      const columns = this.db.prepare(`PRAGMA table_info(storyboards)`).all() as { name: string }[]
      const columnNames = columns.map(c => c.name)
      if (!columnNames.includes('video_path')) {
        this.db.exec(`ALTER TABLE storyboards ADD COLUMN video_path TEXT`)
        console.log('[DatabaseManager] 已为 storyboards 表添加 video_path 字段')
      }
    } catch (e) {
      console.error('[DatabaseManager] 添加 video_path 字段失败:', e)
    }

    // ==================== 符合第三范式的新增子表 ====================

    // 图像资产表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS image_assets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        type TEXT NOT NULL,
        provider TEXT,
        model TEXT,
        prompt TEXT NOT NULL,
        negative_prompt TEXT,
        image_path TEXT NOT NULL,
        thumbnail_path TEXT,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_image_assets_project_id ON image_assets(project_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_image_assets_type ON image_assets(type)`)

    // 音频资产表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audio_assets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        type TEXT NOT NULL,
        text TEXT,
        voice_id TEXT,
        audio_path TEXT NOT NULL,
        duration INTEGER NOT NULL,
        volume INTEGER DEFAULT 100,
        fade_in INTEGER,
        fade_out INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_audio_assets_project_id ON audio_assets(project_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_audio_assets_type ON audio_assets(type)`)

    // 场景角色关联表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scene_characters (
        id TEXT PRIMARY KEY,
        scene_script_id TEXT NOT NULL,
        character_id TEXT NOT NULL,
        character_name TEXT NOT NULL,
        position TEXT DEFAULT 'center',
        expression TEXT,
        action TEXT,
        outfit TEXT,
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (scene_script_id) REFERENCES scene_scripts(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_scene_characters_scene_id ON scene_characters(scene_script_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_scene_characters_character_id ON scene_characters(character_id)`)

    // 场景道具关联表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scene_props (
        id TEXT PRIMARY KEY,
        scene_character_id TEXT NOT NULL,
        prop_name TEXT NOT NULL,
        FOREIGN KEY (scene_character_id) REFERENCES scene_characters(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_scene_props_character_id ON scene_props(scene_character_id)`)

    // 场景对话表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scene_dialogues (
        id TEXT PRIMARY KEY,
        scene_script_id TEXT NOT NULL,
        character_id TEXT NOT NULL,
        character_name TEXT NOT NULL,
        text TEXT NOT NULL,
        emotion TEXT,
        volume TEXT DEFAULT 'normal',
        pace TEXT DEFAULT 'normal',
        pause INTEGER DEFAULT 0,
        voice_id TEXT,
        audio_asset_id TEXT,
        sort_order INTEGER NOT NULL,
        FOREIGN KEY (scene_script_id) REFERENCES scene_scripts(id) ON DELETE CASCADE,
        FOREIGN KEY (audio_asset_id) REFERENCES audio_assets(id) ON DELETE SET NULL
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_scene_dialogues_scene_id ON scene_dialogues(scene_script_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_scene_dialogues_character_id ON scene_dialogues(character_id)`)

    // 场景动作表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scene_actions (
        id TEXT PRIMARY KEY,
        scene_script_id TEXT NOT NULL,
        character_id TEXT,
        description TEXT NOT NULL,
        timing TEXT NOT NULL DEFAULT 'during',
        duration REAL,
        sort_order INTEGER NOT NULL,
        FOREIGN KEY (scene_script_id) REFERENCES scene_scripts(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_scene_actions_scene_id ON scene_actions(scene_script_id)`)

    // 分镜角色关联表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS storyboard_characters (
        id TEXT PRIMARY KEY,
        storyboard_id TEXT NOT NULL,
        character_id TEXT NOT NULL,
        position_x REAL NOT NULL DEFAULT 50,
        position_y REAL NOT NULL DEFAULT 50,
        position_scale REAL NOT NULL DEFAULT 1.0,
        expression TEXT,
        action TEXT,
        facing TEXT DEFAULT 'front',
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_storyboard_characters_storyboard_id ON storyboard_characters(storyboard_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_storyboard_characters_character_id ON storyboard_characters(character_id)`)

    // 分镜对话关联表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS storyboard_dialogue_links (
        id TEXT PRIMARY KEY,
        storyboard_id TEXT NOT NULL,
        dialogue_id TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
        FOREIGN KEY (dialogue_id) REFERENCES scene_dialogues(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_storyboard_dialogue_links_storyboard_id ON storyboard_dialogue_links(storyboard_id)`)

    // 分镜动作关联表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS storyboard_action_links (
        id TEXT PRIMARY KEY,
        storyboard_id TEXT NOT NULL,
        action_id TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
        FOREIGN KEY (action_id) REFERENCES scene_actions(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_storyboard_action_links_storyboard_id ON storyboard_action_links(storyboard_id)`)

    // 音轨表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audio_tracks (
        id TEXT PRIMARY KEY,
        episode_id TEXT NOT NULL,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        volume INTEGER DEFAULT 100,
        muted INTEGER DEFAULT 0,
        solo INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (episode_id) REFERENCES video_episodes(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_audio_tracks_episode_id ON audio_tracks(episode_id)`)

    // 音轨音频关联表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audio_track_items (
        id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL,
        audio_asset_id TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (track_id) REFERENCES audio_tracks(id) ON DELETE CASCADE,
        FOREIGN KEY (audio_asset_id) REFERENCES audio_assets(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_audio_track_items_track_id ON audio_track_items(track_id)`)

    // 迁移类型配置表结构
    this.migrateTypeConfigTables()

    // 迁移字典表结构
    this.migrateDictionaryTables()

    // 迁移剧集制作模块JSON字段到子表
    this.migrateStoryToVideoJsonFields()

    // 为 video_episodes 表添加 deleted_at 列（如果不存在）
    this.migrateVideoEpisodesAddDeletedAt()

    // 为 video_episodes 表添加上传长文相关字段
    this.migrateVideoEpisodesAddUploadFields()

    // 执行其他数据库迁移
    this.runMigrations()

    // 检查 portrait_characters 表是否需要修改字段约束
    this.migratePortraitCharactersNullable()

    // 检查 portrait_variants 表是否需要移除 project_id 列
    this.migratePortraitVariantsRemoveProjectId()

    // 为 episode_scripts 表添加 script_content 和 script_format 字段
    this.migrateEpisodeScriptsAddScriptContent()

    // 迁移 video_projects 表，使 long_writing_project_id 可为空
    this.migrateVideoProjectsNullableLongWritingId()

    // 数据库规范化迁移（符合第三范式）
    this.normalizeDatabaseSchema()
  }

  /**
   * 数据库规范化迁移（符合第三范式）
   * 将JSON字段拆分为独立的表列
   */
  private normalizeDatabaseSchema(): void {
    if (!this.db) return

    const migrationKey = 'database_normalization_v1'
    const migrationRecord = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(migrationKey)
    if (migrationRecord) {
      return // 已迁移
    }

    console.log('[DatabaseManager] 开始数据库规范化迁移...')

    try {
      // 1. 规范化 storyboards 表
      this.normalizeStoryboardsTable()

      // 2. 规范化 character_bindings 表
      this.normalizeCharacterBindingsTable()

      // 标记迁移完成
      this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(migrationKey, Date.now().toString())
      console.log('[DatabaseManager] 数据库规范化迁移完成')
    } catch (error) {
      console.error('[DatabaseManager] 数据库规范化迁移失败:', error)
      throw error
    }
  }

  /**
   * 规范化 storyboards 表
   * 将 transition JSON 拆分为独立字段，添加 frame_image_id 外键
   */
  private normalizeStoryboardsTable(): void {
    if (!this.db) return

    // 检查表是否存在
    const tableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='storyboards'").get()
    if (!tableExists) return

    // 获取当前表结构
    const columns = this.db.prepare("PRAGMA table_info(storyboards)").all() as { name: string }[]
    const columnNames = columns.map(col => col.name)

    // 添加新字段
    const newColumns = [
      { name: 'transition_type', sql: 'ALTER TABLE storyboards ADD COLUMN transition_type TEXT DEFAULT \'cut\'' },
      { name: 'transition_duration_ms', sql: 'ALTER TABLE storyboards ADD COLUMN transition_duration_ms INTEGER DEFAULT 500' },
      { name: 'transition_direction', sql: 'ALTER TABLE storyboards ADD COLUMN transition_direction TEXT' },
      { name: 'transition_easing', sql: 'ALTER TABLE storyboards ADD COLUMN transition_easing TEXT DEFAULT \'ease_out\'' },
      { name: 'transition_color', sql: 'ALTER TABLE storyboards ADD COLUMN transition_color TEXT' },
      { name: 'frame_image_id', sql: 'ALTER TABLE storyboards ADD COLUMN frame_image_id TEXT REFERENCES image_assets(id) ON DELETE SET NULL' }
    ]

    for (const col of newColumns) {
      if (!columnNames.includes(col.name)) {
        console.log(`[DatabaseManager] 为 storyboards 表添加 ${col.name} 字段...`)
        try {
          this.db.exec(col.sql)
          console.log(`[DatabaseManager] storyboards 表添加 ${col.name} 字段完成`)
        } catch (e) {
          console.error(`[DatabaseManager] 添加 ${col.name} 字段失败:`, e)
        }
      }
    }

    // 迁移现有 transition JSON 数据到新字段
    const storyboards = this.db.prepare('SELECT id, transition FROM storyboards WHERE transition IS NOT NULL').all() as any[]

    for (const sb of storyboards) {
      if (sb.transition) {
        try {
          const transition = JSON.parse(sb.transition)
          this.db.prepare(`
            UPDATE storyboards
            SET transition_type = ?, transition_duration_ms = ?, transition_direction = ?, transition_easing = ?, transition_color = ?
            WHERE id = ?
          `).run(
            transition.type || 'cut',
            transition.duration || 500,
            transition.direction || null,
            transition.easing || 'ease_out',
            transition.color || null,
            sb.id
          )
        } catch (e) {
          console.warn('[DatabaseManager] 迁移 storyboards.transition 失败:', sb.id, e)
        }
      }
    }

    console.log(`[DatabaseManager] storyboards 表规范化完成，已迁移 ${storyboards.length} 条记录`)
  }

  /**
   * 规范化 character_bindings 表
   * 将 voice_config 和 generate_config JSON 拆分为独立字段
   */
  private normalizeCharacterBindingsTable(): void {
    if (!this.db) return

    // 检查表是否存在
    const tableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='character_bindings'").get()
    if (!tableExists) return

    // 获取当前表结构
    const columns = this.db.prepare("PRAGMA table_info(character_bindings)").all() as { name: string }[]
    const columnNames = columns.map(col => col.name)

    // 添加新字段
    const newColumns = [
      // 声音配置
      { name: 'voice_id', sql: 'ALTER TABLE character_bindings ADD COLUMN voice_id TEXT' },
      { name: 'voice_speed', sql: 'ALTER TABLE character_bindings ADD COLUMN voice_speed REAL DEFAULT 1.0' },
      { name: 'voice_pitch', sql: 'ALTER TABLE character_bindings ADD COLUMN voice_pitch REAL DEFAULT 1.0' },
      // 生成配置
      { name: 'base_description', sql: 'ALTER TABLE character_bindings ADD COLUMN base_description TEXT' },
      { name: 'style_reference', sql: 'ALTER TABLE character_bindings ADD COLUMN style_reference TEXT' },
      { name: 'additional_prompts', sql: 'ALTER TABLE character_bindings ADD COLUMN additional_prompts TEXT' }
    ]

    for (const col of newColumns) {
      if (!columnNames.includes(col.name)) {
        console.log(`[DatabaseManager] 为 character_bindings 表添加 ${col.name} 字段...`)
        try {
          this.db.exec(col.sql)
          console.log(`[DatabaseManager] character_bindings 表添加 ${col.name} 字段完成`)
        } catch (e) {
          console.error(`[DatabaseManager] 添加 ${col.name} 字段失败:`, e)
        }
      }
    }

    // 迁移现有 voice_config JSON 数据
    const bindings = this.db.prepare('SELECT id, voice_config, generate_config FROM character_bindings').all() as any[]

    for (const binding of bindings) {
      // 迁移 voice_config
      if (binding.voice_config) {
        try {
          const voiceConfig = JSON.parse(binding.voice_config)
          this.db.prepare(`
            UPDATE character_bindings
            SET voice_id = ?, voice_speed = ?, voice_pitch = ?
            WHERE id = ?
          `).run(
            voiceConfig.voiceId || null,
            voiceConfig.speed || 1.0,
            voiceConfig.pitch || 1.0,
            binding.id
          )
        } catch (e) {
          console.warn('[DatabaseManager] 迁移 character_bindings.voice_config 失败:', binding.id, e)
        }
      }

      // 迁移 generate_config
      if (binding.generate_config) {
        try {
          const genConfig = JSON.parse(binding.generate_config)
          this.db.prepare(`
            UPDATE character_bindings
            SET base_description = ?, style_reference = ?, additional_prompts = ?
            WHERE id = ?
          `).run(
            genConfig.baseDescription || null,
            genConfig.styleReference || null,
            genConfig.additionalPrompts || null,
            binding.id
          )
        } catch (e) {
          console.warn('[DatabaseManager] 迁移 character_bindings.generate_config 失败:', binding.id, e)
        }
      }
    }

    console.log(`[DatabaseManager] character_bindings 表规范化完成，已迁移 ${bindings.length} 条记录`)
  }

  /**
   * 迁移剧集制作模块JSON字段到子表（符合第三范式）
   */
  private migrateStoryToVideoJsonFields(): void {
    if (!this.db) return

    // 检查是否已迁移（通过检查新表是否有数据来判断）
    const migrationKey = 'story_to_video_json_migration_v1'
    const migrationRecord = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(migrationKey)
    if (migrationRecord) {
      return // 已迁移
    }

    console.log('[DatabaseManager] 开始迁移剧集制作模块JSON字段到子表...')

    try {
      // 备份数据库
      this.backupDatabase()

      // 迁移场景剧本中的 characters、dialogues、actions 字段
      this.migrateSceneScriptJsonFields()

      // 迁移分镜中的 characters、dialogue_ids、action_ids 字段
      this.migrateStoryboardJsonFields()

      // 标记迁移完成
      this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(migrationKey, Date.now().toString())

      console.log('[DatabaseManager] 剧集制作模块JSON字段迁移完成')
    } catch (error) {
      console.error('[DatabaseManager] 剧集制作模块JSON字段迁移失败:', error)
      // 尝试恢复备份
      this.restoreDatabaseFromBackup()
      throw error
    }
  }

  /**
   * 备份数据库
   */
  private backupDatabase(): void {
    if (!this.db || !this.dbPath) return

    const backupPath = `${this.dbPath}.backup_${Date.now()}`
    console.log(`[DatabaseManager] 备份数据库到: ${backupPath}`)

    try {
      // 使用 SQLite 的备份 API
      this.db.backup(backupPath)
      this.lastBackupPath = backupPath
      console.log('[DatabaseManager] 数据库备份完成')
    } catch (error) {
      console.error('[DatabaseManager] 数据库备份失败:', error)
      throw error
    }
  }

  /**
   * 从备份恢复数据库
   */
  private restoreDatabaseFromBackup(): void {
    if (!this.lastBackupPath) {
      console.warn('[DatabaseManager] 没有可用的备份文件')
      return
    }

    console.log(`[DatabaseManager] 尝试从备份恢复: ${this.lastBackupPath}`)

    try {
      // 关闭当前数据库连接
      this.db?.close()

      // 复制备份文件覆盖原文件
      const fs = require('fs')
      fs.copyFileSync(this.lastBackupPath, this.dbPath!)

      // 重新打开数据库
      this.db = new Database(this.dbPath!)
      console.log('[DatabaseManager] 数据库恢复完成')
    } catch (error) {
      console.error('[DatabaseManager] 数据库恢复失败:', error)
    }
  }

  /**
   * 迁移场景剧本的JSON字段
   */
  private migrateSceneScriptJsonFields(): void {
    if (!this.db) return

    // 获取所有场景剧本
    const scenes = this.db.prepare('SELECT id, characters, dialogues, actions FROM scene_scripts').all() as any[]

    for (const scene of scenes) {
      // 迁移 characters
      if (scene.characters) {
        try {
          const characters = JSON.parse(scene.characters)
          if (Array.isArray(characters)) {
            for (let i = 0; i < characters.length; i++) {
              const char = characters[i]
              const charId = `sc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
              this.db.prepare(`
                INSERT OR IGNORE INTO scene_characters (id, scene_script_id, character_id, character_name, position, expression, action, outfit, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                charId,
                scene.id,
                char.characterId || '',
                char.characterName || '',
                char.position || 'center',
                char.expression || null,
                char.action || null,
                char.outfit || null,
                i
              )

              // 迁移道具
              if (char.props && Array.isArray(char.props)) {
                for (const prop of char.props) {
                  const propId = `sp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                  this.db.prepare(`
                    INSERT OR IGNORE INTO scene_props (id, scene_character_id, prop_name)
                    VALUES (?, ?, ?)
                  `).run(propId, charId, prop)
                }
              }
            }
          }
        } catch (e) {
          console.warn('[DatabaseManager] 解析场景角色JSON失败:', e)
        }
      }

      // 迁移 dialogues
      if (scene.dialogues) {
        try {
          const dialogues = JSON.parse(scene.dialogues)
          if (Array.isArray(dialogues)) {
            for (let i = 0; i < dialogues.length; i++) {
              const dlg = dialogues[i]
              const dlgId = dlg.id || `dlg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
              this.db.prepare(`
                INSERT OR IGNORE INTO scene_dialogues (id, scene_script_id, character_id, character_name, text, emotion, volume, pace, pause, voice_id, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                dlgId,
                scene.id,
                dlg.characterId || '',
                dlg.characterName || '',
                dlg.text || '',
                dlg.emotion || null,
                dlg.volume || 'normal',
                dlg.pace || 'normal',
                dlg.pause || 0,
                dlg.voiceId || null,
                i
              )
            }
          }
        } catch (e) {
          console.warn('[DatabaseManager] 解析场景对话JSON失败:', e)
        }
      }

      // 迁移 actions
      if (scene.actions) {
        try {
          const actions = JSON.parse(scene.actions)
          if (Array.isArray(actions)) {
            for (let i = 0; i < actions.length; i++) {
              const act = actions[i]
              const actId = act.id || `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
              this.db.prepare(`
                INSERT OR IGNORE INTO scene_actions (id, scene_script_id, character_id, description, timing, duration, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).run(
                actId,
                scene.id,
                act.characterId || null,
                act.description || '',
                act.timing || 'during',
                act.duration || null,
                i
              )
            }
          }
        } catch (e) {
          console.warn('[DatabaseManager] 解析场景动作JSON失败:', e)
        }
      }
    }
  }

  /**
   * 迁移分镜的JSON字段
   */
  private migrateStoryboardJsonFields(): void {
    if (!this.db) return

    // 获取所有分镜
    const storyboards = this.db.prepare('SELECT id, characters, dialogue_ids, action_ids FROM storyboards').all() as any[]

    for (const storyboard of storyboards) {
      // 迁移 characters
      if (storyboard.characters) {
        try {
          const characters = JSON.parse(storyboard.characters)
          if (Array.isArray(characters)) {
            for (let i = 0; i < characters.length; i++) {
              const char = characters[i]
              this.db.prepare(`
                INSERT OR IGNORE INTO storyboard_characters (id, storyboard_id, character_id, position_x, position_y, position_scale, expression, action, facing, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                `stc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                storyboard.id,
                char.characterId || '',
                char.position?.x || 50,
                char.position?.y || 50,
                char.position?.scale || 1.0,
                char.expression || null,
                char.action || null,
                char.facing || 'front',
                i
              )
            }
          }
        } catch (e) {
          console.warn('[DatabaseManager] 解析分镜角色JSON失败:', e)
        }
      }

      // 迁移 dialogue_ids
      if (storyboard.dialogue_ids) {
        try {
          const dialogueIds = JSON.parse(storyboard.dialogue_ids)
          if (Array.isArray(dialogueIds)) {
            for (let i = 0; i < dialogueIds.length; i++) {
              const dialogueId = dialogueIds[i]
              this.db.prepare(`
                INSERT OR IGNORE INTO storyboard_dialogue_links (id, storyboard_id, dialogue_id, sort_order)
                VALUES (?, ?, ?, ?)
              `).run(
                `sdl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                storyboard.id,
                dialogueId,
                i
              )
            }
          }
        } catch (e) {
          console.warn('[DatabaseManager] 解析分镜对话ID JSON失败:', e)
        }
      }

      // 迁移 action_ids
      if (storyboard.action_ids) {
        try {
          const actionIds = JSON.parse(storyboard.action_ids)
          if (Array.isArray(actionIds)) {
            for (let i = 0; i < actionIds.length; i++) {
              const actionId = actionIds[i]
              this.db.prepare(`
                INSERT OR IGNORE INTO storyboard_action_links (id, storyboard_id, action_id, sort_order)
                VALUES (?, ?, ?, ?)
              `).run(
                `sal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                storyboard.id,
                actionId,
                i
              )
            }
          }
        } catch (e) {
          console.warn('[DatabaseManager] 解析分镜动作ID JSON失败:', e)
        }
      }
    }
  }

  /**
   * 为 video_episodes 表添加 deleted_at 列（如果不存在）
   */
  private migrateVideoEpisodesAddDeletedAt(): void {
    if (!this.db) return

    // 检查是否存在 deleted_at 列
    const columns = this.db.prepare("PRAGMA table_info(video_episodes)").all() as { name: string }[]
    const hasDeletedAt = columns.some(col => col.name === 'deleted_at')

    if (!hasDeletedAt) {
      console.log('[DatabaseManager] 为 video_episodes 表添加 deleted_at 列...')
      try {
        this.db.exec('ALTER TABLE video_episodes ADD COLUMN deleted_at INTEGER DEFAULT NULL')
        console.log('[DatabaseManager] video_episodes 表添加 deleted_at 列完成')
      } catch (e) {
        console.error('[DatabaseManager] 添加 deleted_at 列失败:', e)
      }
    }
  }

  /**
   * 为 video_episodes 表添加上传长文相关字段
   */
  private migrateVideoEpisodesAddUploadFields(): void {
    if (!this.db) return

    // 检查是否存在 source_type 列
    const columns = this.db.prepare("PRAGMA table_info(video_episodes)").all() as { name: string }[]
    const hasSourceType = columns.some(col => col.name === 'source_type')

    if (!hasSourceType) {
      console.log('[DatabaseManager] 为 video_episodes 表添加上传长文相关字段...')
      try {
        // 添加 source_type 列，默认值为 'outline'
        this.db.exec('ALTER TABLE video_episodes ADD COLUMN source_type TEXT NOT NULL DEFAULT \'outline\'')
        // 添加 uploaded_content 列
        this.db.exec('ALTER TABLE video_episodes ADD COLUMN uploaded_content TEXT DEFAULT NULL')
        // 添加 uploaded_characters 列
        this.db.exec('ALTER TABLE video_episodes ADD COLUMN uploaded_characters TEXT DEFAULT NULL')
        console.log('[DatabaseManager] video_episodes 表添加上传长文相关字段完成')
      } catch (e) {
        console.error('[DatabaseManager] 添加上传长文相关字段失败:', e)
      }
    }
  }

  /**
   * 迁移类型配置表结构（移除 levels 字段，改用独立的等级表）
   */
  private migrateTypeConfigTables(): void {
    if (!this.db) return

    // 检查技能类型表是否有旧的 levels 字段
    const skillTypesTable = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lw_project_skill_types'").get()
    if (skillTypesTable) {
      const columns = this.db.prepare("PRAGMA table_info(lw_project_skill_types)").all() as { name: string }[]
      const hasOldLevelsField = columns.some(col => col.name === 'levels')

      if (hasOldLevelsField) {
        console.log('[DatabaseManager] 迁移技能类型配置表结构，移除 levels 字段...')

        // 备份数据
        const oldData = this.db.prepare('SELECT * FROM lw_project_skill_types').all() as any[]

        // 重建表
        this.db.exec('DROP TABLE lw_project_skill_types')
        this.db.exec(`
          CREATE TABLE lw_project_skill_types (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(project_id, code),
            FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
          )
        `)

        // 恢复数据（忽略 levels 字段）
        const insertStmt = this.db.prepare(`
          INSERT INTO lw_project_skill_types (id, project_id, code, name, description, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        for (const row of oldData) {
          insertStmt.run(row.id, row.project_id, row.code, row.name, null, row.sort_order, row.created_at, row.updated_at)
        }

        console.log('[DatabaseManager] 技能类型配置表迁移完成')
      }
    }

    // 检查物品类型表是否有旧的 levels 字段
    const itemTypesTable = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lw_project_item_types'").get()
    if (itemTypesTable) {
      const columns = this.db.prepare("PRAGMA table_info(lw_project_item_types)").all() as { name: string }[]
      const hasOldLevelsField = columns.some(col => col.name === 'levels')

      if (hasOldLevelsField) {
        console.log('[DatabaseManager] 迁移物品类型配置表结构，移除 levels 字段...')

        // 备份数据
        const oldData = this.db.prepare('SELECT * FROM lw_project_item_types').all() as any[]

        // 重建表
        this.db.exec('DROP TABLE lw_project_item_types')
        this.db.exec(`
          CREATE TABLE lw_project_item_types (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(project_id, code),
            FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
          )
        `)

        // 恢复数据（忽略 levels 字段）
        const insertStmt = this.db.prepare(`
          INSERT INTO lw_project_item_types (id, project_id, code, name, description, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        for (const row of oldData) {
          insertStmt.run(row.id, row.project_id, row.code, row.name, null, row.sort_order, row.created_at, row.updated_at)
        }

        console.log('[DatabaseManager] 物品类型配置表迁移完成')
      }
    }
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
   * 为 episode_scripts 表添加 script_content 和 script_format 字段
   */
  private migrateEpisodeScriptsAddScriptContent(): void {
    if (!this.db) return

    // 检查 episode_scripts 表是否存在
    const tableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='episode_scripts'").get()
    if (!tableExists) return

    // 获取表结构
    const columns = this.db.prepare("PRAGMA table_info(episode_scripts)").all() as { name: string }[]
    const columnNames = columns.map(col => col.name)

    // 添加 script_content 字段
    if (!columnNames.includes('script_content')) {
      console.log('[DatabaseManager] 为 episode_scripts 表添加 script_content 字段...')
      try {
        this.db.exec('ALTER TABLE episode_scripts ADD COLUMN script_content TEXT')
        console.log('[DatabaseManager] episode_scripts 表添加 script_content 字段完成')
      } catch (e) {
        console.error('[DatabaseManager] 添加 script_content 字段失败:', e)
      }
    }

    // 添加 script_format 字段
    if (!columnNames.includes('script_format')) {
      console.log('[DatabaseManager] 为 episode_scripts 表添加 script_format 字段...')
      try {
        this.db.exec('ALTER TABLE episode_scripts ADD COLUMN script_format TEXT DEFAULT \'standard\'')
        console.log('[DatabaseManager] episode_scripts 表添加 script_format 字段完成')
      } catch (e) {
        console.error('[DatabaseManager] 添加 script_format 字段失败:', e)
      }
    }
  }

  /**
   * 迁移 video_projects 表，使 long_writing_project_id 可为空
   */
  private migrateVideoProjectsNullableLongWritingId(): void {
    if (!this.db) return

    // 检查 video_projects 表是否存在
    const tableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='video_projects'").get()
    if (!tableExists) return

    // 使用 settings 表检查是否已经迁移
    const migrationKey = 'video_projects_nullable_lw_id_v1'
    try {
      const migrationRecord = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(migrationKey)
      if (migrationRecord) {
        return // 已迁移
      }
    } catch (e) {
      // settings 表可能不存在，继续执行迁移
      console.log('[DatabaseManager] settings 表检查跳过，继续迁移')
    }

    // 检查 long_writing_project_id 字段是否已经是可空的
    const columns = this.db.prepare("PRAGMA table_info(video_projects)").all() as { name: string; notnull: number }[]
    const longWritingProjectIdCol = columns.find(col => col.name === 'long_writing_project_id')

    // 如果字段不存在或已经是可空的，标记迁移完成
    if (!longWritingProjectIdCol || longWritingProjectIdCol.notnull === 0) {
      // 标记迁移完成
      try {
        this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(migrationKey, Date.now().toString())
      } catch (e) {
        // 忽略 settings 表可能不存在的情况
      }
      return
    }

    console.log('[DatabaseManager] 迁移 video_projects 表，使 long_writing_project_id 可为空...')

    // 临时禁用外键约束
    this.db.exec('PRAGMA foreign_keys = OFF')

    try {
      // 保存所有依赖表的数据
      const dependentTables = [
        'character_bindings',
        'location_bindings',
        'item_bindings',
        'video_episodes',
        'episode_scripts',
        'image_assets',
        'audio_assets'
      ]

      const savedData: Map<string, any[]> = new Map()
      for (const table of dependentTables) {
        try {
          const tableExists = this.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`).get()
          if (tableExists) {
            const rows = this.db.prepare(`SELECT * FROM ${table}`).all()
            savedData.set(table, rows)
            console.log(`[DatabaseManager] 保存 ${table} 数据: ${rows.length} 条`)
          }
        } catch (e) {
          console.log(`[DatabaseManager] 跳过表 ${table}`)
        }
      }

      // 删除依赖表
      for (const table of dependentTables) {
        try {
          this.db.exec(`DROP TABLE IF EXISTS ${table}`)
        } catch (e) {
          // 忽略
        }
      }

      // 删除旧表
      this.db.exec('DROP TABLE video_projects')

      // 创建新表（long_writing_project_id 可为空）
      this.db.exec(`
        CREATE TABLE video_projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          long_writing_project_id TEXT,
          status TEXT NOT NULL DEFAULT 'draft',
          config TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (long_writing_project_id) REFERENCES lw_projects(id) ON DELETE SET NULL
        )
      `)

      // 重建索引
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_video_projects_lw_project_id ON video_projects(long_writing_project_id)')
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_video_projects_status ON video_projects(status)')
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_video_projects_created_at ON video_projects(created_at DESC)')

      // 重建依赖表（从之前保存的数据恢复）
      this.recreateDependentTablesWithData(savedData)

      // 标记迁移完成
      try {
        this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(migrationKey, Date.now().toString())
      } catch (e) {
        // 忽略
      }

      console.log('[DatabaseManager] video_projects 表迁移完成')
    } catch (error) {
      console.error('[DatabaseManager] video_projects 表迁移失败:', error)
      throw error
    } finally {
      // 重新启用外键约束
      this.db.exec('PRAGMA foreign_keys = ON')
    }
  }

  /**
   * 重建依赖表并恢复数据
   */
  private recreateDependentTablesWithData(savedData: Map<string, any[]>): void {
    // character_bindings 表
    if (savedData.has('character_bindings') && savedData.get('character_bindings')!.length > 0) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS character_bindings (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          long_writing_character_id TEXT NOT NULL,
          portrait_id TEXT,
          generate_config TEXT,
          voice_config TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE,
          FOREIGN KEY (portrait_id) REFERENCES portrait_characters(id) ON DELETE SET NULL
        )
      `)
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_character_bindings_project_id ON character_bindings(project_id)')

      const data = savedData.get('character_bindings')!
      for (const row of data) {
        const cols = Object.keys(row).join(', ')
        const placeholders = Object.keys(row).map(() => '?').join(', ')
        const values = Object.values(row)
        this.db.prepare(`INSERT INTO character_bindings (${cols}) VALUES (${placeholders})`).run(...values)
      }
    }

    // location_bindings 表
    if (savedData.has('location_bindings') && savedData.get('location_bindings')!.length > 0) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS location_bindings (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          long_writing_location_id TEXT NOT NULL,
          location_name TEXT NOT NULL,
          image_paths TEXT DEFAULT '[]',
          thumbnail_path TEXT,
          generate_config TEXT,
          base_description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE,
          UNIQUE(project_id, long_writing_location_id)
        )
      `)
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_location_bindings_project_id ON location_bindings(project_id)')

      const data = savedData.get('location_bindings')!
      for (const row of data) {
        const cols = Object.keys(row).join(', ')
        const placeholders = Object.keys(row).map(() => '?').join(', ')
        const values = Object.values(row)
        this.db.prepare(`INSERT INTO location_bindings (${cols}) VALUES (${placeholders})`).run(...values)
      }
    }

    // item_bindings 表
    if (savedData.has('item_bindings') && savedData.get('item_bindings')!.length > 0) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS item_bindings (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          long_writing_item_id TEXT NOT NULL,
          item_name TEXT NOT NULL,
          image_paths TEXT DEFAULT '[]',
          thumbnail_path TEXT,
          generate_config TEXT,
          base_description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE,
          UNIQUE(project_id, long_writing_item_id)
        )
      `)
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_item_bindings_project_id ON item_bindings(project_id)')

      const data = savedData.get('item_bindings')!
      for (const row of data) {
        const cols = Object.keys(row).join(', ')
        const placeholders = Object.keys(row).map(() => '?').join(', ')
        const values = Object.values(row)
        this.db.prepare(`INSERT INTO item_bindings (${cols}) VALUES (${placeholders})`).run(...values)
      }
    }

    // video_episodes 表
    if (savedData.has('video_episodes') && savedData.get('video_episodes')!.length > 0) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS video_episodes (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          source_type TEXT NOT NULL DEFAULT 'outline',
          outline_id TEXT,
          uploaded_content TEXT,
          uploaded_characters TEXT,
          episode_number INTEGER NOT NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          duration INTEGER DEFAULT 0,
          script_id TEXT,
          audio_tracks TEXT DEFAULT '[]',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          deleted_at DATETIME,
          FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE
        )
      `)
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_video_episodes_project_id ON video_episodes(project_id)')
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_video_episodes_outline_id ON video_episodes(outline_id)')
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_video_episodes_status ON video_episodes(status)')

      const data = savedData.get('video_episodes')!
      for (const row of data) {
        const cols = Object.keys(row).join(', ')
        const placeholders = Object.keys(row).map(() => '?').join(', ')
        const values = Object.values(row)
        this.db.prepare(`INSERT INTO video_episodes (${cols}) VALUES (${placeholders})`).run(...values)
      }
    }

    // episode_scripts 表
    if (savedData.has('episode_scripts') && savedData.get('episode_scripts')!.length > 0) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS episode_scripts (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          episode_id TEXT NOT NULL,
          outline_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          synopsis TEXT,
          script_content TEXT,
          script_format TEXT DEFAULT 'standard',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE,
          FOREIGN KEY (episode_id) REFERENCES video_episodes(id) ON DELETE CASCADE
        )
      `)
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_episode_scripts_episode_id ON episode_scripts(episode_id)')
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_episode_scripts_status ON episode_scripts(status)')

      const data = savedData.get('episode_scripts')!
      for (const row of data) {
        const cols = Object.keys(row).join(', ')
        const placeholders = Object.keys(row).map(() => '?').join(', ')
        const values = Object.values(row)
        this.db.prepare(`INSERT INTO episode_scripts (${cols}) VALUES (${placeholders})`).run(...values)
      }
    }

    // image_assets 表
    if (savedData.has('image_assets') && savedData.get('image_assets')!.length > 0) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS image_assets (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          type TEXT NOT NULL,
          reference_id TEXT,
          prompt TEXT,
          negative_prompt TEXT,
          file_path TEXT NOT NULL,
          width INTEGER DEFAULT 0,
          height INTEGER DEFAULT 0,
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE
        )
      `)
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_image_assets_project_id ON image_assets(project_id)')
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_image_assets_type ON image_assets(type)')

      const data = savedData.get('image_assets')!
      for (const row of data) {
        const cols = Object.keys(row).join(', ')
        const placeholders = Object.keys(row).map(() => '?').join(', ')
        const values = Object.values(row)
        this.db.prepare(`INSERT INTO image_assets (${cols}) VALUES (${placeholders})`).run(...values)
      }
    }

    // audio_assets 表
    if (savedData.has('audio_assets') && savedData.get('audio_assets')!.length > 0) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS audio_assets (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          type TEXT NOT NULL,
          text TEXT,
          voice_id TEXT,
          audio_path TEXT NOT NULL,
          duration INTEGER NOT NULL,
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE
        )
      `)
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_audio_assets_project_id ON audio_assets(project_id)')
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_audio_assets_type ON audio_assets(type)')

      const data = savedData.get('audio_assets')!
      for (const row of data) {
        const cols = Object.keys(row).join(', ')
        const placeholders = Object.keys(row).map(() => '?').join(', ')
        const values = Object.values(row)
        this.db.prepare(`INSERT INTO audio_assets (${cols}) VALUES (${placeholders})`).run(...values)
      }
    }
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
    if (!overviewColumnNames.includes('key_characters')) {
      this.db.exec('ALTER TABLE lw_story_overviews ADD COLUMN key_characters TEXT DEFAULT \'[]\'')
    }
    if (!overviewColumnNames.includes('key_locations')) {
      this.db.exec('ALTER TABLE lw_story_overviews ADD COLUMN key_locations TEXT DEFAULT \'[]\'')
    }
    if (!overviewColumnNames.includes('is_saved')) {
      this.db.exec('ALTER TABLE lw_story_overviews ADD COLUMN is_saved INTEGER DEFAULT 0')
    }
    if (!overviewColumnNames.includes('enabled_features')) {
      this.db.exec('ALTER TABLE lw_story_overviews ADD COLUMN enabled_features TEXT DEFAULT \'[]\'')
    }

    // 检查 lw_story_backgrounds 表是否需要添加新字段
    const backgroundColumns = this.db.prepare("PRAGMA table_info(lw_story_backgrounds)").all() as { name: string }[]
    const backgroundColumnNames = backgroundColumns.map(col => col.name)

    if (!backgroundColumnNames.includes('faction_distribution')) {
      this.db.exec('ALTER TABLE lw_story_backgrounds ADD COLUMN faction_distribution TEXT')
    }
    if (!backgroundColumnNames.includes('geographic_orientation')) {
      this.db.exec('ALTER TABLE lw_story_backgrounds ADD COLUMN geographic_orientation TEXT')
    }

    // 检查 lw_global_settings 表是否需要添加 estimated_lengths 字段
    const globalSettingsColumns = this.db.prepare("PRAGMA table_info(lw_global_settings)").all() as { name: string }[]
    const globalSettingsColumnNames = globalSettingsColumns.map(col => col.name)

    if (!globalSettingsColumnNames.includes('estimated_lengths')) {
      this.db.exec('ALTER TABLE lw_global_settings ADD COLUMN estimated_lengths TEXT')
    }

    // 检查 video_episodes 表是否需要添加 deleted_at 字段（逻辑删除）
    const videoEpisodeColumns = this.db.prepare("PRAGMA table_info(video_episodes)").all() as { name: string }[]
    const videoEpisodeColumnNames = videoEpisodeColumns.map(col => col.name)

    if (!videoEpisodeColumnNames.includes('deleted_at')) {
      this.db.exec('ALTER TABLE video_episodes ADD COLUMN deleted_at INTEGER DEFAULT NULL')
    }

    // 检查 video_episodes 表是否需要添加上传长文相关字段
    if (!videoEpisodeColumnNames.includes('source_type')) {
      this.db.exec('ALTER TABLE video_episodes ADD COLUMN source_type TEXT NOT NULL DEFAULT \'outline\'')
    }
    if (!videoEpisodeColumnNames.includes('uploaded_content')) {
      this.db.exec('ALTER TABLE video_episodes ADD COLUMN uploaded_content TEXT DEFAULT NULL')
    }
    if (!videoEpisodeColumnNames.includes('uploaded_characters')) {
      this.db.exec('ALTER TABLE video_episodes ADD COLUMN uploaded_characters TEXT DEFAULT NULL')
    }

    // 检查 lw_story_locations 表是否需要添加 map_id 字段
    const locationColumns = this.db.prepare("PRAGMA table_info(lw_story_locations)").all() as { name: string }[]
    const locationColumnNames = locationColumns.map(col => col.name)

    if (!locationColumnNames.includes('map_id')) {
      this.db.exec('ALTER TABLE lw_story_locations ADD COLUMN map_id TEXT REFERENCES lw_project_maps(id) ON DELETE SET NULL')
      // 创建 map_id 列的索引
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_lw_locations_map_id ON lw_story_locations(map_id)')
    }

    // 检查 lw_story_characters 表是否需要添加 importance 字段
    const characterColumns = this.db.prepare("PRAGMA table_info(lw_story_characters)").all() as { name: string }[]
    const characterColumnNames = characterColumns.map(col => col.name)

    if (!characterColumnNames.includes('importance')) {
      this.db.exec('ALTER TABLE lw_story_characters ADD COLUMN importance TEXT DEFAULT \'secondary\'')
    }

    // 检查 lw_story_characters 表是否需要添加 template_type 和 generated_image_id 字段
    if (!characterColumnNames.includes('template_type')) {
      this.db.exec('ALTER TABLE lw_story_characters ADD COLUMN template_type TEXT')
    }
    if (!characterColumnNames.includes('generated_image_id')) {
      this.db.exec('ALTER TABLE lw_story_characters ADD COLUMN generated_image_id TEXT')
    }

    // 检查 lw_story_characters 表是否需要添加新字段（身高、体重、人种、职业、职务）
    if (!characterColumnNames.includes('height')) {
      this.db.exec('ALTER TABLE lw_story_characters ADD COLUMN height INTEGER')
    }
    if (!characterColumnNames.includes('weight')) {
      this.db.exec('ALTER TABLE lw_story_characters ADD COLUMN weight INTEGER')
    }
    if (!characterColumnNames.includes('race')) {
      this.db.exec('ALTER TABLE lw_story_characters ADD COLUMN race TEXT')
    }
    if (!characterColumnNames.includes('occupation')) {
      this.db.exec('ALTER TABLE lw_story_characters ADD COLUMN occupation TEXT')
    }
    if (!characterColumnNames.includes('position')) {
      this.db.exec('ALTER TABLE lw_story_characters ADD COLUMN position TEXT')
    }

    // 检查 lw_story_locations 表是否需要添加 entity_importance 字段
    if (!locationColumnNames.includes('entity_importance')) {
      this.db.exec('ALTER TABLE lw_story_locations ADD COLUMN entity_importance TEXT DEFAULT \'secondary\'')
    }

    // 检查 lw_story_locations 表是否需要添加 template_type 和 generated_image_id 字段
    if (!locationColumnNames.includes('template_type')) {
      this.db.exec('ALTER TABLE lw_story_locations ADD COLUMN template_type TEXT')
    }
    if (!locationColumnNames.includes('generated_image_id')) {
      this.db.exec('ALTER TABLE lw_story_locations ADD COLUMN generated_image_id TEXT')
    }

    // 检查 lw_story_items 表是否需要添加 importance 字段
    const itemColumns = this.db.prepare("PRAGMA table_info(lw_story_items)").all() as { name: string }[]
    const itemColumnNames = itemColumns.map(col => col.name)

    if (!itemColumnNames.includes('importance')) {
      this.db.exec('ALTER TABLE lw_story_items ADD COLUMN importance TEXT DEFAULT \'secondary\'')
    }

    // 检查临时实体模板表是否存在，不存在则创建
    const tempCharTemplateExists = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='lw_temp_character_templates'"
    ).get()
    if (!tempCharTemplateExists) {
      console.log('[DatabaseManager] 创建 lw_temp_character_templates 表...')
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS lw_temp_character_templates (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          gender TEXT NOT NULL DEFAULT 'other',
          age_min INTEGER DEFAULT 20,
          age_max INTEGER DEFAULT 50,
          base_prompt TEXT NOT NULL,
          style_variants TEXT DEFAULT '[]',
          negative_prompt TEXT,
          match_keywords TEXT DEFAULT '[]',
          sort_order INTEGER DEFAULT 0,
          is_default INTEGER DEFAULT 0,
          created_at INTEGER,
          updated_at INTEGER
        )
      `)
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_temp_char_templates_type ON lw_temp_character_templates(type)`)
      console.log('[DatabaseManager] lw_temp_character_templates 表创建完成')
    }

    const tempLocTemplateExists = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='lw_temp_location_templates'"
    ).get()
    if (!tempLocTemplateExists) {
      console.log('[DatabaseManager] 创建 lw_temp_location_templates 表...')
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS lw_temp_location_templates (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          base_prompt TEXT NOT NULL,
          style_variants TEXT DEFAULT '[]',
          negative_prompt TEXT,
          match_keywords TEXT DEFAULT '[]',
          sort_order INTEGER DEFAULT 0,
          is_default INTEGER DEFAULT 0,
          created_at INTEGER,
          updated_at INTEGER
        )
      `)
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_lw_temp_loc_templates_type ON lw_temp_location_templates(type)`)
      console.log('[DatabaseManager] lw_temp_location_templates 表创建完成')
    }

    // 初始化默认临时实体模板数据（在表创建后调用）
    if (this.lwTempCharacterTemplates) {
      this.lwTempCharacterTemplates.initializeDefaultData()
    }
    if (this.lwTempLocationTemplates) {
      this.lwTempLocationTemplates.initializeDefaultData()
    }

    // 检查并添加 lw_story_outlines 表的 involved_items 列
    const outlineColumns = this.db.prepare("PRAGMA table_info(lw_story_outlines)").all() as any[]
    const outlineColumnNames = outlineColumns.map(col => col.name)

    if (!outlineColumnNames.includes('involved_items')) {
      console.log('[DatabaseManager] 添加 lw_story_outlines.involved_items 列...')
      this.db.exec('ALTER TABLE lw_story_outlines ADD COLUMN involved_items TEXT DEFAULT \'[]\'')
      console.log('[DatabaseManager] lw_story_outlines.involved_items 列添加完成')
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
    this.lwTypeConfig = new LwTypeConfigRepository(this.db)
    this.lwFactions = new LwFactionRepository(this.db)
    this.lwMaps = new LwMapRepository(this.db)
    this.lwPrewrites = new LwPrewriteRepository(this.db)
    this.lwMemories = new LwMemoryRepository(this.db)
    this.lwEntityStates = new LwEntityStateRepository(this.db)
    this.lwChapterStateSummaries = new LwChapterStateSummaryRepository(this.db)

    // 初始化符合第三范式的长文写作关联表仓库
    this.lwPlotCharacters = new LwPlotCharacterRepository(this.db)
    this.lwPlotLocations = new LwPlotLocationRepository(this.db)
    this.lwOutlineCharacters = new LwOutlineCharacterRepository(this.db)
    this.lwOutlineLocations = new LwOutlineLocationRepository(this.db)
    this.lwOutlineItems = new LwOutlineItemRepository(this.db)
    this.lwSkillCharacters = new LwSkillCharacterRepository(this.db)
    this.lwDesignMessages = new LwDesignMessageRepository(this.db)
    this.lwMemoryEntities = new LwMemoryEntityRepository(this.db)

    // 初始化临时实体模板仓库
    this.lwTempCharacterTemplates = new LwTempCharacterTemplateRepository(this.db)
    this.lwTempLocationTemplates = new LwTempLocationTemplateRepository(this.db)
    this.lwProjectModelConfigs = new LwProjectModelConfigRepository(this.db)

    this.diaryFolders = new DiaryFolderRepository(this.db)
    this.diaryEntries = new DiaryEntryRepository(this.db)
    this.diaryLinks = new DiaryLinkRepository(this.db)
    this.diaryAttachments = new DiaryAttachmentRepository(this.db)

    // 剧集制作相关
    this.videoProjects = new VideoProjectRepository(this.db)
    this.videoEpisodes = new VideoEpisodeRepository(this.db)
    this.episodeScripts = new EpisodeScriptRepository(this.db)
    this.sceneScripts = new SceneScriptRepository(this.db)
    this.storyboards = new StoryboardRepository(this.db)
    this.characterBindings = new CharacterBindingRepository(this.db)
    this.locationBindings = new LocationBindingRepository(this.db)
    this.itemBindings = new ItemBindingRepository(this.db)

    // 初始化新的子表仓库
    this.sceneCharacters = new SceneCharacterRepository(this.db)
    this.sceneDialogues = new SceneDialogueRepository(this.db)
    this.sceneActions = new SceneActionRepository(this.db)
    this.storyboardCharacters = new StoryboardCharacterRepository(this.db)
    this.imageAssets = new ImageAssetRepository(this.db)

    // 初始化 OSS 配置仓库
    this.ossConfigs = new OSSConfigRepository(this.db)
    this.ossConfigs.initTable()
    console.log('[DatabaseManager] OSS 配置仓库已初始化')
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