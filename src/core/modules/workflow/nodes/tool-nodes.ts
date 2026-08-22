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
import { getPathProvider } from '@core/interfaces/path.interface'
import type { HttpResponseType } from './http-fetch'

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
    { key: 'base64', type: 'string', desc: 'base64 模式：二进制响应内容' },
    { key: 'dataUrl', type: 'string', desc: 'base64 模式：data:<mime>;base64,...（可直接接保存资产节点）' },
    { key: 'filePath', type: 'string', desc: 'file/auto 模式：二进制响应落盘路径（可直接接保存资产节点）' },
    { key: 'mimeType', type: 'string', desc: '二进制响应的 MIME 类型' },
    { key: 'sizeBytes', type: 'number', desc: '二进制响应字节数' },
  ],
  validateConfig(config) {
    const cfg = config as { toolType?: string; toolId?: string; responseType?: string }
    const errors: string[] = []
    if (!cfg.toolType || !['custom', 'preset'].includes(cfg.toolType)) {
      errors.push('工具类型必须是 custom 或 preset')
    }
    if (!cfg.toolId || !stringifyValue(cfg.toolId).trim()) {
      errors.push('工具不能为空')
    }
    if (cfg.responseType && !['auto', 'text', 'json', 'base64', 'file'].includes(cfg.responseType)) {
      errors.push('responseType 必须是 auto/text/json/base64/file')
    }
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      toolType: 'custom' | 'preset'
      toolId: string
      credentialId?: string
      params?: Array<{ key: string; value: string }>
      responseType?: HttpResponseType
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
      responseType: cfg.responseType,
      // 落盘目录：每次运行独立，防并发互踩（与 media-nodes 同模式）
      outputDir: `${getPathProvider().getDataPath()}/workflow-media/${ctx.runId.replace(/[^\w.-]/g, '_')}/tools`,
    })
    const out: Record<string, unknown> = {
      status: result.status,
      ok: result.ok,
      json: result.json ?? null,
      text: result.text,
      durationMs: result.durationMs,
      ...(result.base64 !== undefined ? { base64: result.base64 } : {}),
      ...(result.dataUrl !== undefined ? { dataUrl: result.dataUrl } : {}),
      ...(result.filePath !== undefined ? { filePath: result.filePath } : {}),
      ...(result.mimeType !== undefined ? { mimeType: result.mimeType } : {}),
      ...(result.sizeBytes !== undefined ? { sizeBytes: result.sizeBytes } : {}),
    }
    if (result.ok) {
      return { status: 'succeeded', output: out }
    }
    // 网络失败（status=0）可重试；HTTP 错误码不重试
    return {
      status: 'failed',
      error: result.text,
      retryable: result.status === 0,
      output: out,
    }
  },
}

export const TOOL_NODE_HANDLERS: WorkflowNodeHandler[] = [toolCallNode]
