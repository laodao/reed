/**
 * 预加载脚本
 * @module preload/index
 * @description 通过 contextBridge 安全暴露 API 给渲染进程
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { DocumentSource } from '@shared/types/knowledge-base.types'
import type { NoticeListQuery } from '@shared/types'
import type { EpAiGenerateTextRequest, EpBatchCreateEpisodesRequest, EpBatchIdentifyEntitiesRequest } from '@shared/types/episode-production'
import { dlAgentEventChannel, dlStreamChannel } from '@shared/utils/domain-learning-event'

// IPC 通道名称常量
const IPC_CHANNELS = {
  // 设置相关
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // API密钥相关
  API_KEY_LIST: 'api-key:list',
  API_KEY_SET: 'api-key:set',
  API_KEY_DELETE: 'api-key:delete',
  API_KEY_TEST: 'api-key:test',

  // 提供商模板相关
  PROVIDER_TEMPLATE_LIST: 'provider-template:list',

  // 提供商配置相关
  PROVIDER_CONFIG_LIST: 'provider-config:list',
  PROVIDER_CONFIG_GET: 'provider-config:get',
  PROVIDER_CONFIG_CREATE: 'provider-config:create',
  PROVIDER_CONFIG_UPDATE: 'provider-config:update',
  PROVIDER_CONFIG_DELETE: 'provider-config:delete',
  PROVIDER_CONFIG_TEST: 'provider-config:test',
  PROVIDER_CONFIG_SET_DEFAULT: 'provider-config:set-default',
  PROVIDER_CONFIG_CHANGED: 'provider-config:changed',

  // 对话相关
  DIALOG_LIST: 'dialog:list',
  DIALOG_LIST_BY_ROLE: 'dialog:list-by-role',
  DIALOG_GET: 'dialog:get',
  DIALOG_CREATE: 'dialog:create',
  DIALOG_UPDATE: 'dialog:update',
  DIALOG_DELETE: 'dialog:delete',
  DIALOG_TOUCH: 'dialog:touch',

  // 消息相关
  MESSAGE_LIST: 'message:list',
  MESSAGE_CREATE: 'message:create',
  MESSAGE_GET: 'message:get',
  MESSAGE_UPDATE: 'message:update',
  MESSAGE_DELETE: 'message:delete',

  // 角色相关
  ROLE_LIST: 'role:list',
  ROLE_GET: 'role:get',
  ROLE_CREATE: 'role:create',
  ROLE_UPDATE: 'role:update',
  ROLE_DELETE: 'role:delete',
  ROLE_DIALOG_COUNT: 'role:dialog-count',

  // 聊天相关（流式）
  CHAT_SEND: 'chat:send',
  CHAT_STREAM: 'chat:stream',
  CHAT_STOP: 'chat:stop',

  // 图像生成相关
  IMAGE_GENERATE: 'image:generate',
  IMAGE_TASK_STATUS: 'image:task-status',
  IMAGE_STOP: 'image:stop',
  IMAGE_LIST: 'image:list',
  IMAGE_GET: 'image:get',
  IMAGE_TOGGLE_FAVORITE: 'image:toggle-favorite',
  IMAGE_DELETE: 'image:delete',
  IMAGE_DELETE_MANY: 'image:delete-many',
  IMAGE_PROVIDERS: 'image:providers',
  IMAGE_MODELS: 'image:models',
  IMAGE_TEST_PROVIDER: 'image:test-provider',
  IMAGE_DOWNLOAD: 'image:download',
  IMAGE_SELECT_FILE: 'image:select-file',

  // 搜索引擎相关
  SEARCH_ENGINE_TEMPLATES: 'search-engine:templates',
  SEARCH_ENGINE_LIST: 'search-engine:list',
  SEARCH_ENGINE_GET: 'search-engine:get',
  SEARCH_ENGINE_CREATE: 'search-engine:create',
  SEARCH_ENGINE_UPDATE: 'search-engine:update',
  SEARCH_ENGINE_DELETE: 'search-engine:delete',
  SEARCH_ENGINE_TEST: 'search-engine:test',
  SEARCH_ENGINE_SET_DEFAULT: 'search-engine:set-default',
  SEARCH_ENGINE_SEARCH: 'search-engine:search',
  SEARCH_ENGINE_GET_DISABLED_QUICK: 'search-engine:get-disabled-quick',
  SEARCH_ENGINE_SET_QUICK_ENABLED: 'search-engine:set-quick-enabled',
  SEARCH_ENGINE_CHANGED: 'search-engine:changed',

  // 日记相关
  DIARY_LIST_FOLDERS: 'diary:list-folders',
  DIARY_GET_ALL_FOLDERS: 'diary:get-all-folders',
  DIARY_CREATE_FOLDER: 'diary:create-folder',
  DIARY_UPDATE_FOLDER: 'diary:update-folder',
  DIARY_DELETE_FOLDER: 'diary:delete-folder',
  DIARY_LIST_ENTRIES: 'diary:list-entries',
  DIARY_GET_ENTRY: 'diary:get-entry',
  DIARY_CREATE_ENTRY: 'diary:create-entry',
  DIARY_UPDATE_ENTRY: 'diary:update-entry',
  DIARY_DELETE_ENTRY: 'diary:delete-entry',
  DIARY_MOVE_ENTRY: 'diary:move-entry',
  DIARY_SEARCH: 'diary:search',
  DIARY_GET_BACKLINKS: 'diary:get-backlinks',
  DIARY_EXPORT_HTML: 'diary:export-html',
  DIARY_EXPORT_PDF: 'diary:export-pdf',
  DIARY_EXPORT_DOCX: 'diary:export-docx',

  // 剧集制作相关
  EP_LIST_PROJECTS: 'ep:list-projects',
  EP_LIST_PROJECTS_SUMMARY: 'ep:list-projects-summary',
  EP_GET_PROJECT: 'ep:get-project',
  EP_CREATE_PROJECT: 'ep:create-project',
  EP_UPDATE_PROJECT: 'ep:update-project',
  EP_DELETE_PROJECT: 'ep:delete-project',

  EP_GET_CHARACTER_BINDINGS: 'ep:get-character-bindings',
  EP_BIND_CHARACTER: 'ep:bind-character',
  EP_UPDATE_CHARACTER_BINDING: 'ep:update-character-binding',
  EP_DELETE_CHARACTER_BINDING: 'ep:delete-character-binding',

  // 地点绑定
  EP_GET_LOCATION_BINDINGS: 'ep:get-location-bindings',
  EP_BIND_LOCATION: 'ep:bind-location',
  EP_UPDATE_LOCATION_BINDING: 'ep:update-location-binding',
  EP_DELETE_LOCATION_BINDING: 'ep:delete-location-binding',

  // 物品绑定
  EP_GET_ITEM_BINDINGS: 'ep:get-item-bindings',
  EP_BIND_ITEM: 'ep:bind-item',
  EP_UPDATE_ITEM_BINDING: 'ep:update-item-binding',
  EP_DELETE_ITEM_BINDING: 'ep:delete-item-binding',

  EP_LIST_EPISODES: 'ep:list-episodes',
  EP_GET_EPISODE: 'ep:get-episode',
  EP_CREATE_EPISODE: 'ep:create-episode',
  EP_UPDATE_EPISODE: 'ep:update-episode',
  EP_DELETE_EPISODE: 'ep:delete-episode',

  EP_GET_SCRIPT: 'ep:get-script',
  EP_UPDATE_SCRIPT: 'ep:update-script',

  EP_LIST_SCENES: 'ep:list-scenes',
  EP_GET_SCENE: 'ep:get-scene',
  EP_CREATE_SCENE: 'ep:create-scene',
  EP_UPDATE_SCENE: 'ep:update-scene',
  EP_DELETE_SCENE: 'ep:delete-scene',

  EP_LIST_STORYBOARDS: 'ep:list-storyboards',
  EP_STORYBOARD_SET_BACKGROUND_REF: 'ep:storyboard:set-background-ref',
  EP_STORYBOARD_GET_BACKGROUND_REF: 'ep:storyboard:get-background-ref',
  EP_GET_STORYBOARD: 'ep:get-storyboard',
  EP_UPDATE_STORYBOARD: 'ep:update-storyboard',
  EP_REORDER_STORYBOARDS: 'ep:reorder-storyboards',
  EP_DELETE_STORYBOARD: 'ep:delete-storyboard',

  EP_GENERATE_SCRIPT: 'ep:generate-script',
  EP_GENERATE_SCENES: 'ep:generate-scenes',
  EP_GENERATE_STORYBOARD: 'ep:generate-storyboard',
  EP_GENERATE_STORYBOARDS: 'ep:generate-storyboards',
  // 2026-09-16 分镜与资产识别联合生成（D1/D2/D8）
  EP_COGEN_STORYBOARDS: 'ep:cogen-storyboards',
  // spec 2026-05-27：单分镜 AI 填充
  EP_FILL_STORYBOARD: 'ep:fill-storyboard',
  // spec 2026-05-08：场景级 AI 润色
  EP_POLISH_SCENE: 'ep:polish-scene',

  // 追加剧本（已有剧本继续增加内容 · 增量不覆盖已有场次）
  EP_PREPARE_SCRIPT_APPEND: 'ep:prepare-script-append',
  EP_APPEND_SCRIPT: 'ep:append-script',

  // P4-T6 引用解析 + 完整性校验
  EP_RESOLVE_REFERENCE: 'ep:resolve-reference',
  EP_RESOLVE_REFERENCES_BATCH: 'ep:resolve-references-batch',
  EP_VALIDATE_SCENE: 'ep:validate-scene',
  EP_VALIDATE_EPISODE_SCRIPT: 'ep:validate-episode-script',

  // P5-T8 多关键帧
  EP_GENERATE_KEYFRAMES: 'ep:generate-keyframes',
  EP_REGENERATE_KEYFRAME: 'ep:regenerate-keyframe',
  EP_LIST_KEYFRAMES: 'ep:list-keyframes',
  EP_PLAN_KEYFRAME_REGEN: 'ep:plan-keyframe-regen',
  EP_ENSURE_KEYFRAMES: 'ep:ensure-keyframes',
  EP_INSERT_KEYFRAME_BETWEEN: 'ep:insert-keyframe-between',
  EP_GENERATE_KEYFRAME_AT_INDEX: 'ep:generate-keyframe-at-index',
  EP_SET_KEYFRAME_REFERENCE_OVERRIDES: 'ep:set-keyframe-reference-overrides',
  EP_LIST_ASSET_IMAGES: 'ep:list-asset-images',

  // P5-T13 视频片段 + provider 列表
  EP_LIST_VIDEO_PROVIDERS: 'ep:list-video-providers',
  EP_GET_PROVIDER_CAPABILITIES: 'ep:get-provider-capabilities',
  EP_GENERATE_VIDEO_SEGMENT: 'ep:generate-video-segment',

  // 视频片段制重构（tasks/2026-09-04-ep-video-segment-redesign §3/§5）：分段 + 片段级生成
  EP_RECOMPUTE_SEGMENTS: 'ep:recompute-segments',
  EP_LIST_SEGMENTS: 'ep:list-segments',
  EP_GENERATE_SEGMENT_VIDEO: 'ep:generate-segment-video',

  // P6-T5 合成 + 导出 MP4
  EP_BUILD_TIMELINE: 'ep:build-timeline',
  EP_PREVIEW_SUBTITLE: 'ep:preview-subtitle',
  EP_EXPORT_MP4: 'ep:export-mp4',
  EP_OPEN_EXPORT_FOLDER: 'ep:open-export-folder',

  // P5-T14/T15 V3 binding-aware 场景音频
  EP_GENERATE_SCENE_AUDIO_V3: 'ep:generate-scene-audio-v3',

  // P6-T13 顶部 6 段阶段进度条（spec §2.1 + §2.2）
  EP_CALCULATE_EPISODE_PROGRESS: 'ep:calculate-episode-progress',

  // 剧集列表含进度（spec §6.1）
  EP_LIST_EPISODES_WITH_PROGRESS: 'ep:list-episodes-with-progress',

  // P6-T16 阶段门控（spec §2.3 软引导）
  EP_CAN_ENTER_STAGE: 'ep:can-enter-stage',

  // P5-T32 分镜内角色独立配置（spec §4.5.3）
  EP_LIST_STORYBOARD_CHARACTERS: 'ep:list-storyboard-characters',
  EP_SAVE_STORYBOARD_CHARACTERS: 'ep:save-storyboard-characters',
  EP_CLEAR_STORYBOARD_CHARACTERS: 'ep:clear-storyboard-characters',

  // P5/P6-FU1 剧本 binding 修复（spec §4.1）
  EP_SCAN_SCRIPT_BINDINGS: 'ep:scan-script-bindings',
  EP_FIX_SCRIPT_BINDINGS_BY_NAME: 'ep:fix-script-bindings-by-name',
  EP_CREATE_MISSING_SCRIPT_BINDINGS: 'ep:create-missing-script-bindings',

  // FU4-1 ① 内容 stage AI 识别要素
  EP_IDENTIFY_UPLOADED_ENTITIES: 'ep:identify-uploaded-entities',
  // 「AI 写剧本」生成故事原文
  EP_AI_GENERATE_TEXT: 'ep:ai-generate-text',
  // 「批量创建剧集」分析剧本文件 + 批量建集
  EP_ANALYZE_SCRIPT_FILE: 'ep:analyze-script-file',
  EP_ANALYZE_SCRIPT_TEXT: 'ep:analyze-script-text',
  EP_BATCH_CREATE_EPISODES: 'ep:batch-create-episodes',
  EP_BATCH_IDENTIFY_ENTITIES: 'ep:batch-identify-entities',
  // FU5-B2 ① 内容 stage 整理 / 取舍（覆写三数组）
  EP_UPDATE_UPLOADED_ENTITIES: 'ep:update-uploaded-entities',

  EP_GET_STYLE_PRESETS: 'ep:get-style-presets',
  EP_GENERATE_STORYBOARD_IMAGE: 'ep:generate-storyboard-image',
  EP_GENERATE_SCENE_IMAGES: 'ep:generate-scene-images',
  EP_GENERATE_AUDIO: 'ep:generate-audio',

  // 视频合成相关
  EP_GET_VIDEO_PRESETS: 'ep:get-video-presets',
  EP_SYNTHESIZE_SCENE_VIDEO: 'ep:synthesize-scene-video',
  EP_SYNTHESIZE_STORYBOARD_VIDEO: 'ep:synthesize-storyboard-video',
  EP_EXPORT_VIDEO: 'ep:export-video',

  // 上传模式实体管理
  EP_GET_UPLOADED_ENTITY: 'ep:get-uploaded-entity',
  EP_UPDATE_UPLOADED_ENTITY: 'ep:update-uploaded-entity',
  EP_DELETE_UPLOADED_ENTITY: 'ep:delete-uploaded-entity',
  EP_IS_BINDING_FROM_LONGWRITING: 'ep:is-binding-from-longwriting',

  // ===== V2.5 资产域 channel（与 V2 channel 共存；service 走 *AssetService） =====
  // 角色资产（10 个）
  EP_ASSET_CHARACTER_LIST: 'ep:asset:character:list',
  EP_ASSET_CHARACTER_GET: 'ep:asset:character:get',
  EP_ASSET_CHARACTER_EFFECTIVE: 'ep:asset:character:effective',
  EP_ASSET_CHARACTER_CREATE_STANDALONE: 'ep:asset:character:create-standalone',
  EP_ASSET_CHARACTER_CREATE_LINKED_LW: 'ep:asset:character:create-linked-lw',
  EP_ASSET_CHARACTER_UPDATE_OVERRIDE: 'ep:asset:character:update-override',
  EP_ASSET_CHARACTER_UPDATE_STANDALONE: 'ep:asset:character:update-standalone',
  EP_ASSET_CHARACTER_UPDATE_EXTRA: 'ep:asset:character:update-extra',
  EP_ASSET_CHARACTER_SET_VOICE: 'ep:asset:character:set-voice',
  EP_ASSET_CHARACTER_SET_PORTRAIT: 'ep:asset:character:set-portrait',
  EP_ASSET_CHARACTER_DELETE: 'ep:asset:character:delete',

  // 地点资产（9 个）
  EP_ASSET_LOCATION_LIST: 'ep:asset:location:list',
  EP_ASSET_LOCATION_GET: 'ep:asset:location:get',
  EP_ASSET_LOCATION_EFFECTIVE: 'ep:asset:location:effective',
  EP_ASSET_LOCATION_CREATE_STANDALONE: 'ep:asset:location:create-standalone',
  EP_ASSET_LOCATION_CREATE_LINKED_LW: 'ep:asset:location:create-linked-lw',
  EP_ASSET_LOCATION_PICK_BEST_VARIANT: 'ep:asset:location:pick-best-variant',
  EP_ASSET_LOCATION_UPDATE_OVERRIDE: 'ep:asset:location:update-override',
  EP_ASSET_LOCATION_UPDATE_STANDALONE: 'ep:asset:location:update-standalone',
  EP_ASSET_LOCATION_UPDATE_EXTRA: 'ep:asset:location:update-extra',
  EP_ASSET_LOCATION_DELETE: 'ep:asset:location:delete',

  // 物品资产（8 个）
  EP_ASSET_ITEM_LIST: 'ep:asset:item:list',
  EP_ASSET_ITEM_GET: 'ep:asset:item:get',
  EP_ASSET_ITEM_EFFECTIVE: 'ep:asset:item:effective',
  EP_ASSET_ITEM_CREATE_STANDALONE: 'ep:asset:item:create-standalone',
  EP_ASSET_ITEM_CREATE_LINKED_LW: 'ep:asset:item:create-linked-lw',
  EP_ASSET_ITEM_UPDATE_OVERRIDE: 'ep:asset:item:update-override',
  EP_ASSET_ITEM_UPDATE_STANDALONE: 'ep:asset:item:update-standalone',
  EP_ASSET_ITEM_UPDATE_EXTRA: 'ep:asset:item:update-extra',
  EP_ASSET_ITEM_DELETE: 'ep:asset:item:delete',

  // 语音资产（5 个）
  EP_ASSET_PROJECT_SUMMARY: 'ep:asset:project-summary',
  EP_ASSET_VOICE_LIST: 'ep:asset:voice:list',
  EP_ASSET_VOICE_LIST_READY: 'ep:asset:voice:list-ready',
  EP_ASSET_VOICE_GET: 'ep:asset:voice:get',
  EP_ASSET_VOICE_BIND_TO_CHARACTER: 'ep:asset:voice:bind-to-character',
  EP_ASSET_VOICE_LIST_CHARACTERS: 'ep:asset:voice:list-characters',

  // 统一图谱（7 个）
  EP_ASSET_IMAGE_LIST_BY_ASSET: 'ep:asset:image:list-by-asset',
  EP_ASSET_IMAGE_LIST_BY_CATEGORY: 'ep:asset:image:list-by-category',
  EP_ASSET_IMAGE_GET_MAIN: 'ep:asset:image:get-main',
  EP_ASSET_IMAGE_ADD: 'ep:asset:image:add',
  EP_ASSET_IMAGE_SET_AS_MAIN: 'ep:asset:image:set-as-main',
  EP_ASSET_IMAGE_DELETE: 'ep:asset:image:delete',
  EP_ASSET_IMAGE_UPDATE: 'ep:asset:image:update',
  EP_ASSET_IMAGE_SAVE_PROMPT: 'ep:asset:image:save-prompt',
  EP_ASSET_IMAGE_GENERATE_MAIN: 'ep:asset:image:generate-main',
  EP_ASSET_ENRICH_SETTINGS: 'ep:asset:enrich-settings',
  /** spec 2026-05-09 ep-redesign §3.2 B2 · AI 正向字段提取 */
  EP_ASSET_EXTRACT_FIELDS: 'ep:asset:extract-fields',
  /** spec 2026-05-09 ep-redesign §3.2 B3 · 角色一键多角度参考图（character bible 三视图）*/
  EP_ASSET_CHARACTER_GENERATE_THREE_VIEWS: 'ep:asset:character:generate-three-views',
  /** spec 2026-05-09 ep-redesign §3.2 D1 · 角色形象组（multi-reference）*/
  EP_ASSET_CHARACTER_SET_REFERENCE_SET: 'ep:asset:character:set-reference-set',
  EP_ASSET_CHARACTER_GET_REFERENCE_SET: 'ep:asset:character:get-reference-set',
  /** spec 2026-05-09 ep-redesign §3.2 B7 · 9 帧故事板预览 */
  EP_STORYBOARD_GENERATE_THUMBNAILS: 'ep:storyboard:generate-thumbnails',
  EP_STORYBOARD_CLEANUP_THUMBNAILS: 'ep:storyboard:cleanup-thumbnails',
  EP_STORYBOARD_CREATE_FROM_THUMBNAILS: 'ep:storyboard:create-from-thumbnails',
  /** spec 2026-05-09 ep-redesign §3.2 D2 · 跨项目角色库 */
  EP_USER_ASSET_LIST: 'ep:user-asset:list',
  EP_USER_ASSET_ADD_FROM_BINDING: 'ep:user-asset:add-from-binding',
  EP_USER_ASSET_CREATE_BINDING: 'ep:user-asset:create-binding',
  EP_USER_ASSET_DELETE: 'ep:user-asset:delete',
  /** spec 2026-05-09 ep-redesign §3.2 D5 · 视频解析（参考视频 → 分镜骨架） */
  EP_REFERENCE_VIDEO_ANALYZE: 'ep:reference-video:analyze',
  EP_REFERENCE_VIDEO_LIST: 'ep:reference-video:list',
  EP_REFERENCE_VIDEO_GET: 'ep:reference-video:get',
  EP_REFERENCE_VIDEO_DELETE: 'ep:reference-video:delete',
  EP_REFERENCE_VIDEO_IMPORT_TO_SCENE: 'ep:reference-video:import-to-scene',
  /** spec 2026-05-09 ep-redesign §3.2 D3 · 数字人池 */
  EP_ASSET_PRESET_LIST: 'ep:asset:preset:list',
  EP_ASSET_PRESET_ENSURE_MAIN_IMAGE: 'ep:asset:preset:ensure-main-image',
  EP_ASSET_PRESET_ENSURE_ALL_IMAGES: 'ep:asset:preset:ensure-all-images',
  EP_ASSET_PRESET_USE_TO_PROJECT: 'ep:asset:preset:use-to-project',
  EP_ASSET_CHARACTER_EXTRACT_FRAMES: 'ep:asset:character-extract:frames',
  EP_ASSET_CHARACTER_EXTRACT_CLEANUP: 'ep:asset:character-extract:cleanup',
  EP_ASSET_CHARACTER_EXTRACT_IMPORT_FRAMES: 'ep:asset:character-extract:import-frames',

  // 派生（2 个）
  EP_ASSET_DERIVE_SINGLE: 'ep:asset:derive:single',
  EP_ASSET_DERIVE_BATCH: 'ep:asset:derive:batch',

  // 引用导入（2 个）
  EP_ASSET_IMPORT_FROM_PORTRAIT: 'ep:asset:import:from-portrait',
  EP_ASSET_IMPORT_FROM_IMAGE: 'ep:asset:import:from-image',

  // 主图文件上传（双端 · follow-up）
  EP_ASSET_IMAGE_UPLOAD_MAIN_FILE: 'ep:asset:image:upload-main-file',
  EP_ASSET_IMAGE_UPLOAD_MAIN_ADD: 'ep:asset:image:upload-main-add',
  EP_ASSET_IMAGE_UPLOAD_REF: 'ep:asset:image:upload-ref',

  // spec 2026-05-09 多主图模型新增
  EP_ASSET_IMAGE_ADD_MAIN: 'ep:asset:image:add-main',
  EP_ASSET_IMAGE_SWITCH_MAIN: 'ep:asset:image:switch-main',
  EP_ASSET_IMAGE_UPDATE_METADATA: 'ep:asset:image:update-metadata',

  // 360 全景 + 视角截图（7 个 · P3c Task 4）
  EP_ASSET_PANORAMA_LIST: 'ep:asset:panorama:list',
  EP_ASSET_PANORAMA_GENERATE: 'ep:asset:panorama:generate',
  EP_ASSET_PANORAMA_UPLOAD: 'ep:asset:panorama:upload',
  EP_ASSET_PANORAMA_UPLOAD_FILE: 'ep:asset:panorama:upload-file',
  EP_ASSET_SET_REFERENCE_IMAGE: 'ep:asset:set-reference-image',
  EP_ASSET_PANORAMA_DELETE: 'ep:asset:panorama:delete',
  EP_ASSET_PANORAMA_CREATE_SNAPSHOT: 'ep:asset:panorama:create-snapshot',
  EP_ASSET_PANORAMA_LIST_SNAPSHOTS: 'ep:asset:panorama:list-snapshots',
  EP_ASSET_PANORAMA_DELETE_SNAPSHOT: 'ep:asset:panorama:delete-snapshot',

  // OSS 配置相关
  OSS_LIST_CONFIGS: 'oss:list-configs',
  OSS_GET_CONFIG: 'oss:get-config',
  OSS_CREATE_CONFIG: 'oss:create-config',
  OSS_UPDATE_CONFIG: 'oss:update-config',
  OSS_DELETE_CONFIG: 'oss:delete-config',
  OSS_SET_DEFAULT: 'oss:set-default',
  OSS_TOGGLE_ENABLED: 'oss:toggle-enabled',
  OSS_TEST_CONNECTION: 'oss:test-connection',
  OSS_UPLOAD_FILE: 'oss:upload-file',

  // 数据源（第三方数据库）
  DATASOURCE_LIST: 'datasource:list',
  DATASOURCE_LIST_ELIGIBLE: 'datasource:list-eligible',
  DATASOURCE_CREATE: 'datasource:create',
  DATASOURCE_UPDATE: 'datasource:update',
  DATASOURCE_DELETE: 'datasource:delete',
  DATASOURCE_TOGGLE_ENABLED: 'datasource:toggle-enabled',
  DATASOURCE_TEST_CONNECTION: 'datasource:test-connection',

  // 业务包（包内核：启用态查询/切换）
  PACK_LIST: 'pack:list',
  PACK_SET_ENABLED: 'pack:setEnabled',

  // ==================== 通知中心 ====================
  NOTIFICATION_LIST: 'notification:list',
  NOTIFICATION_MARK_READ: 'notification:mark-read',
  NOTIFICATION_MARK_ALL_READ: 'notification:mark-all-read',
  NOTIFICATION_UNREAD_COUNT: 'notification:unread-count'
} as const

