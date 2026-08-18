/**
 * 任务节点（首批：delay / http-request / llm-chat / human-review）
 * @module core/modules/workflow/nodes/task-nodes
 * @description config 由引擎统一深解析（实参）；handler 不再解析 config 字段。
 *              剩余 AI 节点（kb/web-search/translate/image/voice/lw）在下一批补齐。
 */

import { callAIStream, callVLM, toImageDataUrl } from '../../../services/ai-call'
import { WORKFLOW_DEFAULTS } from '@shared/types/workflow.types'
import { executeHttpFetch } from './http-fetch'
import { sleepAbortable } from '../engine/async-utils'
import type { WorkflowNodeContext } from '../engine/node-handler'
import type { WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'

// ==================== 延时 ====================

const delayNode: WorkflowNodeHandler = {
  type: 'delay',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [{ key: 'waitedMs', type: 'number', desc: '实际等待毫秒' }],
  validateConfig(config) {
    const v = (config as { durationMs?: unknown }).durationMs
    const n = Number(v)
    if (v === undefined || v === null || Number.isNaN(n) || n < 0) {
      return ['durationMs 必须是非负数字（模板解析后）']
    }
    return []
  },
  async execute(ctx: WorkflowNodeContext) {
    const ms = Number((ctx.config as { durationMs: number }).durationMs)
    const t0 = Date.now()
    await sleepAbortable(ms, ctx.signal, 'reject')
    return { status: 'succeeded', output: { waitedMs: Date.now() - t0 } }
  },
}

// ==================== HTTP 请求 ====================

const httpRequestNode: WorkflowNodeHandler = {
  type: 'http-request',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'status', type: 'number', desc: 'HTTP 状态码' },
    { key: 'body', type: 'string', desc: '响应体文本' },
    { key: 'json', type: 'json', desc: 'JSON 响应解析结果' },
    { key: 'headers', type: 'json', desc: '响应头' },
  ],
  validateConfig(config) {
    const cfg = config as { method?: string; url?: string; timeoutMs?: number }
    const errors: string[] = []
    if (!cfg.method || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(cfg.method)) {
      errors.push('method 必须是 GET/POST/PUT/PATCH/DELETE')
    }
    if (!cfg.url || !/^https?:\/\//.test(String(cfg.url))) {
      errors.push('url 必须是 http(s):// 开头的完整地址')
    }
    if (cfg.timeoutMs !== undefined && (!Number.isFinite(cfg.timeoutMs) || cfg.timeoutMs <= 0)) {
      errors.push('timeoutMs 必须是正数')
    }
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      method: string
      url: string
      headers?: Array<{ key: string; value: string }>
      body?: string
      timeoutMs?: number
    }
    // C5：抽出共享执行（oas-tool 复用超时/取消/输出形状）
    const result = await executeHttpFetch(
      {
        method: cfg.method,
        url: cfg.url,
        headers: Object.fromEntries((cfg.headers ?? []).map(h => [h.key, h.value])),
        body: cfg.body,
        timeoutMs: cfg.timeoutMs,
      },
      ctx.signal
    )
    if (!result.ok) return { status: 'failed', error: result.error }
    return { status: 'succeeded', output: result.output }
  },
}

// ==================== LLM 对话 ====================

