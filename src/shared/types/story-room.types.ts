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

/** 卡片种类：概要/人物/故事线/世界/大纲/章节/矛盾 + custom（动态分类，P0） */
export type ArtifactCardKind = 'overview' | 'character' | 'plot' | 'world' | 'outline' | 'chapter' | 'conflict' | 'custom' | 'foreshadow'

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

// ==================== 设计包（长程任务产物，整体确认制） ====================

/**
 * 设计包条目：长程任务（design 模式）中 Agent 通过 lw_save_* 工具落下的
 * 草稿项。确认前不碰正式表——「全部设计完整体让用户确认」的载体。
 */
export type DesignItemKind = 'card' | 'event' | 'relation' | 'design_doc'

/** 关系草稿：新增走名称解析建边；endOf 存在时为"终结某段关系" */
export interface DesignRelationPayload {
  sourceType?: 'character' | 'location' | 'item' | 'faction' | 'skill'
  sourceName: string
  targetType?: 'character' | 'location' | 'item' | 'faction' | 'skill'
  targetName: string
  /** new=新关系（默认）；ended=终结 source↔target 间 relationType 的仍生效边 */
  changeType?: 'new' | 'ended'
  relationType: string
  description?: string
  /** 自第几章起生效（研讨期默认 1；写作期=当前章） */
  validFromChapter?: number
}

/** 事件草稿：chapterNumber=0 表示规划中未锚定（state=planned） */
export interface DesignEventPayload {
  name: string
  description?: string
  involvedEntities?: Array<{ type: string; id?: string; name: string }>
  stateBefore?: string
  stateAfter?: string
  chapterNumber?: number
}

export interface DesignItem {
  id: string
  kind: DesignItemKind
  /** 卡片/关系/事件的人类标题（确认面板展示） */
  label: string
  /** kind=card 时为完整 ArtifactCard（data 与 story-persist 输入同构） */
  payload: Record<string, any>
  note?: string
  createdAt: number
}

export interface DesignPackage {
  id: string
  /** 「反派角色与势力网设计」式任务标题（lw_task_progress plan 的任务名） */
  title: string
  status: 'draft' | 'confirmed' | 'discarded'
  items: DesignItem[]
  /** 产出该包的轮次 */
  sourceTurn: number
  createdAt: number
  confirmedAt?: number
}

// ==================== 待审批项（写作期门禁：章法产物 → 用户审批 → 继续） ====================

export type RoomApprovalType = 'chapter_review'

export type RoomApprovalStatus = 'pending' | 'approved' | 'rejected'

/** 审批内容载荷：type=chapter_review 时为章法产物摘要（全文按 outlineId 现取，不进状态 JSON） */
export interface RoomApprovalPayload {
  outlineId?: string
  chapterNo?: number | null
  chapterTitle?: string
  wordCount?: number
  /** 章法工作流 run id（可审计） */
  runId?: string
  /** 设计卡自检 { ok, issues } */
  review?: { ok: boolean; issues: string[] } | null
  /** 写后一致性检查结论 */
  postCheck?: { passed: boolean; report: string | null } | null
  /** 故事性检查结论（钩子/爽点/吸引依据） */
  storyCheck?: Record<string, any> | null
}

/**
 * 待审批项：写作期「写完一章 → 用户在审批界面确认 → 才继续下一章」的载体。
 * 聊天流中由消息文本里的审批标记 `[待审批:<id>]` 渲染成按钮（标记常量见下）；
 * 独立于标记，顶栏「待审批 N」入口常驻（标记丢失也能进入审批界面）。
 */
export interface RoomApproval {
  id: string
  type: RoomApprovalType
  title: string
  status: RoomApprovalStatus
  payload: RoomApprovalPayload
  /** 产出该审批单的轮次（溯源） */
  sourceTurn: number
  createdAt: number
  decidedAt?: number
  /** 通过/驳回时用户的备注 */
  note?: string
}

/** 聊天消息中的审批标记：`[待审批:apr_xxx]`——ChatCanvas 解析后渲染为审批按钮 */
export function approvalMarker(id: string): string {
  return `[待审批:${id}]`
}

