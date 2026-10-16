/**
 * 任务节点（首批：delay / http-request / llm-chat / human-review）
 * @module core/platform/workflow/nodes/task-nodes
 * @description config 由引擎统一深解析（实参）；handler 不再解析 config 字段。
 *              剩余 AI 节点（kb/web-search/translate/image/voice/lw）在下一批补齐。
 */

import { callAIStream, callVLM, toImageDataUrl } from '../../services/ai-call'
import { getPathProvider } from '@core/interfaces/path.interface'
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
    { key: 'body', type: 'string', desc: '响应体文本（二进制响应为空串）' },
    { key: 'json', type: 'json', desc: 'JSON 响应解析结果' },
    { key: 'headers', type: 'json', desc: '响应头' },
    { key: 'base64', type: 'string', desc: 'base64 模式：二进制响应内容' },
    { key: 'dataUrl', type: 'string', desc: 'base64 模式：data:<mime>;base64,...（可直接接保存资产节点）' },
    { key: 'filePath', type: 'string', desc: 'file/auto 模式：二进制响应落盘路径' },
    { key: 'mimeType', type: 'string', desc: '二进制响应的 MIME 类型' },
    { key: 'sizeBytes', type: 'number', desc: '二进制响应字节数' },
  ],
  validateConfig(config) {
    const cfg = config as { method?: string; url?: string; timeoutMs?: number; responseType?: string }
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
    if (cfg.responseType && !['auto', 'text', 'json', 'base64', 'file'].includes(cfg.responseType)) {
      errors.push('responseType 必须是 auto/text/json/base64/file')
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
      responseType?: 'auto' | 'text' | 'json' | 'base64' | 'file'
    }
    // C5：抽出共享执行（oas-tool 复用超时/取消/输出形状）
    const result = await executeHttpFetch(
      {
        method: cfg.method,
        url: cfg.url,
        headers: Object.fromEntries((cfg.headers ?? []).map(h => [h.key, h.value])),
        body: cfg.body,
        timeoutMs: cfg.timeoutMs,
        responseType: cfg.responseType,
        // 落盘目录：每次运行独立，防并发互踩（与 media-nodes 同模式）
        outputDir: `${getPathProvider().getDataPath()}/workflow-media/${ctx.runId.replace(/[^\w.-]/g, '_')}/http`,
      },
      ctx.signal
    )
    if (!result.ok) return { status: 'failed', error: result.error }
    return { status: 'succeeded', output: result.output }
  },
}

// ==================== LLM 对话 ====================

/**
 * 从 LLM 输出中稳健提取 JSON（jsonMode 兜底）。
 * 模型常把 JSON 包进 ```json 代码块，或前置"好的，以下是 JSON："等说明文字，或包裹不完整；
 * 依次尝试：整体 → 剥离代码块 → 截取首个 {/[ 到末个 }/]。
 */
function extractJson(text: string): unknown {
  const t = text.trim()
  // 1. 整体直接解析（最常见的纯 JSON）
  try { return JSON.parse(t) } catch { /* 继续兜底 */ }
  // 2. 剥离 ```json ... ``` 代码块包裹
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    try { return JSON.parse(fence[1].trim()) } catch { /* 继续兜底 */ }
  }
  // 3. 带前后说明：截取首个 {/[ 到末个 }/] 之间的片段
  const start = t.search(/[\[{]/)
  if (start >= 0) {
    const closer = t[start] === '[' ? ']' : '}'
    const end = t.lastIndexOf(closer)
    if (end > start) {
      try { return JSON.parse(t.slice(start, end + 1)) } catch { /* 交给调用方报错 */ }
    }
  }
  throw new Error('不是有效 JSON')
}

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
    // + AbortSignal 真取消 + 增量进度回调 + 多轮对话历史（multiTurn 开启时注入前序轮次）
    const doCall = async (): Promise<{ content: string; usage?: unknown }> => {
      const history = ctx.getLLMHistory?.() ?? []
      const r = await callAIStream({
        prompt: String(cfg.prompt),
        systemPrompt: cfg.systemPrompt,
        providerConfigId: cfg.providerConfigId,
        modelId: cfg.modelId,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
        messages: history.length > 0 ? history : undefined,
        signal: ctx.signal,
        onDelta: delta => ctx.emitProgress(-1, delta.slice(-50)),
      }).catch(e => {
        throw new Error(`LLM 调用失败: ${e instanceof Error ? e.message : String(e)}`)
      })
      return { content: String(r?.content ?? ''), usage: r?.usage }
    }
    let { content, usage } = await doCall()

    const output: Record<string, unknown> = { content }
    if (cfg.jsonMode) {
      // jsonMode 容错：输出可能被截断/带说明文字，解析失败时自动重试（最多 3 次）
      let parsed: unknown
      let ok = false
      for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
        try {
          parsed = extractJson(content)
          ok = true
        } catch {
          if (attempt < 3) {
            ctx.emitProgress(-1, `jsonMode 输出解析失败，重试 ${attempt}/2`)
            const retry = await doCall()
            content = retry.content
            usage = retry.usage
            output.content = content
          }
        }
      }
      if (!ok) return { status: 'failed', error: 'jsonMode 输出不是有效 JSON', retryable: true }
      output.parsed = parsed
    }
    if (usage) output.usage = usage
    // 多轮对话：登记本轮（成功路径；jsonMode 重试后取最终 content）
    ctx.recordLLMTurn?.('user', String(cfg.prompt))
    ctx.recordLLMTurn?.('assistant', content)
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
