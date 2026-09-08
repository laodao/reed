/**
 * 故事研讨室（Story Room）共享类型
 * @module shared/types/story-room.types
 *
 * core（宿主/服务）/ preload / renderer 三端共用的 wire 类型。
 * 产品设计：docs/design/2026-09-04-story-room-design.md（v2.1 harness 化修订）。
 * 存储约定：房间状态存 `lw_projects.wizard_state` 的 `room` 子键（零 schema 变更）；
 * 消息存 `lw_design_messages`（conversation_id = `room:{projectId}`）。
 */

import type { DesignMessage } from './longwriting.types'

// ==================== 阶段与内容目标 ====================

/** 研讨阶段：故事核 → 人物 → 故事线 → 大纲 → 写作（交接编辑器） */
export type RoomPhaseId = 'story-core' | 'characters' | 'plots' | 'outline' | 'writing'

/** 内容目标：长篇小说 / 短剧剧本（大纲阶段换分集策略，终点换转短剧桥） */
export type ContentTarget = 'novel' | 'script'

// ==================== 共识账本 ====================

export type ConsensusKind = 'premise' | 'character' | 'plot' | 'world' | 'tone' | 'taboo'

export type ConsensusStatus = 'tentative' | 'confirmed' | 'rejected'

/** 共识账本条目：讨论成果的轻量沉淀（rejected 同样保留——防 AI 重复推荐被否方案） */
export interface ConsensusEntry {
  id: string
  kind: ConsensusKind
  /** 「主角动机 = 洗冤复仇」式短句 */
  title: string
  /** 支撑细节（最多 3 条） */
  points: string[]
  status: ConsensusStatus
  /** 出自第几轮对话（可溯源） */
  sourceTurn: number
  updatedAt: number
}

// ==================== 提炼卡片 ====================

/** 卡片种类：概要/人物/故事线/世界/大纲/章节/矛盾（设计文档 §4.1 七类） */
export type ArtifactCardKind = 'overview' | 'character' | 'plot' | 'world' | 'outline' | 'chapter' | 'conflict'

export type ArtifactCardStatus = 'pending' | 'adopted' | 'ignored' | 'failed'

/**
 * 提炼卡片：整理器产出的结构化草案。`data` 与落库函数（story-persist）的
 * 输入同构——采纳即直接落库。
 */
export interface ArtifactCard {
  id: string
  kind: ArtifactCardKind
  /** 「人物卡 · 林晓」式标题 */
  title: string
  data: Record<string, any>
  status: ArtifactCardStatus
  /** provenance：出自第几~第几轮对话 */
  sourceTurns: number[]
  /** 大纲卡逐卷序号（逐卷确认用）；分集大纲卡为集号 */
  volumeIndex?: number
  /** 最近一次「按反馈重提」的反馈原文 */
  feedback?: string
  /** 采纳/失败结果回执 */
  resultNote?: string
  createdAt: number
}

// ==================== 房间状态（wizard_state.room） ====================

/** 研讨室持久状态——`lw_projects.wizard_state.room` 子键 */
export interface RoomWorkspaceState {
  ledger: ConsensusEntry[]
  /** 前情提要（滚动摘要）：账本记结论，摘要记过程 */
  summary: string
  /** 已摘要至第几轮 */
  summarizedTurn: number
  /** 当前轮号（每轮对话 +1，从 1 起） */
  turnNo: number
  phase: RoomPhaseId
  contentTarget: ContentTarget
  /** 待处理卡片（提炼后 pending，采纳/忽略后终态） */
  pendingCards: ArtifactCard[]
  cardSeq: number
}

export function defaultRoomState(): RoomWorkspaceState {
  return {
    ledger: [],
    summary: '',
    summarizedTurn: 0,
    turnNo: 0,
    phase: 'story-core',
    contentTarget: 'novel',
    pendingCards: [],
    cardSeq: 0,
  }
}

// ==================== 事件（longwriting:room:{projectId}） ====================

export type RoomEventType =
  | 'message:delta'
  | 'message:done'
  | 'ledger:update'
  | 'card:ready'
  | 'card:update'
  | 'phase:changed'
  | 'gate:suggest'
  | 'distill:start'
  | 'error'

export type RoomEvent =
  | { type: 'message:delta'; text: string }
  | { type: 'message:done'; message: RoomMessageView }
  | { type: 'ledger:update'; ledger: ConsensusEntry[] }
  | { type: 'card:ready'; cards: ArtifactCard[] }
  | { type: 'card:update'; card: ArtifactCard }
  | { type: 'phase:changed'; phase: RoomPhaseId }
  | { type: 'gate:suggest'; toPhase: RoomPhaseId; reason: string }
  | { type: 'distill:start'; scope: DistillScope }
  | { type: 'error'; error: string }

// ==================== 视图 / 请求类型 ====================

/** 消息视图：metadata 已带轮次/阶段（JSON 字符串透传，前端解析） */
export interface RoomMessageView extends Omit<DesignMessage, 'metadata'> {
  id?: string
  metadata?: string
}

export interface RoomStateView {
  projectId: string
  phase: RoomPhaseId
  contentTarget: ContentTarget
  ledger: ConsensusEntry[]
  summary: string
  turnNo: number
  pendingCards: ArtifactCard[]
}

/** 按需提炼范围（设计文档 §9） */
export type DistillScope = 'overview' | 'characters' | 'plots' | 'world' | 'outline'

/** 账本用户操作（确认/否决/丢弃/修改一句话） */
export type LedgerOpInput =
  | { action: 'confirm'; entryId: string }
  | { action: 'reject'; entryId: string }
  | { action: 'discard'; entryId: string }
  | { action: 'revise'; entryId: string; title?: string; points?: string[] }
