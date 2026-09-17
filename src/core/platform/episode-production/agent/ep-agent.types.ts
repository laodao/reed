/**
 * 剧集制作 · 对话式工作流 Agent · 类型定义
 * @module platform/episode-production/agent/ep-agent.types
 *
 * 参考长文写作 agent（src/core/platform/services/longwriting/agent/agent.types.ts）复刻的范式：
 * 用户消息 → AI 决策（JSON: reply + actions）→ 引擎执行动作（调用现有生成/落库能力）
 *       → AI 总结（流式回复）。工作流 = 依赖规则 + 生产状态，顺序由 AI 推进。
 *
 * 动作全部映射到现有 episode-production 真实服务（script / scene / storyboard / asset 等），
 * 严禁写死或假数据。
 */

import type { SceneScript, Storyboard } from '@shared/types/episode-production'

// ==================== 生产动作 ====================

/**
 * 剧集制作生产动作类型（映射现有生成/落库能力）
 */
export type EpAgentActionType =
  | 'generate_script'          // 生成整集剧本（synopsis + 结构化场景 + 正文）
  | 'split_scenes'             // 从剧本 synopsis 拆分场景
  | 'generate_storyboards'     // 按场景批量生成分镜
  | 'generate_keyframes'       // 为分镜生成关键帧图（2026-09-16 后半程工具）
  | 'generate_segment_video'   // 生成分镜/片段视频（2026-09-16 后半程工具）
  | 'generate_scene_audio'     // 场景配音（对白+旁白 TTS，2026-09-16 后半程工具）
  | 'export_mp4'               // 整集合成导出 MP4（2026-09-16 后半程工具）
  | 'generate_char_asset'      // 为角色生成定妆主图
  | 'generate_location_asset'  // 为地点生成主图
  | 'generate_item_asset'      // 为物品生成主图
  | 'update_entity'            // 修改已有资产（角色/地点/物品）
  | 'delete_entity'            // 删除已有资产（角色/地点/物品）
  | 'query_database'           // 查询外部数据库（工作流数据源：参数化 SQL 读真实第三方库）

/** AI 决策输出（system prompt 约束为纯 JSON） */
export interface EpAgentAction {
  type: EpAgentActionType
  params?: Record<string, any>
}

/** AI 决策输出（system prompt 约束为纯 JSON） */
export interface EpAgentDecision {
  reply?: string
  actions?: EpAgentAction[]
  /** 需要用户先选择的参数（多轮确认）。如生成定妆图但未指定角色 → choice.param='name', choices=角色名单 */
  choice?: EpAgentChoice
}

/** 多轮确认：需要用户从一组候选里选一个（供 action 的某个 params 字段） */
export interface EpAgentChoice {
  /** 需要填充的 action 类型 */
  actionType: EpAgentActionType
  /** 需要填充的 params 字段名（如 'name'） */
  param: string
  /** 供用户选择的候选（如角色名列表） */
  choices: string[]
  /** 提示语（如何选择） */
  prompt?: string
}

// ==================== 执行摘要 / 事件 ====================

export type EpAgentActionStatus = 'ok' | 'error' | 'skipped'

/** 单个动作执行摘要（喂给总结调用 + 写入对话 metadata） */
export interface EpAgentActionSummary {
  type: EpAgentActionType
  status: EpAgentActionStatus
  /** 人类可读结果（如"已生成剧本：第1集《xxx》，含 5 场"） */
  message: string
  /** 变更分区（前端数据面板刷新用） */
  changed?: EpAgentPanelSection[]
  /** 预览数据（前端对话内嵌预览卡用） */
  data?: any
  /** 跳转意图（前端可据此自动切 tab / 定位） */
  nav?: EpAgentNavTarget
  /** 失败原因（status=error 时） */
  error?: string
}

/** 数据面板分区（Tab + 事件 changed） */
export type EpAgentPanelSection =
  | 'script'
  | 'scenes'
  | 'storyboards'
  | 'assets'
  | 'compose'

/**
 * 动作结果跳转意图：前端 action:done 后据此自动切到对应 tab/定位。
 * tab 对应工作台 tab（script/asset/storyboard/compose）；asset 用于切到资产页定位某资产。
 */
export interface EpAgentNavTarget {
  tab: 'script' | 'asset' | 'storyboard' | 'compose'
  sceneId?: string | null
  asset?: { kind: 'character' | 'location' | 'item'; id: string; name: string } | null
}

