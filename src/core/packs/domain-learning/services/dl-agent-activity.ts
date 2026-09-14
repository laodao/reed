/**
 * 领域共学：Agent 活动跟踪（流事件 → 活动行）
 * @module packs/domain-learning/services/dl-agent-activity
 *
 * 从 `AgentStreamEvent`（step / tool-start / tool-end）翻译出「正在做什么」的一行文案，
 * 供宿主 emit 成 progress 事件（前端 1-3 行滚动显示）。
 *
 * 为什么单独抽出来：文案翻译的坑都在细节里——步号要跟随 step 事件、tool-end 失败时要复用
 * tool-start 时的**主语**（否则失败行只剩"落库知识点未成功"，用户不知道是哪个知识点）、
 * 成功结束不产生多余行。抽成类后可以直测，宿主只剩一行调用。
 */

import { describeDlActivity, type DlActivityKind } from '@shared/utils/domain-learning-activity'
import type { AgentStreamEvent } from '@core/platform/agent-runtime/types'

/** 一条活动行（宿主据此 emit progress 事件） */
export interface DlActivityEvent {
  line: string
  kind: DlActivityKind
  tool: string
}

/**
 * 有状态跟踪器（每轮一个实例；同一轮内维护步号与在途 toolCallId → 主语）。
 */
export class DlActivityTracker {
  private step = 0
  private readonly calls = new Map<string, { tool: string; args?: unknown }>()

  /**
   * 处理一个流事件。
   * @returns 需要展示的活动行；null = 该事件不产生活动行（如 step 事件本身、成功的 tool-end）
   */
  onStream(event: AgentStreamEvent): DlActivityEvent | null {
    if (event.kind === 'step') {
      this.step = event.stepNumber
      return null
    }
    if (event.kind === 'tool-start') {
      this.calls.set(event.toolCallId, { tool: event.toolName, args: event.args })
      const { line, kind } = describeDlActivity({
        toolName: event.toolName,
        args: event.args,
        step: this.step > 0 ? this.step : undefined,
      })
      return { line, kind, tool: event.toolName }
    }
    if (event.kind === 'tool-end') {
      const called = this.calls.get(event.toolCallId)
      this.calls.delete(event.toolCallId)
      if (event.ok) return null
      // 失败必须可见（额度用尽/门禁拒绝都走这里）：复用调用时的主语，用户才知道是哪个条目没成
      const tool = called?.tool ?? event.toolName
      const { line, kind } = describeDlActivity({ toolName: tool, args: called?.args, ok: false })
      return { line, kind, tool }
    }
    return null
  }
}
