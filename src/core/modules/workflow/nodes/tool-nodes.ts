/**
 * 工具节点（P0 片1：tool-call 第三方 API 调用）
 * @module core/modules/workflow/nodes/tool-nodes
 * @description 引用自定义工具或预设工具，参数经 {{模板}} 映射，凭据自动注入。
 *              执行复用 ToolService（参数组装 + SecureStorage 解密 + http-fetch 共享执行）。
 */

import type { WorkflowNodeContext } from '../engine/node-handler'
import type { WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'
import { getToolService } from '../tools/tool-registry'

const toolCallNode: WorkflowNodeHandler = {
  type: 'tool-call',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'status', type: 'number', desc: 'HTTP 状态码（网络失败为 0）' },
    { key: 'ok', type: 'boolean', desc: '是否 2xx' },
    { key: 'json', type: 'json', desc: '响应 JSON（非 JSON 为 null）' },
    { key: 'text', type: 'string', desc: '响应原文' },
    { key: 'durationMs', type: 'number', desc: '耗时毫秒' },
  ],
  validateConfig(config) {
    const cfg = config as { toolType?: string; toolId?: string }
    const errors: string[] = []
    if (!cfg.toolType || !['custom', 'preset'].includes(cfg.toolType)) {
      errors.push('工具类型必须是 custom 或 preset')
    }
    if (!cfg.toolId || !stringifyValue(cfg.toolId).trim()) {
      errors.push('工具不能为空')
    }
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      toolType: 'custom' | 'preset'
      toolId: string
      credentialId?: string
      params?: Array<{ key: string; value: string }>
    }
    const params: Record<string, unknown> = {}
    for (const p of cfg.params ?? []) {
      if (p.key) params[p.key] = p.value
    }
    const result = await getToolService().executeTool({
      type: cfg.toolType,
      toolId: stringifyValue(cfg.toolId),
      credentialId: cfg.credentialId || null,
      params,
      signal: ctx.signal,
    })
    if (result.ok) {
      return {
        status: 'succeeded',
        output: { status: result.status, ok: true, json: result.json ?? null, text: result.text, durationMs: result.durationMs },
      }
    }
    // 网络失败（status=0）可重试；HTTP 错误码不重试
    return {
      status: 'failed',
      error: result.text,
      retryable: result.status === 0,
      output: { status: result.status, ok: false, json: null, text: result.text, durationMs: result.durationMs },
    }
  },
}

export const TOOL_NODE_HANDLERS: WorkflowNodeHandler[] = [toolCallNode]