/** 推给前端的事件（channel: ep-agent:${projectId}:${episodeId}） */
export type EpAgentEvent =
  | { type: 'stage'; stage: 'deciding' | 'acting' | 'summarizing' }
  | { type: 'action:start'; actionType: EpAgentActionType; label: string }
  | { type: 'action:done'; summary: EpAgentActionSummary }
  | { type: 'reply:start'; summaryEventId: string }
  | { type: 'reply:content'; content: string }
  | { type: 'reply:done'; suggestions: string[] }
  | { type: 'error'; error: string }
  | { type: 'choice:request'; choice: EpAgentChoice; approvalId?: string; pendingInput?: Record<string, unknown> }

// ==================== 生产状态（引擎实时计算，不持久化） ====================

/**
 * 剧集当前生产状态（用于决策上下文 + 前端进度）。
 * 以 episode 为粒度。
 */
export interface EpAgentProductionState {
  /** 项目快照（2026-09-16 S-04 上下文注入：项目名进系统快照） */
  project?: { name: string | null }
  episode: {
    id: string | null
    title?: string | null
    episodeNumber?: number | null
    status?: string | null
    hasScript: boolean
    synopsis?: string | null
    scriptContent?: string | null
    /** ⑥ 合成完成标记（成功导出 MP4 的路径；2026-09-16 P0-CM2 后真实落库） */
    composedVideoPath?: string | null
  }
  scenes: { total: number; countWithBindings: number; locations: string[] }
  storyboards: { total: number; scenesCovered: number; scenesTotal: number }
  assets: {
    characters: { count: number; names: string[] }
    locations: { count: number; names: string[] }
    items: { count: number; names: string[] }
  }
  /** 后半程生产进度（2026-09-16 后半程工具配套快照；供模型判断下一步与成本） */
  production?: {
    /** 已出片的分镜数（storyboard.videoPath 非空） */
    storyboardsWithVideo: number
    /** 已有关键帧图的分镜数 */
    storyboardsWithKeyframes: number
    /** 已配音场景数（旁白或有对白音频） */
    scenesWithAudio: number
  }
  /** 可查询的外部数据源名单「名称（id）」（≤5；query_database 决策依据） */
  dataSources?: string[]
}

// ==================== 动作执行上下文 ====================

export interface EpAgentExecutionContext {
  projectId: string
  episodeId: string
  providerConfigId?: string
  modelId?: string
  db: any
  ai: any
  emit: (event: EpAgentEvent) => void
  /** 工具调用的中止信号（0916 review：批量长工具循环在步边界感知取消/超时，及时停烧） */
  signal?: AbortSignal
}

// ==================== 服务结果 ====================

export interface EpAgentSendResult {
  conversationId: string
  /** 已持久化的 assistant 消息（含 metadata） */
  assistantMessage: any
  /** 本轮动作摘要（前端可直接用） */
  actionSummaries: EpAgentActionSummary[]
  /** 下一步建议 chips */
  suggestions: string[]
  /** 待用户选择的多轮确认（有值表示本轮未执行动作，需用户先选择） */
  choice?: EpAgentChoice | null
}

/** 对话历史条目（含可选元数据） */
export interface EpAgentHistoryItem {
  id?: string
  role: string
  content: string
  timestamp: number
  metadata?: string | null
}

// ==================== 对话常量 ====================

/** 对话上下文注入的历史条数上限 */
export const EP_AGENT_HISTORY_LIMIT = 20

// ==================== harness 直驱（M6.5-a，35 号） ====================

/** harness 模式的 definition id（轨迹/会话定位用） */
export const EP_AGENT_DEFINITION_ID = 'ep-agent'
/** harness 模式每轮最大步数（研究/制作混合负载；12=chat 宿主同量级） */
export const EP_AGENT_MAX_STEPS = 12
/** 切换开关：env EP_AGENT_HARNESS='0' 回退旧三段式协议（默认 harness） */
export function isEpAgentHarnessEnabled(): boolean {
  return process.env.EP_AGENT_HARNESS !== '0'
}
/** 生成动作的并发言上限（动作串行执行，此值保留语义） */
export const EP_AGENT_MAX_ACTIONS_PER_TURN = 3

/** 类型占位（避免未使用导入告警）——保持 SceneScript / Storyboard 类型在模块可见 */
export type EpAgentSceneRef = SceneScript
export type EpAgentStoryboardRef = Storyboard
