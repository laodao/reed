/**
 * 工具注册表（通用平台模块，23 号 §3 / 14 号 R1-R2）
 * @module core/platform/agent-runtime/tools/registry
 *
 * 三类消费者：agent 循环（LLM 选工具）/ 工作流节点（config 驱动）/ 业务包代码
 * （AgentDefinition 声明后直调 execute——不经 LLM）。
 * 来源：builtin（平台内置）与 pack:<packId>:<name>（业务包工具）；node/tool/oas/skill
 * 来源随 M2 接线批接入（本批不实现 executor 分发，只保留 source 枚举位）。
 *
 * 关键纪律（14 号）：
 * - zod 是 schema 单一事实源，jsonSchema 派生缓存（zod4 原生 toJSONSchema）
 * - 错误永不 throw 出 registry——一律 AgentToolResult{ok:false} 回填
 * - 取严：requiresApproval ∨ dangerLevel∈{exec, external-post} 均需批准；
 *   binding.approval='never' 为显式放宽（编辑器二次确认），'always' 强制
 * - buildToolDefs 为 run 启动时快照：运行中注册/注销不影响在途白名单
 * - 静态 config 深合并静态键优先（LLM 不可覆盖宿主配置）；LLM args 中的
 *   字面 {{...}} 原样传递不展开（模板注入防线，14 号 §7-8）
 * - 结果截断：>16KB 数组截前 20 项 + _truncated 标注；二进制字段永不进上下文；
 *   完整结果落盘引用化（resultRef）为 M2——当前仅内存截断
 */

import { createLogger } from '@core/utils/logger'
import type { z } from 'zod'
import type {
  AgentToolBinding,
  AgentToolResult,
  AgentToolErrorCode,
} from '@shared/types/agent.types'
import type {
  AgentToolDef,
  AgentToolSpec,
  AgentToolContext,
  LLMToolDescriptor,
  ToolDangerLevel,
} from '../types'

const logger = createLogger('AgentToolRegistry')

// —— 观测面/防御性常量（命名导出便于测试与复用方引用） ——

/** 工具结果序列化上限（14 号 §5.5） */
export const TOOL_RESULT_MAX_BYTES = 16_384
/** 截断时数组保留项数 */
export const TOOL_RESULT_ARRAY_KEEP = 20
/** 单字段字符串截断上限 */
export const TOOL_RESULT_FIELD_MAX_CHARS = 2_000
/** 直调执行超时（缺省；宿主可经 AgentToolContext.signal 控制中止） */
export const TOOL_EXECUTE_TIMEOUT_MS = 120_000
/** 工具基础名式样（14 号 §3 命名规范；命名空间前缀另拼） */
export const TOOL_NAME_RE = /^[a-z][a-z0-9_]{2,48}$/

/** 需默认人工批准的危险级别（14 号 §8） */
const APPROVAL_DANGER_LEVELS: ReadonlySet<ToolDangerLevel> = new Set(['exec', 'external-post'])

// ==================== 类型化错误（23 号 §9 纪律） ====================

/** 注册名冲突 / 非法工具名 */
export class AgentToolConflictError extends Error {
  readonly code = 'AGENT_TOOL_CONFLICT'
  constructor(name: string, reason: string) {
    super(`工具注册失败（${name}）：${reason}`)
    this.name = 'AgentToolConflictError'
  }
}

// ==================== 审计面（14 号 §4.1 的注入形态；DB 落表随 M2） ====================

/** 单次工具调用审计记录（字段白名单制——禁记解密后凭据/完整响应体） */
export interface AgentToolCallAudit {
  toolName: string
  args: unknown // 已过 schema 校验的入参（{{credential}} 展开前形态）
  dangerLevel: ToolDangerLevel
  approval: 'not-required' | 'approved' | 'rejected' | 'auto'
  status: 'succeeded' | 'failed' | 'blocked' | 'rejected'
  errorCode?: AgentToolErrorCode
  durationMs: number
  resultPreview: string
  truncated: boolean
  /** 宿主上下文（runId/nodeId/iteration 等，调用方经 context 传入） */
  context: Record<string, unknown>
}

