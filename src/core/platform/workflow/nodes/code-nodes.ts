/**
 * 代码节点（P0 片2：JavaScript 沙箱执行；2026-10-08 宿主桥扩展）
 * @module core/platform/workflow/nodes/code-nodes
 * @description 用 Node vm 在隔离 context 中执行用户代码：
 *              - 暴露安全全局（console/Math/JSON/Date 等基础 JS 能力），不暴露 require/process/fs
 *              - 输入经 inputs 对象注入（模板深解析后的实参；valueType=json 时解析为结构）
 *              - 约定用户代码 return 一个对象 → 节点输出 { result }
 *              - 同步超时 codeSandbox.timeoutMs（vm timeout，防同步死循环）
 *
 *              宿主桥（设计 docs/design/2026-10-08-workflow-app-platform-evolution.md §2）：
 *              - 注入 `host` 命名空间：host.http / host.table.* / host.log.*（白名单异步宿主函数）
 *              - 三重闸门：墙钟 asyncTimeoutMs + host 调用计数 maxHostCalls + ctx.signal 中止
 *              - host.http / host.table 写操作计入运行级工具预算（toolBudget）
 *              - 已知残留：纯微任务死循环（无宿主调用）无法在进程内抢占，彻底解决需 task runner（P3）
 *
 * 安全说明：vm 不是完整安全边界（V1 单用户桌面场景可接受）；
 * 文档注明"仅执行可信代码"——分享/多租户场景需替换为独立进程沙箱（P2/P3）。
 */