/**
 * 暴露给渲染进程的 API
 */
const electronAPI = {
  // 设置相关
  settings: {
    get: (key?: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key),
    set: (key: string, value: any) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key, value })
  },

  // API密钥相关（保留兼容）
  apiKey: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.API_KEY_LIST),
    set: (provider: string, key: string, endpoint?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.API_KEY_SET, { provider, key, endpoint }),
    delete: (provider: string) => ipcRenderer.invoke(IPC_CHANNELS.API_KEY_DELETE, { provider }),
    test: (provider: string) => ipcRenderer.invoke(IPC_CHANNELS.API_KEY_TEST, { provider })
  },

  // 提供商模板相关
  providerTemplate: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_TEMPLATE_LIST)
  },

  // 提供商配置相关
  providerConfig: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_CONFIG_LIST),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_CONFIG_GET, id),
    create: (data: {
      templateId: string
      name: string
      shortId?: string
      apiKey?: string
      accessKeyId?: string
      accessKeySecret?: string
      baseUrl?: string
      imageBaseUrl?: string
      videoBaseUrl?: string
      audioBaseUrl?: string
      customHeaders?: Record<string, string>
      customParams?: Record<string, unknown>
      models?: Array<{
        id: string
        name: string
        type?: string
        contextWindow: number
        maxOutputTokens: number
        features: string[]
        supportsThinking?: boolean
        supportsWebSearch?: boolean
        supportsTools?: boolean
      }>
      isEnabled?: boolean
      isDefault?: boolean
      defaultModelId?: string
    }) => ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_CONFIG_CREATE, data),
    update: (
      id: string,
      data: Partial<{
        name: string
        shortId: string
        apiKey: string
        accessKeyId: string
        accessKeySecret: string
        baseUrl: string
        imageBaseUrl: string
        videoBaseUrl: string
        audioBaseUrl: string
        customHeaders: Record<string, string>
        customParams: Record<string, unknown>
        defaultModelId?: string
        models?: Array<{
          id: string
          name: string
          type?: string
          contextWindow: number
          maxOutputTokens: number
          features: string[]
          supportsThinking?: boolean
          supportsWebSearch?: boolean
          supportsTools?: boolean
        }>
        isEnabled: boolean
        isDefault: boolean
      }>
    ) => ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_CONFIG_UPDATE, { id, data }),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_CONFIG_DELETE, id),
    test: (data: {
      configId?: string
      templateId?: string
      apiKey?: string
      accessKeyId?: string
      accessKeySecret?: string
      baseUrl?: string
    }) => ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_CONFIG_TEST, data),
    setDefault: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_CONFIG_SET_DEFAULT, id),
    // 监听配置变化
    onChanged: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on(IPC_CHANNELS.PROVIDER_CONFIG_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PROVIDER_CONFIG_CHANGED, handler)
    }
  },

  // 对话相关
  dialog: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_LIST),
    listByRole: (roleId: string | null) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_LIST_BY_ROLE, roleId),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_GET, id),
    create: (data: {
      title?: string
      modelId: string
      providerConfigId?: string
      roleId?: string
      systemPrompt?: string
      contextConfig?: { maxMessages: number; maxTokens: number }
    }) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_CREATE, data),
    update: (
      id: string,
      data: Partial<{
        title: string
        systemPrompt: string
        contextConfig: { maxMessages: number; maxTokens: number }
        modelId: string
        providerConfigId: string
      }>
    ) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_UPDATE, { id, data }),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_DELETE, id),
    touch: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_TOUCH, id)
  },

  // 消息相关
  message: {
    list: (dialogId: string) => ipcRenderer.invoke(IPC_CHANNELS.MESSAGE_LIST, dialogId),
    get: (messageId: string) => ipcRenderer.invoke(IPC_CHANNELS.MESSAGE_GET, messageId),
    create: (data: {
      dialogId: string
      role: 'user' | 'assistant' | 'system'
      content: string
      modelId?: string
      tokensUsed?: number
      attachments?: Array<{
        id: string
        type: 'image' | 'document'
        fileName: string
        filePath: string
        fileSize: number
        mimeType: string
      }>
      metadata?: {
        thinkingChain?: string
        webSearch?: Array<{ title: string; url: string; snippet: string }>
        knowledgeBase?: string[]
      }
    }) => ipcRenderer.invoke(IPC_CHANNELS.MESSAGE_CREATE, data),
    update: (
      id: string,
      content: string
    ) => ipcRenderer.invoke(IPC_CHANNELS.MESSAGE_UPDATE, { id, content }),
    delete: (dialogId: string) => ipcRenderer.invoke(IPC_CHANNELS.MESSAGE_DELETE, dialogId),
    deleteSingle: (messageId: string) => ipcRenderer.invoke('message:deleteSingle', messageId)
  },

  // 角色相关
  role: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.ROLE_LIST),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.ROLE_GET, id),
    create: (data: {
      name: string
      description?: string
      systemPrompt?: string
      avatar?: string
      // 模型配置
      defaultModelId?: string
      defaultProviderConfigId?: string
      autoResetModel?: boolean
      // 生成参数
      temperature?: number
      topP?: number
      maxContextMessages?: number
      maxTokens?: number
      enableStream?: boolean
      customParams?: Record<string, unknown>
    }) => ipcRenderer.invoke(IPC_CHANNELS.ROLE_CREATE, data),
    update: (
      id: string,
      data: Partial<{
        name: string
        description: string
        systemPrompt: string
        avatar: string
        // 模型配置
        defaultModelId: string
        defaultProviderConfigId: string
        autoResetModel: boolean
        // 生成参数
        temperature: number
        topP: number
        maxContextMessages: number
        maxTokens: number
        enableStream: boolean
        customParams: Record<string, unknown>
      }>
    ) => ipcRenderer.invoke(IPC_CHANNELS.ROLE_UPDATE, { id, data }),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.ROLE_DELETE, id),
    getDialogCount: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.ROLE_DIALOG_COUNT, id)
  },

  // 聊天相关（流式消息）
  chat: {
    send: (data: {
      dialogId: string
      content: string
      attachments?: Array<{
        id: string
        type: 'image' | 'document'
        fileName: string
        filePath: string
        fileSize: number
        mimeType: string
      }>
      enableWebSearch?: boolean
      enableThinkingChain?: boolean
      modelId?: string
      providerConfigId?: string
      // 知识库配置
      knowledgeBaseIds?: string[]
      knowledgeRetrieveCount?: number
      knowledgeThreshold?: number
    }) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND, data),
    stop: (dialogId: string) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_STOP, dialogId),
    onStream: (callback: (event: any, data: any) => void) => {
      const handler = (event: any, data: any) => callback(event, data)
      ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM, handler)
    }
  },

  // 图像生成相关
  image: {
    // 生成图像
    generate: (request: {
      providerId: string
      modelId: string
      prompt: string
      negativePrompt?: string
      width: number
      height: number
      style?: string
      quality?: string
      count?: number
      seed?: number
      referenceImage?: string
    }) => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_GENERATE, request),
    // 获取任务状态
    getTaskStatus: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_TASK_STATUS, taskId),
    // 停止生成
    stop: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_STOP, taskId),
    // 获取图像列表
    list: (page?: number, pageSize?: number, favoriteOnly?: boolean, status?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.IMAGE_LIST, page, pageSize, favoriteOnly, status),
    // 获取单个图像
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_GET, id),
    // 切换收藏状态
    toggleFavorite: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_TOGGLE_FAVORITE, id),
    // 删除图像
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_DELETE, id),
    // 批量删除图像
    deleteMany: (ids: string[]) => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_DELETE_MANY, ids),
    // 获取图像提供商列表
    getProviders: () => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_PROVIDERS),
    // 获取图像模型列表
    getModels: (providerId?: string) => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_MODELS, providerId),
    // 测试提供商连接
    testProvider: (providerId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.IMAGE_TEST_PROVIDER, providerId),
    // 下载图像到本地
    download: (imageId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.IMAGE_DOWNLOAD, imageId),
    // 选择参考图片
    selectFile: () =>
      ipcRenderer.invoke(IPC_CHANNELS.IMAGE_SELECT_FILE),
    // 监听图像生成事件
    onGenerationEvent: (callback: (event: any, data: {
      type: 'generation-started' | 'generation-progress' | 'generation-completed' | 'generation-failed'
      taskId: string
      images?: any[]
      status?: string
      progress?: number
      error?: string
    }) => void) => {
      const handler = (event: any, data: any) => callback(event, data)
      ipcRenderer.on('image:generation-event', handler)
      return () => ipcRenderer.removeListener('image:generation-event', handler)
    }
  },

  // 文件对话框
  workflow: {
    // ==================== 定义 ====================
    listDefinitions: (p: { keyword?: string; page: number; pageSize: number; sortBy?: string; sortOrder?: string }) =>
      ipcRenderer.invoke('wf:list-definitions', p),
    getDefinition: (id: string) => ipcRenderer.invoke('wf:get-definition', { id }),
    createDefinition: (p: { name: string; description?: string; settings?: Record<string, unknown> }) =>
      ipcRenderer.invoke('wf:create-definition', p),
    updateDefinition: (id: string, patch: Record<string, unknown>) =>
      ipcRenderer.invoke('wf:update-definition', { id, patch }),
    saveDraft: (id: string, graph: unknown) => ipcRenderer.invoke('wf:save-draft', { id, graph }),
    deleteDefinition: (id: string) => ipcRenderer.invoke('wf:delete-definition', { id }),
    publishDefinition: (p: { id: string; triggers?: unknown[]; settings?: unknown }) =>
      ipcRenderer.invoke('wf:publish-definition', p),
    validateGraph: (graph: unknown) => ipcRenderer.invoke('wf:validate-graph', { graph }),
    validateTriggers: (triggers: unknown[]) => ipcRenderer.invoke('wf:validate-triggers', { triggers }),
    updateTriggers: (id: string, triggers: unknown[]) => ipcRenderer.invoke('wf:update-triggers', { id, triggers }),
    exportDefinition: (id: string) => ipcRenderer.invoke('wf:export-definition', { id }),
    importDefinition: (p: { content: string; duplicatePolicy?: 'copy' | 'overwrite' }) =>
      ipcRenderer.invoke('wf:import-definition', p),
    // ==================== 运行 ====================
    startRun: (p: { definitionId: string; inputs?: Record<string, unknown> }) =>
      ipcRenderer.invoke('wf:start-run', p),
    cancelRun: (runId: string) => ipcRenderer.invoke('wf:cancel-run', { runId }),
    resumeRun: (p: { runId: string; forceRerunNodeIds?: string[] }) => ipcRenderer.invoke('wf:resume-run', p),
    reviewDecide: (p: {
      runId: string
      nodeId: string
      decision: 'approve' | 'approve_with_changes' | 'reject'
      comment?: string
      editedValues?: Record<string, unknown>
    }) => ipcRenderer.invoke('wf:review-decide', p),
    getRun: (runId: string) => ipcRenderer.invoke('wf:get-run', { runId }),
    draftFromNl: (p: { description: string; name?: string }) => ipcRenderer.invoke('wf:draft-from-nl', p),
    listRunLogs: (runId: string) => ipcRenderer.invoke('wf:list-run-logs', { runId }),
    collectNodeOutput: (p: { runId: string; nodeId: string; iterationIndex?: number }) =>
      ipcRenderer.invoke('wf:collect-node-output', p),
    listRuns: (p: { definitionId?: string; status?: string; page: number; pageSize: number }) =>
      ipcRenderer.invoke('wf:list-runs', p),
    deleteRun: (runId: string) => ipcRenderer.invoke('wf:delete-run', { runId }),
    getPendingReviews: () => ipcRenderer.invoke('wf:get-pending-reviews'),
    getNodeTrajectories: (p: { runId: string; nodeId: string; iterationIndex?: number }) =>
      ipcRenderer.invoke('wf:get-node-trajectories', p),
    // ==================== M3 任务树/知识飞轮 ====================
    createPlan: (p: { goal: string; title?: string }) => ipcRenderer.invoke('at:create-plan', p),
    approvePlan: (rootId: string) => ipcRenderer.invoke('at:approve-plan', { rootId }),
    getTaskTree: (rootId: string) => ipcRenderer.invoke('at:get-tree', { rootId }),
    listTaskRoots: () => ipcRenderer.invoke('at:list-roots'),
    taskVerifyDecide: (p: { taskId: string; decision: 'approve' | 'reject'; comment?: string }) => ipcRenderer.invoke('at:verify-decide', p),
    taskEscalateDecide: (p: { taskId: string; decision: 'pass' | 'fail' | 'retry'; comment?: string }) => ipcRenderer.invoke('at:escalate-decide', p),
    cancelTask: (rootId: string) => ipcRenderer.invoke('at:cancel', { rootId }),
    listMemoryPending: () => ipcRenderer.invoke('am:list-pending'),
    listMemoryActive: () => ipcRenderer.invoke('am:list-active'),
    listMemoryArchived: () => ipcRenderer.invoke('am:list-archived'),
    approveMemory: (id: string) => ipcRenderer.invoke('am:approve', { id }),
    archiveMemory: (id: string) => ipcRenderer.invoke('am:archive', { id }),
    addManualMemory: (p: { kind: string; title: string; content: string; bizModule?: string; projectId?: string }) => ipcRenderer.invoke('am:add-manual', p),
    rejectMemory: (id: string) => ipcRenderer.invoke('am:reject', { id }),
    // ==================== M5.5 Agent 工作台 ====================
    agentConsole: {
      listSessions: () => ipcRenderer.invoke('ac:list-sessions'),
      getTrajectory: (p: { scopeKey: string }) => ipcRenderer.invoke('ac:get-trajectory', p),
      getContext: (p: { scopeKey: string }) => ipcRenderer.invoke('ac:get-context', p),
      stop: (p: { scopeKey: string }) => ipcRenderer.invoke('ac:stop', p),
      onTrajectory: (callback: (data: any) => void) => {
        const handler = (_event: any, data: any) => callback(data)
        ipcRenderer.on('ac:trajectory', handler)
        return () => ipcRenderer.removeListener('ac:trajectory', handler)
      },
      onRunUpdate: (callback: (data: any) => void) => {
        const handler = (_event: any, data: any) => callback(data)
        ipcRenderer.on('ac:run-update', handler)
        return () => ipcRenderer.removeListener('ac:run-update', handler)
      },
    },
    // ==================== 触发器 ====================
    triggerPreview: (expression: string) => ipcRenderer.invoke('wf:trigger-preview', { expression }),
    listAgentTools: () => ipcRenderer.invoke('wf:list-agent-tools'),
    enableShare: (id: string) => ipcRenderer.invoke('wf:enable-share', { id }),
    reportToPdf: (p: { markdown: string; title?: string }) => ipcRenderer.invoke('wf:report-to-pdf', p),
    uploadFormFile: (p: { runId: string; nodeId: string; fileName: string; base64: string }) => ipcRenderer.invoke('wf:form-upload', p),
    disableShare: (id: string) => ipcRenderer.invoke('wf:disable-share', { id }),
    // ==================== 版本历史 ====================
    listVersions: (definitionId: string) => ipcRenderer.invoke('wf:list-versions', { definitionId }),
    restoreVersion: (p: { definitionId: string; versionId: string }) => ipcRenderer.invoke('wf:restore-version', p),
    // ==================== 实时事件（返回取消订阅函数） ====================
    onRunEvent: (callback: (data: any) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('wf:run-event', handler)
      return () => ipcRenderer.removeListener('wf:run-event', handler)
    },
  },

  // ==================== 应用模块（片3） ====================
  app: {
    list: (p: { keyword?: string; category?: string; pinned?: boolean; page: number; pageSize: number }) => ipcRenderer.invoke('app:list', p),
    get: (id: string) => ipcRenderer.invoke('app:get', { id }),
    getByDefinition: (definitionId: string) => ipcRenderer.invoke('app:get-by-definition', { definitionId }),
    createFromWorkflow: (p: { definitionId: string; name?: string; icon?: string; category?: string; tags?: string[]; channelSession?: boolean; channelShare?: boolean; channelApi?: boolean }) => ipcRenderer.invoke('app:create-from-workflow', p),
    updateChannels: (p: { id: string; channelSession?: boolean; channelShare?: boolean; channelApi?: boolean }) => ipcRenderer.invoke('app:update-channels', p),
    setPinned: (id: string, pinned: boolean) => ipcRenderer.invoke('app:set-pinned', { id, pinned }),
    updateMeta: (p: { id: string; name?: string; icon?: string | null; description?: string | null; category?: string | null; tags?: string[] }) => ipcRenderer.invoke('app:update-meta', p),
    categories: () => ipcRenderer.invoke('app:categories'),
    enableShare: (id: string) => ipcRenderer.invoke('app:enable-share', { id }),
    disableShare: (id: string) => ipcRenderer.invoke('app:disable-share', { id }),
    setEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke('app:set-enabled', { id, enabled }),
    delete: (id: string) => ipcRenderer.invoke('app:delete', { id }),
  },
  appSession: {
    list: (appId: string) => ipcRenderer.invoke('app-session:list', { appId }),
    create: (p: { appId: string; startInputs?: Record<string, unknown> }) => ipcRenderer.invoke('app-session:create', p),
    get: (sessionId: string) => ipcRenderer.invoke('app-session:get', { sessionId }),
    rename: (sessionId: string, title: string) => ipcRenderer.invoke('app-session:rename', { sessionId, title }),
    messages: (sessionId: string) => ipcRenderer.invoke('app-session:messages', { sessionId }),
    start: (p: { sessionId: string; inputs?: Record<string, unknown> }) => ipcRenderer.invoke('app-session:start', p),
    review: (p: { sessionId: string; nodeId: string; decision: string; editedValues?: Record<string, unknown>; choice?: string }) => ipcRenderer.invoke('app-session:review', p),
    delete: (sessionId: string) => ipcRenderer.invoke('app-session:delete', { sessionId }),
  },

  // ==================== 通用资产库（保存资产/读取资产/资产中心） ====================
  assets: {
    list: (p: { category?: string; subCategory?: string; keyword?: string; page: number; pageSize: number }) => ipcRenderer.invoke('asset:list', p),
    get: (id: string) => ipcRenderer.invoke('asset:get', { id }),
    create: (p: {
      category?: string
      subCategory?: string
      name?: string
      description?: string
      tags?: string[]
      content: { kind: 'file'; path: string } | { kind: 'url'; url: string } | { kind: 'text'; text: string } | { kind: 'json'; json: string }
    }) => ipcRenderer.invoke('asset:create', p),
    update: (p: { id: string; name?: string; description?: string | null; tags?: string[]; category?: string; subCategory?: string | null }) => ipcRenderer.invoke('asset:update', p),
    delete: (id: string) => ipcRenderer.invoke('asset:delete', { id }),
    stats: () => ipcRenderer.invoke('asset:stats'),
    subCategoryStats: (category: string) => ipcRenderer.invoke('asset:sub-category-stats', { category }),
    openFolder: (id: string) => ipcRenderer.invoke('asset:open-folder', { id }),
    groupOpenFolder: (groupId: string) => ipcRenderer.invoke('asset:group-open-folder', { groupId }),
    // 分类定义（业务分类实体：驱动资产中心分组与预览）
    listCategories: (p?: { category?: string }) => ipcRenderer.invoke('asset:categories-list', p ?? {}),
    createCategory: (p: {
      name: string
      code?: string
      allowedKinds?: string[]
      allowedCategories?: string[]
      previewable?: boolean
      previewMode?: string
      previewTemplateId?: string | null
      sortOrder?: number
    }) => ipcRenderer.invoke('asset:category-create', p),
    updateCategory: (p: { id: string; name?: string; code?: string | null; allowedKinds?: string[]; allowedCategories?: string[]; previewable?: boolean; previewMode?: string; previewTemplateId?: string | null; sortOrder?: number }) => ipcRenderer.invoke('asset:category-update', p),
    deleteCategory: (id: string) => ipcRenderer.invoke('asset:category-delete', { id }),
    previewRender: (assetId: string) => ipcRenderer.invoke('asset:preview-render', { assetId }),
    previewTemplates: () => ipcRenderer.invoke('asset:preview-templates'),
    // 文本报告资产 → 长图图片资产（桌面端渲染；Web 返回 null）
    materializeImage: (p: { assetId: string; templateId?: string; subCategory?: string; name?: string; tags?: string[] }) => ipcRenderer.invoke('asset:materialize-image', p),    sourceLink: (assetId: string) => ipcRenderer.invoke('asset:source-link', { assetId }),
    groupDetail: (groupId: string) => ipcRenderer.invoke('asset:group-detail', { groupId }),
    download: (id: string, view?: 'preview' | 'source') => ipcRenderer.invoke('asset:download', { id, view }),
    // 网页收藏「更新快照」：按 sourceUrl 重新抓取并就地刷新
    refreshWebpage: (assetId: string) => ipcRenderer.invoke('asset:webpage-refresh', { assetId }),
  },

  // ==================== 新闻来源库（内置应用 C1 早报 / C2 周报的数据源） ====================
  newsSource: {
    list: (p: { topicId?: string; keyword?: string }) => ipcRenderer.invoke('newsSource:list', p),
    get: (id: string) => ipcRenderer.invoke('newsSource:get', { id }),
    create: (p: { topicId: string; name: string; url: string }) => ipcRenderer.invoke('newsSource:create', p),
    update: (p: { id: string; topicId?: string; name?: string; url?: string; enabled?: boolean }) => ipcRenderer.invoke('newsSource:update', p),
    delete: (id: string) => ipcRenderer.invoke('newsSource:delete', { id }),
  },

  // ==================== 新闻主题（入库可增删） ====================
  newsTopic: {
    list: () => ipcRenderer.invoke('newsTopic:list'),
    create: (p: { name: string }) => ipcRenderer.invoke('newsTopic:create', p),
    update: (p: { id: string; name?: string }) => ipcRenderer.invoke('newsTopic:update', p),
    delete: (id: string) => ipcRenderer.invoke('newsTopic:delete', { id }),
  },

  // ==================== 网站 favicon（新闻来源图标） ====================
  favicon: {
    get: (url: string) => ipcRenderer.invoke('favicon:get', { url }),
  },

  // ==================== P0 工具模块（片1：第三方 API 工具） ====================
  tools: {
    listCredentials: () => ipcRenderer.invoke('tool:list-credentials'),
    saveCredential: (p: { name: string; apiKey: string; baseUrl?: string }) => ipcRenderer.invoke('tool:save-credential', p),
    deleteCredential: (id: string) => ipcRenderer.invoke('tool:delete-credential', { id }),
    listCustom: () => ipcRenderer.invoke('tool:list-custom'),
    scanInstalled: () => ipcRenderer.invoke('tool:scan-installed'),
    saveCustom: (p: {
      name: string
      description?: string
      kind?: 'api' | 'cli'
      method: string
      url: string
      headers?: Array<{ key: string; value: string }>
      paramsSchema?: Array<{ key: string; label?: string; type?: string; required?: boolean; options?: Array<{ label: string; value: string | number }>; default?: unknown }>
      authType?: string
      credentialId?: string | null
      command?: string
      argsTemplate?: string
      cwd?: string
      timeoutMs?: number
      stdoutType?: 'text' | 'json'
    }) => ipcRenderer.invoke('tool:save-custom', p),
    updateCustom: (id: string, patch: Record<string, unknown>) => ipcRenderer.invoke('tool:update-custom', { id, patch }),
    deleteCustom: (id: string) => ipcRenderer.invoke('tool:delete-custom', { id }),
    presets: () => ipcRenderer.invoke('tool:presets'),
  },

  // ==================== 技能模块（Skill 技能包：内置只读 + 用户技能库管理） ====================
  skills: {
    list: () => ipcRenderer.invoke('skill:list'),
    get: (id: string) => ipcRenderer.invoke('skill:get', { id }),
    resolve: (id: string) => ipcRenderer.invoke('skill:resolve', { id }),
    create: (input: Record<string, unknown>) => ipcRenderer.invoke('skill:create', { input }),
    update: (id: string, patch: Record<string, unknown>) => ipcRenderer.invoke('skill:update', { id, patch }),
    remove: (id: string) => ipcRenderer.invoke('skill:remove', { id }),
    importFromPath: (path: string) => ipcRenderer.invoke('skill:import', { path }),
    exportToPath: (id: string, destDir: string) => ipcRenderer.invoke('skill:export', { id, destDir }),
    forkBuiltin: (id: string) => ipcRenderer.invoke('skill:fork', { id }),
  },

  // ==================== P0 邮箱模块（邮件收发工具：邮箱账号配置） ====================
  email: {
    listAccounts: () => ipcRenderer.invoke('email:list-accounts'),
    saveAccount: (p: {
      id?: string
      name: string
      imapHost: string
      imapPort: number
      imapSecure: boolean
      smtpHost: string
      smtpPort: number
      smtpSecure: boolean
      user: string
      pass?: string
      fromName: string
    }) => ipcRenderer.invoke('email:save-account', p),
    deleteAccount: (id: string) => ipcRenderer.invoke('email:delete-account', { id }),
    testAccount: (id: string) => ipcRenderer.invoke('email:test-account', { id }),
  },

  file: {
    // 打开文件选择对话框
    openDialog: (options?: {
      multiple?: boolean
      filters?: Array<{ name: string; extensions: string[] }>
    }) => ipcRenderer.invoke('file:open-dialog', options),
    // 读取文件内容（用于预览）
    readAsBase64: (filePath: string) => ipcRenderer.invoke('file:read-base64', filePath),
    // 读取文本文件内容（UTF-8；模板上传用）
    readTextFile: (p: { path: string }) => ipcRenderer.invoke('file:read-text', { filePath: p.path }),
    // 保存文件对话框
    saveFile: (options?: {
      defaultPath?: string
      filters?: Array<{ name: string; extensions: string[] }>
    }) => ipcRenderer.invoke('file:save-dialog', options),
    // 写入文本文件
    writeTextFile: (filePath: string, content: string) =>
      ipcRenderer.invoke('file:write-text', { filePath, content }),
    // 写入二进制文件（base64 编码传输，用于图片等 Blob 落盘）
    writeBinaryFile: (filePath: string, base64: string) =>
      ipcRenderer.invoke('file:write-binary', { filePath, base64 }),
    // 打开文件夹选择对话框
    openFolderDialog: () => ipcRenderer.invoke('file:open-folder-dialog'),
    // 复制文件
    copyFile: (sourcePath: string, targetPath: string) =>
      ipcRenderer.invoke('file:copy', { sourcePath, targetPath })
  },

  // 导出相关
  export: {
    // 导出消息为图片
    messageAsImage: (data: { imageBase64: string; fileName?: string }) =>
      ipcRenderer.invoke('export:message-image', data),
    // 导出消息为 Word
    messageAsWord: (data: { content: string; modelId?: string }) =>
      ipcRenderer.invoke('export:message-word', data),
    // 获取 Obsidian 保管库列表
    getObsidianVaults: () =>
      ipcRenderer.invoke('export:get-obsidian-vaults'),
    // 获取保管库目录列表
    getVaultDirectories: (vaultPath: string) =>
      ipcRenderer.invoke('export:get-vault-directories', vaultPath),
    // 获取保管库文件列表
    getVaultFiles: (vaultPath: string, subPath?: string) =>
      ipcRenderer.invoke('export:get-vault-files', vaultPath, subPath),
    // 导出到 Obsidian
    toObsidian: (data: {
      content: string
      thinkingChain?: string
      title: string
      vaultPath: string
      subPath?: string
      tags?: string[]
      createdAt?: string
      source?: string
      mode: 'new' | 'append'
      appendFile?: string
    }) => ipcRenderer.invoke('export:to-obsidian', data)
  },

  // 翻译相关
  translation: {
    // 获取翻译提供商列表
    getProviders: () => ipcRenderer.invoke('translation:providers'),
    // 文本翻译
    text: (request: {
      text: string
      sourceLanguage: string
      targetLanguage: string
      providerId?: string
      modelId?: string
    }) => ipcRenderer.invoke('translation:text', request),
    // 文件翻译
    file: (request: {
      filePath: string
      sourceLanguage: string
      targetLanguage: string
      providerId?: string
      modelId?: string
    }) => ipcRenderer.invoke('translation:file', request),
    // 选择文件
    selectFile: () => ipcRenderer.invoke('translation:select-file'),
    // 获取历史
    history: (query: {
      page: number
      pageSize: number
      type?: 'text' | 'file'
      favorite?: boolean
    }) => ipcRenderer.invoke('translation:history', query),
    // 获取详情
    get: (id: string) => ipcRenderer.invoke('translation:get', id),
    // 切换收藏
    toggleFavorite: (id: string) => ipcRenderer.invoke('translation:toggle-favorite', id),
    // 删除
    delete: (id: string) => ipcRenderer.invoke('translation:delete', id),
    // 下载
    download: (id: string) => ipcRenderer.invoke('translation:download', id),
    // 进度监听
    onProgress: (callback: (data: { translationId: string; progress: number }) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('translation:progress', handler)
      return () => ipcRenderer.removeListener('translation:progress', handler)
    },
    // 完成监听
    onCompleted: (callback: (data: { translationId: string; targetFile: string }) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('translation:completed', handler)
      return () => ipcRenderer.removeListener('translation:completed', handler)
    },
    // 失败监听
    onFailed: (callback: (data: { translationId: string; error: string }) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('translation:failed', handler)
      return () => ipcRenderer.removeListener('translation:failed', handler)
    },
    // 打开文件夹
    openFolder: (filePath: string) => ipcRenderer.invoke('translation:open-folder', filePath)
  },

  // 语音相关
  voice: {
    // 获取语音提供商列表
    getProviders: () => ipcRenderer.invoke('voice:providers'),
    // 获取发音人列表
    getVoices: (providerId?: string, language?: string) =>
      ipcRenderer.invoke('voice:voices', providerId, language),
    // 文本转语音
    tts: (request: {
      text: string
      voiceId: string
      language?: string
      speed?: number
      pitch?: number
      volume?: number
      emotion?: string
      style?: string
      providerId?: string
      modelId?: string
    }) => ipcRenderer.invoke('voice:tts', request),
    // 语音转文本
    stt: (request: {
      audioPath?: string
      audioData?: string
      language?: string
      providerId?: string
      modelId?: string
    }) => ipcRenderer.invoke('voice:stt', request),
    // 语音复刻 — 创建（DashScope CosyVoice，2026-05 接入）
    clone: (request: {
      name: string
      samplePath: string
      sampleDurationSec: number
      prefix: string
      language?: string
      providerId?: string
    }) => ipcRenderer.invoke('voice:clone', request),
    // 选择音频文件
    selectFile: () => ipcRenderer.invoke('voice:select-file'),
    // 获取语音历史
    history: (query: {
      page: number
      pageSize: number
      type?: 'tts' | 'stt'
      favorite?: boolean
    }) => ipcRenderer.invoke('voice:history', query),
    // 删除语音记录
    delete: (id: string) => ipcRenderer.invoke('voice:delete', id),
    // 切换收藏
    toggleFavorite: (id: string) => ipcRenderer.invoke('voice:toggle-favorite', id),
    // 获取复刻声音列表（status 可选筛 training/ready/failed）
    getClonedVoices: (status?: 'training' | 'ready' | 'failed') =>
      ipcRenderer.invoke('voice:cloned-list', status),
    // 删除复刻声音（含 provider 端 + DB + 解绑相关角色）
    deleteClonedVoice: (id: string) => ipcRenderer.invoke('voice:cloned-delete', id),
    // 同步刷新某条复刻状态（也被 scheduler 内部用）
    refreshCloneStatus: (id: string) =>
      ipcRenderer.invoke('voice:clone-refresh-status', id),
    // 试听复刻音色（text 可选；当前仅支持系统 demo 试听）
    preview: (id: string, text?: string) =>
      ipcRenderer.invoke('voice:preview', id, text),
    // TTS 完成监听
    onTTSCompleted: (callback: (data: { recordId: string; audioPath: string }) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('voice:tts-completed', handler)
      return () => ipcRenderer.removeListener('voice:tts-completed', handler)
    },
    // STT 完成监听
    onSTTCompleted: (callback: (data: { recordId: string; text: string }) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('voice:stt-completed', handler)
      return () => ipcRenderer.removeListener('voice:stt-completed', handler)
    },
    // 复刻完成监听（status='ready'）
    onCloneCompleted: (
      callback: (data: { id: string; status: 'ready'; voiceId?: string }) => void,
    ) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('voice:clone-completed', handler)
      return () => ipcRenderer.removeListener('voice:clone-completed', handler)
    },
    // 复刻失败监听（status='failed'）
    onCloneFailed: (
      callback: (data: { id: string; status: 'failed'; errorMessage?: string }) => void,
    ) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('voice:clone-failed', handler)
      return () => ipcRenderer.removeListener('voice:clone-failed', handler)
    },
    // 下载音频
    download: (audioPath: string) => ipcRenderer.invoke('voice:download', audioPath),

    // ===== 声音设计（通过文本描述创建音色）=====
    // 创建声音设计
    designVoice: (request: {
      name: string
      voicePrompt: string
      prefix: string
      targetModel?: string
      providerId?: string
    }) => ipcRenderer.invoke('voice:design', request),
    // 获取设计音色列表
    getDesignedVoices: (status?: 'training' | 'ready' | 'failed') =>
      ipcRenderer.invoke('voice:designed-list', status),
    // 删除设计音色
    deleteDesignedVoice: (id: string) => ipcRenderer.invoke('voice:designed-delete', id),
    // 刷新设计音色状态
    refreshDesignStatus: (id: string) => ipcRenderer.invoke('voice:design-refresh-status', id),
    // 试听设计音色
    previewDesignedVoice: (id: string) => ipcRenderer.invoke('voice:design-preview', id)
  },

  // 数据路径相关
  dataPath: {
    // 获取数据路径配置
    getConfig: () => ipcRenderer.invoke('data-path:get-config'),
    // 选择数据路径
    select: () => ipcRenderer.invoke('data-path:select'),
    // 设置数据路径
    set: (newPath: string, migrate?: boolean) => ipcRenderer.invoke('data-path:set', newPath, migrate),
    // 重置为默认路径
    reset: (migrate?: boolean) => ipcRenderer.invoke('data-path:reset', migrate),
    // 获取迁移状态
    getMigrationStatus: () => ipcRenderer.invoke('data-path:migration-status'),
    // 计算数据大小
    calculateSize: () => ipcRenderer.invoke('data-path:calculate-size'),
    // 打开数据目录
    openFolder: () => ipcRenderer.invoke('data-path:open-folder')
  },

  // 知识库相关
  knowledgeBase: {
    // 获取知识库列表
    list: () => ipcRenderer.invoke('knowledge-base:list'),
    // 知识库目录（分组/分类）
    listFolders: () => ipcRenderer.invoke('kb:folder-list'),
    createFolder: (name: string) => ipcRenderer.invoke('kb:folder-create', name),
    renameFolder: (id: string, name: string) => ipcRenderer.invoke('kb:folder-rename', { id, name }),
    deleteFolder: (id: string) => ipcRenderer.invoke('kb:folder-delete', id),
    // D1 QA 问答对
    listQaPairs: (knowledgeBaseId: string, keyword?: string) => ipcRenderer.invoke('kb-qa:list', { knowledgeBaseId, keyword }),
    addQaPair: (p: { knowledgeBaseId: string; question: string; answer: string; similarQuestions?: string[] }) => ipcRenderer.invoke('kb-qa:add', p),
    updateQaPair: (p: { id: string; question?: string; answer?: string; similarQuestions?: string[] }) => ipcRenderer.invoke('kb-qa:update', p),
    deleteQaPair: (id: string) => ipcRenderer.invoke('kb-qa:delete', { id }),
    searchQa: (p: { knowledgeBaseId: string; query: string; topK?: number; threshold?: number }) => ipcRenderer.invoke('kb-qa:search', p),
    importQaXlsx: (knowledgeBaseId: string, base64: string) => ipcRenderer.invoke('kb-qa:import-xlsx', { knowledgeBaseId, base64 }),
    exportQaXlsx: (knowledgeBaseId: string) => ipcRenderer.invoke('kb-qa:export-xlsx', { knowledgeBaseId }),
    // 获取知识库详情
    get: (id: string) => ipcRenderer.invoke('knowledge-base:get', id),
    // 创建知识库
    create: (data: {
      name: string
      description?: string
      embeddingModel: string
      embeddingProvider: 'cloud' | 'local'
      embeddingDimension: number
      providerConfigId?: string
      ollamaBaseUrl?: string
      folderId?: string | null
    }) => ipcRenderer.invoke('knowledge-base:create', data),
    // 更新知识库
    update: (id: string, data: Partial<{
      name: string
      description: string
      rerankConfig?: string | null
      folderId?: string | null
    }>) => ipcRenderer.invoke('knowledge-base:update', { id, request: data }),
    // 删除知识库
    delete: (id: string) => ipcRenderer.invoke('knowledge-base:delete', id),
    // 添加文档（直接添加文本内容）
    addDocument: (knowledgeBaseId: string, data: {
      name: string
      type: 'text'
      content: string
      source?: DocumentSource
    }) => ipcRenderer.invoke('knowledge-base:add-document', { knowledgeBaseId, data }),
    // 添加网页
    addWebpage: (knowledgeBaseId: string, url: string) =>
      ipcRenderer.invoke('knowledge-base:add-webpage', { knowledgeBaseId, url }),
    // 上传文档
    uploadDocuments: (knowledgeBaseId: string, files: Array<{
      path: string
      name: string
      size: number
    }>) => ipcRenderer.invoke('knowledge-base:upload-documents', { knowledgeBaseId, files }),
    // 获取文档列表
    getDocuments: (knowledgeBaseId: string) => ipcRenderer.invoke('knowledge-base:get-documents', knowledgeBaseId),
    // 删除文档
    deleteDocument: (documentId: string) => ipcRenderer.invoke('knowledge-base:delete-document', documentId),
    // 重新处理文档
    reprocessDocument: (documentId: string) => ipcRenderer.invoke('knowledge-base:reprocess-document', documentId),
    // 获取文档分片
    getDocumentChunks: (documentId: string) => ipcRenderer.invoke('knowledge-base:get-document-chunks', documentId),
    // 分页获取文档分片（可选按章节过滤，M5 章节树定位）
    getDocumentChunksPaginated: (documentId: string, page: number, pageSize: number, chapterTitle?: string) =>
      ipcRenderer.invoke('knowledge-base:get-document-chunks-paginated', { documentId, page, pageSize, chapterTitle }),
    // 获取单个切片详情
    getChunk: (chunkId: string) => ipcRenderer.invoke('knowledge-base:get-chunk', chunkId),
    // 章节树 + 摘要进度（M2）
    getChapterTree: (documentId: string) =>
      ipcRenderer.invoke('knowledge-base:get-chapter-tree', { documentId }),
    // 章节摘要生成/重试（M2；自动调度在处理完成后异步进行）
    summarizeDocument: (documentId: string, retryFailed?: boolean) =>
      ipcRenderer.invoke('knowledge-base:summarize-document', { documentId, retryFailed }),
    // 检索知识库
    search: (request: {
      knowledgeBaseId: string
      query: string
      topK?: number
      vectorWeight?: number
      threshold?: number
    }) => ipcRenderer.invoke('knowledge-base:search', request),
    // 获取可用的 Embedding 模型
    getEmbeddingModels: () => ipcRenderer.invoke('knowledge-base:get-embedding-models'),
    getRerankModels: () => ipcRenderer.invoke('knowledge-base:get-rerank-models'),
    // 选择文件
    selectFiles: () => ipcRenderer.invoke('knowledge-base:select-files'),
    // 获取文件限制信息
    getFileLimits: () => ipcRenderer.invoke('knowledge-base:get-file-limits'),
    // 监听文档处理进度
    onDocumentProgress: (callback: (data: { documentId: string; progress: number; estimatedSeconds?: number }) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('kb:document-progress', handler)
      return () => ipcRenderer.removeListener('kb:document-progress', handler)
    },
    // 监听文档状态变化
    onDocumentStatus: (callback: (data: { documentId: string; status: string; chunkCount?: number; errorMessage?: string }) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('kb:document-status', handler)
      return () => ipcRenderer.removeListener('kb:document-status', handler)
    },
    // 监听知识库统计更新
    onStatsUpdate: (callback: (data: { id: string; documentCount: number; vectorCount: number; totalSize: number }) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('kb:stats', handler)
      return () => ipcRenderer.removeListener('kb:stats', handler)
    }
  },

  // 领域共学空间（dl:* 全部由 domain-learning 包 handler 提供，返回 { success, data?, error? }）
  domainLearning: {
    // 空间列表（Home 卡片；无参 → DlSpaceSummary[]）
    listSpaces: () => ipcRenderer.invoke('dl:list-spaces'),
    // 新建空间（name/goal 必填 → { id }；profileId/profile 画像；kbId 可绑定项目知识库）
    createSpace: (p: { name: string; goal: string; tagline?: string; description?: string; profileId?: string; profile?: Record<string, unknown> | null; kbId?: string | null }) =>
      ipcRenderer.invoke('dl:create-space', p),
    // 绑定/改绑项目知识库（M4-B → { kbId }）
    setSpaceKb: (p: { id: string; kbId?: string | null }) => ipcRenderer.invoke('dl:set-space-kb', p),
    // 主题学习前置要求（2026-09-12：整个领域的学习门槛；读 → DlSpacePrereq[]，写 → { prerequisites }）
    getSpacePrereqs: (id: string) => ipcRenderer.invoke('dl:get-space-prereqs', { id }),
    setSpacePrereqs: (p: { id: string; prerequisites: Array<{ name: string; why?: string; level?: string; inSpace?: boolean }> }) =>
      ipcRenderer.invoke('dl:set-space-prereqs', p),
    // 空间行详情（DlProjectRow；本版界面少用）
    getSpace: (id: string) => ipcRenderer.invoke('dl:get-space', { id }),
    // 切换空间状态（active / paused / archived → { ok }）
    setSpaceStatus: (id: string, status: 'active' | 'paused' | 'archived') =>
      ipcRenderer.invoke('dl:set-space-status', { id, status }),
    // 三栏空间聚合视图（Space 页主数据源 → DlSpaceView | null）
    getSpaceView: (id: string) => ipcRenderer.invoke('dl:get-space-view', { id }),
    // Atlas 知识全景图（→ DlAtlasGraph | null）
    getAtlasGraph: (id: string) => ipcRenderer.invoke('dl:get-atlas-graph', { id }),
    // Atlas 节点档案（右栏 → DlNodeProfile | null）
    getNodeProfile: (id: string, nodeId: string) => ipcRenderer.invoke('dl:get-node-profile', { id, nodeId }),
    // 推荐下一个待学概念（→ conceptId | null）
    pickNext: (id: string) => ipcRenderer.invoke('dl:pick-next', { id }),
    // 手工追加知识点（2026-09-12：用户建点；勾选的前置直连为已确认边 → DlCreateConceptResult）
    saveConcept: (p: {
      id: string
      name: string
      nodeType?: string
      parentId?: string | null
      definitionShort?: string | null
      en?: string | null
      prerequisites?: string[]
    }) => ipcRenderer.invoke('dl:save-concept', p),
    // 标记「懂了」（前置全就绪才放行 → { ok }）
    ackMastered: (id: string, conceptId: string) => ipcRenderer.invoke('dl:ack-mastered', { id, conceptId }),
    // 标记「没懂」（sectionKey 定位到讲义区 → { confusedCount, splitSuggested }）
    ackConfused: (id: string, conceptId: string, sectionKey?: string) =>
      ipcRenderer.invoke('dl:ack-confused', { id, conceptId, sectionKey }),
    // 人工确认关系（→ { ok }）
    confirmRelation: (p: { id: string; sourceId: string; targetId: string; relationType: string; evidence?: string }) =>
      ipcRenderer.invoke('dl:confirm-relation', p),
    // 未解问题队列（→ DlQuestionView[]，DTO 化剔 userId/Date）
    listQuestions: (id: string) => ipcRenderer.invoke('dl:list-questions', { id }),
    // Agent 发送（research=研究概念/未解问题产出讲义草稿；tutor=追问答疑 → DlAgentSendResult）
    agentSend: (p: { mode: 'research' | 'tutor' | 'task'; spaceId: string; conceptId?: string | null; message: string; providerConfigId?: string; modelId?: string; focusQuestionId?: string }) =>
      ipcRenderer.invoke('dl:agent-send', p),
    // Agent 取消（该 scope 在途轮次）
    agentCancel: (p: { mode: 'research' | 'tutor' | 'task'; spaceId: string; conceptId?: string | null }) =>
      ipcRenderer.invoke('dl:agent-cancel', p),
    // Agent 忙碌查询（该 scope 是否有在途轮次）
    agentBusy: (p: { mode: 'research' | 'tutor' | 'task'; spaceId: string; conceptId?: string | null }) =>
      ipcRenderer.invoke('dl:agent-busy', p),
    // 讲义发布（draft→published 人审确认；2026-09-09 复盘补闭环）
    publishCard: (p: { id: string; cardId: string }) => ipcRenderer.invoke('dl:publish-card', p),
    // 周期推进配置（M2-C：dl:get-space-pace / dl:set-space-pace / dl:scheduler-state）
    getSpacePace: (id: string) => ipcRenderer.invoke('dl:get-space-pace', { id }),
    setSpacePace: (p: {
      id: string
      pace: { enabled: boolean; intervalMin: number; autoResearchConcepts: boolean; autoResolveOpenQuestions: boolean }
    }) => ipcRenderer.invoke('dl:set-space-pace', p),
    schedulerState: () => ipcRenderer.invoke('dl:scheduler-state'),
    // Atlas 增强视图与画像（M2-E）
    getAtlasViews: (id: string) => ipcRenderer.invoke('dl:get-atlas-views', { id }),
    setSpaceProfile: (p: { id: string; profileId?: string | null; profile?: Record<string, unknown> | null }) =>
      ipcRenderer.invoke('dl:set-space-profile', p),
    // 统计与导出（M3-C）
    getSpaceStats: (id: string) => ipcRenderer.invoke('dl:get-space-stats', { id }),
    exportLessonDigest: (id: string) => ipcRenderer.invoke('dl:export-lesson-digest', { id }),
    // 间隔复习（M3-B）
    getSpaceReview: (id: string) => ipcRenderer.invoke('dl:get-space-review', { id }),
    setSpaceReview: (p: {
      id: string
      review: { enabled: boolean; intervalMin: number; limit: number }
    }) => ipcRenderer.invoke('dl:set-space-review', p),
    reviewDue: (id: string) => ipcRenderer.invoke('dl:review-due', { id }),
    ackNeedReview: (p: { id: string; conceptId: string }) => ipcRenderer.invoke('dl:ack-need-review', p),
    reviewDone: (p: { id: string; conceptId: string }) => ipcRenderer.invoke('dl:review-done', p),
    // 概念笔记（M4-UX1）
    listNotes: (p: { id: string; conceptId?: string | null }) => ipcRenderer.invoke('dl:list-notes', p),
    createNote: (p: {
      id: string
      conceptId?: string | null
      source: 'selection' | 'qna'
      anchorText?: string | null
      anchorStart?: number | null
      anchorEnd?: number | null
      questionId?: string | null
      contentMd: string
    }) => ipcRenderer.invoke('dl:create-note', p),
    deleteNote: (p: { id: string; noteId: string }) => ipcRenderer.invoke('dl:delete-note', p),
    // 订阅 agent 动作事件（通道 dl:agent:<spaceId>[:<conceptId>]；返回取消订阅函数）
    onAgentEvent: (
      spaceId: string,
      conceptId: string | null | undefined,
      callback: (event: any) => void,
    ) => {
      const channel = dlAgentEventChannel(spaceId, conceptId)
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    },
    // 订阅流式正文（通道 dl:generate:<eventId>；增量 { type:'content', content }；返回取消订阅函数）
    onStream: (eventId: string, callback: (event: { type: string; content?: string; error?: string }) => void) => {
      const channel = dlStreamChannel(eventId)
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    }
  },

  // 人像设计相关
  portrait: {
    // 项目管理
    createProject: (data: {
      name: string
      description?: string
    }) => ipcRenderer.invoke('portrait:create-project', data),
    listProjects: (page?: number, pageSize?: number) =>
      ipcRenderer.invoke('portrait:list-projects', page, pageSize),
    getProject: (id: string) => ipcRenderer.invoke('portrait:get-project', id),
    updateProject: (data: { id: string; name?: string; description?: string; defaultProviderId?: string; defaultModelId?: string }) =>
      ipcRenderer.invoke('portrait:update-project', data),
    deleteProject: (id: string) => ipcRenderer.invoke('portrait:delete-project', id),

    // 角色管理
    createCharacter: (data: {
      projectId: string
      name: string
      gender: 'male' | 'female'
      age: number
      height: number
      weight: number
      race: 'asian' | 'european'
      description?: string
      prompt?: string
      referenceImages?: string[]
      providerId?: string
      modelId?: string
      config?: {
        angles?: ('front' | 'left' | 'right' | 'back')[]
        backgroundType?: 'solid' | 'transparent'
        backgroundColor?: string
      }
    }) => ipcRenderer.invoke('portrait:create-character', data),
    listCharacters: (projectId: string) =>
      ipcRenderer.invoke('portrait:list-characters', projectId),
    getCharacter: (id: string) => ipcRenderer.invoke('portrait:get-character', id),
    updateCharacter: (data: {
      id: string
      name?: string
      gender?: 'male' | 'female'
      age?: number
      height?: number
      weight?: number
      race?: 'asian' | 'european'
      description?: string
      prompt?: string
      referenceImages?: string[]
      providerId?: string
      modelId?: string
      config?: {
        angles?: ('front' | 'left' | 'right' | 'back')[]
        backgroundType?: 'solid' | 'transparent'
        backgroundColor?: string
      }
    }) => ipcRenderer.invoke('portrait:update-character', data),
    deleteCharacter: (id: string) => ipcRenderer.invoke('portrait:delete-character', id),

    // 生成人物
    generate: (request: {
      characterId?: string
      prompt: string
      negativePrompt?: string
      referenceImages?: string[]
      providerId: string
      modelId: string
      config: {
        angles: ('front' | 'left' | 'right' | 'back')[]
        backgroundType?: 'solid' | 'transparent'
        backgroundColor?: string
        width?: number
        height?: number
        seed?: number
      }
    }) => ipcRenderer.invoke('portrait:generate', request),

    // 换衣
    changeClothes: (request: {
      characterId: string
      variantId?: string
      clothesDescription: string
      angles: ('front' | 'left' | 'right' | 'back')[]
      width?: number
      height?: number
    }) => ipcRenderer.invoke('portrait:change-clothes', request),

    // 换背景
    changeBackground: (request: {
      characterId: string
      variantId?: string
      backgroundType: 'solid' | 'preset' | 'custom'
      backgroundColor?: string
      presetScene?: string
      customDescription?: string
      angles: ('front' | 'left' | 'right' | 'back')[]
      width?: number
      height?: number
    }) => ipcRenderer.invoke('portrait:change-background', request),

    // 变体管理
    getVariant: (variantId: string) => ipcRenderer.invoke('portrait:get-variant', variantId),
    listVariants: (characterId: string) => ipcRenderer.invoke('portrait:list-variants', characterId),
    deleteVariant: (id: string) => ipcRenderer.invoke('portrait:delete-variant', id),
    editImage: (request: {
      characterId: string
      variantId: string
      editPrompt: string
      width?: number
      height?: number
    }) => ipcRenderer.invoke('portrait:edit-image', request),

    // 生成多角度（第二步）
    generateAngles: (request: {
      characterId: string
      angles: ('front' | 'left' | 'right' | 'back')[]
      variantId?: string // 可选：基于哪个变体生成
      prompt?: string // 追加提示词（可选）
      negativePrompt?: string // 追加反向提示词（可选）
      width?: number
      height?: number
    }) => ipcRenderer.invoke('portrait:generate-angles', request),

    // 新版人像设计（spec 2026-07-24）：基于半身扩展全身
    generateFullBody: (request: {
      characterId: string
      sourceVariantId: string
      prompt?: string
      negativePrompt?: string
      referenceImages?: string[]
      providerId?: string
      modelId?: string
      strength?: number
      width?: number
      height?: number
    }) => ipcRenderer.invoke('portrait:generate-full-body', request),

    // 新版人像设计：只修改面部
    editFace: (request: {
      characterId: string
      variantId: string
      facePrompt?: string
      faceTemplateId?: string
      referenceImages?: string[]
      strength?: number
      focusRegion?: 'face' | 'face_and_hair' | 'upper'
      width?: number
      height?: number
    }) => ipcRenderer.invoke('portrait:edit-face', request),

    // 新版人像设计：提示词模板
    promptTemplate: {
      list: (category?: 'face' | 'body' | 'clothing' | 'background') =>
        ipcRenderer.invoke('portrait:prompt-template:list', category),
      apply: (templateId: string, vars: Record<string, string | number>) =>
        ipcRenderer.invoke('portrait:prompt-template:apply', templateId, vars),
      save: (input: {
        id?: string
        name: string
        category: 'face' | 'body' | 'clothing' | 'background'
        content: string
        applyTo: ('generate' | 'regenerate' | 'face' | 'clothes')[]
        sortOrder?: number
      }) => ipcRenderer.invoke('portrait:prompt-template:save', input),
      delete: (id: string) => ipcRenderer.invoke('portrait:prompt-template:delete', id)
    },

    // 面容几何工作室：算法变形结果保存（spec 2026-07-25）
    saveFaceVariant: (request: {
      characterId: string
      sourceVariantId: string
      dataUrl: string
      faceParams?: Record<string, number>
    }) => ipcRenderer.invoke('portrait:save-face-variant', request),

    // 导出
    export: (request: {
      characterId: string
      variantIds?: string[]
      type: 'single' | 'grid' | 'zip'
      gridLayout?: 'horizontal' | 'vertical' | '2x2'
    }) => ipcRenderer.invoke('portrait:export', request),

    // 监听生成事件
    onGenerationEvent: (callback: (data: {
      type: 'generation-started' | 'generation-progress' | 'generation-completed' | 'generation-failed'
      characterId: string
      angle?: string
      progress?: number
      variants?: any[]
      error?: string
    }) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('portrait:generation-event', handler)
      return () => ipcRenderer.removeListener('portrait:generation-event', handler)
    }
  },

  // 搜索引擎相关
  searchEngine: {
    // 获取模板列表
    getTemplates: () => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_ENGINE_TEMPLATES),
    // 获取配置列表
    list: () => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_ENGINE_LIST),
    // 获取单个配置
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_ENGINE_GET, id),
    // 创建配置
    create: (data: {
      templateId: string
      name: string
      apiKey?: string
      extraConfig?: Record<string, unknown>
      maxResults?: number
      isEnabled?: boolean
      isDefault?: boolean
    }) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_ENGINE_CREATE, data),
    // 更新配置
    update: (id: string, data: Partial<{
      name: string
      apiKey: string
      extraConfig: Record<string, unknown>
      maxResults: number
      isEnabled: boolean
      isDefault: boolean
    }>) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_ENGINE_UPDATE, { id, data }),
    // 删除配置
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_ENGINE_DELETE, id),
    // 测试配置
    test: (data: {
      configId?: string
      templateId?: string
      apiKey?: string
      extraConfig?: Record<string, unknown>
    }) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_ENGINE_TEST, data),
    // 设置默认配置
    setDefault: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_ENGINE_SET_DEFAULT, id),
    // 执行搜索
    search: (request: {
      query: string
      engine: string
      configId?: string
      maxResults?: number
    }) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_ENGINE_SEARCH, request),
    // 获取被禁用的快速搜索引擎列表
    getDisabledQuickEngines: () => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_ENGINE_GET_DISABLED_QUICK),
    // 设置快速搜索引擎启用状态
    setQuickEngineEnabled: (engineId: string, enabled: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.SEARCH_ENGINE_SET_QUICK_ENABLED, { engineId, enabled }),
    // 监听配置变化
    onChanged: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on(IPC_CHANNELS.SEARCH_ENGINE_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SEARCH_ENGINE_CHANGED, handler)
    }
  },

  // 长文写作相关
  longwriting: {
    // 项目管理
    getProjects: () => ipcRenderer.invoke('longwriting:getProjects'),
    getProject: (id: string) => ipcRenderer.invoke('longwriting:getProject', id),
    createProject: (data: { name: string; type: 'story' | 'comment' }) =>
      ipcRenderer.invoke('longwriting:createProject', data),
    updateProject: (id: string, data: { name?: string; stage?: string; progress?: number }) =>
      ipcRenderer.invoke('longwriting:updateProject', id, data),
    deleteProject: (id: string) => ipcRenderer.invoke('longwriting:deleteProject', id),

    // 故事概要
    getStoryOverview: (projectId: string) =>
      ipcRenderer.invoke('longwriting:getStoryOverview', projectId),
    updateStoryOverview: (projectId: string, data: any) =>
      ipcRenderer.invoke('longwriting:updateStoryOverview', projectId, data),
    lockStoryOverview: (projectId: string, locked: boolean) =>
      ipcRenderer.invoke('longwriting:lockStoryOverview', projectId, locked),

    // 背景设定
    getBackground: (projectId: string) =>
      ipcRenderer.invoke('longwriting:getBackground', projectId),
    updateBackground: (projectId: string, data: any) =>
      ipcRenderer.invoke('longwriting:updateBackground', projectId, data),

    // 地点管理
    getLocations: (projectId: string) =>
      ipcRenderer.invoke('longwriting:getLocations', projectId),
    getLocation: (id: string) => ipcRenderer.invoke('longwriting:getLocation', id),
    createLocation: (data: any) => ipcRenderer.invoke('longwriting:createLocation', data),
    updateLocation: (id: string, data: any) =>
      ipcRenderer.invoke('longwriting:updateLocation', id, data),
    deleteLocation: (id: string) => ipcRenderer.invoke('longwriting:deleteLocation', id),

    // 势力管理
    getFactions: (projectId: string) =>
      ipcRenderer.invoke('longwriting:getFactions', projectId),
    getFactionsByType: (projectId: string, factionType: string) =>
      ipcRenderer.invoke('longwriting:getFactionsByType', projectId, factionType),
    getFaction: (id: string) => ipcRenderer.invoke('longwriting:getFaction', id),
    createFaction: (data: any) => ipcRenderer.invoke('longwriting:createFaction', data),
    updateFaction: (id: string, data: any) =>
      ipcRenderer.invoke('longwriting:updateFaction', id, data),
    deleteFaction: (id: string) => ipcRenderer.invoke('longwriting:deleteFaction', id),
    reorderFactions: (orderList: { id: string; order: number }[]) =>
      ipcRenderer.invoke('longwriting:reorderFactions', orderList),

    // 地图管理
    getMaps: (projectId: string) => ipcRenderer.invoke('longwriting:getMaps', projectId),
    getMap: (id: string) => ipcRenderer.invoke('longwriting:getMap', id),
    createMap: (data: { projectId: string; name: string; orientation?: string; characteristics?: string }) =>
      ipcRenderer.invoke('longwriting:createMap', data),
    updateMap: (id: string, data: any) => ipcRenderer.invoke('longwriting:updateMap', id, data),
    deleteMap: (id: string) => ipcRenderer.invoke('longwriting:deleteMap', id),
    generateMapData: (eventId: string, projectId: string, mapId: string, prompt: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:generateMapData', eventId, projectId, mapId, prompt, providerConfigId, modelId),
    generateMapImage: (projectId: string, mapId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:generateMapImage', projectId, mapId, providerConfigId, modelId),

    // 情节管理
    getPlots: (projectId: string) =>
      ipcRenderer.invoke('longwriting:getPlots', projectId),
    getPlot: (id: string) => ipcRenderer.invoke('longwriting:getPlot', id),
    createPlot: (data: { projectId: string; title: string; summary: string; involvedCharacters?: string[]; involvedLocations?: string[]; notes?: string }) =>
      ipcRenderer.invoke('longwriting:createPlot', data),
    batchCreatePlots: (projectId: string, plots: { title: string; summary: string; involvedCharacters?: string[] }[]) =>
      ipcRenderer.invoke('longwriting:batchCreatePlots', projectId, plots),
    updatePlot: (id: string, data: any) =>
      ipcRenderer.invoke('longwriting:updatePlot', id, data),
    reorderPlots: (projectId: string, orderList: { id: string; order: number }[]) =>
      ipcRenderer.invoke('longwriting:reorderPlots', projectId, orderList),
    deletePlot: (id: string) => ipcRenderer.invoke('longwriting:deletePlot', id),
    getPlotCount: (projectId: string) =>
      ipcRenderer.invoke('longwriting:getPlotCount', projectId),

    // 角色管理
    getCharacters: (projectId: string) =>
      ipcRenderer.invoke('longwriting:getCharacters', projectId),
    getCharacter: (id: string) => ipcRenderer.invoke('longwriting:getCharacter', id),
    createCharacter: (data: any) => ipcRenderer.invoke('longwriting:createCharacter', data),
    updateCharacter: (id: string, data: any) =>
      ipcRenderer.invoke('longwriting:updateCharacter', id, data),
    deleteCharacter: (id: string) => ipcRenderer.invoke('longwriting:deleteCharacter', id),
    linkPortrait: (characterId: string, portraitId: string) =>
      ipcRenderer.invoke('longwriting:linkPortrait', characterId, portraitId),
    unlinkPortrait: (characterId: string) =>
      ipcRenderer.invoke('longwriting:unlinkPortrait', characterId),

    // 角色关系
    getCharacterRelations: (characterId: string) =>
      ipcRenderer.invoke('longwriting:getCharacterRelations', characterId),
    createCharacterRelation: (data: any) =>
      ipcRenderer.invoke('longwriting:createCharacterRelation', data),
    deleteCharacterRelation: (id: string) =>
      ipcRenderer.invoke('longwriting:deleteCharacterRelation', id),

    // 角色与人像同步
    getCharacterByPortraitId: (portraitId: string) =>
      ipcRenderer.invoke('longwriting:getCharacterByPortraitId', portraitId),
    syncCharacterToPortrait: (portraitId: string, characterData: any) =>
      ipcRenderer.invoke('longwriting:syncCharacterToPortrait', portraitId, characterData),

    // 技能管理
    getSkills: (projectId: string) =>
      ipcRenderer.invoke('longwriting:getSkills', projectId),
    getSkill: (id: string) => ipcRenderer.invoke('longwriting:getSkill', id),
    createSkill: (data: any) => ipcRenderer.invoke('longwriting:createSkill', data),
    updateSkill: (id: string, data: any) =>
      ipcRenderer.invoke('longwriting:updateSkill', id, data),
    deleteSkill: (id: string) => ipcRenderer.invoke('longwriting:deleteSkill', id),

    // 物品管理
    getItems: (projectId: string) =>
      ipcRenderer.invoke('longwriting:getItems', projectId),
    getItem: (id: string) => ipcRenderer.invoke('longwriting:getItem', id),
    createItem: (data: any) => ipcRenderer.invoke('longwriting:createItem', data),
    updateItem: (id: string, data: any) =>
      ipcRenderer.invoke('longwriting:updateItem', id, data),
    deleteItem: (id: string) => ipcRenderer.invoke('longwriting:deleteItem', id),

    // 素材管理
    getMaterials: (projectId: string) =>
      ipcRenderer.invoke('longwriting:getMaterials', projectId),
    getMaterial: (id: string) => ipcRenderer.invoke('longwriting:getMaterial', id),
    createMaterial: (data: any) => ipcRenderer.invoke('longwriting:createMaterial', data),
    updateMaterial: (id: string, data: any) =>
      ipcRenderer.invoke('longwriting:updateMaterial', id, data),
    updateMaterialStatus: (id: string, status: string, errorMessage?: string) =>
      ipcRenderer.invoke('longwriting:updateMaterialStatus', id, status, errorMessage),
    deleteMaterial: (id: string) => ipcRenderer.invoke('longwriting:deleteMaterial', id),
    processMaterial: (id: string) => ipcRenderer.invoke('longwriting:processMaterial', id),

    // 大纲管理
    getOutlineTree: (projectId: string) =>
      ipcRenderer.invoke('longwriting:getOutlineTree', projectId),
    getOutline: (id: string) => ipcRenderer.invoke('longwriting:getOutline', id),
    createOutline: (data: any) => ipcRenderer.invoke('longwriting:createOutline', data),
    updateOutline: (id: string, data: any) =>
      ipcRenderer.invoke('longwriting:updateOutline', id, data),
    deleteOutline: (id: string) => ipcRenderer.invoke('longwriting:deleteOutline', id),
    moveOutline: (id: string, newParentId: string | null) =>
      ipcRenderer.invoke('longwriting:moveOutline', id, newParentId),

    // 章节管理
    getChapter: (outlineId: string) => ipcRenderer.invoke('longwriting:getChapter', outlineId),
    getChaptersByOutlineIds: (outlineIds: string[]) =>
      ipcRenderer.invoke('longwriting:getChaptersByOutlineIds', outlineIds),
    saveChapter: (outlineId: string, content: string) =>
      ipcRenderer.invoke('longwriting:saveChapter', outlineId, content),
    getChapterVersions: (chapterId: string) =>
      ipcRenderer.invoke('longwriting:getChapterVersions', chapterId),
    restoreChapterVersion: (chapterId: string, versionId: string) =>
      ipcRenderer.invoke('longwriting:restoreChapterVersion', chapterId, versionId),
    lockChapterVersion: (versionId: string) =>
      ipcRenderer.invoke('longwriting:lockChapterVersion', versionId),

    // AI 生成（eventId 作为第一个参数）
    generateStoryOverview: (eventId: string, projectId: string, input: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:generateStoryOverview', eventId, projectId, input, providerConfigId, modelId),
    generateCharacters: (eventId: string, projectId: string, providerConfigId?: string, modelId?: string, requirements?: string) =>
      ipcRenderer.invoke('longwriting:generateCharacters', eventId, projectId, providerConfigId, modelId, requirements),
    generateSkillsItems: (eventId: string, projectId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:generateSkillsItems', eventId, projectId, providerConfigId, modelId),
    generateSkillItemTypes: (eventId: string, projectId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:generateSkillItemTypes', eventId, projectId, providerConfigId, modelId),
    generateSkillsOnly: (eventId: string, projectId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:generateSkillsOnly', eventId, projectId, providerConfigId, modelId),
    generateItemsOnly: (eventId: string, projectId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:generateItemsOnly', eventId, projectId, providerConfigId, modelId),
    generatePlots: (eventId: string, projectId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:generatePlots', eventId, projectId, providerConfigId, modelId),
    polishBackground: (eventId: string, projectId: string, field: 'eraDescription' | 'socialStructure' | 'techLevel' | 'specialRules' | 'factionDistribution' | 'geographicOrientation', eraType: string, content: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:polishBackground', eventId, projectId, field, eraType, content, providerConfigId, modelId),
    generateLocations: (eventId: string, projectId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:generateLocations', eventId, projectId, providerConfigId, modelId),
    generateFactions: (eventId: string, projectId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:generateFactions', eventId, projectId, providerConfigId, modelId),
    generateOutlineStory: (eventId: string, projectId: string, providerConfigId?: string, modelId?: string, structureLevel?: number, opts?: { contentTarget?: 'novel' | 'script'; episodeCount?: number }) =>
      ipcRenderer.invoke('longwriting:generateOutlineStory', eventId, projectId, providerConfigId, modelId, structureLevel, opts),
    generateOutlineComment: (eventId: string, projectId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:generateOutlineComment', eventId, projectId, providerConfigId, modelId),
    generateChapter: (eventId: string, projectId: string, outlineId: string, targetWords?: number, providerConfigId?: string, modelId?: string, style?: string, extraPrompt?: string, options?: { skipChapterCardGate?: boolean }) =>
      ipcRenderer.invoke('longwriting:generateChapter', eventId, projectId, outlineId, targetWords, providerConfigId, modelId, style, extraPrompt, options),
    // 章节工作台（38 号）：上下文预览 + 按勾选上下文生成
    chapterContextPreview: (projectId: string, outlineId: string, opts?: { targetWords?: number; style?: string; extraPrompt?: string }) =>
      ipcRenderer.invoke('longwriting:chapterContextPreview', projectId, outlineId, opts),
    generateChapterWithContext: (eventId: string, projectId: string, outlineId: string, params: { targetWords?: number; style?: string; extraPrompt?: string; enabledItemIds?: string[]; providerConfigId?: string; modelId?: string }) =>
      ipcRenderer.invoke('longwriting:generateChapterWithContext', eventId, projectId, outlineId, params),
    generateSection: (eventId: string, projectId: string, outlineId: string, targetWords?: number, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:generateSection', eventId, projectId, outlineId, targetWords, providerConfigId, modelId),
    generateChapterPrewrite: (eventId: string, projectId: string, outlineId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:generateChapterPrewrite', eventId, projectId, outlineId, providerConfigId, modelId),
    generateChapterCard: (eventId: string, projectId: string, outlineId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:generateChapterCard', eventId, projectId, outlineId, providerConfigId, modelId),

    // AI 生成事件监听
    onGenerateEvent: (eventId: string, callback: (event: any, data: any) => void) => {
      const channel = `longwriting:generate:${eventId}`
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    },

    // 导出功能
    getExportData: (projectId: string) =>
      ipcRenderer.invoke('longwriting:getExportData', projectId),
    exportMarkdown: (projectId: string) =>
      ipcRenderer.invoke('longwriting:exportMarkdown', projectId),
    exportWord: (projectId: string) =>
      ipcRenderer.invoke('longwriting:exportWord', projectId),
    exportChapter: (data: { outlineId: string; content: string; fileName: string; format: string }) =>
      ipcRenderer.invoke('longwriting:exportChapter', data),

    // 全局配置
    getGlobalSettings: () =>
      ipcRenderer.invoke('longwriting:getGlobalSettings'),
    updateGlobalSettings: (data: any) =>
      ipcRenderer.invoke('longwriting:updateGlobalSettings', data),

    // 字典分类管理
    getDictionaryCategories: () =>
      ipcRenderer.invoke('longwriting:getDictionaryCategories'),
    createDictionaryCategory: (code: string, name: string) =>
      ipcRenderer.invoke('longwriting:createDictionaryCategory', code, name),
    updateDictionaryCategory: (code: string, name: string) =>
      ipcRenderer.invoke('longwriting:updateDictionaryCategory', code, name),
    deleteDictionaryCategory: (code: string) =>
      ipcRenderer.invoke('longwriting:deleteDictionaryCategory', code),

    // 字典项管理
    getDictionaryAll: () =>
      ipcRenderer.invoke('longwriting:getDictionaryAll'),
    getDictionaryByCategory: (categoryCode: string) =>
      ipcRenderer.invoke('longwriting:getDictionaryByCategory', categoryCode),
    createDictionaryItem: (categoryCode: string, code: string, name: string) =>
      ipcRenderer.invoke('longwriting:createDictionaryItem', categoryCode, code, name),
    updateDictionaryItem: (id: string, data: { code?: string; name?: string }) =>
      ipcRenderer.invoke('longwriting:updateDictionaryItem', id, data),
    deleteDictionaryItem: (id: string) =>
      ipcRenderer.invoke('longwriting:deleteDictionaryItem', id),
    reorderDictionary: (categoryCode: string, orderedIds: string[]) =>
      ipcRenderer.invoke('longwriting:reorderDictionary', categoryCode, orderedIds),

    // 项目级别类型配置
    getSkillTypeConfigs: (projectId: string) =>
      ipcRenderer.invoke('longwriting:getSkillTypeConfigs', projectId),
    createSkillTypeConfig: (data: any) =>
      ipcRenderer.invoke('longwriting:createSkillTypeConfig', data),
    updateSkillTypeConfig: (id: string, data: any) =>
      ipcRenderer.invoke('longwriting:updateSkillTypeConfig', id, data),
    deleteSkillTypeConfig: (id: string) =>
      ipcRenderer.invoke('longwriting:deleteSkillTypeConfig', id),

    getItemTypeConfigs: (projectId: string) =>
      ipcRenderer.invoke('longwriting:getItemTypeConfigs', projectId),
    createItemTypeConfig: (data: any) =>
      ipcRenderer.invoke('longwriting:createItemTypeConfig', data),
    updateItemTypeConfig: (id: string, data: any) =>
      ipcRenderer.invoke('longwriting:updateItemTypeConfig', id, data),
    deleteItemTypeConfig: (id: string) =>
      ipcRenderer.invoke('longwriting:deleteItemTypeConfig', id),

    initDefaultTypeConfigs: (projectId: string) =>
      ipcRenderer.invoke('longwriting:initDefaultTypeConfigs', projectId),

    // 技能等级配置
    getSkillLevels: (projectId: string, skillTypeCode: string) =>
      ipcRenderer.invoke('longwriting:getSkillLevels', projectId, skillTypeCode),
    createSkillLevel: (data: any) =>
      ipcRenderer.invoke('longwriting:createSkillLevel', data),
    updateSkillLevel: (id: string, data: any) =>
      ipcRenderer.invoke('longwriting:updateSkillLevel', id, data),
    deleteSkillLevel: (id: string) =>
      ipcRenderer.invoke('longwriting:deleteSkillLevel', id),
    reorderSkillLevels: (projectId: string, skillTypeCode: string, orderedIds: string[]) =>
      ipcRenderer.invoke('longwriting:reorderSkillLevels', projectId, skillTypeCode, orderedIds),

    // 物品等级配置
    getItemLevels: (projectId: string, itemTypeCode: string) =>
      ipcRenderer.invoke('longwriting:getItemLevels', projectId, itemTypeCode),
    createItemLevel: (data: any) =>
      ipcRenderer.invoke('longwriting:createItemLevel', data),
    updateItemLevel: (id: string, data: any) =>
      ipcRenderer.invoke('longwriting:updateItemLevel', id, data),
    deleteItemLevel: (id: string) =>
      ipcRenderer.invoke('longwriting:deleteItemLevel', id),
    reorderItemLevels: (projectId: string, itemTypeCode: string, orderedIds: string[]) =>
      ipcRenderer.invoke('longwriting:reorderItemLevels', projectId, itemTypeCode, orderedIds),

    // 章节预写
    getPrewrite: (outlineId: string) =>
      ipcRenderer.invoke('longwriting:getPrewrite', outlineId),
    savePrewrite: (data: any) =>
      ipcRenderer.invoke('longwriting:savePrewrite', data),
    confirmPrewrite: (outlineId: string) =>
      ipcRenderer.invoke('longwriting:confirmPrewrite', outlineId),
    deletePrewrite: (outlineId: string) =>
      ipcRenderer.invoke('longwriting:deletePrewrite', outlineId),

    // 故事记忆
    getMemories: (projectId: string) =>
      ipcRenderer.invoke('longwriting:getMemories', projectId),
    getMemoriesBeforeChapter: (projectId: string, chapterNumber: number) =>
      ipcRenderer.invoke('longwriting:getMemoriesBeforeChapter', projectId, chapterNumber),
    getMemory: (id: string) =>
      ipcRenderer.invoke('longwriting:getMemory', id),
    createMemory: (data: any) =>
      ipcRenderer.invoke('longwriting:createMemory', data),
    batchCreateMemories: (dataList: any[]) =>
      ipcRenderer.invoke('longwriting:batchCreateMemories', dataList),
    updateMemory: (id: string, data: any) =>
      ipcRenderer.invoke('longwriting:updateMemory', id, data),
    deleteMemory: (id: string) =>
      ipcRenderer.invoke('longwriting:deleteMemory', id),
    toggleMemoryActive: (id: string) =>
      ipcRenderer.invoke('longwriting:toggleMemoryActive', id),
    getMemoryStats: (projectId: string) =>
      ipcRenderer.invoke('longwriting:getMemoryStats', projectId),

    // AI 记忆提取
    extractMemories: (projectId: string, outlineId: string, prewriteContent: string, chapterNumber: number, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:extractMemories', projectId, outlineId, prewriteContent, chapterNumber, providerConfigId, modelId),

    // 实体状态快照
    getEntityStateSnapshots: (projectId: string) =>
      ipcRenderer.invoke('longwriting:getEntityStateSnapshots', projectId),
    getEntityStateAtChapter: (projectId: string, entityType: string, entityId: string, chapterNumber: number) =>
      ipcRenderer.invoke('longwriting:getEntityStateAtChapter', projectId, entityType, entityId, chapterNumber),
    getEntitiesStatesForChapter: (projectId: string, chapterNumber: number, entities: Array<{ entityType: string; entityId: string }>) =>
      ipcRenderer.invoke('longwriting:getEntitiesStatesForChapter', projectId, chapterNumber, entities),
    getEntityStatesByChapter: (projectId: string, chapterNumber: number) =>
      ipcRenderer.invoke('longwriting:getEntityStatesByChapter', projectId, chapterNumber),
    getEntityStateSnapshot: (id: string) =>
      ipcRenderer.invoke('longwriting:getEntityStateSnapshot', id),
    createEntityStateSnapshot: (data: any) =>
      ipcRenderer.invoke('longwriting:createEntityStateSnapshot', data),
    batchCreateEntityStateSnapshots: (dataList: any[]) =>
      ipcRenderer.invoke('longwriting:batchCreateEntityStateSnapshots', dataList),
    upsertEntityStateSnapshot: (data: any) =>
      ipcRenderer.invoke('longwriting:upsertEntityStateSnapshot', data),
    updateEntityStateSnapshot: (id: string, data: any) =>
      ipcRenderer.invoke('longwriting:updateEntityStateSnapshot', id, data),
    deleteEntityStateSnapshot: (id: string) =>
      ipcRenderer.invoke('longwriting:deleteEntityStateSnapshot', id),
    deleteEntityStatesByChapter: (projectId: string, chapterNumber: number) =>
      ipcRenderer.invoke('longwriting:deleteEntityStatesByChapter', projectId, chapterNumber),
    getSnapshotStats: (projectId: string) =>
      ipcRenderer.invoke('longwriting:getSnapshotStats', projectId),

    // AI 实体状态提取
    extractEntityStates: (projectId: string, outlineId: string, chapterContent: string, chapterNumber: number, involvedEntities: Array<{ type: string; id: string; name: string }>, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:extractEntityStates', projectId, outlineId, chapterContent, chapterNumber, involvedEntities, providerConfigId, modelId),

    // AI 章节实体识别
    recognizeChapterEntities: (projectId: string, chapterContent: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:recognizeChapterEntities', projectId, chapterContent, providerConfigId, modelId),

    // 数据迁移
    backupDatabase: () => ipcRenderer.invoke('longwriting:backupDatabase'),
    migrateProject: (projectId: string, autoBackup?: boolean) =>
      ipcRenderer.invoke('longwriting:migrateProject', projectId, autoBackup),
    migrateAllProjects: (autoBackup?: boolean) =>
      ipcRenderer.invoke('longwriting:migrateAllProjects', autoBackup),
    checkNeedsMigration: (projectId: string) =>
      ipcRenderer.invoke('longwriting:checkNeedsMigration', projectId),
    getMigrationStats: (projectId: string) =>
      ipcRenderer.invoke('longwriting:getMigrationStats', projectId),

    // 新实体检测
    detectNewEntities: (
      projectId: string,
      text: string,
      sourceOutlineId?: string,
      chapterNumber?: number
    ) => ipcRenderer.invoke('longwriting:detectNewEntities', projectId, text, sourceOutlineId, chapterNumber),

    autoAddEntities: (
      projectId: string,
      characters?: any[],
      locations?: any[],
      items?: any[]
    ) => ipcRenderer.invoke('longwriting:autoAddEntities', projectId, characters, locations, items),

    // 项目步骤模型配置
    getStageModelConfigs: (projectId: string) =>
      ipcRenderer.invoke('longwriting:getStageModelConfigs', projectId),
    getStageModelConfig: (projectId: string, stage: string) =>
      ipcRenderer.invoke('longwriting:getStageModelConfig', projectId, stage),
    setStageModelConfig: (projectId: string, stage: string, providerConfigId: string, modelId: string) =>
      ipcRenderer.invoke('longwriting:setStageModelConfig', projectId, stage, providerConfigId, modelId),
    setStageModelConfigs: (projectId: string, configs: Array<{ stage: string; providerConfigId: string; modelId: string }>) =>
      ipcRenderer.invoke('longwriting:setStageModelConfigs', projectId, configs),

    // 章节状态摘要
    getChapterStateSummaries: (projectId: string) =>
      ipcRenderer.invoke('longwriting:getChapterStateSummaries', projectId),
    getChapterStateSummary: (id: string) =>
      ipcRenderer.invoke('longwriting:getChapterStateSummary', id),
    getChapterStateSummaryByOutline: (outlineId: string) =>
      ipcRenderer.invoke('longwriting:getChapterStateSummaryByOutline', outlineId),
    getLatestChapterStateSummary: (projectId: string) =>
      ipcRenderer.invoke('longwriting:getLatestChapterStateSummary', projectId),
    extractChapterStateSummary: (
      projectId: string,
      outlineId: string,
      chapterNumber: number,
      chapterContent: string,
      providerConfigId?: string,
      modelId?: string
    ) =>
      ipcRenderer.invoke('longwriting:extractChapterStateSummary', projectId, outlineId, chapterNumber, chapterContent, providerConfigId, modelId),
    saveChapterStateSummary: (data: {
      projectId: string
      outlineId: string
      chapterNumber: number
      storyTime: string
      currentLocation: string
      characterStates: string
      pendingEvents: string
      keyChanges: string
    }) =>
      ipcRenderer.invoke('longwriting:saveChapterStateSummary', data),

    // ============ 阶段2：图谱 / 事件 / 向导 / 取消 ============
    graphGet: (projectId: string) =>
      ipcRenderer.invoke('longwriting:graph:getGraph', projectId),
    graphGetNode: (projectId: string, entityType: string, entityId: string) =>
      ipcRenderer.invoke('longwriting:graph:getNode', projectId, entityType, entityId),
    graphResolveEntities: (projectId: string, inputs: Array<{ type: string; name: string }>) =>
      ipcRenderer.invoke('longwriting:graph:resolveEntities', projectId, inputs),
    graphGetTimeline: (projectId: string, entityType: string, entityId: string) =>
      ipcRenderer.invoke('longwriting:graph:getTimeline', projectId, entityType, entityId),
    graphGetStateAtChapter: (projectId: string, entityType: string, entityId: string, chapterNumber: number) =>
      ipcRenderer.invoke('longwriting:graph:getStateAtChapter', projectId, entityType, entityId, chapterNumber),
    graphGetEdgesAtChapter: (projectId: string, entityId: string, chapterNumber: number) =>
      ipcRenderer.invoke('longwriting:graph:getEdgesAtChapter', projectId, entityId, chapterNumber),
    graphGetRelations: (projectId: string, entityType: string, entityId: string, chapterNumber?: number) =>
      ipcRenderer.invoke('longwriting:graph:getRelations', projectId, entityType, entityId, chapterNumber),
    graphGenerateRelations: (eventId: string, projectId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:graph:generateRelations', eventId, projectId, providerConfigId, modelId),
    graphSyncRelations: (projectId: string, relations: any[]) =>
      ipcRenderer.invoke('longwriting:graph:syncRelations', projectId, relations),
    graphAddEdge: (input: any) =>
      ipcRenderer.invoke('longwriting:graph:addEdge', input),
    graphUpdateEdge: (id: string, patch: any) =>
      ipcRenderer.invoke('longwriting:graph:updateEdge', id, patch),
    graphDeleteEdge: (id: string) =>
      ipcRenderer.invoke('longwriting:graph:deleteEdge', id),
    graphEndRelation: (id: string, chapterNumber: number) =>
      ipcRenderer.invoke('longwriting:graph:endRelation', id, chapterNumber),
    graphValidateBeforeGeneration: (projectId: string, outlineId: string, chapterNumber?: number) =>
      ipcRenderer.invoke('longwriting:graph:validateBeforeGeneration', projectId, outlineId, chapterNumber),
    graphScanContradictions: (projectId: string, opts?: { status?: 'pending' | 'all' }) =>
      ipcRenderer.invoke('longwriting:graph:scanContradictions', projectId, opts),
    graphExtractChapter: (
      projectId: string,
      outlineId: string,
      chapterContent: string,
      chapterNumber: number,
      providerConfigId?: string,
      modelId?: string
    ) =>
      ipcRenderer.invoke('longwriting:graph:extractChapterGraph', projectId, outlineId, chapterContent, chapterNumber, providerConfigId, modelId),

    eventGetByChapter: (projectId: string, chapterNumber: number) =>
      ipcRenderer.invoke('longwriting:event:getByChapter', projectId, chapterNumber),
    eventUpdate: (id: string, patch: any) =>
      ipcRenderer.invoke('longwriting:event:update', id, patch),
    eventDelete: (id: string) =>
      ipcRenderer.invoke('longwriting:event:delete', id),

    wizardGetState: (projectId: string) =>
      ipcRenderer.invoke('longwriting:wizard:getState', projectId),
    generateCancel: (eventId: string) =>
      ipcRenderer.invoke('longwriting:generate:cancel', eventId),
    extractChapterEvents: (
      projectId: string,
      outlineId: string,
      chapterContent: string,
      chapterNumber: number,
      providerConfigId?: string,
      modelId?: string
    ) =>
      ipcRenderer.invoke('longwriting:extractChapterEvents', projectId, outlineId, chapterContent, chapterNumber, providerConfigId, modelId),

    // ==================== 故事研讨室（v2.1） ====================
    roomSend: (projectId: string, message: string, opts?: { providerConfigId?: string; modelId?: string }) =>
      ipcRenderer.invoke('longwriting:room:send', projectId, message, opts),
    roomHistory: (projectId: string) =>
      ipcRenderer.invoke('longwriting:room:history', projectId),
    roomState: (projectId: string) =>
      ipcRenderer.invoke('longwriting:room:state', projectId),
    roomCancel: (projectId: string) =>
      ipcRenderer.invoke('longwriting:room:cancel', projectId),
    roomLedgerUpdate: (projectId: string, op: unknown) =>
      ipcRenderer.invoke('longwriting:room:ledger:update', projectId, op),
    roomSetPhase: (projectId: string, phase: string) =>
      ipcRenderer.invoke('longwriting:room:setPhase', projectId, phase),
    roomDistill: (projectId: string, scope: string, opts?: { providerConfigId?: string; modelId?: string }) =>
      ipcRenderer.invoke('longwriting:room:distill', projectId, scope, opts),
    conflictPlan: (projectId: string, conflict: unknown, opts?: { providerConfigId?: string; modelId?: string }) =>
      ipcRenderer.invoke('longwriting:room:conflict:plan', projectId, conflict, opts),
    conflictExecute: (projectId: string, action: string, payload: Record<string, unknown>) =>
      ipcRenderer.invoke('longwriting:room:conflict:execute', projectId, action, payload),
    roomAdoptCard: (projectId: string, cardId: string, patch?: Record<string, unknown>) =>
      ipcRenderer.invoke('longwriting:room:adoptCard', projectId, cardId, patch),
    roomRegenerateCard: (projectId: string, cardId: string, feedback: string, opts?: { providerConfigId?: string; modelId?: string }) =>
      ipcRenderer.invoke('longwriting:room:regenerateCard', projectId, cardId, feedback, opts),
    roomIgnoreCard: (projectId: string, cardId: string) =>
      ipcRenderer.invoke('longwriting:room:ignoreCard', projectId, cardId),
    roomSetTarget: (projectId: string, target: string) =>
      ipcRenderer.invoke('longwriting:room:setTarget', projectId, target),
    roomDesignConfirm: (projectId: string, packageId: string, itemIds?: string[]) =>
      ipcRenderer.invoke('longwriting:room:designConfirm', projectId, packageId, itemIds),
    roomDesignDiscard: (projectId: string, packageId: string) =>
      ipcRenderer.invoke('longwriting:room:designDiscard', projectId, packageId),

    // ==================== 故事圣经统一读模型（P0） ====================
    bibleList: (projectId: string) =>
      ipcRenderer.invoke('longwriting:bible:list', projectId),
    bibleDetail: (projectId: string, kindKey: string, id: string) =>
      ipcRenderer.invoke('longwriting:bible:detail', projectId, kindKey, id),
    bibleCustomCreate: (projectId: string, kindKey: string, name: string, fields: Record<string, unknown> | null, origin?: Record<string, unknown>, parentId?: string | null) =>
      ipcRenderer.invoke('longwriting:bible:custom:create', projectId, kindKey, name, fields, origin, parentId),
    bibleCustomUpdate: (projectId: string, id: string, patch: { name?: string; fields?: Record<string, unknown> | null; parentId?: string | null }) =>
      ipcRenderer.invoke('longwriting:bible:custom:update', projectId, id, patch),
    bibleCustomDelete: (projectId: string, id: string) =>
      ipcRenderer.invoke('longwriting:bible:custom:delete', projectId, id),
    bibleProgression: (projectId: string, kindKey: string, id: string) =>
      ipcRenderer.invoke('longwriting:bible:progression', projectId, kindKey, id),
    bibleForeshadowStatus: (projectId: string, id: string, status: string, payoffChapter?: number | null) =>
      ipcRenderer.invoke('longwriting:bible:foreshadow:status', projectId, id, status, payoffChapter),
    onRoomEvent: (projectId: string, callback: (event: unknown) => void) => {
      const channel = `longwriting:room:${projectId}`
      const listener = (_event: any, data: unknown) => callback(data)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    }
  },

  // 步骤0：向量索引（步骤6 前端面板消费）
  vectorIndex: {
    rebuildProject: (eventId: string, projectId: string) =>
      ipcRenderer.invoke('longwriting:vectorIndex:rebuildProject', eventId, projectId),
    search: (
      projectId: string,
      query: string,
      opts?: {
        entityType?: string
        chapterNumberLte?: number
        topK?: number
        scoreThreshold?: number
      },
    ) => ipcRenderer.invoke('longwriting:vectorIndex:search', projectId, query, opts),
    stats: (projectId: string) =>
      ipcRenderer.invoke('longwriting:vectorIndex:stats', projectId),
    // 进度事件订阅（返回取消订阅函数）
    onProgress: (eventId: string, callback: (data: any) => void) => {
      const channel = `longwriting:vectorIndex:progress:${eventId}`
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    },
  },

  // 日记相关
  diary: {
    listFolders: (parentId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_LIST_FOLDERS, parentId),
    getAllFolders: () =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_GET_ALL_FOLDERS),
    createFolder: (data: { name: string; parentId?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_CREATE_FOLDER, data),
    updateFolder: (id: string, data: { name?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_UPDATE_FOLDER, { id, request: data }),
    deleteFolder: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_DELETE_FOLDER, id),

    listEntries: (folderId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_LIST_ENTRIES, folderId),
    getEntry: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_GET_ENTRY, id),
    createEntry: (data: { folderId: string; title?: string; content?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_CREATE_ENTRY, data),
    updateEntry: (id: string, data: { title?: string; content?: string; tags?: string[] }) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_UPDATE_ENTRY, { id, request: data }),
    deleteEntry: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_DELETE_ENTRY, id),
    moveEntry: (id: string, targetFolderId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_MOVE_ENTRY, { id, targetFolderId }),

    search: (keyword: string, folderId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_SEARCH, { keyword, folderId }),

    getBacklinks: (entryId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_GET_BACKLINKS, entryId),

    exportHtml: (entryId: string, outputPath?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_EXPORT_HTML, { entryId, outputPath }),
    exportPdf: (entryId: string, outputPath?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_EXPORT_PDF, { entryId, outputPath }),
    exportDocx: (entryId: string, outputPath?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_EXPORT_DOCX, { entryId, outputPath })
  },

  // 剧集制作相关
  episodeProduction: {
    // 项目管理
    listProjects: (longWritingProjectId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_LIST_PROJECTS, longWritingProjectId),
    /** FU5-A1 项目卡片聚合视图（项目列表 v2 用） */
    listProjectsSummary: (longWritingProjectId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_LIST_PROJECTS_SUMMARY, longWritingProjectId),
    getProject: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GET_PROJECT, projectId),
    createProject: (name: string, longWritingProjectId?: string, config?: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_CREATE_PROJECT, name, longWritingProjectId, config),
    updateProject: (projectId: string, data: { name?: string; status?: string; config?: any }) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_UPDATE_PROJECT, projectId, data),
    deleteProject: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_DELETE_PROJECT, projectId),

    // 角色绑定
    getCharacterBindings: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GET_CHARACTER_BINDINGS, projectId),
    bindCharacter: (projectId: string, longWritingCharacterId: string, portraitId?: string, voiceConfig?: any, generateConfig?: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_BIND_CHARACTER, projectId, longWritingCharacterId, portraitId, voiceConfig, generateConfig),
    updateCharacterBinding: (bindingId: string, data: { portraitId?: string | null; voiceConfig?: any; generateConfig?: any | null }) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_UPDATE_CHARACTER_BINDING, bindingId, data),
    deleteCharacterBinding: (bindingId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_DELETE_CHARACTER_BINDING, bindingId),

    // 地点绑定
    getLocationBindings: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GET_LOCATION_BINDINGS, projectId),
    bindLocation: (projectId: string, longWritingLocationId: string, locationName: string, imagePaths?: string[], generateConfig?: any, generateImages?: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_BIND_LOCATION, projectId, longWritingLocationId, locationName, imagePaths, generateConfig, generateImages),
    updateLocationBinding: (bindingId: string, data: { imagePaths?: string[]; thumbnailPath?: string | null; generateConfig?: any | null; generateImages?: boolean }) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_UPDATE_LOCATION_BINDING, bindingId, data),
    deleteLocationBinding: (bindingId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_DELETE_LOCATION_BINDING, bindingId),

    // 物品绑定
    getItemBindings: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GET_ITEM_BINDINGS, projectId),
    bindItem: (projectId: string, longWritingItemId: string, itemName: string, imagePaths?: string[], generateConfig?: any, generateImages?: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_BIND_ITEM, projectId, longWritingItemId, itemName, imagePaths, generateConfig, generateImages),
    updateItemBinding: (bindingId: string, data: { imagePaths?: string[]; thumbnailPath?: string | null; generateConfig?: any | null; generateImages?: boolean }) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_UPDATE_ITEM_BINDING, bindingId, data),
    deleteItemBinding: (bindingId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_DELETE_ITEM_BINDING, bindingId),

    // 剧集管理
    listEpisodes: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_LIST_EPISODES, projectId),
    getEpisode: (episodeId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GET_EPISODE, episodeId),
    createEpisode: (projectId: string, data: {
      sourceType: 'outline' | 'uploaded'
      outlineId?: string
      uploadedContent?: string
      episodeNumber: number
      title: string
      storyEra?: string
      storyRegion?: string
      storyBackgroundExtra?: string
    }) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_CREATE_EPISODE, projectId, data),
    updateEpisode: (episodeId: string, data: { title?: string; status?: string; duration?: number; scriptId?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_UPDATE_EPISODE, episodeId, data),
    deleteEpisode: (episodeId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_DELETE_EPISODE, episodeId),

    // 剧本管理
    getScript: (scriptId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GET_SCRIPT, scriptId),
    updateScript: (scriptId: string, data: { synopsis?: string; scenes?: any[]; totalDuration?: number; characterAppearances?: string[]; status?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_UPDATE_SCRIPT, scriptId, data),

    // 场景管理
    listScenes: (episodeScriptId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_LIST_SCENES, episodeScriptId),
    getScene: (sceneId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GET_SCENE, sceneId),
    /** FU8-C3 手动添加场景：partial 不传则用默认空字段 + 自动 sceneNumber */
    createScene: (episodeScriptId: string, partial: any = {}) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_CREATE_SCENE, episodeScriptId, partial),
    updateScene: (sceneId: string, data: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_UPDATE_SCENE, sceneId, data),
    deleteScene: (sceneId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_DELETE_SCENE, sceneId),

    // 分镜管理
    listStoryboards: (sceneScriptId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_LIST_STORYBOARDS, sceneScriptId),
    getStoryboard: (storyboardId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GET_STORYBOARD, storyboardId),
    updateStoryboard: (storyboardId: string, data: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_UPDATE_STORYBOARD, storyboardId, data),
    reorderStoryboards: (sceneScriptId: string, orderedIds: string[]) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.EP_REORDER_STORYBOARDS,
        sceneScriptId,
        orderedIds,
      ),
    deleteStoryboard: (storyboardId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_DELETE_STORYBOARD, storyboardId),
    /** FU5-A9-L2 ④ 分镜配置时绑 panorama_snapshot 作背景 ref（spec §4.5.10） */
    setStoryboardBackgroundRef: (storyboardId: string, imageId: string | null) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.EP_STORYBOARD_SET_BACKGROUND_REF,
        storyboardId,
        imageId,
      ),
    getStoryboardBackgroundRef: (storyboardId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_STORYBOARD_GET_BACKGROUND_REF, storyboardId),

    /**
     * 9 帧故事板预览（spec 2026-05-09 ep-redesign §3.2 B7）
     * 一张大图 → sharp 切片 9 张；返回 frames + sessionDir。
     */
    generateStoryboardThumbnails: (input: {
      episodeScriptId: string
      count?: 9 | 16 | 25
      storySynopsis: string
      styleAnchors?: string[]
    }) => ipcRenderer.invoke(IPC_CHANNELS.EP_STORYBOARD_GENERATE_THUMBNAILS, input),
    /** 用户取消 / 完成挑选时清理 temp 目录 */
    cleanupStoryboardThumbnails: (input: { sessionDir: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_STORYBOARD_CLEANUP_THUMBNAILS, input),
    /** 用选中帧创建分镜（C10 follow-up · #56） */
    createStoryboardsFromThumbnails: (input: {
      sceneScriptId: string
      thumbnails: Array<{ gridIndex: number; description?: string }>
    }) => ipcRenderer.invoke(IPC_CHANNELS.EP_STORYBOARD_CREATE_FROM_THUMBNAILS, input),

    // AI 生成
    generateScript: (episodeId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GENERATE_SCRIPT, episodeId, providerConfigId, modelId),
    generateScenes: (scriptId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GENERATE_SCENES, scriptId, providerConfigId, modelId),
    generateStoryboard: (sceneId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GENERATE_STORYBOARD, sceneId, providerConfigId, modelId),
    generateStoryboards: (scriptId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GENERATE_STORYBOARDS, scriptId, providerConfigId, modelId),
    /**
     * 2026-09-16 联合生成（D8 替换旧「批量生成分镜」入口）：
     * 逐场景一次 LLM 调用产出资产清单 + 分镜，代码侧建/复用 binding 并回填全部 ID。
     * 返回 { episodeId, results: [{ sceneId, shotCount, createdBindings, reusedBindings, error? }] }。
     */
    cogenStoryboards: (episodeId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_COGEN_STORYBOARDS, episodeId),
    // spec 2026-05-28：单分镜 AI 填充（扩展版，覆盖所有字段）
    fillStoryboard: (
      storyboardId: string,
      fillInput: {
        shotNumber: number
        sceneContext: string
        location?: string
        timeOfDay?: string
        mood?: string
        existingFields: {
          shotType?: string | null
          cameraAngle?: string | null
          cameraMovement?: string | null
          duration?: number | null
          frameDescription?: string | null
          // 扩展字段（2026-05-28）
          lensFocalMm?: number | null
          aperture?: string | null
          cameraStyle?: string | null
          lighting?: string | null
          transitionType?: string | null
          transitionDuration?: number | null
          transitionDirection?: string | null
          keyframeCount?: number | null
        }
      },
      providerConfigId?: string,
      modelId?: string,
    ) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_FILL_STORYBOARD, storyboardId, fillInput, providerConfigId, modelId),

    // spec 2026-05-08：场景级 AI 润色 — 不直接落库，返回字段子集让前端 SceneEditDialog 对比
    polishScene: (sceneId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_POLISH_SCENE, sceneId, providerConfigId, modelId),

    /**
     * 追加剧本 · 生成草稿（不落库）。
     * mode='ai-continue' 用 instruction 续写；mode='manual-text' 用 text 拆场景。
     * 返回 { existingSceneCount, existingContentLength, startSceneNumber, draft }。
     */
    prepareScriptAppend: (
      scriptId: string,
      input: {
        mode: 'ai-continue' | 'manual-text'
        instruction?: string
        text?: string
        providerConfigId?: string
        modelId?: string
      },
    ) => ipcRenderer.invoke(IPC_CHANNELS.EP_PREPARE_SCRIPT_APPEND, scriptId, input),
    /** 追加剧本 · 落库（用户确认草稿后调用；只 append，不删已有场次） */
    appendScript: (
      scriptId: string,
      draft: { scriptContent: string; synopsis: string; scenes: any[] },
      options?: { keepApproved?: boolean },
    ) => ipcRenderer.invoke(IPC_CHANNELS.EP_APPEND_SCRIPT, scriptId, draft, options),

    // P4-T6 引用解析 + 完整性校验
    resolveReference: (kind: 'character' | 'location' | 'item', bindingId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_RESOLVE_REFERENCE, kind, bindingId),
    resolveReferencesBatch: (refs: Array<{ kind: 'character' | 'location' | 'item'; bindingId: string }>) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_RESOLVE_REFERENCES_BATCH, refs),
    validateScene: (sceneScriptId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_VALIDATE_SCENE, sceneScriptId),
    validateEpisodeScript: (episodeScriptId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_VALIDATE_EPISODE_SCRIPT, episodeScriptId),

    // P5-T8 多关键帧（P5-T26 加 userPrompt）
    generateKeyframes: (
      storyboardId: string,
      styleName?: string,
      keyframeCountOverride?: number,
      userPrompt?: string,
    ) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.EP_GENERATE_KEYFRAMES,
        storyboardId,
        styleName,
        keyframeCountOverride,
        userPrompt,
      ),
    regenerateKeyframe: (
      keyframeId: string,
      styleName?: string,
      userPrompt?: string,
    ) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.EP_REGENERATE_KEYFRAME,
        keyframeId,
        styleName,
        userPrompt,
      ),
    listKeyframes: (storyboardId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_LIST_KEYFRAMES, storyboardId),
    /** 确保关键帧记录存在（不生成图片，用于先挑图再生成场景） */
    ensureKeyframes: (storyboardId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_ENSURE_KEYFRAMES, storyboardId),
    insertKeyframeBetween: (
      storyboardId: string,
      afterKeyframeId: string,
      userPrompt?: string,
    ) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.EP_INSERT_KEYFRAME_BETWEEN,
        storyboardId,
        afterKeyframeId,
        userPrompt,
      ),
    /** 在指定 frameIndex 生成单张关键帧（"添加关键帧"对话框入口） */
    generateKeyframeAtIndex: (
      storyboardId: string,
      frameIndex: number,
      userPrompt?: string,
    ) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.EP_GENERATE_KEYFRAME_AT_INDEX,
        storyboardId,
        frameIndex,
        userPrompt,
      ),
    setKeyframeReferenceOverrides: (
      keyframeId: string,
      overrides: Array<{
        kind: 'character' | 'location' | 'item'
        bindingId: string
        imageId: string
      }>,
    ) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.EP_SET_KEYFRAME_REFERENCE_OVERRIDES,
        keyframeId,
        overrides,
      ),
    listAssetImages: (
      assetType: 'character' | 'location' | 'item',
      assetId: string,
    ) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_LIST_ASSET_IMAGES, assetType, assetId),
    planKeyframeRegen: (changedFrameIndex: number, keyframeCount: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_PLAN_KEYFRAME_REGEN, changedFrameIndex, keyframeCount),

    // P5-T13 视频片段
    listVideoProviders: () =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_LIST_VIDEO_PROVIDERS),
    getProviderCapabilities: (providerType: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GET_PROVIDER_CAPABILITIES, providerType),
    generateVideoSegment: (storyboardId: string, opts?: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GENERATE_VIDEO_SEGMENT, storyboardId, opts),

    // 视频片段制（2026-09-04 重构）：分段预览/重算 + 片段级一次视频调用
    recomputeSegments: (episodeId: string, opts?: { budgetSec?: number }) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_RECOMPUTE_SEGMENTS, episodeId, opts),
    listSegments: (episodeId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_LIST_SEGMENTS, episodeId),
    generateSegmentVideo: (segmentId: string, opts?: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GENERATE_SEGMENT_VIDEO, segmentId, opts),

    // P6-T5 合成 + 导出 MP4
    buildTimeline: (episodeScriptId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_BUILD_TIMELINE, episodeScriptId),
    previewSubtitle: (episodeScriptId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_PREVIEW_SUBTITLE, episodeScriptId),
    exportMp4: (episodeScriptId: string, outputPath: string, opts?: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_EXPORT_MP4, episodeScriptId, outputPath, opts),
    openExportFolder: (filePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_OPEN_EXPORT_FOLDER, filePath),

    // P5-T14/T15 V3 binding-aware 场景音频
    generateSceneAudioV3: (sceneScriptId: string, opts?: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GENERATE_SCENE_AUDIO_V3, sceneScriptId, opts),

    // P6-T13 顶部 6 段阶段进度条（spec §2.1）
    calculateEpisodeProgress: (episodeId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_CALCULATE_EPISODE_PROGRESS, episodeId),

    // 剧集列表含进度（spec §6.1）
    listEpisodesWithProgress: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_LIST_EPISODES_WITH_PROGRESS, projectId),

    // P6-T16 阶段门控（spec §2.3 软引导）
    canEnterStage: (episodeId: string, currentStatus: string, targetStatus: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_CAN_ENTER_STAGE, episodeId, currentStatus, targetStatus),

    // P5-T32 分镜内角色独立配置（spec §4.5.3）
    listStoryboardCharacters: (storyboardId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_LIST_STORYBOARD_CHARACTERS, storyboardId),
    saveStoryboardCharacters: (storyboardId: string, inputs: any[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_SAVE_STORYBOARD_CHARACTERS, storyboardId, inputs),
    clearStoryboardCharacters: (storyboardId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_CLEAR_STORYBOARD_CHARACTERS, storyboardId),

    // P5/P6-FU1 剧本 binding 修复
    scanScriptBindings: (episodeScriptId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_SCAN_SCRIPT_BINDINGS, episodeScriptId),
    fixScriptBindingsByName: (episodeScriptId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_FIX_SCRIPT_BINDINGS_BY_NAME, episodeScriptId),
    createMissingScriptBindings: (episodeScriptId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_CREATE_MISSING_SCRIPT_BINDINGS, episodeScriptId),

    // FU4-1 ① 内容 stage AI 识别要素（spec §0.4 IdentifyEntities）
    // kinds 缺省 = 三类全识别；传入子集 = 只识别该子集（保留其他 kind 的现状）
    identifyUploadedEntities: (
      episodeId: string,
      providerConfigId?: string,
      modelId?: string,
      kinds?: Array<'character' | 'location' | 'item'>,
    ) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.EP_IDENTIFY_UPLOADED_ENTITIES,
        episodeId,
        providerConfigId,
        modelId,
        kinds,
      ),
    /** 「AI 写剧本」：提示词 + 故事背景 → 生成故事原文（回填 uploadedContent） */
    aiGenerateText: (req: EpAiGenerateTextRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_AI_GENERATE_TEXT, req),
    /** 「批量创建剧集」：选剧本文件 → 按章节拆分预览 */
    analyzeScriptFile: () =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_ANALYZE_SCRIPT_FILE),
    /** M1 首页「导入拆集」：粘贴剧本文本 → 按章节拆分预览（纯函数，零 AI） */
    analyzeScriptText: (text: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_ANALYZE_SCRIPT_TEXT, text),
    /** 「批量创建剧集」：确认后批量建集 */
    batchCreateEpisodes: (req: EpBatchCreateEpisodesRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_BATCH_CREATE_EPISODES, req),
    /** 「批量识别资产」：对指定剧集逐集识别角色/地点/物品（跨集去重） */
    batchIdentifyEntities: (req: EpBatchIdentifyEntitiesRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_BATCH_IDENTIFY_ENTITIES, req),
    /** FU5-B2 ① 内容 stage 整理 / 取舍（覆写 episode.uploadedX） */
    updateUploadedEntities: (
      episodeId: string,
      payload: {
        uploadedCharacters?: any[]
        uploadedLocations?: any[]
        uploadedItems?: any[]
      },
    ) => ipcRenderer.invoke(IPC_CHANNELS.EP_UPDATE_UPLOADED_ENTITIES, episodeId, payload),

    // 资源生成
    getStylePresets: () =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GET_STYLE_PRESETS),
    generateStoryboardImage: (storyboardId: string, styleName: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GENERATE_STORYBOARD_IMAGE, storyboardId, styleName, providerConfigId, modelId),
    generateSceneImages: (sceneId: string, styleName: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GENERATE_SCENE_IMAGES, sceneId, styleName, providerConfigId, modelId),
    generateAudio: (sceneId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GENERATE_AUDIO, sceneId),

    // 进度事件监听
    onImageProgress: (callback: (event: any, data: { sceneId: string; index: number; total: number }) => void) => {
      const handler = (_event: any, data: any) => callback(_event, data)
      ipcRenderer.on('ep:image-progress', handler)
      return () => ipcRenderer.removeListener('ep:image-progress', handler)
    },
    onAudioProgress: (callback: (event: any, data: { sceneId: string; type: string; index: number; total: number }) => void) => {
      const handler = (_event: any, data: any) => callback(_event, data)
      ipcRenderer.on('ep:audio-progress', handler)
      return () => ipcRenderer.removeListener('ep:audio-progress', handler)
    },
    // 分镜生成进度（单个场景）
    onStoryboardProgress: (callback: (event: any, data: { sceneId: string; shotNumber: number; total: number; storyboard: any }) => void) => {
      const handler = (_event: any, data: any) => callback(_event, data)
      ipcRenderer.on('ep:storyboard-progress', handler)
      return () => ipcRenderer.removeListener('ep:storyboard-progress', handler)
    },
    // 分镜批量生成进度（多个场景）
    onStoryboardsProgress: (callback: (event: any, data: { scriptId: string; sceneIndex: number; total: number; shotProgress: { current: number; total: number } | null }) => void) => {
      const handler = (_event: any, data: any) => callback(_event, data)
      ipcRenderer.on('ep:storyboards-progress', handler)
      return () => ipcRenderer.removeListener('ep:storyboards-progress', handler)
    },

    // 视频合成
    getVideoPresets: () =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GET_VIDEO_PRESETS),
    synthesizeSceneVideo: (sceneId: string, quality?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_SYNTHESIZE_SCENE_VIDEO, sceneId, quality),
    synthesizeStoryboardVideo: (storyboardId: string, quality?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_SYNTHESIZE_STORYBOARD_VIDEO, storyboardId, quality),
    exportVideo: (sourcePath: string, outputPath: string, quality?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_EXPORT_VIDEO, sourcePath, outputPath, quality),

    // 上传模式实体管理
    getUploadedEntity: (entityId: string, entityType: 'character' | 'location' | 'item') =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GET_UPLOADED_ENTITY, entityId, entityType),
    updateUploadedEntity: (entityId: string, entityType: 'character' | 'location' | 'item', data: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_UPDATE_UPLOADED_ENTITY, entityId, entityType, data),
    deleteUploadedEntity: (entityId: string, entityType: 'character' | 'location' | 'item', projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_DELETE_UPLOADED_ENTITY, entityId, entityType, projectId),
    isBindingFromLongWriting: (binding: { longWritingCharacterId?: string; longWritingLocationId?: string; longWritingItemId?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_IS_BINDING_FROM_LONGWRITING, binding),

    // ==================== V2.5 资产域 namespace（与 V2 channel 共存） ====================
    asset: {
      /** FU5-C1 项目级聚合（4 类 binding 主图状态 + 图谱细分计数 + voice 关系） */
      projectSummary: (projectId: string) =>
        ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_PROJECT_SUMMARY, projectId),
      // 角色资产（10 个）
      character: {
        list: (projectId: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_CHARACTER_LIST, projectId),
        get: (id: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_CHARACTER_GET, id),
        effective: (id: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_CHARACTER_EFFECTIVE, id),
        createStandalone: (input: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_CHARACTER_CREATE_STANDALONE, input),
        createLinkedLw: (input: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_CHARACTER_CREATE_LINKED_LW, input),
        updateOverride: (id: string, override: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_CHARACTER_UPDATE_OVERRIDE, id, override),
        updateStandalone: (id: string, patch: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_CHARACTER_UPDATE_STANDALONE, id, patch),
        /** FU5-C2 身份块 + 声音参数 + 风格锚点 + 备选服装 */
        updateExtra: (id: string, patch: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_CHARACTER_UPDATE_EXTRA, id, patch),
        setVoice: (id: string, voiceId: string | null) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_CHARACTER_SET_VOICE, id, voiceId),
        setPortrait: (id: string, portraitId: string | null) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_CHARACTER_SET_PORTRAIT, id, portraitId),
        delete: (id: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_CHARACTER_DELETE, id),
        /**
         * 一键多角度参考图（spec 2026-05-09 ep-redesign §3.2 B3）
         * 串行调 imageGen 3 次（front / 3q_left / 3q_right），同 base 主图 ref 保一致性。
         */
        generateThreeViews: (input: {
          assetType: 'character'
          assetId: string
          prompt: string
          negativePrompt?: string
          baseImageId?: string | null
        }) => ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_CHARACTER_GENERATE_THREE_VIEWS, input),
        /**
         * 设置角色形象组（spec 2026-05-09 ep-redesign §3.2 D1）
         * 用户在 ReferenceSetPanel 勾选 asset_image.id → 落 binding.referenceSetImageIds JSON。
         */
        setReferenceSet: (input: { bindingId: string; imageIds: string[] }) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_CHARACTER_SET_REFERENCE_SET, input),
        /** 取形象组实际生效列表（含 fallback 默认 main+view） */
        getReferenceSet: (input: { bindingId: string }) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_CHARACTER_GET_REFERENCE_SET, input),
      },
      // 地点资产（9 个）
      location: {
        list: (projectId: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_LOCATION_LIST, projectId),
        get: (id: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_LOCATION_GET, id),
        effective: (id: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_LOCATION_EFFECTIVE, id),
        createStandalone: (input: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_LOCATION_CREATE_STANDALONE, input),
        createLinkedLw: (input: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_LOCATION_CREATE_LINKED_LW, input),
        pickBestVariant: (bindingId: string, input: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_LOCATION_PICK_BEST_VARIANT, bindingId, input),
        updateOverride: (id: string, override: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_LOCATION_UPDATE_OVERRIDE, id, override),
        updateStandalone: (id: string, patch: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_LOCATION_UPDATE_STANDALONE, id, patch),
        /** FU5-C3 场景类型 + 规模 + 氛围 + 风格锚点 + 默认时间/天气 */
        updateExtra: (id: string, patch: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_LOCATION_UPDATE_EXTRA, id, patch),
        delete: (id: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_LOCATION_DELETE, id),
      },
      // 物品资产（8 个）
      item: {
        list: (projectId: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_ITEM_LIST, projectId),
        get: (id: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_ITEM_GET, id),
        effective: (id: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_ITEM_EFFECTIVE, id),
        createStandalone: (input: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_ITEM_CREATE_STANDALONE, input),
        createLinkedLw: (input: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_ITEM_CREATE_LINKED_LW, input),
        updateOverride: (id: string, override: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_ITEM_UPDATE_OVERRIDE, id, override),
        updateStandalone: (id: string, patch: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_ITEM_UPDATE_STANDALONE, id, patch),
        updateExtra: (id: string, patch: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_ITEM_UPDATE_EXTRA, id, patch),
        delete: (id: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_ITEM_DELETE, id),
      },
      // 语音资产（5 个）
      voice: {
        list: () =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_VOICE_LIST),
        listReady: () =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_VOICE_LIST_READY),
        get: (voiceId: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_VOICE_GET, voiceId),
        bindToCharacter: (characterBindingId: string, voiceId: string | null) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_VOICE_BIND_TO_CHARACTER, characterBindingId, voiceId),
        listCharacters: (voiceId: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_VOICE_LIST_CHARACTERS, voiceId),
      },
      // 统一图谱（7 个）
      image: {
        listByAsset: (assetType: string, assetId: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_IMAGE_LIST_BY_ASSET, assetType, assetId),
        listByCategory: (assetType: string, assetId: string, category: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_IMAGE_LIST_BY_CATEGORY, assetType, assetId, category),
        getMain: (assetType: string, assetId: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_IMAGE_GET_MAIN, assetType, assetId),
        add: (input: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_IMAGE_ADD, input),
        setAsMain: (id: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_IMAGE_SET_AS_MAIN, id),
        delete: (id: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_IMAGE_DELETE, id),
        update: (id: string, patch: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_IMAGE_UPDATE, id, patch),
        /** 保存图集 slot 提示词（有图更新行；无图创建占位行承载提示词） */
        savePrompt: (input: {
          assetType: string
          assetId: string
          category: string
          label?: string | null
          prompt: string
        }) => ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_IMAGE_SAVE_PROMPT, input),
        generateMain: (input: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_IMAGE_GENERATE_MAIN, input),
        uploadMainFile: (input: { fileName: string; base64: string; assetType: string; assetId: string }) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_IMAGE_UPLOAD_MAIN_FILE, input),
        /** 上传一张图作为"新增主图"（多主图：不替换旧主图，新图成为默认） */
        uploadMainAdd: (input: { fileName: string; base64: string; assetType: string; assetId: string; label?: string | null }) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_IMAGE_UPLOAD_MAIN_ADD, input),
        /** 上传参考图（保存文件返回路径，不落 asset_image 行；供换装生成作 reference） */
        uploadReference: (input: { fileName: string; base64: string }) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_IMAGE_UPLOAD_REF, input),
        // spec 2026-05-09 多主图模型
        /** 在已有主图基础上追加一张主图（不降级旧主图） */
        addMain: (input: {
          assetType: 'character' | 'location' | 'item'
          assetId: string
          prompt: string
          negativePrompt?: string
          referenceImagePath?: string | null
          label: string
          makeDefault?: boolean
          metadata?: Record<string, unknown> | null
        }) => ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_IMAGE_ADD_MAIN, input),
        /** 切换默认主图（is_main=1 标记归属，不动 category） */
        switchMain: (imageId: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_IMAGE_SWITCH_MAIN, imageId),
        /** 更新单图 metadata（angle/time/weather/...） */
        updateMetadata: (imageId: string, metadata: Record<string, unknown> | null) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_IMAGE_UPDATE_METADATA, imageId, metadata),
      },
      // 派生（2 个）
      derive: {
        single: (input: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_DERIVE_SINGLE, input),
        batch: (input: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_DERIVE_BATCH, input),
      },
      // 引用导入（2 个）
      import: {
        fromPortrait: (input: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_IMPORT_FROM_PORTRAIT, input),
        fromImage: (input: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_IMPORT_FROM_IMAGE, input),
      },
      // 360 全景 + 视角截图（7 个 · P3c Task 4）
      panorama: {
        list: (locationBindingId: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_PANORAMA_LIST, locationBindingId),
        generate: (input: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_PANORAMA_GENERATE, input),
        upload: (input: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_PANORAMA_UPLOAD, input),
        uploadFile: (input: { fileName: string; base64: string; locationBindingId: string; label?: string | null }) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_PANORAMA_UPLOAD_FILE, input),
        delete: (id: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_PANORAMA_DELETE, id),
        createSnapshot: (input: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_PANORAMA_CREATE_SNAPSHOT, input),
        listSnapshots: (locationBindingId: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_PANORAMA_LIST_SNAPSHOTS, locationBindingId),
        deleteSnapshot: (id: string) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_PANORAMA_DELETE_SNAPSHOT, id),
      },
      // AI 设定反推（spec 2026-05-07）
      enrichSettings: (input: { projectId: string }) =>
        ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_ENRICH_SETTINGS, input),

      /**
       * AI 正向字段提取（spec 2026-05-09 ep-redesign §3.2 B2）
       * 用户在自由文本"人物描述"里写完，调本 API → LLM 抽出结构化字段。
       * 不覆盖逻辑放前端（service 只返回 LLM 结果）。
       */
      extractFields: (input: {
        assetType: 'character' | 'location' | 'item'
        description: string
        projectId: string
      }) => ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_EXTRACT_FIELDS, input),

      /**
       * 跨项目角色库（spec 2026-05-09 ep-redesign §3.2 D2）
       * 让用户在多项目间复用同一角色 / 地点 / 物品。
       */
      userAsset: {
        list: (input: { assetType?: 'character' | 'location' | 'item'; keyword?: string } = {}) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_USER_ASSET_LIST, input),
        addFromBinding: (input: {
          bindingId: string
          bindingType: 'character' | 'location' | 'item'
        }) => ipcRenderer.invoke(IPC_CHANNELS.EP_USER_ASSET_ADD_FROM_BINDING, input),
        createBinding: (input: { userAssetId: string; targetProjectId: string }) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_USER_ASSET_CREATE_BINDING, input),
        delete: (input: { userAssetId: string }) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_USER_ASSET_DELETE, input),
      },

      /**
       * 视频解析（spec 2026-05-09 ep-redesign §3.2 D5 · P-22）
       * 上传参考视频 → ffmpeg 抽帧 / scene detection → ParsedShot[] 落库。
       */
      referenceVideo: {
        analyze: (input: {
          videoPath: string
          sceneThreshold?: number
          vlmModelId?: string
          vlmProviderConfigId?: string
        }) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_REFERENCE_VIDEO_ANALYZE, input),
        list: () => ipcRenderer.invoke(IPC_CHANNELS.EP_REFERENCE_VIDEO_LIST),
        get: (input: { id: string }) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_REFERENCE_VIDEO_GET, input),
        delete: (input: { id: string }) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_REFERENCE_VIDEO_DELETE, input),
        importToScene: (input: { sceneScriptId: string; parsedShots: any[] }) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_REFERENCE_VIDEO_IMPORT_TO_SCENE, input),
      },

      /**
       * 数字人池（spec 2026-05-09 ep-redesign §3.2 D3 · P-8）
       * 列内置预设角色 / 按需生成形象图（避免 seed 阶段浪费配额）。
       */
      preset: {
        list: (input: { gender?: string } = {}) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_PRESET_LIST, input),
        ensureMainImage: (input: { presetId: string }) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_PRESET_ENSURE_MAIN_IMAGE, input),
        ensureAllImages: () =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_PRESET_ENSURE_ALL_IMAGES),
        useToProject: (input: { presetId: string; targetProjectId: string; overrideName?: string }) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_PRESET_USE_TO_PROJECT, input),
      },

      /**
       * 视频提取主体（spec 2026-05-09 ep-redesign §3.2 E1 · Phase 5 · P-22）
       * 用户上传短视频 → ffmpeg 抽 N 个候选代表帧 → 用户挑要保留的帧 → 落主图。
       * 当前为时间均匀采样降级版（face-api.js 未装）；future face-clustering。
       */
      characterExtract: {
        frames: (input: { videoPath: string; frameCount?: number }) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_CHARACTER_EXTRACT_FRAMES, input),
        cleanup: (input: { sessionId: string }) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_CHARACTER_EXTRACT_CLEANUP, input),
        importFrames: (input: {
          bindingId: string
          frames: Array<{ framePath: string; label: string }>
        }) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_CHARACTER_EXTRACT_IMPORT_FRAMES, input),
      },

      /**
       * 设置 / 清空资产参考图（spec 2026-05-09）：
       *   - 上传：传 base64 + fileName + mimeType；后端存盘 → 落 binding.reference_image_path
       *   - 清空：传 clear=true
       * 返回 { referenceImagePath: string | null }（new 或 null）。
       */
      setReferenceImage: (input: {
        assetType: 'character' | 'location' | 'item'
        bindingId: string
        base64?: string
        fileName?: string
        mimeType?: string
        clear?: boolean
      }) =>
        ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_SET_REFERENCE_IMAGE, input),
    },

    // 视频合成进度事件监听
    onSynthesisProgress: (callback: (event: any, data: { sceneId: string; phase: string; progress: number }) => void) => {
      const handler = (_event: any, data: any) => callback(_event, data)
      ipcRenderer.on('ep:synthesis-progress', handler)
      return () => ipcRenderer.removeListener('ep:synthesis-progress', handler)
    },

    // ===== P6 对话式制作 Agent（剧本/资产/分镜右侧助手） =====
    agentSend: (projectId: string, episodeId: string, message: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('ep:agent:send', projectId, episodeId, message, providerConfigId, modelId),
    agentHistory: (episodeId: string) =>
      ipcRenderer.invoke('ep:agent:history', episodeId),
    agentCancel: (projectId: string, episodeId: string) =>
      ipcRenderer.invoke('ep:agent:cancel', projectId, episodeId),
    agentState: (projectId: string, episodeId: string) =>
      ipcRenderer.invoke('ep:agent:state', projectId, episodeId),
    agentDecide: (projectId: string, episodeId: string, approvalId: string, action: 'select' | 'reject', selected?: string) =>
      ipcRenderer.invoke('ep:agent:decide', projectId, episodeId, approvalId, action, selected),
    agentListPending: (projectId: string, episodeId: string) =>
      ipcRenderer.invoke('ep:agent:list-pending', projectId, episodeId),
    onAgentEvent: (projectId: string, episodeId: string, callback: (event: any, data: any) => void) => {
      const channel = `ep-agent:${projectId}:${episodeId}`
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    }
  },

  // OSS 图床配置相关
  oss: {
    listConfigs: () =>
      ipcRenderer.invoke(IPC_CHANNELS.OSS_LIST_CONFIGS),
    getConfig: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.OSS_GET_CONFIG, id),
    createConfig: (data: {
      name: string
      provider: 'aliyun' | 'volcengine'
      accessKeyId: string
      accessKeySecret: string
      region: string
      bucket: string
      endpoint?: string
      customDomain?: string
      pathPrefix?: string
    }) =>
      ipcRenderer.invoke(IPC_CHANNELS.OSS_CREATE_CONFIG, data),
    updateConfig: (id: string, data: {
      name?: string
      accessKeyId?: string
      accessKeySecret?: string
      region?: string
      bucket?: string
      endpoint?: string
      customDomain?: string
      pathPrefix?: string
      isEnabled?: boolean
      isDefault?: boolean
    }) =>
      ipcRenderer.invoke(IPC_CHANNELS.OSS_UPDATE_CONFIG, { id, ...data }),
    deleteConfig: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.OSS_DELETE_CONFIG, id),
    setDefault: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.OSS_SET_DEFAULT, id),
    toggleEnabled: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.OSS_TOGGLE_ENABLED, id),
    testConnection: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.OSS_TEST_CONNECTION, id),
    uploadFile: (request: {
      configId?: string
      localPath: string
      customPath?: string
      fileName?: string
    }) =>
      ipcRenderer.invoke(IPC_CHANNELS.OSS_UPLOAD_FILE, request)
  },

  datasource: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.DATASOURCE_LIST),
    listEligible: () => ipcRenderer.invoke(IPC_CHANNELS.DATASOURCE_LIST_ELIGIBLE),
    create: (req: {
      name: string
      driver: string
      host: string
      port: number
      database: string
      username?: string
      password?: string
      ssl?: boolean
    }) => ipcRenderer.invoke(IPC_CHANNELS.DATASOURCE_CREATE, req),
    update: (id: string, req: {
      name?: string
      driver?: string
      host?: string
      port?: number
      database?: string
      username?: string
      password?: string
      ssl?: boolean
      isEnabled?: boolean
    }) => ipcRenderer.invoke(IPC_CHANNELS.DATASOURCE_UPDATE, { id, req }),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DATASOURCE_DELETE, id),
    toggleEnabled: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DATASOURCE_TOGGLE_ENABLED, id),
    testConnection: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DATASOURCE_TEST_CONNECTION, id)
  },

  // 业务包（包内核：启用态查询/切换——前端装配时据 pack:list 决定挂哪些包的路由/菜单）
  pack: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PACK_LIST),
    setEnabled: (packId: string, enabled: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.PACK_SET_ENABLED, { packId, enabled })
  },

  // 通知中心（顶栏铃铛 + 历史列表 + 点击跳转；已读状态由后端 user_notification_reads 持久化，
  // 历史数据源 = 平台事件表 platform_events）
  notification: {
    // 通知列表（分页 + 未读优先）：入参 { page?, pageSize?, unreadFirst? }，
    // 返回 { success, data?: { items, total, unread, hasMore } }
    list: (q?: NoticeListQuery) => ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_LIST, q),
    // 标记一组 seq 已读：入参 { seqs: number[] } → { success, data?: { marked, unread } }
    markRead: (seqs: number[]) => ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_MARK_READ, { seqs }),
    // 全部标记已读 → { success, data?: { marked, unread } }
    markAllRead: () => ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_MARK_ALL_READ),
    // 未读计数（铃铛徽标）→ { success, data?: number }
    unreadCount: () => ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_UNREAD_COUNT)
  },

  // 错误处理
  onError: (callback: (event: any, data: any) => void) => {
    const handler = (_event: any, data: any) => callback(_event, data)
    ipcRenderer.on('error:show', handler)
    return () => ipcRenderer.removeListener('error:show', handler)
  },

  // 自动保存状态
  onAutoSaveStatus: (callback: (event: any, data: { id: string; status: string }) => void) => {
    const handler = (_event: any, data: any) => callback(_event, data)
    ipcRenderer.on('autosave:status', handler)
    return () => ipcRenderer.removeListener('autosave:status', handler)
  },

  // 快捷键触发
  onShortcut: (callback: (event: any, id: string) => void) => {
    const handler = (_event: any, id: string) => callback(_event, id)
    ipcRenderer.on('shortcut:triggered', handler)
    return () => ipcRenderer.removeListener('shortcut:triggered', handler)
  }
}

// 通过 contextBridge 暴露 API
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// TypeScript 类型声明
export type ElectronAPI = typeof electronAPI
