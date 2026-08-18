/**
 * OAS 自定义接口节点（C5，spec v2 §5）
 * @module core/modules/workflow/nodes/oas-nodes
 * @description 粘贴/导入 OpenAPI JSON → 选 operation → 参数按 OAS 声明填写
 *              （值支持 {{模板}}，引擎解析后到实参）→ 本质是参数化封装的
 *              http-request（复用 executeHttpFetch：超时/取消/输出形状）。
 *              V1 限制：不支持 $ref 引用与复杂 schema（解析器层拒绝）。
 */

import { buildRequest, listOperations, listParameters } from '@shared/utils/openapi-parser'
import { executeHttpFetch } from './http-fetch'
import type { WorkflowNodeContext } from '../engine/node-handler'
import type { WorkflowNodeHandler } from '../engine/node-handler'

interface OasToolConfig {
  oasSpec: string
  operationId: string
  params?: Array<{ key: string; value: unknown }>
  baseUrlOverride?: string
  headers?: Array<{ key: string; value: string }>
  timeoutMs?: number
}

const oasToolNode: WorkflowNodeHandler = {
  type: 'oas-tool',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'status', type: 'number', desc: 'HTTP 状态码' },
    { key: 'body', type: 'string', desc: '响应体文本' },
    { key: 'json', type: 'json', desc: 'JSON 响应解析结果' },
    { key: 'headers', type: 'json', desc: '响应头' },
  ],
  validateConfig(config) {
    const cfg = config as OasToolConfig
    const errors: string[] = []
    if (!cfg.oasSpec || !String(cfg.oasSpec).trim()) {
      errors.push('必须粘贴 OpenAPI JSON')
      return errors
    }
    const ops = listOperations(String(cfg.oasSpec))
    if (!ops.ok) return [...errors, ops.error]
    if (!cfg.operationId) {
      errors.push('必须选择接口（operationId）')
      return errors
    }
    if (!ops.operations.some(o => o.operationId === cfg.operationId)) {
      errors.push(`OAS 中不存在 operationId：${cfg.operationId}`)
      return errors
    }
    // 必填参数校验（path/query/header 声明中 required 的）
    for (const p of listParameters(String(cfg.oasSpec), cfg.operationId)) {
      if (!p.required) continue
      const provided = (cfg.params ?? []).find(x => x.key === p.name)
      if (!provided || provided.value === undefined || provided.value === null || String(provided.value).trim() === '') {
        errors.push(`缺少必填参数：${p.name}（${p.in}）`)
      }
    }
    if (cfg.timeoutMs !== undefined && (!Number.isFinite(cfg.timeoutMs) || cfg.timeoutMs <= 0)) {
      errors.push('timeoutMs 必须是正数')
    }
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as OasToolConfig
    const built = buildRequest(String(cfg.oasSpec), cfg.operationId, cfg.params ?? [], cfg.baseUrlOverride)
    if (!built.ok) return { status: 'failed', error: built.error }

    // 附加自定义 headers（如鉴权头——OAS 声明的 header 参数已在 buildRequest 并入）
    const headers = { ...built.request.headers }
    for (const h of cfg.headers ?? []) {
      if (h.key.trim()) headers[h.key] = h.value
    }

    const result = await executeHttpFetch(
      {
        method: built.request.method,
        url: built.request.url,
        headers,
        body: built.request.body,
        timeoutMs: cfg.timeoutMs,
      },
      ctx.signal
    )
    if (!result.ok) return { status: 'failed', error: result.error }
    return { status: 'succeeded', output: result.output }
  },
}

export const OAS_NODE_HANDLERS: WorkflowNodeHandler[] = [oasToolNode]
