/**
 * 核心数据库管理器接口
 * @module core/database/database-manager.interface
 * @description 平台无关的数据库管理器抽象，core 层服务依赖此接口而非 electron 实现。
 *              Electron / Web / Node 等运行环境各自提供具体实现，组装 DataSource 与所有
 *              Repository 实例后由该接口暴露给上层服务。
 */

import type { DataSource } from 'typeorm'

import type { LwBibleKindRepository } from './repositories/lw-bible-kind.repository'
import type { LwCustomEntityRepository } from './repositories/lw-custom-entity.repository'
import type { LwForeshadowRepository } from './repositories/lw-foreshadow.repository'
import type { ApiKeyRepository } from './repositories/api-key.repository'
import type { AssetGroupRepository } from './repositories/asset-group.repository'
import type { AssetImageRepository } from './repositories/asset-image.repository'
import type { UserRepository } from './repositories/user.repository'
import type { CharacterBindingRepository } from './repositories/character-binding.repository'
import type { ClonedVoiceRepository } from './repositories/cloned-voice.repository'
import type { DesignedVoiceRepository } from './repositories/designed-voice.repository'
import type { DialogRepository } from './repositories/dialog.repository'
import type { DiaryAttachmentRepository } from './repositories/diary-attachment.repository'
import type { DiaryEntryRepository } from './repositories/diary-entry.repository'
import type { DiaryFolderRepository } from './repositories/diary-folder.repository'
import type { DiaryLinkRepository } from './repositories/diary-link.repository'
import type { EpisodeScriptRepository } from './repositories/episode-script.repository'
import type { ImageAssetRepository } from './repositories/image-asset.repository'
import type { ImageRepository } from './repositories/image.repository'
import type { ItemBindingRepository } from './repositories/item-binding.repository'
import type { KbChunkRepository } from './repositories/kb-chunk.repository'
import type { KbChapterRepository } from './repositories/kb-chapter.repository'
import type { KbDocumentRepository } from './repositories/kb-document.repository'
import type { KbInvertedIndexRepository } from './repositories/kb-inverted-index.repository'
import type { KbVectorRepository } from './repositories/kb-vector.repository'
import type { KbQaPairRepository } from './repositories/kb-qa-pair.repository'
import type { KbFolderRepository } from './repositories/kb-folder.repository'
import type { AppRepository } from './repositories/app.repository'
import type { AppSessionRepository } from './repositories/app-session.repository'
import type { AppSessionMessageRepository } from './repositories/app-session-message.repository'
import type { AssetRepository } from './repositories/asset.repository'
import type { AssetCategoryRepository } from './repositories/asset-category.repository'
import type { InfoSourceRepository } from './repositories/info-source.repository'
import type { InfoSourceTopicRepository } from './repositories/info-source-topic.repository'
import type { InfoSourceCategoryRepository } from './repositories/info-source-category.repository'
import type { ToolCredentialRepository } from './repositories/tool-credential.repository'
import type { CustomToolRepository } from './repositories/custom-tool.repository'
import type { EmailAccountRepository } from './repositories/email-account.repository'
import type { VariableRepository, DataTableDefRepository, DataTableRowRepository } from './repositories/variable.repositories'
import type { UserNotificationReadRepository } from './repositories/user-notification-read.repository'
import type { KnowledgeBaseRepository } from './repositories/knowledge-base.repository'
import type { LocationBindingRepository } from './repositories/location-binding.repository'
import type { LwBackgroundRepository } from './repositories/lw-background.repository'
import type { LwChapterRepository } from './repositories/lw-chapter.repository'
import type { LwChapterStateSummaryRepository } from './repositories/lw-chapter-state-summary.repository'
import type { LwCharacterRepository } from './repositories/lw-character.repository'
import type { LwCharacterRelationRepository } from './repositories/lw-character-relation.repository'
import type { LwDesignMessageRepository } from './repositories/lw-design-message.repository'
import type { LwDictionaryRepository } from './repositories/lw-dictionary.repository'
import type { LwEntityStateRepository } from './repositories/lw-entity-state.repository'
import type { LwEventRepository } from './repositories/lw-event.repository'
import type { LwGraphEdgeRepository } from './repositories/lw-graph-edge.repository'
import type { LwFactionRepository } from './repositories/lw-faction.repository'
import type { LwGlobalSettingsRepository } from './repositories/lw-global-settings.repository'
import type { LwItemRepository } from './repositories/lw-item.repository'
import type { LwLocationRepository } from './repositories/lw-location.repository'
import type { LwMapRepository } from './repositories/lw-map.repository'
import type { LwMaterialRepository } from './repositories/lw-material.repository'
import type { LwMemoryEntityRepository } from './repositories/lw-memory-entity.repository'
import type { LwMemoryRepository } from './repositories/lw-memory.repository'
import type { LwOutlineCharacterRepository } from './repositories/lw-outline-character.repository'
import type { LwOutlineItemRepository } from './repositories/lw-outline-item.repository'
import type { LwOutlineLocationRepository } from './repositories/lw-outline-location.repository'
import type { LwOutlineRepository } from './repositories/lw-outline.repository'
import type { LwPlotCharacterRepository } from './repositories/lw-plot-character.repository'
import type { LwPlotLocationRepository } from './repositories/lw-plot-location.repository'
import type { LwPlotRepository } from './repositories/lw-plot.repository'
import type { LwPrewriteRepository } from './repositories/lw-prewrite.repository'
import type { LwProjectModelConfigRepository } from './repositories/lw-project-model-config.repository'
import type { LwProjectRepository } from './repositories/lw-project.repository'
import type { LwSkillCharacterRepository } from './repositories/lw-skill-character.repository'
import type { LwSkillRepository } from './repositories/lw-skill.repository'
import type { LwStoryOverviewRepository } from './repositories/lw-story-overview.repository'
import type { LwTempCharacterTemplateRepository } from './repositories/lw-temp-character-template.repository'
import type { LwTempLocationTemplateRepository } from './repositories/lw-temp-location-template.repository'
import type { LwTypeConfigRepository } from './repositories/lw-type-config.repository'
import type { LwVectorIndexRepository } from './repositories/lw-vector-index.repository'
import type { WorkflowDefinitionRepository } from './repositories/workflow-definition.repository'
import type { PackBindingRepository, PackRepository } from './repositories/business-pack.repositories'
import type { WorkflowRunRepository } from './repositories/workflow-run.repository'
import type { WorkflowNodeRunRepository } from './repositories/workflow-node-run.repository'
import type { MessageRepository } from './repositories/message.repository'
import type { OSSConfigRepository } from './repositories/oss-config.repository'
import type { DataSourceRepository } from './repositories/datasource.repository'
import type { PortraitCharacterRepository } from './repositories/portrait-character.repository'
import type { PortraitProjectRepository } from './repositories/portrait-project.repository'
import type { PortraitVariantRepository } from './repositories/portrait-variant.repository'
import type { PortraitPromptTemplateRepository } from './repositories/portrait-prompt-template.repository'
import type { ProviderConfigRepository } from './repositories/provider-config.repository'
import type { RoleRepository } from './repositories/role.repository'
import type { SceneActionRepository } from './repositories/scene-action.repository'
import type { SceneCharacterRepository } from './repositories/scene-character.repository'
import type { SceneDialogueRepository } from './repositories/scene-dialogue.repository'
import type { SceneScriptRepository } from './repositories/scene-script.repository'
import type { SearchEngineConfigRepository } from './repositories/search-engine-config.repository'
import type { SettingsRepository } from './repositories/settings.repository'
import type { StoryboardCharacterRepository } from './repositories/storyboard-character.repository'
import type { StoryboardKeyframeRepository } from './repositories/storyboard-keyframe.repository'
import type { StoryboardRepository } from './repositories/storyboard.repository'
import type { TranslationRepository } from './repositories/translation.repository'
import type { VideoEpisodeRepository } from './repositories/video-episode.repository'
import type { VideoProjectRepository } from './repositories/video-project.repository'
import type { VoiceRepository } from './repositories/voice.repository'

