/**
 * episode-production · 流程（项目/剧集状态） · 类型定义
 * @module shared/types/episode-production/workflow.types
 * @description 剧集生产流程类型：项目状态枚举、剧集状态枚举、项目/剧集领域对象及数据库记录。
 *
 * 注：原类型定义来自 src/shared/types/story-to-video.types.ts，
 *     P1 拆分后旧文件改为 deprecated re-export。修改请改本文件。
 */

import type { TransitionType } from './compose.types'
// TODO(P2): VideoEpisode.audioTracks 应改为 audioTrackIds: string[]（关系引用），届时可移除对 render.types 的依赖。
import type { AudioTrack } from './render.types'

/**
 * 项目状态
 */
export type ProjectStatus = 'draft' | 'producing' | 'completed'

/**
 * 剧集状态
 *
 * P2 变更（spec §2.4）：
 * - 新增 'asset_prep'：已识别角色/地点/物品，等待素材确认
 * - 'reviewing' 改名为 'composing'：合成/后期审查阶段
 */
export type EpisodeStatus =
  | 'pending'
  | 'asset_prep'      // P2 新增（spec §2.4）：已识别要素，等待素材确认
  | 'scripting'
  | 'storyboarding'
  | 'producing'
  | 'composing'       // P2 改名（旧 'reviewing'）：合成/后期审查阶段
  | 'completed'

/**
 * 剧集内容来源类型
 */
export type EpisodeSourceType = 'outline' | 'uploaded'

/**
 * 上传长文识别的角色（FU5-B2 扩展：source / confirmed / lw 关联 + 客户端临时 id）
 * 2026-05-27 扩展：AI 识别时直接输出 age / gender / race，减少后续手动填写
 */
export interface UploadedCharacter {
  /** 客户端临时 id，用于 v-for key + 用户取舍跟踪；服务端不强制要求 */
  id?: string
  name: string
  description?: string
  role?: string // 主角、配角、反派等
  /** AI 识别时的年龄推断（可选，减少后续手动填写） */
  age?: number
  /** AI 识别时的性别推断（可选） */
  gender?: string
  /** AI 识别时的人种/种族推断（可选） */
  race?: string
  /** 双来源标签（spec §1.2）；缺省按 lw_*_id 是否存在推断（有→linked_lw，否→standalone） */
  sourceType?: 'linked_lw' | 'standalone'
  /** 已绑定的长文角色 id（linked_lw 时有值） */
  longWritingCharacterId?: string
  /** 用户是否确认该实体进入剧集；缺省 true（FU5-B2 用户取舍 §2.D-1） */
  confirmed?: boolean
}

/**
 * 上传长文识别的地点
 */
export interface UploadedLocation {
  id?: string
  name: string
  description?: string
  type?: string // 地点类型
  sourceType?: 'linked_lw' | 'standalone'
  longWritingLocationId?: string
  confirmed?: boolean
}

/**
 * 上传长文识别的物品
 */
export interface UploadedItem {
  id?: string
  name: string
  description?: string
  type?: string // 物品类型
  sourceType?: 'linked_lw' | 'standalone'
  longWritingItemId?: string
  confirmed?: boolean
}

/**
 * 剧集项目配置
 */
export interface VideoProjectConfig {
  // 视频设置
  resolution: '1080p' | '720p' | '4k'
  aspectRatio: '16:9' | '9:16' | '1:1'
  fps: 24 | 30 | 60

  // 音频设置
  defaultNarratorVoice: string // 默认旁白声音
  defaultCharacterVoice: string // 默认角色声音
  backgroundMusicEnabled: boolean
  backgroundMusicVolume: number // 0-100

  // 模型设置（各环节独立配置）
  // 剧本生成模型
  scriptModel?: {
    providerConfigId: string
    modelId: string
  }
  // 分镜生成模型
  storyboardModel?: {
    providerConfigId: string
    modelId: string
  }
  // 画面生成模型
  imageModel?: {
    providerConfigId: string
    modelId: string
  }
  // 视频合成模型
  videoModel?: {
    providerConfigId: string
    modelId: string
  }
  // 音频生成模型
  audioModel?: {
    providerConfigId: string
    modelId: string
  }

  // 图像设置
  imageProviderId: string // 图像生成提供商
  imageModelId: string // 图像模型
  imageStyle: string // 图像风格（写实/动漫/插画等）— 历史字段，仅作 fallback；新代码用 styleAnchors

  /**
   * 项目级风格锚点（spec 2026-05-08）。新建剧集项目时选择，作为该项目下所有
   * character / location / item 资产的默认风格 — 资产自身 styleAnchors 为空时继承本字段，
   * 资产已填则不覆盖。所有主图 / 派生图 prompt 也会拼上项目风格作为兜底锚点。
   */
  styleAnchors?: string[]

  // 默认镜头设置
  defaultShotDuration: number // 默认分镜时长（秒）
  defaultTransitionType: TransitionType // 默认转场类型
  defaultTransitionDuration: number // 默认转场时长（毫秒）

  /**
   * 视频片段时长预算（秒，5–30，默认 15）。
   * 视频片段制（tasks/2026-09-04-ep-video-segment-redesign §3）：自动分段时
   * 同场景内连续镜头累加时长不超过该预算。缺失/非法 → 15s。
   */
  segmentDurationBudgetSec?: number
}

/**
 * 剧集项目
 */
