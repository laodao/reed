/**
 * get_tool_result：工具产物回查工具（39 号 P1-1）
 * @module core/platform/agent-runtime/tools/artifact-lookup
 *
 * 与产物归档配套的内生工具：上下文里被截断（8K）/剪枝（[pruned…]）/折叠
 * （[superseded…]）的工具结果，模型按 toolCallId 回查全文。分页窗口返回
 * （单窗缺省 8000 字符，超出给 hasMore/nextOffset）——比一次性灌 8K 上限更可控。
 * 归档端口未装配的宿主不注入本工具（占位文本里的指引随之失效，无死链）。
 */

import { z } from 'zod'
import type { AgentToolDef } from '../types'
import type { ToolArtifactPort } from './artifacts'

const GetToolResultInput = z.object({
  toolCallId: z.string().min(1).describe('要回查的工具调用 id（截断/剪枝/折叠占位里都带）'),
  offset: z.number().int().min(0).optional().describe('JSON 文本窗口起点（翻页用，缺省 0）'),
  maxChars: z.number().int().min(200).max(16_000).optional().describe('窗口大小（缺省 8000 字符）'),
})

const WINDOW_DEFAULT_CHARS = 8_000

export function createGetToolResultTool(port: ToolArtifactPort): AgentToolDef<{
  toolCallId: string
  offset?: number
  maxChars?: number
}> {
  return {
    name: 'get_tool_result',
    description:
      '回查历史工具调用的完整结果。当早前工具结果在上下文中显示为截断（…[truncated]）、剪枝（[pruned…]）或被取代（[superseded…]）时，用其 toolCallId 取回全文（支持 offset 翻页）。',
    inputSchema: GetToolResultInput,
    dangerLevel: 'read',
    async execute(input) {
      const record = await port.load(input.toolCallId)
      if (!record) {
        return {
          ok: false as const,
          error: 'NOT_FOUND',
          hint: '该 toolCallId 无归档产物（可能来自未启用归档的宿主，或产物超限拒存）。',
        }
      }
      let text: string
      try {
        text = typeof record.result === 'string' ? record.result : JSON.stringify(record.result)
      } catch {
        return { ok: false as const, error: 'UNSERIALIZABLE', hint: '归档产物无法序列化为文本。' }
      }
      const offset = input.offset ?? 0
      const maxChars = input.maxChars ?? WINDOW_DEFAULT_CHARS
      const window = text.slice(offset, offset + maxChars)
      const nextOffset = offset + window.length
      return {
        ok: true as const,
        data: {
          toolName: record.toolName,
          totalChars: text.length,
          window,
          hasMore: nextOffset < text.length,
          ...(nextOffset < text.length ? { nextOffset } : {}),
        },
      }
    },
  }
}