/**
 * 核心数据库管理器接口
 *
 * 设计原则：
 * 1. 仅暴露 Repository 与 DataSource，不含任何 Electron / 文件系统 / 进程控制 API。
 * 2. 字段默认 nullable：实现可在 init 之前留空；调用方需要做好 null 检查。
 * 3. core 层服务参数约束到此接口，避免编译期反向依赖 electron。
 */
export interface ICoreDatabaseManager {
  readonly dataSource: DataSource | null

  // ---- 用户系统（多租户基础）----
  users: UserRepository | null

  // ---- 通用模块 ----
  settings: SettingsRepository | null
  apiKeys: ApiKeyRepository | null
  providerConfigs: ProviderConfigRepository | null
  searchEngineConfigs: SearchEngineConfigRepository | null
  ossConfigs: OSSConfigRepository | null
  /** 第三方数据库数据源（工作流「数据库」节点连接配置） */
  dataSources: DataSourceRepository | null

  // ---- 对话 / 角色 ----
  dialogs: DialogRepository | null
  messages: MessageRepository | null
  roles: RoleRepository | null
  translations: TranslationRepository | null

  // ---- 多媒体 ----
  images: ImageRepository | null
  voices: VoiceRepository | null
  clonedVoices: ClonedVoiceRepository | null
  designedVoices: DesignedVoiceRepository | null

