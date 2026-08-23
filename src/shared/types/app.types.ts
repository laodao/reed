/**
 * 应用模块类型与常量（片1）
 * @module shared/types/app.types
 * @description 应用 = 发布单元（来源：已发布工作流），四渠道（会话/分享/API/定时）。
 *              会话消息复用 messages 表：messages.dialog_id = app_session.id，
 *              卡片类型存 messages.metadata（WORKFLOW_SESSION_CARDS 判别联合）。
 *              常量与类型同处——core 写库与前端渲染双端同源，严禁另起一套。
 */

/** 应用来源类型（V1 仅 workflow；harness 等未来在此扩展） */
export const APPLICATION_SOURCE_KINDS = {
  workflow: 'workflow',
} as const

/** 应用会话状态 */
export const APP_SESSION_STATUSES = {
  idle: 'idle',
  running: 'running',
  failed: 'failed',
} as const

/**
 * 应用会话对应 dialog 行的 roleId 标记（双表同主键方案的隔离手段）：
 * 对话页（默认助手/角色列表）均按 roleId 过滤——该标记不匹配任何真实角色，
 * 应用会话因此不混入对话列表。严禁改成普通角色 id。
 */
export const APP_SESSION_DIALOG_ROLE_ID = '__app_session__'

/** 会话卡片类型（messages.metadata.card） */
export const WORKFLOW_SESSION_CARDS = {
  startForm: 'start-form',
  runStatus: 'run-status',
  nodeStatus: 'node-status',
  review: 'review',
  message: 'message',
  report: 'report',
} as const

/** 会话消息 metadata 判别联合（写库与渲染共用） */
export type SessionCardMeta =
  | { card: typeof WORKFLOW_SESSION_CARDS.startForm; appId: string; form: unknown[]; runId?: string }
  | { card: typeof WORKFLOW_SESSION_CARDS.runStatus; runId: string; status: string }
  | { card: typeof WORKFLOW_SESSION_CARDS.nodeStatus; runId: string; nodeId: string; status: string }
  | { card: typeof WORKFLOW_SESSION_CARDS.review; runId: string; nodeId: string; kind: 'form' | 'approve' | 'choose' | 'input'; schema?: unknown }
  | { card: typeof WORKFLOW_SESSION_CARDS.message; runId: string; content: string }
  | { card: typeof WORKFLOW_SESSION_CARDS.report; runId: string; title: string; markdown: string; format?: string; filePath?: string; imageBase64?: string }

/** 应用记录（apps 表字段同名直出，零映射） */
export interface AppRecord {
  id: string
  userId: string | null
  name: string
  icon: string | null
  description: string | null
  /** 应用分类（自由文本，如 新闻资讯/文案写作/视频处理；AppList 分类筛选/首页分组用） */
  category?: string | null
  /** 标签列表（DB 存 JSON 数组字符串；搜索/展示用） */
  tags: string[]
  /** 固定到首页（1=首页显示快捷入口） */
  pinned?: number
  sourceKind: string
  sourceId: string
  sourceVersion: number | null
  channelSession: number
  channelShare: number
  channelApi: number
  shareToken: string | null
  enabled: number
  /** 内置应用（全局共享、禁删禁改，允许复制为自有） */
  isBuiltin?: boolean
  lastRunAt: Date | null
  createdAt: Date | null
  updatedAt: Date | null
}

/** 应用会话记录（app_sessions 表字段同名直出） */
export interface AppSessionRecord {
  id: string
  userId: string | null
  appId: string
  title: string
  status: string
  lastRunId: string | null
  lastStartInputs: Record<string, unknown> | null
  createdAt: Date | null
  updatedAt: Date | null
}