import vm from 'node:vm'
import { workflowRuntimeParams } from '@shared/utils/workflow-runtime-params'
import type { WorkflowNodeContext } from '../engine/node-handler'
import type { WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'
import { executeHttpFetch } from './http-fetch'
import { getVariableDataService } from '../variables/variable-data.service'

/** 沙箱可用的安全全局（白名单——不暴露 process/require/Buffer/global 等） */
const SAFE_GLOBALS: Record<string, unknown> = {
  console,
  Math,
  JSON,
  Date,
  Number,
  String,
  Boolean,
  Array,
  Object,
  Error,
  TypeError,
  RangeError,
  Promise,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  RegExp,
  Map,
  Set
}

/** 桌面端运行判定（真·Electron 主进程；Web 多租户服务端禁任意 JS 执行） */
export function isElectronRuntime(): boolean {
  // ELECTRON_RUN_AS_NODE=1（vitest/tsx 跑在 Electron 内置 Node 上）语义仍是 Node，
  // 不是桌面主进程 → 按非桌面处理，保留"服务端/测试不执行任意 JS"的 RCE 门禁。
  const v = process.versions as Record<string, string | undefined>
  return !!v.electron && process.env.ELECTRON_RUN_AS_NODE !== '1'
}

export function runCodeInSandbox(
  code: string,
  inputs: Record<string, unknown>,
  timeoutMs: number
): unknown {
  const context: Record<string, unknown> = {
    ...SAFE_GLOBALS,
    inputs,
    result: undefined
  }
  vm.createContext(context)
  // 包装：用户代码以 (function(inputs){...}) 调用，return 值写回 result
  const wrapped = `result = (function(inputs) {\n${code}\n})`
  const script = new vm.Script(`${wrapped}(inputs)`, { filename: 'workflow-code-node' })
  script.runInContext(context, { timeout: timeoutMs })
  return context.result
}

/** 宿主桥注入对象（代码内 await host.* 调用；实现于沙箱外闭包，持有节点上下文） */
export type CodeHostBridge = {
  http: (input: {
    method: string
    url: string
    headers?: Record<string, string>
    body?: string
    timeoutMs?: number
    responseType?: 'auto' | 'text' | 'json' | 'base64'
  }) => Promise<Record<string, unknown>>
  table: {
    insert: (p: { tableId?: string; tableName?: string; scope?: 'workflow' | 'app'; row: Record<string, unknown> }) => Promise<{ tableId: string; rowId: string }>
    upsert: (p: { tableId?: string; tableName?: string; scope?: 'workflow' | 'app'; row: Record<string, unknown> }) => Promise<{ tableId: string; rowId: string; action: 'inserted' | 'updated' }>
    query: (p: { tableId?: string; tableName?: string; scope?: 'workflow' | 'app'; filter?: { field?: string; contains?: string }; limit?: number }) => Promise<Array<Record<string, unknown>>>
    update: (p: { rowId: string; row: Record<string, unknown> }) => Promise<{ ok: boolean }>
    delete: (p: { rowId: string }) => Promise<{ ok: boolean }>
  }
  log: {
    info: (msg: string, extra?: unknown) => void
    warn: (msg: string, extra?: unknown) => void
    error: (msg: string, extra?: unknown) => void
  }
}

/**
 * 构建宿主桥：三重闸门（计数/中止/预算）全部在闭包里自查。
 * host.table 的 app 作用域自动以 ctx.definitionId 为属主（与 data-table 节点同语义）。
 */
export function buildHostBridge(ctx: WorkflowNodeContext): CodeHostBridge {
  const { maxHostCalls } = workflowRuntimeParams().codeSandbox
  let hostCalls = 0

  const gate = (what: string, chargeBudget = false): void => {
    if (ctx.signal.aborted) throw new Error(`host.${what}：节点已取消`)
    hostCalls += 1
    if (hostCalls > maxHostCalls) {
      throw new Error(`host 调用次数超限（>${maxHostCalls}，参数设置 → 工作流 → 代码节点沙箱可调）——请减少代码内循环的宿主调用`)
    }
    if (chargeBudget && ctx.toolBudget && !ctx.toolBudget.tryConsume()) {
      throw new Error(`host.${what}：运行级工具调用预算已耗尽`)
    }
  }

  const tableOwner = (scope?: 'workflow' | 'app') =>
    scope === 'app' ? { scope: 'app' as const, ownerId: ctx.definitionId } : { scope: 'workflow' as const }

  return {
    http: async (input) => {
      gate('http', true)
      const r = await executeHttpFetch(
        {
          method: input.method || 'GET',
          url: input.url,
          headers: input.headers,
          body: input.body,
          timeoutMs: input.timeoutMs,
          responseType: input.responseType ?? 'text',
        },
        ctx.signal,
      )
      if (!r.ok) throw new Error(`host.http 请求失败：${r.error}`)
      // file 模式的落盘路径对沙箱无意义，剥离（其余字段可序列化直出）
      const output = { ...r.output } as Record<string, unknown>
      delete output.filePath
      return output
    },
    table: {
      insert: async (p) => {
        gate('table.insert', true)
        return getVariableDataService().insertRow({ ...p, ...tableOwner(p.scope) })
      },
      upsert: async (p) => {
        gate('table.upsert', true)
        return getVariableDataService().upsertRow({ ...p, ...tableOwner(p.scope) })
      },
      query: async (p) => {
        gate('table.query')
        const svc = getVariableDataService()
        const { limit, ...rest } = p
        const page = await svc.queryRowsPaged({ ...rest, ...tableOwner(p.scope), page: 1, pageSize: limit ?? 200 })
        return page.rows
      },
      update: async (p) => {
        gate('table.update', true)
        await getVariableDataService().updateRow(p.rowId, p.row)
        return { ok: true }
      },
      delete: async (p) => {
        gate('table.delete', true)
        await getVariableDataService().deleteRow(p.rowId)
        return { ok: true }
      },
    },
    log: {
      info: (msg, extra) => ctx.logger.info(String(msg), extra),
      warn: (msg, extra) => ctx.logger.warn(String(msg), extra),
      error: (msg, extra) => ctx.logger.error(String(msg), extra),
    },
  }
}

/**
 * 沙箱执行（宿主桥版）：代码包成 async 函数注入 (inputs, host)，
 * vm timeout 只拦同步段；整体墙钟经 Promise.race 中断（真实 IO 等待期间事件循环空闲、可触发）。
 */
export async function runCodeInSandboxAsync(
  code: string,
  inputs: Record<string, unknown>,
  opts: {
    syncTimeoutMs: number
    wallClockMs: number
    host?: CodeHostBridge
    signal?: AbortSignal
  }
): Promise<unknown> {
  const context: Record<string, unknown> = {
    ...SAFE_GLOBALS,
    inputs,
    host: opts.host ?? {},
    result: undefined,
  }
  vm.createContext(context)
  const wrapped = `result = (async function(inputs, host) {\n${code}\n})`
  const script = new vm.Script(`${wrapped}(inputs, host)`, { filename: 'workflow-code-node' })
  script.runInContext(context, { timeout: opts.syncTimeoutMs })
  const userPromise = context.result as Promise<unknown>
  if (!userPromise || typeof (userPromise as { then?: unknown }).then !== 'function') {
    return context.result // 代码没走异步路径（无 await）——同步返回值直出
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const wallClockP = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`代码执行超时（宿主调用墙钟 ${opts.wallClockMs}ms，参数设置 → 工作流 → 代码节点沙箱可调）`)),
      opts.wallClockMs,
    )
  })
  let onAbort: (() => void) | undefined
  const abortP = new Promise<never>((_, reject) => {
    if (opts.signal?.aborted) {
      reject(new Error('代码执行被取消'))
      return
    }
    onAbort = () => reject(new Error('代码执行被取消'))
    opts.signal?.addEventListener('abort', onAbort, { once: true })
  })
  // 竞速输了之后用户 Promise 仍可能 reject（如中止传导）——吞掉防 unhandledRejection
  userPromise.catch(() => {})

  try {
    return await Promise.race([userPromise, wallClockP, abortP])
  } finally {
    if (timer) clearTimeout(timer)
    if (onAbort && opts.signal) opts.signal.removeEventListener('abort', onAbort)
  }
}

