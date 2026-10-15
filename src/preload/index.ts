/**
 * 预加载脚本
 * @module preload/index
 * @description 通过 contextBridge 安全暴露 API 给渲染进程
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { DocumentSource } from '@shared/types/knowledge-base.types'
import type { NoticeListQuery } from '@shared/types'

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

  // AI Hub 统一网关（账号会话/模型刷新/计费）
  AIHUB_LOGIN: 'aihub:login',
  AIHUB_REGISTER: 'aihub:register',
  AIHUB_LOGOUT: 'aihub:logout',
  AIHUB_SESSION: 'aihub:session',
  AIHUB_SET_ENABLED: 'aihub:set-enabled',
  AIHUB_ENABLED: 'aihub:enabled',
  AIHUB_REFRESH_MODELS: 'aihub:refresh-models',
  AIHUB_TOKEN_EXPIRED: 'aihub:token-expired',
  AIHUB_SAVE_GATEWAY_CONFIG: 'aihub:save-gateway-config',
  AIHUB_BALANCE: 'aihub:balance',
  AIHUB_REDEEM: 'aihub:redeem',
  AIHUB_RECHARGE_URL: 'aihub:recharge-url',
  AIHUB_SESSION_CHANGED: 'aihub:session-changed',

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
  DIARY_LIST_DELETED: 'diary:list-deleted',
  DIARY_RESTORE_ENTRY: 'diary:restore-entry',
  DIARY_PURGE_ENTRY: 'diary:purge-entry',
  DIARY_EMPTY_TRASH: 'diary:empty-trash',
  DIARY_LIST_BY_DATE_RANGE: 'diary:list-by-date-range',
  DIARY_LIST_ALL_ENTRIES: 'diary:list-all-entries',
  DIARY_GET_ON_THIS_DAY: 'diary:get-on-this-day',
  DIARY_GET_INSPIRATION: 'diary:get-inspiration',
  DIARY_SET_FOLDER_BRAIN_OPT_IN: 'diary:set-folder-brain-opt-in',
  DIARY_UPLOAD_ATTACHMENT: 'diary:upload-attachment',
  DIARY_DELETE_ATTACHMENT: 'diary:delete-attachment',
  DIARY_DESCRIBE_ATTACHMENT: 'diary:describe-attachment',
  DIARY_GET_WRITING_PROMPT: 'diary:get-writing-prompt',
  DIARY_CREATE_REFLECTION: 'diary:create-reflection',
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
  // S-01 阶段就绪状态机（四 tab 状态点/提示条/gating）
  EP_EPISODE_READINESS: 'ep:episode-readiness',
  // S-08 产出质量自检（关键帧 refs / 字幕↔对白 / 时长偏差 / VLM 相似度）
  EP_EPISODE_QUALITY_CHECK: 'ep:episode-quality-check',

  EP_GET_SCRIPT: 'ep:get-script',
  EP_UPDATE_SCRIPT: 'ep:update-script',

  EP_LIST_SCENES: 'ep:list-scenes',
  EP_GET_SCENE: 'ep:get-scene',
  EP_CREATE_SCENE: 'ep:create-scene',
  EP_UPDATE_SCENE: 'ep:update-scene',
  EP_DELETE_SCENE: 'ep:delete-scene',

  EP_LIST_STORYBOARDS: 'ep:list-storyboards',
  EP_UPDATE_SCENE_DIALOGUE: 'ep:update-scene-dialogue',
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
  // S-06：单场景分镜重拆（cogen 场景级入口）
  EP_COGEN_SCENE_STORYBOARDS: 'ep:cogen-scene-storyboards',
  // spec 2026-05-27：单分镜 AI 填充
  EP_FILL_STORYBOARD: 'ep:fill-storyboard',
  // spec 2026-05-08：场景级 AI 润色
  EP_POLISH_SCENE: 'ep:polish-scene',
  // S-06：场景级局部重拆（只重生成该场景结构化数据，作废其分镜）
  EP_REGENERATE_SCENE: 'ep:regenerate-scene',

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
  EP_REVIEW_KEYFRAME: 'ep:review-keyframe',
  EP_REVIEW_KEYFRAMES: 'ep:review-keyframes',

  // P5-T13 视频片段 + provider 列表
  EP_LIST_VIDEO_PROVIDERS: 'ep:list-video-providers',
  EP_GET_PROVIDER_CAPABILITIES: 'ep:get-provider-capabilities',
  EP_GENERATE_VIDEO_SEGMENT: 'ep:generate-video-segment',

  // 视频片段制重构（tasks/2026-09-04-ep-video-segment-redesign §3/§5）：分段 + 片段级生成
  EP_RECOMPUTE_SEGMENTS: 'ep:recompute-segments',
  EP_LIST_SEGMENTS: 'ep:list-segments',
  EP_GENERATE_SEGMENT_VIDEO: 'ep:generate-segment-video',
  EP_DELETE_SEGMENT: 'ep:delete-segment',
  // S-03 手动分段（tasks/2026-09-16-ep-studio-polish）
  EP_MERGE_SEGMENTS: 'ep:merge-segments',
  EP_SPLIT_SEGMENT: 'ep:split-segment',
  // S-07 片段排序：同场景相邻交换 seq
  EP_MOVE_SEGMENT: 'ep:move-segment',

  // P6-T5 合成 + 导出 MP4
  EP_BUILD_TIMELINE: 'ep:build-timeline',
  EP_PREVIEW_SUBTITLE: 'ep:preview-subtitle',
  EP_EXPORT_MP4: 'ep:export-mp4',
  EP_OPEN_EXPORT_FOLDER: 'ep:open-export-folder',
  // S-07 导出版本留档：最近 5 条导出记录
  EP_LIST_EXPORT_HISTORY: 'ep:list-export-history',

  // S-09 AI 用量统计（ai_call_stats 聚合）
  EP_AI_USAGE_STATS: 'ep:ai-usage-stats',

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
  // S-05 定妆图确认闸门（2026-09-17）
  EP_ASSET_IMAGE_SET_CONFIRMED: 'ep:asset-image-set-confirmed',
  EP_ASSET_REFERENCE_IMPACT: 'ep:asset:reference-impact',
  EP_ASSET_REGEN_REFERENCING_KEYFRAMES: 'ep:asset:regenerate-referencing-keyframes',
  // T01 · 资产写回影响范围统计（设为主图/重新生成前的确认弹窗数据源）
  EP_ASSET_GET_WRITE_IMPACT: 'ep:asset:get-write-impact',

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

  // AI Hub 统一网关（账号会话/模型刷新/计费）——登录、登出、会话查询、余额、兑换码
  aihub: {
    login: (params: { gatewayUrl?: string; identity: string; password: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.AIHUB_LOGIN, params),
    register: (params: { gatewayUrl?: string; email: string; password: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.AIHUB_REGISTER, params),
    logout: () => ipcRenderer.invoke(IPC_CHANNELS.AIHUB_LOGOUT),
    session: () => ipcRenderer.invoke(IPC_CHANNELS.AIHUB_SESSION),
    // 功能总开关（默认关闭；Web 端仅 admin 可写）
    setEnabled: (enabled: boolean) => ipcRenderer.invoke(IPC_CHANNELS.AIHUB_SET_ENABLED, { enabled }),
    enabled: () => ipcRenderer.invoke(IPC_CHANNELS.AIHUB_ENABLED),
    refreshModels: () => ipcRenderer.invoke(IPC_CHANNELS.AIHUB_REFRESH_MODELS),
    saveGatewayConfig: (config: { gatewayUrl: string; rechargeUrl?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.AIHUB_SAVE_GATEWAY_CONFIG, config),
    balance: () => ipcRenderer.invoke(IPC_CHANNELS.AIHUB_BALANCE),
    redeem: (code: string) => ipcRenderer.invoke(IPC_CHANNELS.AIHUB_REDEEM, { code }),
    rechargeUrl: () => ipcRenderer.invoke(IPC_CHANNELS.AIHUB_RECHARGE_URL),
    // 监听会话变化（登录/登出/401 广播）
    onSessionChanged: (callback: (data: { loggedIn: boolean }) => void) => {
      const handler = (_event: unknown, data: { loggedIn: boolean }) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.AIHUB_SESSION_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AIHUB_SESSION_CHANGED, handler)
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
    listReviewed: (p: { page?: number; pageSize?: number }) => ipcRenderer.invoke('wf:list-reviewed', p),
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

  // ==================== 通用资产库（保存资产/读取资产/资产中心） ====================

  // ==================== 信息来源（设置 → 信息来源；工作流采集节点与各业务模块的数据源） ====================
  // 类别（一个类别 = 设置界面一个 tab）→ 分组（类别内一级分组）→ 来源（名称 + URL）



  // ==================== 网站 favicon（信息来源图标） ====================
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
    brain: {
      getConfig: (kbId: string) => ipcRenderer.invoke('kb:brain:get-config', { kbId }),
      updateConfig: (p: { kbId: string; patch: Record<string, unknown> }) => ipcRenderer.invoke('kb:brain:update-config', p),
      docStatus: (kbId: string) => ipcRenderer.invoke('kb:brain:doc-status', { kbId }),
      listAtoms: (p: { kbId: string; documentId?: string; page?: number; pageSize?: number; status?: string; type?: string; types?: string[]; origin?: string; layer?: string; foreshadow?: string }) =>
        ipcRenderer.invoke('kb:brain:list-atoms', p),
      consolidateRun: (kbId: string) => ipcRenderer.invoke('kb:brain:consolidate-run', { kbId }),
      consolidateStatus: (kbId: string) => ipcRenderer.invoke('kb:brain:consolidate-status', { kbId }),
      cleanupRun: (kbId: string) => ipcRenderer.invoke('kb:brain:cleanup-run', { kbId }),
      cleanupStatus: (kbId: string) => ipcRenderer.invoke('kb:brain:cleanup-status', { kbId }),
      layerRelabelRun: (kbId: string) => ipcRenderer.invoke('kb:brain:layer-relabel-run', { kbId }),
      layerRelabelStatus: (kbId: string) => ipcRenderer.invoke('kb:brain:layer-relabel-status', { kbId }),
      autoLogList: (kbId: string, limit?: number) => ipcRenderer.invoke('kb:brain:auto-log-list', { kbId, limit }),
      autoLogUndo: (logId: string) => ipcRenderer.invoke('kb:brain:auto-log-undo', { logId }),
      bookPassesRun: (kbId: string) => ipcRenderer.invoke('kb:brain:book-passes-run', { kbId }),
      bookPassesStatus: (kbId: string) => ipcRenderer.invoke('kb:brain:book-passes-status', { kbId }),
      // 位置参数签名（review H4）：与本命名空间其余方法及 web 桥 wrap 的位置参数约定一致，
      // 对象在此组装——renderer 直传对象会被 web 桥整体塞进 kbId 字段导致静默失效
      readingRun: (kbId: string, documentId?: string) => ipcRenderer.invoke('kb:brain:reading-run', { kbId, documentId }),
      readingStatus: (kbId: string) => ipcRenderer.invoke('kb:brain:reading-status', { kbId }),
      graphBuildRun: (p: { kbId: string; documentId: string }) => ipcRenderer.invoke('kb:brain:graph-build-run', p),
      graphData: (p: { kbId: string }) => ipcRenderer.invoke('kb:brain:graph-data', p),
      reviewRun: (p: { kbId: string; documentId: string; docName: string }) => ipcRenderer.invoke('kb:brain:review-run', p),
      summaryRun: (p: { kbId: string; documentId: string; docName: string }) => ipcRenderer.invoke('kb:brain:summary-run', p),
      foreshadowRun: (kbId: string) => ipcRenderer.invoke('kb:brain:foreshadow-run', { kbId }),
      foreshadowStatus: (kbId: string) => ipcRenderer.invoke('kb:brain:foreshadow-status', { kbId }),
      getAtom: (atomId: string) => ipcRenderer.invoke('kb:brain:get-atom', { atomId }),
      listNotes: (p: { kbId: string; status?: string; type?: string; page?: number; pageSize?: number }) => ipcRenderer.invoke('kb:brain:list-notes', p),
      proposalInbox: (p: { kbId: string; page?: number; pageSize?: number }) => ipcRenderer.invoke('kb:brain:proposal-inbox', p),
      decideProposal: (p: { noteId: string; action: 'publish' | 'publish-edited' | 'reject'; patch?: { title?: string; body?: string; description?: string } }) =>
        ipcRenderer.invoke('kb:brain:decide-proposal', p),
      listLens: (kbId: string) => ipcRenderer.invoke('kb:brain:list-lens', { kbId }),
      upsertLens: (p: { kbId: string; id?: string; title: string; description: string; attendTo: string[]; questions: string[] }) =>
        ipcRenderer.invoke('kb:brain:upsert-lens', p),
      captureReading: (p: { kbId: string; documentId: string; chapterId?: string; chapterHash?: string; quote: string; remark: string; startOffset?: number; endOffset?: number; lensNoteId?: string }) =>
        ipcRenderer.invoke('kb:brain:capture-reading', p),
      stats: (kbId: string) => ipcRenderer.invoke('kb:brain:stats', { kbId }),
      healthCheck: (kbId: string) => ipcRenderer.invoke('kb:brain:health-check', { kbId }),
      search: (p: { knowledgeBaseId: string; query: string; topK?: number; include?: string[]; lensNoteId?: string; intent?: string }) =>
        ipcRenderer.invoke('kb:brain:search', p),
      distill: (p: { kbId: string; documentIds?: string[] }) => ipcRenderer.invoke('kb:brain:distill', p),
      digestDocument: (documentId: string) => ipcRenderer.invoke('kb:brain:digest-document', { documentId }),
      conflicts: (kbId: string) => ipcRenderer.invoke('kb:brain:conflicts', { kbId }),
      resolveConflict: (p: { atomId: string; verdict: 'supported' | 'superseded'; supersededByAtomId?: string }) =>
        ipcRenderer.invoke('kb:brain:resolve-conflict', p),
      research: (question: string) => ipcRenderer.invoke('kb:brain:research', { question }),
      exportSkill: (noteId: string) => ipcRenderer.invoke('kb:brain:export-skill', { noteId }),
      taste: (kbId: string) => ipcRenderer.invoke('kb:brain:taste', { kbId }),
      onResearch: (cb: (data: { phase: string; detail: string }) => void) => {
        const h = (_e: unknown, data: { phase: string; detail: string }): void => cb(data)
        ipcRenderer.on('kb:brain:research', h)
        return () => ipcRenderer.removeListener('kb:brain:research', h)
      },
      listModels: () => ipcRenderer.invoke('kb:brain:list-models'),
      goalRun: (p: { kbId: string; goalId: string }) => ipcRenderer.invoke('kb:brain:goal-run', p),
      goalStatus: (kbId: string) => ipcRenderer.invoke('kb:brain:goal-status', { kbId }),
      reviewNext: (p: { kbId: string; limit?: number }) => ipcRenderer.invoke('kb:brain:review-next', p),
      reviewGrade: (p: { kbId: string; noteId: string; rating: 1 | 2 | 3 | 4 }) => ipcRenderer.invoke('kb:brain:review-grade', p),
      onProgress: (cb: (data: { documentId: string; phase: string; progress: number }) => void) => {
        const h = (_e: unknown, data: { documentId: string; phase: string; progress: number }): void => cb(data)
        ipcRenderer.on('kb:brain:progress', h)
        return () => ipcRenderer.removeListener('kb:brain:progress', h)
      },
      onStatus: (cb: (data: { documentId: string; brainStatus: string; error?: string }) => void) => {
        const h = (_e: unknown, data: { documentId: string; brainStatus: string; error?: string }) => cb(data)
        ipcRenderer.on('kb:brain:status', h)
        return () => ipcRenderer.removeListener('kb:brain:status', h)
      },
    },
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
    // 继续处理（断点续跑：保留已有向量，只补未完成部分）
    resumeDocument: (documentId: string) => ipcRenderer.invoke('knowledge-base:resume-document', documentId),
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

  // 信息搜集（ic:* 全部由 info-collection 包 handler 提供，返回 { success, data?, error? }；
  // 设计 docs/design/2026-10-07-info-collection-design.md）

  // 人像设计相关

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
    // ==================== 设定资产库（世界观库 + 角色 IP 库，2026-09-24 P0） ====================
    library: {
      worldList: (includeArchived?: boolean) =>
        ipcRenderer.invoke('longwriting:library:world:list', includeArchived),
      worldGet: (id: string) =>
        ipcRenderer.invoke('longwriting:library:world:get', id),
      worldCreate: (req: { name: string; genre: string; tagline?: string; description?: string; tags?: string[]; fromTemplate?: string }) =>
        ipcRenderer.invoke('longwriting:library:world:create', req),
      worldUpdate: (id: string, req: Record<string, unknown>) =>
        ipcRenderer.invoke('longwriting:library:world:update', id, req),
      worldDelete: (id: string) =>
        ipcRenderer.invoke('longwriting:library:world:delete', id),
      worldSeedTemplate: (worldId: string, templateId: string) =>
        ipcRenderer.invoke('longwriting:library:world:seedTemplate', worldId, templateId),
      worldExport: (worldId: string) =>
        ipcRenderer.invoke('longwriting:library:world:export', worldId),
      worldImport: (payload: Record<string, unknown>, opts?: { rename?: string }) =>
        ipcRenderer.invoke('longwriting:library:world:import', payload, opts),
      worldKindList: (worldId: string) =>
        ipcRenderer.invoke('longwriting:library:worldKind:list', worldId),
      worldKindCreate: (data: { worldId: string; key: string; label: string; icon?: string | null; sortOrder?: number; fieldsSchema?: unknown[] | null; promptHint?: string | null }) =>
        ipcRenderer.invoke('longwriting:library:worldKind:create', data),
      worldKindDelete: (id: string, worldId: string) =>
        ipcRenderer.invoke('longwriting:library:worldKind:delete', id, worldId),
      worldEntryList: (worldId: string, kindKey?: string) =>
        ipcRenderer.invoke('longwriting:library:worldEntry:list', worldId, kindKey),
      worldEntryGet: (id: string) =>
        ipcRenderer.invoke('longwriting:library:worldEntry:get', id),
      worldEntryCreate: (req: Record<string, unknown>) =>
        ipcRenderer.invoke('longwriting:library:worldEntry:create', req),
      worldEntryUpdate: (id: string, req: Record<string, unknown>) =>
        ipcRenderer.invoke('longwriting:library:worldEntry:update', id, req),
      worldEntryDelete: (id: string) =>
        ipcRenderer.invoke('longwriting:library:worldEntry:delete', id),
      worldEntryReorder: (orderList: { id: string; order: number }[]) =>
        ipcRenderer.invoke('longwriting:library:worldEntry:reorder', orderList),
      worldEdgeList: (worldId: string) =>
        ipcRenderer.invoke('longwriting:library:worldEdge:list', worldId),
      worldEdgeCreate: (data: { worldId: string; sourceId: string; targetId: string; relationType: string; label?: string | null }) =>
        ipcRenderer.invoke('longwriting:library:worldEdge:create', data),
      worldEdgeDelete: (id: string) =>
        ipcRenderer.invoke('longwriting:library:worldEdge:delete', id),
      ipList: (includeArchived?: boolean) =>
        ipcRenderer.invoke('longwriting:library:ip:list', includeArchived),
      ipGet: (id: string) =>
        ipcRenderer.invoke('longwriting:library:ip:get', id),
      ipCreate: (req: Record<string, unknown>) =>
        ipcRenderer.invoke('longwriting:library:ip:create', req),
      ipUpdate: (id: string, req: Record<string, unknown>) =>
        ipcRenderer.invoke('longwriting:library:ip:update', id, req),
      ipDelete: (id: string) =>
        ipcRenderer.invoke('longwriting:library:ip:delete', id),
      ipEdgeList: (characterId: string) =>
        ipcRenderer.invoke('longwriting:library:ipEdge:list', characterId),
      ipEdgeCreate: (req: { sourceId: string; targetId: string; relationType: string; label?: string | null; description?: string | null }) =>
        ipcRenderer.invoke('longwriting:library:ipEdge:create', req),
      ipEdgeDelete: (id: string) =>
        ipcRenderer.invoke('longwriting:library:ipEdge:delete', id),
      listWorldBindings: (projectId: string) =>
        ipcRenderer.invoke('longwriting:library:listWorldBindings', projectId),
      bindWorld: (req: { projectId: string; worldId: string; isPrimary?: boolean; config?: Record<string, unknown> | null }) =>
        ipcRenderer.invoke('longwriting:library:bindWorld', req),
      unbindWorld: (projectId: string, worldId: string) =>
        ipcRenderer.invoke('longwriting:library:unbindWorld', projectId, worldId),
      setPrimaryWorld: (projectId: string, bindingId: string) =>
        ipcRenderer.invoke('longwriting:library:setPrimaryWorld', projectId, bindingId),
      updateWorldBindingConfig: (id: string, config: Record<string, unknown> | null) =>
        ipcRenderer.invoke('longwriting:library:updateWorldBindingConfig', id, config),
      importWorldEntry: (projectId: string, entryId: string) =>
        ipcRenderer.invoke('longwriting:library:importWorldEntry', projectId, entryId),
      listIpBindings: (projectId: string) =>
        ipcRenderer.invoke('longwriting:library:listIpBindings', projectId),
      listIpProjects: (ipCharacterId: string) =>
        ipcRenderer.invoke('longwriting:library:listIpProjects', ipCharacterId),
      importIpCharacter: (req: { projectId: string; ipCharacterId: string; rolePosition?: string }) =>
        ipcRenderer.invoke('longwriting:library:importIpCharacter', req),
      unbindIpCharacter: (projectId: string, ipCharacterId: string, deleteProjectCharacter?: boolean) =>
        ipcRenderer.invoke('longwriting:library:unbindIpCharacter', projectId, ipCharacterId, deleteProjectCharacter),

      // ---- P1（2026-09-25）：AI 生成 / 反向沉淀 / 同步 diff ----
      worldGenerate: (req: { eventId: string; worldId: string; kindKey: string; count?: number; requirements?: string; providerConfigId?: string; modelId?: string }) =>
        ipcRenderer.invoke('longwriting:library:world:generate', req),
      ipGenerate: (req: { eventId: string; seedIdea: string; worldId?: string | null; requirements?: string; providerConfigId?: string; modelId?: string }) =>
        ipcRenderer.invoke('longwriting:library:ip:generate', req),
      ipGenerateLayer: (req: { eventId: string; step: number; seedIdea: string; worldId?: string | null; confirmed: Record<string, unknown>; requirements?: string; variation?: boolean; providerConfigId?: string; modelId?: string }) =>
        ipcRenderer.invoke('longwriting:library:ip:generateLayer', req),
      promoteToIp: (projectId: string, characterId: string) =>
        ipcRenderer.invoke('longwriting:library:promoteToIp', projectId, characterId),
      promoteToLibrary: (req: { worldId: string; entityType: string; entityId: string; kindKey?: string }) =>
        ipcRenderer.invoke('longwriting:library:promoteToLibrary', req),
      syncPreview: (projectId: string) =>
        ipcRenderer.invoke('longwriting:library:syncPreview', projectId),
      syncApply: (projectId: string, targets: Array<{ entityType: string; projectEntityId: string }>) =>
        ipcRenderer.invoke('longwriting:library:syncApply', projectId, targets),
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
    updateEntry: (id: string, data: { title?: string; content?: string; tags?: string[]; frontmatter?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_UPDATE_ENTRY, { id, request: data }),
    deleteEntry: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_DELETE_ENTRY, id),
    moveEntry: (id: string, targetFolderId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_MOVE_ENTRY, { id, targetFolderId }),

    search: (keyword: string, folderId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_SEARCH, { keyword, folderId }),

    getBacklinks: (entryId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_GET_BACKLINKS, entryId),

    listDeleted: () =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_LIST_DELETED),
    restoreEntry: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_RESTORE_ENTRY, id),
    purgeEntry: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_PURGE_ENTRY, id),
    emptyTrash: () =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_EMPTY_TRASH),
    listByDateRange: (from: string, to: string, folderId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_LIST_BY_DATE_RANGE, { from, to, folderId }),
    listAllEntries: (limit?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_LIST_ALL_ENTRIES, limit),
    getOnThisDay: (limit?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_GET_ON_THIS_DAY, limit),
    getInspiration: (entryId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_GET_INSPIRATION, entryId),
    setFolderBrainOptIn: (folderId: string, enabled: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_SET_FOLDER_BRAIN_OPT_IN, { folderId, enabled }),
    uploadAttachment: (data: { entryId: string; fileName: string; base64: string; mimeType?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_UPLOAD_ATTACHMENT, data),
    deleteAttachment: (attachmentId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_DELETE_ATTACHMENT, attachmentId),
    describeAttachment: (attachmentId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_DESCRIBE_ATTACHMENT, attachmentId),
    getWritingPrompt: () =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_GET_WRITING_PROMPT),
    createReflection: (data: { cardTitle: string; reflectionText: string; kbName?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_CREATE_REFLECTION, data),

    exportHtml: (entryId: string, outputPath?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_EXPORT_HTML, { entryId, outputPath }),
    exportPdf: (entryId: string, outputPath?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_EXPORT_PDF, { entryId, outputPath }),
    exportDocx: (entryId: string, outputPath?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIARY_EXPORT_DOCX, { entryId, outputPath })
  },

  // 剧集制作相关

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
