/**
 * Web 端 DatabaseManager
 * @module web/server/platform/web-database-manager
 * @description 与 electron/database/index.ts 等价的 DataSource → Repository 装配，
 *              但去掉所有 Electron / better-sqlite3 / DDL 直查相关代码。
 *              支持 SQLite + PostgreSQL 双方言（取决于传入的 DataSource）。
 */

import type { DataSource } from 'typeorm'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'

import { SettingsRepository } from '@core/database/repositories/settings.repository'
import { ApiKeyRepository } from '@core/database/repositories/api-key.repository'
import { UserRepository } from '@core/database/repositories/user.repository'
import { DialogRepository } from '@core/database/repositories/dialog.repository'
import { MessageRepository } from '@core/database/repositories/message.repository'
import { RoleRepository } from '@core/database/repositories/role.repository'
import { ImageRepository } from '@core/database/repositories/image.repository'
import { ProviderConfigRepository } from '@core/database/repositories/provider-config.repository'
import { TranslationRepository } from '@core/database/repositories/translation.repository'
import { VoiceRepository } from '@core/database/repositories/voice.repository'
import { ClonedVoiceRepository } from '@core/database/repositories/cloned-voice.repository'
import { DesignedVoiceRepository } from '@core/database/repositories/designed-voice.repository'
import { KnowledgeBaseRepository } from '@core/database/repositories/knowledge-base.repository'
import { KbDocumentRepository } from '@core/database/repositories/kb-document.repository'
import { KbChunkRepository } from '@core/database/repositories/kb-chunk.repository'
import { KbVectorRepository } from '@core/database/repositories/kb-vector.repository'
import { KbQaPairRepository } from '@core/database/repositories/kb-qa-pair.repository'
import { KbFolderRepository } from '@core/database/repositories/kb-folder.repository'
import { AppRepository } from '@core/database/repositories/app.repository'
import { AppSessionRepository } from '@core/database/repositories/app-session.repository'
import { AppSessionMessageRepository } from '@core/database/repositories/app-session-message.repository'
import { ToolCredentialRepository } from '@core/database/repositories/tool-credential.repository'
import { CustomToolRepository } from '@core/database/repositories/custom-tool.repository'
import { EmailAccountRepository } from '@core/database/repositories/email-account.repository'
import { VariableRepository, DataTableDefRepository, DataTableRowRepository } from '@core/database/repositories/variable.repositories'
import { KbInvertedIndexRepository } from '@core/database/repositories/kb-inverted-index.repository'
import { PortraitProjectRepository } from '@core/database/repositories/portrait-project.repository'
import { PortraitCharacterRepository } from '@core/database/repositories/portrait-character.repository'
import { PortraitVariantRepository } from '@core/database/repositories/portrait-variant.repository'
import { PortraitPromptTemplateRepository } from '@core/database/repositories/portrait-prompt-template.repository'
import { SearchEngineConfigRepository } from '@core/database/repositories/search-engine-config.repository'
import { LwProjectRepository } from '@core/database/repositories/lw-project.repository'
import { LwStoryOverviewRepository } from '@core/database/repositories/lw-story-overview.repository'
import { LwCharacterRepository } from '@core/database/repositories/lw-character.repository'
import { LwCharacterRelationRepository } from '@core/database/repositories/lw-character-relation.repository'
import { LwOutlineRepository } from '@core/database/repositories/lw-outline.repository'
import { LwChapterRepository } from '@core/database/repositories/lw-chapter.repository'
import { LwBackgroundRepository } from '@core/database/repositories/lw-background.repository'
import { LwLocationRepository } from '@core/database/repositories/lw-location.repository'
import { LwPlotRepository } from '@core/database/repositories/lw-plot.repository'
import { LwSkillRepository } from '@core/database/repositories/lw-skill.repository'
import { LwItemRepository } from '@core/database/repositories/lw-item.repository'
import { LwMaterialRepository } from '@core/database/repositories/lw-material.repository'
import { LwGlobalSettingsRepository } from '@core/database/repositories/lw-global-settings.repository'
import { LwDictionaryRepository } from '@core/database/repositories/lw-dictionary.repository'
import { LwTypeConfigRepository } from '@core/database/repositories/lw-type-config.repository'
import { LwFactionRepository } from '@core/database/repositories/lw-faction.repository'
import { LwMapRepository } from '@core/database/repositories/lw-map.repository'
import { LwPrewriteRepository } from '@core/database/repositories/lw-prewrite.repository'
import { LwMemoryRepository } from '@core/database/repositories/lw-memory.repository'
import { LwEntityStateRepository } from '@core/database/repositories/lw-entity-state.repository'
import { LwEventRepository } from '@core/database/repositories/lw-event.repository'
import { LwGraphEdgeRepository } from '@core/database/repositories/lw-graph-edge.repository'
import { LwChapterStateSummaryRepository } from '@core/database/repositories/lw-chapter-state-summary.repository'
import { LwVectorIndexRepository } from '@core/database/repositories/lw-vector-index.repository'
import { WorkflowDefinitionRepository } from '@core/database/repositories/workflow-definition.repository'
import { WorkflowRunRepository } from '@core/database/repositories/workflow-run.repository'
import { WorkflowNodeRunRepository } from '@core/database/repositories/workflow-node-run.repository'
import { AgentTaskRepository } from '@core/database/repositories/agent-task.repository'
import { AgentMemoryEntryRepository } from '@core/database/repositories/agent-memory-entry.repository'
import { PackBindingRepository, PackRepository } from '@core/database/repositories/business-pack.repositories'
import { LwPlotCharacterRepository } from '@core/database/repositories/lw-plot-character.repository'
import { LwPlotLocationRepository } from '@core/database/repositories/lw-plot-location.repository'
import { LwOutlineCharacterRepository } from '@core/database/repositories/lw-outline-character.repository'
import { LwOutlineLocationRepository } from '@core/database/repositories/lw-outline-location.repository'
import { LwOutlineItemRepository } from '@core/database/repositories/lw-outline-item.repository'
import { LwSkillCharacterRepository } from '@core/database/repositories/lw-skill-character.repository'
import { LwDesignMessageRepository } from '@core/database/repositories/lw-design-message.repository'
import { LwMemoryEntityRepository } from '@core/database/repositories/lw-memory-entity.repository'
import { LwTempCharacterTemplateRepository } from '@core/database/repositories/lw-temp-character-template.repository'
import { LwTempLocationTemplateRepository } from '@core/database/repositories/lw-temp-location-template.repository'
import { LwProjectModelConfigRepository } from '@core/database/repositories/lw-project-model-config.repository'
import { DiaryFolderRepository } from '@core/database/repositories/diary-folder.repository'
import { DiaryEntryRepository } from '@core/database/repositories/diary-entry.repository'
import { DiaryLinkRepository } from '@core/database/repositories/diary-link.repository'
import { DiaryAttachmentRepository } from '@core/database/repositories/diary-attachment.repository'
import { VideoProjectRepository } from '@core/database/repositories/video-project.repository'
import { VideoEpisodeRepository } from '@core/database/repositories/video-episode.repository'
import { EpisodeScriptRepository } from '@core/database/repositories/episode-script.repository'
import { SceneScriptRepository } from '@core/database/repositories/scene-script.repository'
import { StoryboardRepository } from '@core/database/repositories/storyboard.repository'
import { CharacterBindingRepository } from '@core/database/repositories/character-binding.repository'
import { LocationBindingRepository } from '@core/database/repositories/location-binding.repository'
import { ItemBindingRepository } from '@core/database/repositories/item-binding.repository'
import { SceneCharacterRepository } from '@core/database/repositories/scene-character.repository'
import { SceneDialogueRepository } from '@core/database/repositories/scene-dialogue.repository'
import { SceneActionRepository } from '@core/database/repositories/scene-action.repository'
import { StoryboardCharacterRepository } from '@core/database/repositories/storyboard-character.repository'
import { StoryboardKeyframeRepository } from '@core/database/repositories/storyboard-keyframe.repository'
import { ImageAssetRepository } from '@core/database/repositories/image-asset.repository'
import { OSSConfigRepository } from '@core/database/repositories/oss-config.repository'
import { DataSourceRepository } from '@core/database/repositories/datasource.repository'
import { AssetImageRepository } from '@core/database/repositories/asset-image.repository'
import { AssetRepository } from '@core/database/repositories/asset.repository'
import { AssetGroupRepository } from '@core/database/repositories/asset-group.repository'
import { AssetCategoryRepository } from '@core/database/repositories/asset-category.repository'
import { NewsSourceRepository } from '@core/database/repositories/news-source.repository'
import { NewsTopicRepository } from '@core/database/repositories/news-topic.repository'