export interface AgentToolRegistryDeps {
  /** 审计 sink（fire-and-forget；DB 落表 M2 接入，当前缺省仅结构化日志） */
  audit?: (record: AgentToolCallAudit) => void
  /** 审批回调（与 LoopRunner 的 requestApproval 同形；缺省=拒绝——安全默认） */
  requestApproval?: (
    tool: AgentToolDef,
    input: unknown,
    ctx: { scopeId: string; rawInput: string; toolCallId: string; signal?: AbortSignal },
  ) => Promise<{ action: string; reason?: string; input?: Record<string, unknown> }>
  /** 直调执行超时 ms */
  executeTimeoutMs?: number
  clock?: () => number
}

interface RegisteredTool {
  def: AgentToolDef
  spec: AgentToolSpec
}

/** zod → jsonSchema 派生（失败回退空 schema——不阻断注册，列表侧可见降级） */
function deriveJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  try {
    const zs = schema as unknown as { toJSONSchema?: () => Record<string, unknown> }
    if (typeof zs.toJSONSchema === 'function') return zs.toJSONSchema()
    return {}
  } catch (e) {
    logger.warn('[tool-registry] jsonSchema 派生失败（回退空 schema）', e)
    return {}
  }
}

/** 取严：requiresApproval ∨ dangerLevel∈{exec, external-post} */
function deriveRequiresApproval(def: AgentToolDef): boolean {
  return def.requiresApproval === true || APPROVAL_DANGER_LEVELS.has(def.dangerLevel ?? 'read')
}

/** 深合并：静态 config 键优先（递归 plain object；数组/标量静态整体替换） */
export function mergeStaticConfig(
  staticConfig: Record<string, unknown> | undefined,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (!staticConfig || Object.keys(staticConfig).length === 0) return args
  const out: Record<string, unknown> = { ...args }
  for (const [key, staticVal] of Object.entries(staticConfig)) {
    const argVal = out[key]
    if (
      staticVal !== null &&
      typeof staticVal === 'object' &&
      !Array.isArray(staticVal) &&
      argVal !== null &&
      typeof argVal === 'object' &&
      !Array.isArray(argVal)
    ) {
      out[key] = mergeStaticConfig(staticVal as Record<string, unknown>, argVal as Record<string, unknown>)
    } else {
      out[key] = staticVal // 静态键优先：LLM 不可覆盖宿主配置
    }
  }
  return out
}

// ==================== 结果序列化（14 号 §5.5 简化版；落盘引用化 M2） ====================

export function serializeToolResult(raw: unknown): { data: unknown; truncated: boolean } {
  let truncated = false
  const walk = (value: unknown, depth: number): unknown => {
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'string' && value.length > TOOL_RESULT_FIELD_MAX_CHARS) {
        truncated = true
        return value.slice(0, TOOL_RESULT_FIELD_MAX_CHARS) + `…[truncated ${value.length} chars]`
      }
      return value
    }
    if (depth > 8) {
      truncated = true // 深度上限同时兜住循环引用（walk 替换后 stringify 不再遇环）
      return '[depth-limit]'
    }
    if (Array.isArray(value)) {
      const keep = value.length > TOOL_RESULT_ARRAY_KEEP
      const items = keep ? value.slice(0, TOOL_RESULT_ARRAY_KEEP) : value
      const mapped = items.map((v) => walk(v, depth + 1))
      if (keep) {
        truncated = true
        mapped.push({ _truncated: { totalItems: value.length, note: `仅保留前 ${TOOL_RESULT_ARRAY_KEEP} 项` } })
      }
      return mapped
    }
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // 二进制类字段永不进 LLM 上下文（http-fetch 的 base64/dataUrl 形态）
      if ((k === 'base64' || k === 'dataUrl') && typeof v === 'string' && v.length > 256) {
        truncated = true
        out[k] = { _omitted: 'binary', sizeBytes: v.length }
        continue
      }
      out[k] = walk(v, depth + 1)
    }
    return out
  }
  const data = walk(raw, 0)
  try {
    if (JSON.stringify(data).length > TOOL_RESULT_MAX_BYTES) {
      truncated = true
      return { data: { _oversize: true, preview: JSON.stringify(data).slice(0, TOOL_RESULT_MAX_BYTES / 2) }, truncated }
    }
  } catch {
    return { data: { _unserializable: true }, truncated: true }
  }
  return { data, truncated }
}

