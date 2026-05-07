/**
 * 预加载脚本
 * @module preload/index
 * @description 通过 contextBridge 安全暴露 API 给渲染进程
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { DocumentSource } from '@shared/types/knowledge-base.types'

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

  EP_GENERATE_SCRIPT: 'ep:generate-script',
  EP_GENERATE_SCENES: 'ep:generate-scenes',
  EP_GENERATE_STORYBOARD: 'ep:generate-storyboard',
  EP_GENERATE_STORYBOARDS: 'ep:generate-storyboards',

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
  EP_INSERT_KEYFRAME_BETWEEN: 'ep:insert-keyframe-between',
  EP_SET_KEYFRAME_REFERENCE_OVERRIDES: 'ep:set-keyframe-reference-overrides',
  EP_LIST_ASSET_IMAGES: 'ep:list-asset-images',

  // P5-T13 视频片段 + provider 列表
  EP_LIST_VIDEO_PROVIDERS: 'ep:list-video-providers',
  EP_GET_PROVIDER_CAPABILITIES: 'ep:get-provider-capabilities',
  EP_GENERATE_VIDEO_SEGMENT: 'ep:generate-video-segment',

  // P6-T5 合成 + 导出 MP4
  EP_BUILD_TIMELINE: 'ep:build-timeline',
  EP_PREVIEW_SUBTITLE: 'ep:preview-subtitle',
  EP_EXPORT_MP4: 'ep:export-mp4',

  // P5-T14/T15 V3 binding-aware 场景音频
  EP_GENERATE_SCENE_AUDIO_V3: 'ep:generate-scene-audio-v3',

  // P6-T13 顶部 6 段阶段进度条（spec §2.1 + §2.2）
  EP_CALCULATE_EPISODE_PROGRESS: 'ep:calculate-episode-progress',

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
  EP_ASSET_IMAGE_GENERATE_MAIN: 'ep:asset:image:generate-main',
  EP_ASSET_ENRICH_SETTINGS: 'ep:asset:enrich-settings',

  // 派生（2 个）
  EP_ASSET_DERIVE_SINGLE: 'ep:asset:derive:single',
  EP_ASSET_DERIVE_BATCH: 'ep:asset:derive:batch',

  // 引用导入（2 个）
  EP_ASSET_IMPORT_FROM_PORTRAIT: 'ep:asset:import:from-portrait',
  EP_ASSET_IMPORT_FROM_IMAGE: 'ep:asset:import:from-image',

  // 主图文件上传（双端 · follow-up）
  EP_ASSET_IMAGE_UPLOAD_MAIN_FILE: 'ep:asset:image:upload-main-file',

  // 360 全景 + 视角截图（7 个 · P3c Task 4）
  EP_ASSET_PANORAMA_LIST: 'ep:asset:panorama:list',
  EP_ASSET_PANORAMA_GENERATE: 'ep:asset:panorama:generate',
  EP_ASSET_PANORAMA_UPLOAD: 'ep:asset:panorama:upload',
  EP_ASSET_PANORAMA_UPLOAD_FILE: 'ep:asset:panorama:upload-file',
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
  OSS_UPLOAD_FILE: 'oss:upload-file'
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
  file: {
    // 打开文件选择对话框
    openDialog: (options?: {
      multiple?: boolean
      filters?: Array<{ name: string; extensions: string[] }>
    }) => ipcRenderer.invoke('file:open-dialog', options),
    // 读取文件内容（用于预览）
    readAsBase64: (filePath: string) => ipcRenderer.invoke('file:read-base64', filePath),
    // 保存文件对话框
    saveFile: (options?: {
      defaultPath?: string
      filters?: Array<{ name: string; extensions: string[] }>
    }) => ipcRenderer.invoke('file:save-dialog', options),
    // 写入文本文件
    writeTextFile: (filePath: string, content: string) =>
      ipcRenderer.invoke('file:write-text', { filePath, content }),
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
    // 语音复刻
    clone: (request: {
      name: string
      sampleAudioPath?: string
      sampleAudioData?: string
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
    // 获取复刻声音列表
    getClonedVoices: () => ipcRenderer.invoke('voice:cloned-list'),
    // 删除复刻声音
    deleteClonedVoice: (id: string) => ipcRenderer.invoke('voice:cloned-delete', id),
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
    // 下载音频
    download: (audioPath: string) => ipcRenderer.invoke('voice:download', audioPath)
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
    }) => ipcRenderer.invoke('knowledge-base:create', data),
    // 更新知识库
    update: (id: string, data: Partial<{
      name: string
      description: string
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
    // 分页获取文档分片
    getDocumentChunksPaginated: (documentId: string, page: number, pageSize: number) =>
      ipcRenderer.invoke('knowledge-base:get-document-chunks-paginated', { documentId, page, pageSize }),
    // 获取单个切片详情
    getChunk: (chunkId: string) => ipcRenderer.invoke('knowledge-base:get-chunk', chunkId),
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
    }) => ipcRenderer.invoke('portrait:change-background', request),

    // 变体管理
    getVariant: (variantId: string) => ipcRenderer.invoke('portrait:get-variant', variantId),
    listVariants: (characterId: string) => ipcRenderer.invoke('portrait:list-variants', characterId),
    deleteVariant: (id: string) => ipcRenderer.invoke('portrait:delete-variant', id),
    editImage: (request: {
      characterId: string
      variantId: string
      editPrompt: string
    }) => ipcRenderer.invoke('portrait:edit-image', request),

    // 生成多角度（第二步）
    generateAngles: (request: {
      characterId: string
      angles: ('front' | 'left' | 'right' | 'back')[]
      variantId?: string // 可选：基于哪个变体生成
    }) => ipcRenderer.invoke('portrait:generate-angles', request),

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
    generateOutlineStory: (eventId: string, projectId: string, providerConfigId?: string, modelId?: string, structureLevel?: number) =>
      ipcRenderer.invoke('longwriting:generateOutlineStory', eventId, projectId, providerConfigId, modelId, structureLevel),
    generateOutlineComment: (eventId: string, projectId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:generateOutlineComment', eventId, projectId, providerConfigId, modelId),
    generateChapter: (eventId: string, projectId: string, outlineId: string, targetWords?: number, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:generateChapter', eventId, projectId, outlineId, targetWords, providerConfigId, modelId),
    generateSection: (eventId: string, projectId: string, outlineId: string, targetWords?: number, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:generateSection', eventId, projectId, outlineId, targetWords, providerConfigId, modelId),
    generateChapterPrewrite: (eventId: string, projectId: string, outlineId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke('longwriting:generateChapterPrewrite', eventId, projectId, outlineId, providerConfigId, modelId),

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
      ipcRenderer.invoke('longwriting:saveChapterStateSummary', data)
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
      providerConfigId?: string
      modelId?: string
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
    /** FU5-A9-L2 ④ 分镜配置时绑 panorama_snapshot 作背景 ref（spec §4.5.10） */
    setStoryboardBackgroundRef: (storyboardId: string, imageId: string | null) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.EP_STORYBOARD_SET_BACKGROUND_REF,
        storyboardId,
        imageId,
      ),
    getStoryboardBackgroundRef: (storyboardId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_STORYBOARD_GET_BACKGROUND_REF, storyboardId),

    // AI 生成
    generateScript: (episodeId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GENERATE_SCRIPT, episodeId, providerConfigId, modelId),
    generateScenes: (scriptId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GENERATE_SCENES, scriptId, providerConfigId, modelId),
    generateStoryboard: (sceneId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GENERATE_STORYBOARD, sceneId, providerConfigId, modelId),
    generateStoryboards: (scriptId: string, providerConfigId?: string, modelId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GENERATE_STORYBOARDS, scriptId, providerConfigId, modelId),

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

    // P6-T5 合成 + 导出 MP4
    buildTimeline: (episodeScriptId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_BUILD_TIMELINE, episodeScriptId),
    previewSubtitle: (episodeScriptId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_PREVIEW_SUBTITLE, episodeScriptId),
    exportMp4: (episodeScriptId: string, outputPath: string, opts?: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_EXPORT_MP4, episodeScriptId, outputPath, opts),

    // P5-T14/T15 V3 binding-aware 场景音频
    generateSceneAudioV3: (sceneScriptId: string, opts?: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_GENERATE_SCENE_AUDIO_V3, sceneScriptId, opts),

    // P6-T13 顶部 6 段阶段进度条（spec §2.1）
    calculateEpisodeProgress: (episodeId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.EP_CALCULATE_EPISODE_PROGRESS, episodeId),

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
        generateMain: (input: any) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_IMAGE_GENERATE_MAIN, input),
        uploadMainFile: (input: { fileName: string; base64: string; assetType: string; assetId: string }) =>
          ipcRenderer.invoke(IPC_CHANNELS.EP_ASSET_IMAGE_UPLOAD_MAIN_FILE, input),
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
    },

    // 视频合成进度事件监听
    onSynthesisProgress: (callback: (event: any, data: { sceneId: string; phase: string; progress: number }) => void) => {
      const handler = (_event: any, data: any) => callback(_event, data)
      ipcRenderer.on('ep:synthesis-progress', handler)
      return () => ipcRenderer.removeListener('ep:synthesis-progress', handler)
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