const llmChatNode: WorkflowNodeHandler = {
  type: 'llm-chat',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'content', type: 'string', desc: '模型回复全文' },
    { key: 'parsed', type: 'json', desc: 'jsonMode 时的解析结果' },
    { key: 'usage', type: 'json', desc: 'token 用量' },
  ],
  validateConfig(config) {
    const cfg = config as { prompt?: string; temperature?: number; vision?: boolean; imageInput?: string }
    const errors: string[] = []
    if (cfg.prompt === undefined || cfg.prompt === null || String(cfg.prompt).trim() === '') {
      errors.push('prompt 不能为空')
    }
    if (cfg.temperature !== undefined && (cfg.temperature < 0 || cfg.temperature > 2)) {
      errors.push('temperature 范围 0-2')
    }
    if (cfg.vision && !String(cfg.imageInput ?? '').trim()) {
      errors.push('视觉模式必须提供图片输入')
    }
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      providerConfigId?: string
      modelId?: string
      systemPrompt: string
      prompt: string
      temperature?: number
      maxTokens?: number
      jsonMode?: boolean
    }
    // 视觉模式：走 VLM（注意：当前底层 chatSync 暂不支持 signal——视觉模式不可中断，
    // 取消时由引擎按"结果丢弃"降级；chatSync 加 signal 为后续独立小改进）
    if (cfg.vision) {
      // VLM 单图（callVLM 协议限制）；多张输入取第一张，其余忽略不产生 IO
      const firstImage = String(cfg.imageInput ?? '')
        .split(/[\n,]/)
        .map(x => x.trim())
        .filter(Boolean)[0]
      if (!firstImage) {
        return { status: 'failed', error: '视觉模式必须提供图片输入', retryable: false }
      }
      const dataUrl = await toImageDataUrl(firstImage)
      ctx.emitProgress(30, '视觉输入已就绪')
      const content = await callVLM(
        String(cfg.prompt),
        dataUrl,
        cfg.systemPrompt ?? '',
        4096,
        cfg.providerConfigId,
        cfg.modelId
      )
      return { status: 'succeeded', output: { content } }
    }

    // 公共 AI 调用层：统一 modelId fallback 链（显式→config 默认→用户启用→模板内置）
    // + AbortSignal 真取消 + 增量进度回调
    const { content, usage } = await callAIStream({
      prompt: String(cfg.prompt),
      systemPrompt: cfg.systemPrompt,
      providerConfigId: cfg.providerConfigId,
      modelId: cfg.modelId,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      signal: ctx.signal,
      onDelta: delta => ctx.emitProgress(-1, delta.slice(-50)),
    }).catch(e => {
      throw new Error(`LLM 调用失败: ${e instanceof Error ? e.message : String(e)}`)
    })

    const output: Record<string, unknown> = { content }
    if (cfg.jsonMode) {
      try {
        // 容错提取（模型可能带 ```json 包裹）
        const match = content.match(/```(?:json)?\s*([\s\S]*?)```/)
        output.parsed = JSON.parse((match ? match[1] : content).trim())
      } catch {
        return { status: 'failed', error: 'jsonMode 输出不是有效 JSON', retryable: false }
      }
    }
    if (usage) output.usage = usage
    return { status: 'succeeded', output }
  },
}

// ==================== 人工审核 ====================

const humanReviewNode: WorkflowNodeHandler = {
  type: 'human-review',
  controlKind: 'task',
  cancellable: false,
  outputSchema: [
    { key: 'payload', type: 'json', desc: '送审内容（修改后批准时为修改版）' },
    { key: 'decision', type: 'string', desc: 'approved / approved_with_changes / rejected' },
    { key: 'rejected', type: 'boolean', desc: '驳回路径时为 true' },
  ],
  validateConfig(config) {
    const cfg = config as { payload?: unknown }
    if (cfg.payload === undefined || cfg.payload === null || stringifyValue(cfg.payload).trim() === '') {
      return ['payload 不能为空']
    }
    return []
  },
  async execute(ctx: WorkflowNodeContext) {
    const cfg = ctx.config as {
      payload: unknown
      timeoutMs?: number | null
    }
    // payload 已由引擎解析：单占位透传可能是对象；字符串形态尝试 JSON 解析
    let payload: Record<string, unknown>
    if (typeof cfg.payload === 'string') {
      try {
        payload = JSON.parse(cfg.payload)
      } catch {
        payload = { content: cfg.payload }
      }
    } else if (cfg.payload && typeof cfg.payload === 'object') {
      payload = cfg.payload as Record<string, unknown>
    } else {
      payload = { value: cfg.payload }
    }
    const timeoutMs =
      cfg.timeoutMs !== undefined && cfg.timeoutMs !== null && Number(cfg.timeoutMs) > 0
        ? Number(cfg.timeoutMs)
        : null
    return { status: 'waiting_review', payload, timeoutMs }
  },
}

/** 首批任务节点 */
export const TASK_NODE_HANDLERS: WorkflowNodeHandler[] = [
  delayNode,
  httpRequestNode,
  llmChatNode,
  humanReviewNode,
]