// ==================== 注册表 ====================

export class AgentToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>()
  private readonly deps: Required<Pick<AgentToolRegistryDeps, 'executeTimeoutMs'>> & {
    audit: ((record: AgentToolCallAudit) => void) | null
    requestApproval: AgentToolRegistryDeps['requestApproval'] | null
    clock: () => number
  }

  constructor(deps: AgentToolRegistryDeps = {}) {
    this.deps = {
      audit: deps.audit ?? null,
      requestApproval: deps.requestApproval ?? null,
      executeTimeoutMs: deps.executeTimeoutMs ?? TOOL_EXECUTE_TIMEOUT_MS,
      clock: deps.clock ?? (() => Date.now()),
    }
  }

  // —— 注册 ——

  /** 注册工具；ns 传入时名称命名空间化为 pack:<packId>:<name>（业务包 activate 调用） */
  register(def: AgentToolDef, ns?: { packId: string }): void {
    const name = ns ? `pack:${ns.packId}:${def.name}` : def.name
    if (!TOOL_NAME_RE.test(def.name)) {
      throw new AgentToolConflictError(def.name, `基础名须匹配 ${TOOL_NAME_RE.source}（命名空间前缀另拼）`)
    }
    if (this.tools.has(name)) {
      throw new AgentToolConflictError(name, '同名工具已注册')
    }
    this.tools.set(name, {
      def: { ...def, name },
      spec: {
        name,
        source: ns ? 'pack' : 'builtin',
        packId: ns?.packId,
        description: def.description,
        llmDescription: def.description,
        jsonSchema: deriveJsonSchema(def.inputSchema),
        dangerLevel: def.dangerLevel ?? 'read',
        requiresApproval: deriveRequiresApproval(def),
      },
    })
    logger.info(`[tool-registry] 注册 ${name}（source=${ns ? 'pack' : 'builtin'} danger=${def.dangerLevel ?? 'read'}）`)
  }

  /** 按名注销（pack disable / 测试用） */
  unregister(name: string): void {
    if (this.tools.delete(name)) logger.info(`[tool-registry] 注销 ${name}`)
  }

  /** 整包注销（pack disable 时调用；返回注销数量） */
  unregisterPack(packId: string): number {
    let n = 0
    for (const name of [...this.tools.keys()]) {
      if (this.tools.get(name)?.spec.packId === packId) {
        this.tools.delete(name)
        n++
      }
    }
    if (n > 0) logger.info(`[tool-registry] 整包注销 pack=${packId}（${n} 个工具）`)
    return n
  }

  // —— 目录 ——

  listSpecs(filter?: { source?: AgentToolSpec['source']; packId?: string }): AgentToolSpec[] {
    return [...this.tools.values()]
      .map((t) => t.spec)
      .filter(
        (spec) =>
          (!filter?.source || spec.source === filter.source) &&
          (!filter?.packId || spec.packId === filter.packId),
      )
  }

  /** 协议层序列化（LLM 可见面：name/description/parameters——无宿主侧信息） */
  toLLMTools(specs: AgentToolSpec[]): LLMToolDescriptor[] {
    return specs.map((spec) => ({
      name: spec.name,
      description: spec.llmDescription,
      parameters: spec.jsonSchema,
    }))
  }

  // —— 执行（校验→审批短路→执行→截断→审计；错误永不 throw） ——

  async execute(call: {
    toolName: string
    args: Record<string, unknown>
    /** 直调路径的宿主上下文（runId/nodeId/scopeId 等，进审计与执行 ctx.logContext） */
    context?: Record<string, unknown>
    signal?: AbortSignal
  }): Promise<AgentToolResult> {
    return this.runPipeline(call, { skipApproval: false })
  }

  private async runPipeline(
    call: {
      toolName: string
      args: Record<string, unknown>
      context?: Record<string, unknown>
      signal?: AbortSignal
    },
    opts: { skipApproval: boolean },
  ): Promise<AgentToolResult> {
    const started = this.deps.clock()
    const tool = this.tools.get(call.toolName)
    if (!tool) {
      return this.finish(call, null, {
        ok: false,
        error: {
          code: 'NOT_WHITELISTED',
          message: `工具未注册：${call.toolName}`,
          hint: `可用工具：${[...this.tools.keys()].slice(0, 10).join(', ')}${this.tools.size > 10 ? ' …' : ''}`,
          retryable: false,
        },
        durationMs: 0,
      })
    }

    // ① 审批短路（缺省回调=拒绝——安全默认，22 号 §3-C2 同源）。
    // loop 桥接路径 skipApproval=true：loop 层的 requestApproval 已审过，
    // 此处再审会双重发卡（破坏同 scope 单卡不变量）
    let args = call.args
    if (!opts.skipApproval && tool.spec.requiresApproval && this.deps.requestApproval) {
      const decision = await this.deps.requestApproval(tool.def, args, {
        scopeId: String(call.context?.scopeId ?? ''),
        rawInput: String(call.context?.rawInput ?? ''),
        toolCallId: String(call.context?.toolCallId ?? ''),
        signal: call.signal,
      })
      if (decision.action !== 'approve' && decision.action !== 'approve_with_edit') {
        return this.finish(
          call,
          tool,
          {
            ok: false,
            error: {
              code: 'INTERNAL',
              message: '用户拒绝了该操作',
              hint: '请调整方案或直接给出最终答案。',
              retryable: false,
            },
            durationMs: this.deps.clock() - started,
          },
          'rejected',
        )
      }
      if (decision.action === 'approve_with_edit' && decision.input) args = decision.input
    }

    // ② zod 校验（失败=结构化错误回填，模型自纠）
    const parsed = tool.def.inputSchema.safeParse(args)
    if (!parsed.success) {
      return this.finish(call, tool, {
        ok: false,
        error: {
          code: 'INVALID_ARGS',
          message: 'INVALID_ARGS',
          hint: parsed.error.issues
            .slice(0, 8)
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; '),
          retryable: true,
        },
        durationMs: this.deps.clock() - started,
      })
    }

    // ③ 执行（超时 + signal；异常捕获为结构化错误——永不 throw 出注册表）
    let raw: unknown
    try {
      raw = await withTimeout(
        tool.def.execute(parsed.data as never, {
          scopeId: String(call.context?.scopeId ?? ''),
          rawInput: String(call.context?.rawInput ?? ''),
          signal: call.signal,
          logContext: { tool: tool.spec.name, ...call.context },
        }),
        this.deps.executeTimeoutMs,
        call.signal,
      )
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string }
      const code: AgentToolErrorCode =
        err?.name === 'TimeoutError' ? 'TIMEOUT' : call.signal?.aborted ? 'CANCELLED' : 'INTERNAL'
      return this.finish(call, tool, {
        ok: false,
        error: {
          code,
          message: code === 'TIMEOUT' ? `工具执行超过 ${Math.round(this.deps.executeTimeoutMs / 1000)}s` : (err?.message ?? String(e)),
          hint: code === 'TIMEOUT' ? '工具过慢，建议换用更轻量的查询' : undefined,
          retryable: code !== 'CANCELLED',
        },
        durationMs: this.deps.clock() - started,
      })
    }

    // ④ 截断序列化
    const { data, truncated } = serializeToolResult(raw)
    return this.finish(
      call,
      tool,
      { ok: true, data, truncated, durationMs: this.deps.clock() - started },
      'not-required',
      truncated,
    )
  }

  // —— registry→loop 桥接（23 号 §3；run 启动时快照） ——

  /**
   * 按白名单 bindings 装配 LoopRunner 需要的 AgentToolDef 映射。
   * - binding 静态 config 深合并（静态键优先）
   * - descriptionOverride 生效；审计/截断经本注册表包装层复用 execute 管线
   * - maxCalls 闭包计数（快照内独立；超限回填 LIMIT_EXCEEDED）
   * - 审批不在此层：loop 已有 requestApproval 包装（双重发卡反而破坏单卡断言）
   * - 引用未注册工具：跳过 + warn（宁缺毋滥，14 号 §3 覆盖优先级同源）
   */
  buildToolDefs(bindings: AgentToolBinding[]): Record<string, AgentToolDef> {
    const out: Record<string, AgentToolDef> = {}
    const counters = new Map<string, { used: number }>()
    for (const binding of bindings) {
      const tool = this.tools.get(binding.tool)
      if (!tool) {
        logger.warn(`[tool-registry] 白名单引用未注册工具，跳过：${binding.tool}`)
        continue
      }
      const counter = { used: 0 }
      counters.set(binding.tool, counter)
      out[binding.tool] = this.wrapForLoop(tool, binding, counter)
    }
    return out
  }

  private wrapForLoop(
    tool: RegisteredTool,
    binding: AgentToolBinding,
    counter: { used: number },
  ): AgentToolDef {
    const base = tool.def
    const needsApproval =
      binding.approval === 'always'
        ? true
        : binding.approval === 'never'
          ? false // 显式放宽（编辑器二次确认的契约位）
          : tool.spec.requiresApproval // inherit：取严默认
    return {
      ...base,
      description: binding.descriptionOverride ?? base.description,
      requiresApproval: needsApproval,
      execute: async (input, ctx: AgentToolContext) => {
        if (binding.maxCalls !== undefined && counter.used >= binding.maxCalls) {
          return {
            ok: false,
            error: 'LIMIT_EXCEEDED',
            hint: `本工具单次运行上限 ${binding.maxCalls} 次已用尽，请改用其他方式完成任务。`,
          }
        }
        counter.used++
        const merged = mergeStaticConfig(binding.config, input as Record<string, unknown>)
        // 复用 execute 管线（校验/超时/截断/审计），skipApproval——loop 层已审（见方法注释）
        const result = await this.runPipeline(
          {
            toolName: binding.tool,
            args: merged,
            context: {
              ...ctx.logContext,
              scopeId: ctx.scopeId,
              rawInput: ctx.rawInput,
              toolCallId: (ctx as { toolCallId?: string }).toolCallId ?? '',
            },
            signal: ctx.signal,
          },
          { skipApproval: true },
        )
        if (result.ok) return { ok: true, data: result.data }
        return {
          ok: false,
          error: result.error?.code ?? 'INTERNAL',
          detail: result.error?.message,
          hint: result.error?.hint,
        }
      },
    }
  }

  /** 审计收口：sink 异常不外泄（warn 留痕），缺省仅结构化日志 */
  private finish(
    call: { toolName: string; args: Record<string, unknown>; context?: Record<string, unknown> },
    tool: RegisteredTool | null,
    result: AgentToolResult,
    approval: AgentToolCallAudit['approval'] = 'not-required',
    truncated = false,
  ): AgentToolResult {
    if (tool && this.deps.audit) {
      try {
        this.deps.audit({
          toolName: tool.spec.name,
          args: call.args,
          dangerLevel: tool.spec.dangerLevel,
          approval,
          status: result.ok ? 'succeeded' : approval === 'rejected' ? 'rejected' : 'failed',
          errorCode: result.error?.code,
          durationMs: result.durationMs,
          resultPreview: JSON.stringify(result.data ?? result.error?.message ?? '').slice(0, 500),
          truncated,
          context: call.context ?? {},
        })
      } catch (e) {
        logger.warn('[tool-registry] 审计 sink 异常（不影响调用结果）', e)
      }
    }
    if (!result.ok) {
      logger.warn(
        `[tool-registry] 调用失败 ${call.toolName} code=${result.error?.code} ${result.error?.message ?? ''}`,
      )
    }
    return result
  }
}

// ==================== 内部工具 ====================

function withTimeout<T>(p: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error('tool timeout'), { name: 'TimeoutError' })), ms)
    t.unref?.()
    const onAbort = () => {
      clearTimeout(t)
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    p.then(
      (v) => {
        clearTimeout(t)
        signal?.removeEventListener('abort', onAbort)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        signal?.removeEventListener('abort', onAbort)
        reject(e)
      },
    )
  })
}