  // ---- 知识库 ----
  knowledgeBases: KnowledgeBaseRepository | null
  kbDocuments: KbDocumentRepository | null
  kbChunks: KbChunkRepository | null
  /** 知识库章节树（章节实体 + 摘要状态；与切片同源结构检测） */
  kbChapters: KbChapterRepository | null
  kbInvertedIndex: KbInvertedIndexRepository | null
  kbVectors: KbVectorRepository | null
  kbQaPairs: KbQaPairRepository | null
  /** 知识库目录（分组/分类，如 it 行业、能源行业） */
  kbFolders: KbFolderRepository | null
  appDefinitions: AppRepository | null
  appSessions: AppSessionRepository | null
  /** 应用会话消息（独立表，隔离 AI 对话表） */
  appSessionMessages: AppSessionMessageRepository | null
  /** 通用资产库（工作流「保存资产」节点 / 资产中心） */
  assets: AssetRepository | null
  /** 资产组（套图/组图：一次流程多图归为一组） */
  assetGroups: AssetGroupRepository | null
  /** 资产分类定义（业务分类实体：驱动资产中心分组与预览） */
  assetCategories: AssetCategoryRepository | null
  /** 信息来源类别（设置界面「信息来源」的 tab：内置新闻来源 + 用户自建类别） */
  infoSourceCategories: InfoSourceCategoryRepository | null
  /** 信息来源（名称 + URL；工作流采集节点与各业务模块引用） */
  infoSources: InfoSourceRepository | null
  /** 信息来源分组（类别内的一级分组，含「未分组」默认分组） */
  infoSourceTopics: InfoSourceTopicRepository | null
  toolCredentials: ToolCredentialRepository | null
  customTools: CustomToolRepository | null
  /** 邮箱账号（邮件收发：SMTP 发 / IMAP 收） */
  emailAccounts: EmailAccountRepository | null
  variables: VariableRepository | null
  dataTableDefs: DataTableDefRepository | null
  dataTableRows: DataTableRowRepository | null

  // ---- 人像 ----
  portraitProjects: PortraitProjectRepository | null
  portraitCharacters: PortraitCharacterRepository | null
  portraitVariants: PortraitVariantRepository | null
  portraitPromptTemplates: PortraitPromptTemplateRepository | null

  // ---- 长文写作主表 ----
  lwProjects: LwProjectRepository | null
  lwStoryOverviews: LwStoryOverviewRepository | null
  lwCharacters: LwCharacterRepository | null
  lwCharacterRelations: LwCharacterRelationRepository | null
  lwOutlines: LwOutlineRepository | null
  lwChapters: LwChapterRepository | null
  lwBackgrounds: LwBackgroundRepository | null
  lwLocations: LwLocationRepository | null
  lwPlots: LwPlotRepository | null
  lwSkills: LwSkillRepository | null
  lwItems: LwItemRepository | null
  lwMaterials: LwMaterialRepository | null
  lwGlobalSettings: LwGlobalSettingsRepository | null
  lwDictionary: LwDictionaryRepository | null
  lwTypeConfig: LwTypeConfigRepository | null
  lwFactions: LwFactionRepository | null
  lwMaps: LwMapRepository | null
  lwPrewrites: LwPrewriteRepository | null
  lwMemories: LwMemoryRepository | null
  lwEntityStates: LwEntityStateRepository | null
  lwChapterStateSummaries: LwChapterStateSummaryRepository | null
  lwProjectModelConfigs: LwProjectModelConfigRepository | null
  /** 长文向量索引记录（步骤0 新增：chunkId↔实体映射 + contentHash） */
  lwVectorIndices: LwVectorIndexRepository | null
  /** 长文图谱：故事事件节点（章节确认时创建） */
  lwEvents: LwEventRepository | null
  lwBibleKinds: LwBibleKindRepository | null
  lwCustomEntities: LwCustomEntityRepository | null
  lwForeshadows: LwForeshadowRepository | null
  /** 长文图谱：关系边（带 valid_from/valid_until_chapter 时间线） */
  lwGraphEdges: LwGraphEdgeRepository | null

  // ---- 工作流引擎（三表） ----
  /** 工作流定义（草稿/发布双图 + 触发器 + cron 调度状态） */
  workflowDefinitions: WorkflowDefinitionRepository | null
  /** 工作流运行实例（图快照 + 状态机 + 防失控死线） */
  workflowRuns: WorkflowRunRepository | null
  /** 节点级 checkpoint（断点续跑事实源） */
  workflowNodeRuns: WorkflowNodeRunRepository | null
  /** M3 任务树（26 号批1） */
  agentTasks: import('./repositories/agent-task.repository').AgentTaskRepository | null
  /** M3 知识飞轮（26 号批1） */
  agentMemoryEntries: import('./repositories/agent-memory-entry.repository').AgentMemoryEntryRepository | null

