/**
 * 代码节点（P0 片2：JavaScript 沙箱执行）
 * @module core/platform/workflow/nodes/code-nodes
 * @description 用 Node vm 在隔离 context 中执行用户代码：
 *              - 暴露安全全局（console/Math/JSON/Date 等基础 JS 能力），不暴露 require/process/fs/网络
 *              - 输入经 inputs 对象注入（模板深解析后的实参）
 *              - 约定用户代码 return 一个对象 → 节点输出 { result }
 *              - 超时 WORKFLOW_LIMITS.codeTimeoutMs（5s）防死循环拖垮引擎
 *
 * 安全说明：vm 不是完整安全边界（V1 单用户桌面场景可接受）；
 * 文档注明"仅执行可信代码"——分享/多租户场景需替换为独立进程沙箱（P2）。
 */

import vm from 'node:vm'
import { WORKFLOW_LIMITS } from '@shared/types/workflow.types'
import type { WorkflowNodeContext } from '../engine/node-handler'
import type { WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'

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
  Set,
}

/** 沙箱执行：输入注入 context.inputs；返回用户代码的 return 值 */
export function runCodeInSandbox(code: string, inputs: Record<string, unknown>, timeoutMs: number): unknown {
  const context: Record<string, unknown> = {
    ...SAFE_GLOBALS,
    inputs,
    result: undefined,
  }
  vm.createContext(context)
  // 包装：用户代码以 (function(inputs){...}) 调用，return 值写回 result
  const wrapped = `result = (function(inputs) {\n${code}\n})`
  const script = new vm.Script(`${wrapped}(inputs)`, { filename: 'workflow-code-node' })
  script.runInContext(context, { timeout: timeoutMs })
  return context.result
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
    const isElectron = !!(process.versions as Record<string, string | undefined>)?.electron
    if (!isElectron) {
      return {
        status: 'failed',
        error: '代码（code）节点仅在桌面端可用（Web 端不支持在服务端执行任意 JS）',
        retryable: false,
      }
    }
    const cfg = ctx.config as {
      code: string
      inputs?: Array<{ key: string; value: string }>
    }
    const inputs: Record<string, unknown> = {}
    for (const p of cfg.inputs ?? []) {
      if (p.key) inputs[p.key] = p.value
    }
    const code = stringifyValue(cfg.code)
    ctx.logger.info('代码节点执行', { inputs })
    const result = runCodeInSandbox(code, inputs, WORKFLOW_LIMITS.codeTimeoutMs)
    return { status: 'succeeded', output: { result } }
  },
}

export const CODE_NODE_HANDLERS: WorkflowNodeHandler[] = [codeNode]