/** 从消息文本中提取全部审批标记 id（去重保序） */
export function extractApprovalMarkers(text: string): string[] {
  const out: string[] = []
  for (const m of String(text || '').matchAll(/\[待审批[:：]([A-Za-z0-9_:-]+)\]/g)) {
    if (!out.includes(m[1])) out.push(m[1])
  }
  return out
}

/** 去掉消息文本中的审批标记（标记由审批按钮组件渲染，不进正文） */
export function stripApprovalMarkers(text: string): string {
  return String(text || '').replace(/\s*\[待审批[:：][A-Za-z0-9_:-]+\]/g, '')
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
  /** 设计包（长程任务草稿 → 整体确认；确认/驳回后保留终态供回看） */
  designPackages: DesignPackage[]
  designSeq: number
  /** 待审批项（章法产物评审等；approve/reject 后保留终态供回看） */
  approvals: RoomApproval[]
  approvalSeq: number
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
    designPackages: [],
    designSeq: 0,
    approvals: [],
    approvalSeq: 0,
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
  | 'task:progress'
  | 'design:ready'
  | 'target:changed'
  | 'chapter:saved'
  | 'approval:ready'
  | 'approval:decided'
  | 'error'

export type RoomEvent =
  | { type: 'message:delta'; text: string }
  | { type: 'message:done'; message: RoomMessageView }
  | { type: 'ledger:update'; ledger: ConsensusEntry[] }
  | { type: 'card:ready'; cards: ArtifactCard[] }
  | { type: 'card:update'; card: ArtifactCard }
  | { type: 'phase:changed'; phase: RoomPhaseId }
  | { type: 'gate:suggest'; toPhase: RoomPhaseId; reason: string }
  | { type: 'task:progress'; message: string; tool?: string; status?: 'ok' | 'skipped' | 'error' }
  | { type: 'design:ready'; packageId: string; title: string; itemCount: number }
  | { type: 'target:changed'; target: 'novel' | 'script' }
  /** 章节正文已落库（写/重写/局部修正）——研讨室右侧实况面板据此实时上正文 */
  | { type: 'chapter:saved'; outlineId: string; chapterNo: number | null; title: string; wordCount: number; patched?: boolean }
  /** 新待审批项生成（章法完成自动建单）——前端弹审批界面/更新角标 */
  | { type: 'approval:ready'; approvalId: string; title: string }
  /** 审批已决（通过/驳回）——多端状态同步 */
  | { type: 'approval:decided'; approvalId: string; status: 'approved' | 'rejected'; note?: string }
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
  /** 设计包（长程任务草稿/终态，整体确认制） */
  designPackages: DesignPackage[]
  /** 待审批项（章法产物评审；pending 项在审批界面处理） */
  approvals: RoomApproval[]
}

/** 按需提炼范围（设计文档 §9 + v2.1 章节卡 + P0 动态分类 kind:<key>） */
export type DistillScope = 'overview' | 'characters' | 'plots' | 'world' | 'outline' | 'chapter' | 'foreshadow'
/** 动态分类提炼范围：`kind:<key>`（key → lw_bible_kinds.key） */
export type BibleDistillScope = DistillScope | `kind:${string}`

/** 圣经统一视图（bible:list wire，P0） */
export interface BibleEntryWire {
  id: string
  name: string
  sub: string
  aliases?: string[]
  fields: Record<string, unknown>
  origin?: { type: string; turns?: number[]; cardId?: string } | null
}
export interface BibleGroupWire {
  kindKey: string
  label: string
  icon: string | null
  storage: 'entity' | 'custom'
  fieldsSchema: Array<{ key: string; label: string; type: string; options?: string[]; required?: boolean }> | null
  entries: BibleEntryWire[]
}
export interface BibleFieldDef { key: string; label: string; type: string; options?: string[]; required?: boolean }

/** 账本用户操作（确认/否决/丢弃/修改一句话） */
export type LedgerOpInput =
  | { action: 'confirm'; entryId: string }
  | { action: 'reject'; entryId: string }
  | { action: 'discard'; entryId: string }
  | { action: 'revise'; entryId: string; title?: string; points?: string[] }