export class WebDatabaseManager implements ICoreDatabaseManager {
  readonly dataSource: DataSource | null

  // 用户系统
  users: UserRepository | null
  // 通用
  settings: SettingsRepository | null
  apiKeys: ApiKeyRepository | null
  providerConfigs: ProviderConfigRepository | null
  searchEngineConfigs: SearchEngineConfigRepository | null
  ossConfigs: OSSConfigRepository | null
  dataSources: DataSourceRepository | null
  // 对话 / 角色
  dialogs: DialogRepository | null
  messages: MessageRepository | null
  roles: RoleRepository | null
  translations: TranslationRepository | null
  // 多媒体
  images: ImageRepository | null
  voices: VoiceRepository | null
  clonedVoices: ClonedVoiceRepository | null
  designedVoices: DesignedVoiceRepository | null
  // 知识库
  knowledgeBases: KnowledgeBaseRepository | null
  kbFolders: KbFolderRepository | null
  kbDocuments: KbDocumentRepository | null
  kbChunks: KbChunkRepository | null
  kbInvertedIndex: KbInvertedIndexRepository | null
  kbVectors: KbVectorRepository | null
  kbQaPairs: KbQaPairRepository | null
  appDefinitions: AppRepository | null
  appSessions: AppSessionRepository | null
  appSessionMessages: AppSessionMessageRepository | null
  assets: AssetRepository | null
  assetGroups: AssetGroupRepository | null
  assetCategories: AssetCategoryRepository | null
  newsSources: NewsSourceRepository | null
  newsTopics: NewsTopicRepository | null
  toolCredentials: ToolCredentialRepository | null
  customTools: CustomToolRepository | null
  emailAccounts: EmailAccountRepository | null
  variables: VariableRepository | null
  dataTableDefs: DataTableDefRepository | null
  dataTableRows: DataTableRowRepository | null
  // 人像
  portraitProjects: PortraitProjectRepository | null
  portraitCharacters: PortraitCharacterRepository | null
  portraitVariants: PortraitVariantRepository | null
  portraitPromptTemplates: PortraitPromptTemplateRepository | null
  // 长文写作
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
  lwVectorIndices: LwVectorIndexRepository | null
  lwEvents: LwEventRepository | null
  lwGraphEdges: LwGraphEdgeRepository | null
  // 工作流引擎（三表）
  workflowDefinitions: WorkflowDefinitionRepository | null
  workflowRuns: WorkflowRunRepository | null
  workflowNodeRuns: WorkflowNodeRunRepository | null
  agentTasks: import('@core/database/repositories/agent-task.repository').AgentTaskRepository | null
  agentMemoryEntries: import('@core/database/repositories/agent-memory-entry.repository').AgentMemoryEntryRepository | null
  // 业务包内核（第一期）
  packs: PackRepository | null
  packBindings: PackBindingRepository | null
  // 长文关联表
  lwPlotCharacters: LwPlotCharacterRepository | null
  lwPlotLocations: LwPlotLocationRepository | null
  lwOutlineCharacters: LwOutlineCharacterRepository | null
  lwOutlineLocations: LwOutlineLocationRepository | null
  lwOutlineItems: LwOutlineItemRepository | null
  lwSkillCharacters: LwSkillCharacterRepository | null
  lwDesignMessages: LwDesignMessageRepository | null
  lwMemoryEntities: LwMemoryEntityRepository | null
  // 临时模板
  lwTempCharacterTemplates: LwTempCharacterTemplateRepository | null
  lwTempLocationTemplates: LwTempLocationTemplateRepository | null
  // 日记
  diaryFolders: DiaryFolderRepository | null
  diaryEntries: DiaryEntryRepository | null
  diaryLinks: DiaryLinkRepository | null
  diaryAttachments: DiaryAttachmentRepository | null
  // 视频 / 剧集
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
  storyboardKeyframes: StoryboardKeyframeRepository | null
  imageAssets: ImageAssetRepository | null
  assetImage: AssetImageRepository | null