  // ---- 领域共学空间（tasks/2026-09-07-domain-learning-space/design-v3.md §9） ----
  dlProjects: import('./repositories/dl-project.repository').DlProjectRepository | null
  dlConcepts: import('./repositories/dl-concept.repository').DlConceptRepository | null
  dlRelations: import('./repositories/dl-relation.repository').DlRelationRepository | null
  dlMasteryLogs: import('./repositories/dl-mastery-log.repository').DlMasteryLogRepository | null
  dlCards: import('./repositories/dl-card.repository').DlCardRepository | null
  dlDocs: import('./repositories/dl-doc.repository').DlDocRepository | null
  dlQuestions: import('./repositories/dl-question.repository').DlQuestionRepository | null
  dlNotes: import('./repositories/dl-note.repository').DlNoteRepository | null
  dlPlans: import('./repositories/dl-plan.repository').DlPlanRepository | null

  // ---- 业务包内核（第一期） ----
  /** 内置包快照（business_packs：manifest UPSERT + 全局启用态兜底） */
  packs: PackRepository | null
  /** 包启用/配置覆写（business_pack_bindings：user_id NULL = 全局默认行） */
  packBindings: PackBindingRepository | null

  // ---- 通知中心（用户已读状态独立落表，通知历史 = platform_events） ----
  /** 用户通知已读状态（user_notification_reads：复合主键 user_id+seq） */
  notificationReads: UserNotificationReadRepository | null

  // ---- 长文写作关联表（第三范式） ----
  lwPlotCharacters: LwPlotCharacterRepository | null
  lwPlotLocations: LwPlotLocationRepository | null
  lwOutlineCharacters: LwOutlineCharacterRepository | null
  lwOutlineLocations: LwOutlineLocationRepository | null
  lwOutlineItems: LwOutlineItemRepository | null
  lwSkillCharacters: LwSkillCharacterRepository | null
  lwDesignMessages: LwDesignMessageRepository | null
  lwMemoryEntities: LwMemoryEntityRepository | null

  // ---- 临时实体模板 ----
  lwTempCharacterTemplates: LwTempCharacterTemplateRepository | null
  lwTempLocationTemplates: LwTempLocationTemplateRepository | null

  // ---- 日记 ----
  diaryFolders: DiaryFolderRepository | null
  diaryEntries: DiaryEntryRepository | null
  diaryLinks: DiaryLinkRepository | null
  diaryAttachments: DiaryAttachmentRepository | null

  // ---- 视频/剧集 ----
  videoProjects: VideoProjectRepository | null
  videoEpisodes: VideoEpisodeRepository | null
  episodeScripts: EpisodeScriptRepository | null
  sceneScripts: SceneScriptRepository | null
  storyboards: StoryboardRepository | null
  characterBindings: CharacterBindingRepository | null
  locationBindings: LocationBindingRepository | null
  itemBindings: ItemBindingRepository | null
  sceneCharacters: SceneCharacterRepository | null
  sceneDialogues: SceneDialogueRepository | null
  sceneActions: SceneActionRepository | null
  storyboardCharacters: StoryboardCharacterRepository | null
  /** P5-T3：分镜关键帧（spec §4.2）— 一个 storyboard 含 N 张 keyframe */
  storyboardKeyframes: StoryboardKeyframeRepository | null
  imageAssets: ImageAssetRepository | null
  assetImage: AssetImageRepository | null
}

/**
 * core 层服务用于获取数据库管理器单例的访问器签名
 * 各运行环境（electron / web）需在初始化时注册具体实现
 */
export type CoreDatabaseManagerAccessor = () => ICoreDatabaseManager

let _accessor: CoreDatabaseManagerAccessor | null = null

/**
 * 由运行环境调用，注册全局 DatabaseManager 访问器
 */
export function registerCoreDatabaseManager(accessor: CoreDatabaseManagerAccessor): void {
  _accessor = accessor
}

/**
 * core 层服务调用此方法获取已初始化的 DatabaseManager
 * @throws 如果尚未注册访问器
 */
export function getCoreDatabaseManager(): ICoreDatabaseManager {
  if (!_accessor) {
    throw new Error(
      '[ICoreDatabaseManager] 未注册访问器：请在运行环境初始化时调用 registerCoreDatabaseManager()',
    )
  }
  return _accessor()
}