const codeNode: WorkflowNodeHandler = {
  type: 'code',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [{ key: 'result', type: 'json', desc: '代码返回值（任意 JSON 值）' }],
  validateConfig(config) {
    const cfg = config as { code?: string; language?: string }
    const errors: string[] = []
    if (cfg.language && cfg.language !== 'js') errors.push('V1 仅支持 JavaScript')
    if (!stringifyValue(cfg.code).trim()) errors.push('代码不能为空')
    return errors
  },
  async execute(ctx: WorkflowNodeContext) {
    // 平台门禁：vm 沙箱非完整安全边界（文件头注释已自认），仅桌面单用户场景可接受。
    // Web 端是多租户服务器，放行等于"服务端执行任意用户 JS"（RCE），必须禁用。
    if (!isElectronRuntime()) {
      return {
        status: 'failed',
        error: '代码（code）节点仅在桌面端可用（Web 端不支持在服务端执行任意 JS）',
        retryable: false
      }
    }
    const cfg = ctx.config as {
      code: string
      inputs?: Array<{ key: string; value: string; valueType?: 'string' | 'json' }>
    }
    const sandbox = workflowRuntimeParams().codeSandbox
    const inputs: Record<string, unknown> = {}
    for (const p of cfg.inputs ?? []) {
      if (!p.key) continue
      if (p.valueType === 'json') {
        try {
          inputs[p.key] = p.value ? JSON.parse(p.value) : null
        } catch (e) {
          return {
            status: 'failed',
            error: `输入参数「${p.key}」声明为 json 但不是合法 JSON：${e instanceof Error ? e.message : String(e)}`,
            retryable: false,
          }
        }
      } else {
        inputs[p.key] = p.value
      }
    }
    const code = stringifyValue(cfg.code)
    ctx.logger.info('代码节点执行', { inputs })
    const result = await runCodeInSandboxAsync(code, inputs, {
      syncTimeoutMs: sandbox.timeoutMs,
      wallClockMs: sandbox.asyncTimeoutMs,
      host: buildHostBridge(ctx),
      signal: ctx.signal,
    })
    // 输出必须是可 JSON 序列化的纯对象（checkpoint 与变量上下文存储的契约）
    try {
      JSON.stringify(result)
    } catch {
      return {
        status: 'failed',
        error: '代码返回值必须可 JSON 序列化（函数/Symbol/循环引用不行）——请 return 纯数据对象',
        retryable: false,
      }
    }
    return { status: 'succeeded', output: { result } }
  }
}

export const CODE_NODE_HANDLERS: WorkflowNodeHandler[] = [codeNode]
