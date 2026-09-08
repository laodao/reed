/**
 * 会话原始流水（39 号 P0-2）
 * @module core/platform/agent-runtime/memory/transcript-store
 *
 * 问题：agent_sessions 是「当前工作集」（全量替换语义）——压缩/剪枝/折叠改写
 * 后原文被覆盖，无法回放审计。本模块提供 append-only 的原始流水：
 * 每条消息首次进入历史时落一行，之后工作集怎么改写都不影响流水。
 *
 * 写入路径（39 号 P0-2 双层上报）：
 * - loop：经 AgentHost.saveState 的 meta.appended 上报循环产生的增量
 *   （工具消息/助手消息/哨兵/注记/轮次上下文块/压缩摘要消息）
 * - 宿主：自产消息（本轮 user 输入、首轮种子史迁移）由宿主自行补报
 *
 * 端口契约与 TrajectoryAppendPort 同风格：appendBatch + maxSeq（懒续接）。
 * DB 实现走 agent_session_events 表（create-agent-session-events 迁移）；
 * 无 DataSource 降级 null = 不落流水（不破坏既有宿主）。
 */

import { createLogger } from '@core/utils/logger'

const logger = createLogger('AgentRawTranscript')

/** 单条流水消息字节上限（与会话存储 MAX_MESSAGE_BYTES 同值；超限存占位不拒批——
 *  流水是安全网，单条缺失可接受，整批失败不可接受） */
export const TRANSCRIPT_MAX_MESSAGE_BYTES = 512 * 1024

export interface TranscriptAppendRow {
  conversationId: string
  seq: number
  role: string
  /** ModelMessage 整体 JSON */
  content: string
}

export interface RawTranscriptPort {
  appendBatch(rows: TranscriptAppendRow[]): Promise<void>
  /** 会话内已落库最大 seq（续接起点；无行返回 0） */
  maxSeq(conversationId: string): Promise<number>
  /** 会话级联删除（会话重置/清理） */
  deleteByConversation?(conversationId: string): Promise<number>
}

/** 超限消息的占位形态（保留事件存在性，丢弃超限体） */
export function truncateTranscriptContent(content: string): string {
  if (Buffer.byteLength(content, 'utf8') <= TRANSCRIPT_MAX_MESSAGE_BYTES) return content
  logger.warn(`[transcript] 消息超限存占位 bytes=${Buffer.byteLength(content, 'utf8')}`)
  return JSON.stringify({ _truncated: true, bytes: Buffer.byteLength(content, 'utf8') })
}