export interface VideoProject {
  id: string
  name: string
  longWritingProjectId?: string // 关联的长文项目（可选）
  status: ProjectStatus
  config: VideoProjectConfig
  createdAt: number
  updatedAt: number
}

/**
 * 项目卡片用聚合视图（FU5-A1 / 原型 00 项目列表）。
 *
 * 给项目列表卡片用，避免渲染时 N+1 查 episodes / 计算进度。
 * 后端 listSummaries IPC 一次性返回。
 *
 * - episodeCount         项目下剧集数
 * - currentStageLabel    "第 N 集 进行中" / "已完成" 等供卡片底部显示
 * - progressPct          0-100 项目级总进度（按所有剧集 status 平均）
 * - sourceType           linked_lw（项目关联了长文）/ standalone（独立剧集）
 */
export interface VideoProjectSummary extends VideoProject {
  episodeCount: number
  currentStageLabel: string | null
  progressPct: number
  sourceType: 'linked_lw' | 'standalone'
}

/**
 * 剧集（对应一个章节或上传的长文）
 */
export interface VideoEpisode {
  id: string
  projectId: string
  sourceType: EpisodeSourceType // 内容来源类型
  outlineId?: string // 关联的长文大纲节点（outline 模式时有值）
  uploadedContent?: string // 上传的长文内容（uploaded 模式时有值）
  uploadedCharacters?: UploadedCharacter[] // 识别的角色（uploaded 模式时有值）
  uploadedLocations?: UploadedLocation[] // 识别的地点（uploaded 模式时有值）
  uploadedItems?: UploadedItem[] // 识别的物品（uploaded 模式时有值）
  episodeNumber: number // 剧集序号
  title: string
  status: EpisodeStatus
  duration: number // 时长（秒）

  // 关联剧本
  scriptId?: string

  /** ⑥ 合成完成标记：成功导出 MP4 的路径（user-rel 优先）。stage-gate ⑥ 判定依据。 */
  composedVideoPath?: string | null

  // 音轨
  audioTracks: AudioTrack[]

  // ─── 故事背景（spec 2026-05-08 ① 内容页"故事背景卡"，参与主图 prompt） ───
  /** 故事年代（如"民国初年"/"唐代盛世"） */
  storyEra?: string
  /** 故事地域（如"江南水乡"/"东京涩谷"） */
  storyRegion?: string
  /** 其他背景描述（自由文本：阶级 / 文化 / 关键事件） */
  storyBackgroundExtra?: string

  createdAt: number
  updatedAt: number
}

/**
 * 剧集更新载荷 — 可更新字段为 VideoEpisode 中除身份/时间戳外的全部字段；
 * 用于前后端 update 接口的统一类型契约（store · handler · repository）。
 */
export type UpdateVideoEpisodeData = Partial<
  Omit<VideoEpisode, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>
>

/**
 * 缺失项详情（spec §2.3 软引导提示用 · P6-T16）
 */
export interface StageGap {
  code: string
  message: string
  /** 可选：跳转目标（如 sceneId / bindingId） */
  targetId?: string
}

/**
 * 阶段进入决策结果（P6-T16 软引导）
 */
export interface StageEnterDecision {
  allowed: boolean
  /** 缺失项列表（allowed=true 时为空） */
  gaps: StageGap[]
  /** 即使 allowed=false，是否允许"仍要进入"（前向软关卡=true；末端硬锁=false） */
  canForce: boolean
}

/**
 * 单阶段进度（顶部进度条 + 工作台总览用）
 *
 * P6-T13：从 core/progress-calculator 提到 shared 层，让前端组件能直接 import 类型。
 */
export interface StageProgress {
  /** 阶段 status（pending / asset_prep / scripting / storyboarding / producing / composing） */
  stage: EpisodeStatus
  /** 中文标签（如 "① 内容"） */
  label: string
  /** 是否完整（StageGateService.checkStageComplete=true） */
  complete: boolean
  /** 0~1，1 表示完成 */
  progress: number
  /** 视觉标记 ✓（已完成）/ ●（进行中）/ ○（未到） */
  mark: '✓' | '●' | '○'
  /** 缺失项数（incomplete 时） */
  gapCount: number
}

/**
 * 整剧进度（顶部进度条 + 工作台总览用）
 */
export interface EpisodeProgress {
  episodeId: string
  currentStatus: EpisodeStatus
  /** 6 个生产阶段（不含 completed 终态） */
  stages: StageProgress[]
  /** 整剧进度 0~1，6 阶段平均 */
  overallProgress: number
}

/**
 * 数据库中的剧集项目记录
 */
export interface VideoProjectRecord {
  id: string
  name: string
  long_writing_project_id: string | null  // 可能为空
  status: ProjectStatus
  config: string // JSON
  created_at: number
  updated_at: number
}

/**
 * 数据库中的剧集记录
 */
export interface VideoEpisodeRecord {
  id: string
  project_id: string
  source_type: string // 内容来源类型
  outline_id: string | null // 关联的大纲ID（可空）
  uploaded_content: string | null // 上传的长文内容
  uploaded_characters: string | null // 识别的角色（JSON）
  uploaded_locations: string | null // 识别的地点（JSON）
  uploaded_items: string | null // 识别的物品（JSON）
  episode_number: number
  title: string
  status: EpisodeStatus
  duration: number
  script_id: string | null
  audio_tracks: string // JSON
  deleted_at: number | null
  created_at: number
  updated_at: number
}