  constructor(ds: DataSource) {
    this.dataSource = ds

    this.users = new UserRepository(ds)
    this.settings = new SettingsRepository(ds)
    this.apiKeys = new ApiKeyRepository(ds)
    this.providerConfigs = new ProviderConfigRepository(ds)
    this.searchEngineConfigs = new SearchEngineConfigRepository(ds)
    this.ossConfigs = new OSSConfigRepository(ds)
    this.dataSources = new DataSourceRepository(ds)

    this.dialogs = new DialogRepository(ds)
    this.messages = new MessageRepository(ds)
    this.roles = new RoleRepository(ds)
    this.translations = new TranslationRepository(ds)

    this.images = new ImageRepository(ds)
    this.voices = new VoiceRepository(ds)
    this.clonedVoices = new ClonedVoiceRepository(ds)
    this.designedVoices = new DesignedVoiceRepository(ds)

    this.knowledgeBases = new KnowledgeBaseRepository(ds)
    this.kbFolders = new KbFolderRepository(ds)
    this.kbDocuments = new KbDocumentRepository(ds)
    this.kbChunks = new KbChunkRepository(ds)
    this.kbInvertedIndex = new KbInvertedIndexRepository(ds)
    this.kbVectors = new KbVectorRepository()
    this.kbQaPairs = new KbQaPairRepository(ds)
    this.appDefinitions = new AppRepository(ds)
    this.appSessions = new AppSessionRepository(ds)
    this.appSessionMessages = new AppSessionMessageRepository(ds)
    this.assets = new AssetRepository(ds)
    this.assetGroups = new AssetGroupRepository(ds)
    this.assetCategories = new AssetCategoryRepository(ds)
    this.newsSources = new NewsSourceRepository(ds)
    this.newsTopics = new NewsTopicRepository(ds)
    this.toolCredentials = new ToolCredentialRepository(ds)
    this.customTools = new CustomToolRepository(ds)
    this.emailAccounts = new EmailAccountRepository(ds)
    this.variables = new VariableRepository(ds)
    this.dataTableDefs = new DataTableDefRepository(ds)
    this.dataTableRows = new DataTableRowRepository(ds)

    this.portraitProjects = new PortraitProjectRepository(ds)
    this.portraitCharacters = new PortraitCharacterRepository(ds)
    this.portraitVariants = new PortraitVariantRepository(ds)
    this.portraitPromptTemplates = new PortraitPromptTemplateRepository(ds)

    this.lwProjects = new LwProjectRepository(ds)
    this.lwStoryOverviews = new LwStoryOverviewRepository(ds)
    this.lwCharacters = new LwCharacterRepository(ds)
    this.lwCharacterRelations = new LwCharacterRelationRepository(ds)
    this.lwOutlines = new LwOutlineRepository(ds)
    this.lwChapters = new LwChapterRepository(ds)
    this.lwBackgrounds = new LwBackgroundRepository(ds)
    this.lwLocations = new LwLocationRepository(ds)
    this.lwPlots = new LwPlotRepository(ds)
    this.lwSkills = new LwSkillRepository(ds)
    this.lwItems = new LwItemRepository(ds)
    this.lwMaterials = new LwMaterialRepository(ds)
    this.lwGlobalSettings = new LwGlobalSettingsRepository(ds)
    this.lwDictionary = new LwDictionaryRepository(ds)
    this.lwTypeConfig = new LwTypeConfigRepository(ds)
    this.lwFactions = new LwFactionRepository(ds)
    this.lwMaps = new LwMapRepository(ds)
    this.lwPrewrites = new LwPrewriteRepository(ds)
    this.lwMemories = new LwMemoryRepository(ds)
    this.lwEntityStates = new LwEntityStateRepository(ds)
    this.lwChapterStateSummaries = new LwChapterStateSummaryRepository(ds)
    this.lwProjectModelConfigs = new LwProjectModelConfigRepository(ds)
    this.lwVectorIndices = new LwVectorIndexRepository(ds)
    this.lwEvents = new LwEventRepository(ds)
    this.lwGraphEdges = new LwGraphEdgeRepository(ds)
    this.workflowDefinitions = new WorkflowDefinitionRepository(ds)
    this.workflowRuns = new WorkflowRunRepository(ds)
    this.workflowNodeRuns = new WorkflowNodeRunRepository(ds)
    this.agentTasks = new AgentTaskRepository(ds)
    this.agentMemoryEntries = new AgentMemoryEntryRepository(ds)
    // 业务包内核（第一期）：包快照 + 启用/配置覆写
    this.packs = new PackRepository(ds)
    this.packBindings = new PackBindingRepository(ds)

    this.lwPlotCharacters = new LwPlotCharacterRepository(ds)
    this.lwPlotLocations = new LwPlotLocationRepository(ds)
    this.lwOutlineCharacters = new LwOutlineCharacterRepository(ds)
    this.lwOutlineLocations = new LwOutlineLocationRepository(ds)
    this.lwOutlineItems = new LwOutlineItemRepository(ds)
    this.lwSkillCharacters = new LwSkillCharacterRepository(ds)
    this.lwDesignMessages = new LwDesignMessageRepository(ds)
    this.lwMemoryEntities = new LwMemoryEntityRepository(ds)

    this.lwTempCharacterTemplates = new LwTempCharacterTemplateRepository(ds)
    this.lwTempLocationTemplates = new LwTempLocationTemplateRepository(ds)

    this.diaryFolders = new DiaryFolderRepository(ds)
    this.diaryEntries = new DiaryEntryRepository(ds)
    this.diaryLinks = new DiaryLinkRepository(ds)
    this.diaryAttachments = new DiaryAttachmentRepository(ds)

    this.videoProjects = new VideoProjectRepository(ds)
    this.videoEpisodes = new VideoEpisodeRepository(ds)
    this.episodeScripts = new EpisodeScriptRepository(ds)
    this.sceneScripts = new SceneScriptRepository(ds)
    this.storyboards = new StoryboardRepository(ds)
    this.characterBindings = new CharacterBindingRepository(ds)
    this.locationBindings = new LocationBindingRepository(ds)
    this.itemBindings = new ItemBindingRepository(ds)
    this.sceneCharacters = new SceneCharacterRepository(ds)
    this.sceneDialogues = new SceneDialogueRepository(ds)
    this.sceneActions = new SceneActionRepository(ds)
    this.storyboardCharacters = new StoryboardCharacterRepository(ds)
    this.storyboardKeyframes = new StoryboardKeyframeRepository(ds)
    this.imageAssets = new ImageAssetRepository(ds)
    this.assetImage = new AssetImageRepository(ds)
  }
}
