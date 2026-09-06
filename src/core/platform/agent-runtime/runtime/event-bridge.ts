/**
 * 事件桥：harness 事件 → 直推通道 + 平台事件总线（双路径）
 * @module core/platform/agent-runtime/runtime/event-bridge
 *
 * 契约：23 号 §7（AgentEventPort）+ §7b（终态必达/同点同序）+ 21 号事件双路径决策。
 * 总线发布的保序链与失败降级**复用平台公共底座**（event-system/event-producer.ts，
 * 2026-09-06 架构统一性抽象——与 workflow-run-producer 同一骨架不再各写一份）。
 * - 直推（IEventEmitter）保 UI 实时；总线失败只丢审计/联动（warn 不抛）
 * - text.delta 30ms 窗口合批（可配；reply:done/终态事件前强制冲刷）
 * 事件分类（21 号 §6.9.1）：
 * - UI 实时流（仅直推）：stage / action:start / reply:start / reply:content / compaction(start|summary)
 * - 领域事件（直推+总线）：action:done / approval:* / reply:done / error / compaction(done)
 */

import { createLogger } from '@core/utils/logger'
import {
  createPlatformEventProducer,
  type PlatformBusPortLike,
} from '@core/platform/services/event-system/event-producer'
import type { AgentEvent } from '@shared/types/agent.types'

const logger = createLogger('AgentEventBridge')

/** 平台事件总线的最小注入面（底座 event-producer 的总线获取器签名） */
export type PlatformBusPort = PlatformBusPortLike

export interface EventBridgeDeps {
  /** 直推出口（IEventEmitter.emit 包装） */
  emitDirect: (channel: string, event: AgentEvent) => void
  /** definition 的事件通道命名 */
  definitionId: string
  eventChannel: (scopeId: string) => string
  streamChannel?: (scopeId: string) => string
  /** 平台总线；null/缺省=仅直推（bus 未启动/测试） */
  bus?: PlatformBusPort | null
  /** delta 合批窗口 ms（缺省 30；0=禁用合批逐条发） */
  deltaThrottleMs?: number
}

/** AgentEvent.type → 平台事件类型（未登记=仅直推） */
const AGENT_EVENT_MAP: Partial<Record<AgentEvent['type'], string>> = {
  'action:done': 'agent:action.completed',
  'approval:request': 'agent:approval.requested',
  'approval:resolved': 'agent:approval.resolved',
  'reply:done': 'agent:turn.completed',
  error: 'agent:error',
  compaction: 'agent:compaction.completed', // 仅 phase='done' 发布（下方过滤）
}

export class EventBridge {
  private readonly deps: Required<Omit<EventBridgeDeps, 'bus' | 'streamChannel'>> & {
    bus: PlatformBusPort | null
    streamChannel: (scopeId: string) => string
  }
  /** 总线发布（保序+降级在公共底座内；agent 侧策略=仅 warn，直推已先行） */
  private readonly producer: ReturnType<typeof createPlatformEventProducer>
  /** delta 合批缓冲：(scopeId, summaryEventId) → 累积文本 */
  private readonly deltaBuf = new Map<string, { scopeId: string; summaryEventId: string; text: string; timer: ReturnType<typeof setTimeout> | null }>()

  constructor(deps: EventBridgeDeps) {
    this.deps = {
      emitDirect: deps.emitDirect,
      definitionId: deps.definitionId,
      eventChannel: deps.eventChannel,
      streamChannel: deps.streamChannel ?? ((scopeId: string) => `${deps.eventChannel(scopeId)}:stream`),
      bus: deps.bus ?? null,
      deltaThrottleMs: deps.deltaThrottleMs ?? 30,
    }
    this.producer = createPlatformEventProducer({
      getBus: () => this.deps.bus as never,
    })
  }

  /** 唯一出口：门面/协调器只调它（同点同序的"同点"） */
  emit(scopeId: string, event: AgentEvent): void {
    // 终态/新段落事件先冲刷挂起的 delta（保序：delta 先于 done 到达前端）
    if (event.type !== 'reply:content') this.flushDelta()

    // ① 直推：UI 实时流走 streamChannel，其余走主通道
    try {
      if (event.type === 'reply:content') {
        this.bufferDelta(scopeId, event)
      } else {
        this.deps.emitDirect(this.deps.eventChannel(scopeId), event)
      }
    } catch (e) {
      logger.warn('[event-bridge] 直推失败（不影响主流程）', e)
    }

    // ② 领域事件 → 平台总线（保序链；失败仅 warn）
    const platformType = AGENT_EVENT_MAP[event.type]
    if (!platformType) return
    if (platformType === 'agent:compaction.completed' && event.type === 'compaction' && event.phase !== 'done') return
    if (!this.deps.bus) return

    const scopeKey = `${this.deps.definitionId}:${scopeId}`
    const payload = stripType(event)
    // 底座默认降级=warn（agent 侧直推已先行，仅丢审计/联动）——与旧链行为等价
    this.producer.publish({
      type: platformType,
      aggregate: { kind: 'agent_session', id: scopeKey },
      actor: { kind: 'agent', id: this.deps.definitionId },
      correlationId: scopeKey,
      payload,
    })
  }

  /** 等待总线发布链排空（测试/关停用） */
  async flush(): Promise<void> {
    this.flushDelta()
    await this.producer.flush()
  }

  /** 强制冲刷 delta 缓冲（终态事件前调用；测试直接调用） */
  flushDelta(): void {
    for (const buf of this.deltaBuf.values()) {
      if (buf.timer) clearTimeout(buf.timer)
      if (buf.text.length === 0) continue
      try {
        this.deps.emitDirect(
          this.deps.streamChannel(buf.scopeId),
          { type: 'reply:content', summaryEventId: buf.summaryEventId, delta: buf.text },
        )
      } catch (e) {
        logger.warn('[event-bridge] delta 冲刷直推失败', e)
      }
      buf.text = ''
    }
  }

  private bufferDelta(scopeId: string, event: Extract<AgentEvent, { type: 'reply:content' }>): void {
    const key = `${scopeId}:${event.summaryEventId}`
    let buf = this.deltaBuf.get(key)
    if (!buf) {
      buf = { scopeId, summaryEventId: event.summaryEventId, text: '', timer: null }
      this.deltaBuf.set(key, buf)
    }
    buf.text += event.delta
    if (this.deps.deltaThrottleMs <= 0) {
      this.flushDelta()
      return
    }
    if (!buf.timer) {
      buf.timer = setTimeout(() => {
        buf!.timer = null
        this.flushDelta()
      }, this.deps.deltaThrottleMs)
      // 定时器不阻止进程退出（与 agent-service sweeper 同纪律）
      buf.timer.unref?.()
    }
  }
}

/** 剥离 type 字段（平台类型已承载，载荷不带冗余） */
function stripType(event: AgentEvent): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(event as unknown as Record<string, unknown>) }
  delete out.type
  return out
}
