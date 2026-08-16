/**
 * 控制类节点（引擎内同步求值，不占并发信号量）
 * @module core/modules/workflow/nodes/control-nodes
 * @description start / end / condition / parallel / parallel-merge / assign 六个
 *              控制节点的 handler 实现。
 *
 *              控制节点与任务节点走完全相同的执行路径（node_run 留痕、变量输出、
 *              checkpoint），只是 execute() 内不产生 IO 等待。路由语义：
 *              - condition：按分支声明顺序求值，返回 route='branch:{branchId}'
 *              - 其余：无 route（引擎按默认规则激活出边）
 */

import type {
  WorkflowConditionBranch,
  WorkflowConditionItem,
} from '@shared/types/workflow.types'
import type { WorkflowNodeExecutionResult, WorkflowNodeHandler } from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'

// ==================== 开始 ====================

const startNode: WorkflowNodeHandler<any, 'start'> = {
  type: 'start',
  controlKind: 'control',
  cancellable: false,
  outputSchema: [{ key: '*', type: 'json', desc: '输入参数按 key 展开' }],
  validateConfig: () => [],
  async execute(ctx) {
    // 开始节点输出 = 输入参数本身（{{start.key}} 由 resolver 直接读 startInputs，
    // 这里同时落 output 供历史查看与续跑装配）
    return { status: 'succeeded', output: { ...ctx.startInputs } }
  },
}

// ==================== 结束 ====================

const endNode: WorkflowNodeHandler<any, 'end'> = {
  type: 'end',
  controlKind: 'control',
  cancellable: false,
  outputSchema: [],
  validateConfig: () => [],
  async execute() {
    return { status: 'succeeded', output: {} }
  },
}

// ==================== 条件分支 ====================

/** 单个条件的求值（left/right 已是实参） */
function evalCondition(cond: WorkflowConditionItem, resolvedLeft: unknown, resolvedRight: unknown): boolean {
  const left = resolvedLeft
  const right = resolvedRight
  switch (cond.operator) {
    case 'eq':
      return looseEq(left, right)
    case 'ne':
      return !looseEq(left, right)
    case 'gt':
      return compare(left, right) > 0
    case 'gte':
      return compare(left, right) >= 0
    case 'lt':
      return compare(left, right) < 0
    case 'lte':
      return compare(left, right) <= 0
    case 'contains':
      return stringifyValue(left).includes(stringifyValue(right))
    case 'not_contains':
      return !stringifyValue(left).includes(stringifyValue(right))
    case 'is_empty':
      return isEmpty(left)
    case 'not_empty':
      return !isEmpty(left)
    default:
      return false
  }
}

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v).length === 0
  return false
}

/** 宽松相等：数字字符串与数字可比（表单输入常见形态） */
function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true
  const na = toNumber(a)
  const nb = toNumber(b)
  if (na !== null && nb !== null) return na === nb
  return stringifyValue(a) === stringifyValue(b)
}

function compare(a: unknown, b: unknown): number {
  const na = toNumber(a)
  const nb = toNumber(b)
  if (na !== null && nb !== null) return na - nb
  const sa = stringifyValue(a)
  const sb = stringifyValue(b)
  return sa < sb ? -1 : sa > sb ? 1 : 0
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return null
}

const conditionNode: WorkflowNodeHandler<any, 'condition'> = {
  type: 'condition',
  controlKind: 'control',
  cancellable: false,
  outputSchema: [{ key: 'matchedBranch', type: 'string', desc: '命中的 branchId' }],
  validateConfig(config) {
    const errors: string[] = []
    const cfg = config as { branches?: WorkflowConditionBranch[]; noMatchPolicy?: string; fallbackBranchId?: string }
    if (!cfg.branches || cfg.branches.length === 0) {
      errors.push('至少需要一路分支')
      return errors
    }
    const ids = new Set<string>()
    for (const br of cfg.branches) {
      if (!br.branchId) errors.push('分支缺少 branchId')
      else if (ids.has(br.branchId)) errors.push(`分支 branchId 重复：${br.branchId}`)
      else ids.add(br.branchId)
      if (!br.conditions || br.conditions.length === 0) {
        errors.push(`分支「${br.label || br.branchId}」缺少条件`)
      }
    }
    if (cfg.noMatchPolicy === 'fallback' && !cfg.fallbackBranchId) {
      errors.push('noMatchPolicy=fallback 时必须指定 fallbackBranchId')
    }
    if (cfg.fallbackBranchId && !ids.has(cfg.fallbackBranchId)) {
      errors.push(`fallbackBranchId「${cfg.fallbackBranchId}」未在分支中声明`)
    }
    return errors
  },
  async execute(ctx): Promise<WorkflowNodeExecutionResult> {
    const cfg = ctx.config as unknown as {
      branches: WorkflowConditionBranch[]
      noMatchPolicy: 'fallback' | 'fail'
      fallbackBranchId?: string
    }
    // 按声明顺序求值，命中第一路。
    // ⚠️ cond.left/right 已由引擎 resolveConfigDeep 解析为实参——此处直接使用，
    // 禁止再调 resolveTemplate（上游输出含字面 {{...}} 时会被二次展开）
    for (const br of cfg.branches) {
      const allMatch = br.conditions.every(cond =>
        evalCondition(cond, cond.left, cond.right)
      )
      if (allMatch) {
        return {
          status: 'succeeded',
          output: { matchedBranch: br.branchId },
          route: `branch:${br.branchId}`,
        }
      }
    }
    // 全部未命中
    if (cfg.noMatchPolicy === 'fallback' && cfg.fallbackBranchId) {
      return {
        status: 'succeeded',
        output: { matchedBranch: cfg.fallbackBranchId, fallback: true },
        route: `branch:${cfg.fallbackBranchId}`,
      }
    }
    return { status: 'failed', error: '所有分支条件均未命中（noMatchPolicy=fail）', retryable: false }
  },
}

// ==================== 并行分支 / 合并 ====================

const parallelNode: WorkflowNodeHandler<any, 'parallel'> = {
  type: 'parallel',
  controlKind: 'control',
  cancellable: false,
  outputSchema: [],
  validateConfig: () => [],
  async execute() {
    // 扇出结构节点：引擎按出边数量激活全部 normal 出边
    return { status: 'succeeded', output: {} }
  },
}

const parallelMergeNode: WorkflowNodeHandler<any, 'parallel-merge'> = {
  type: 'parallel-merge',
  controlKind: 'control',
  cancellable: false,
  outputSchema: [{ key: '*', type: 'json', desc: 'merge=按来源 nodeId 展开 / first=首达输出' }],
  validateConfig(config) {
    const cfg = config as { waitPolicy?: string; outputMode?: string }
    const errors: string[] = []
    if (cfg.waitPolicy && !['all', 'any'].includes(cfg.waitPolicy)) {
      errors.push('waitPolicy 只能是 all 或 any')
    }
    if (cfg.outputMode && !['merge', 'first'].includes(cfg.outputMode)) {
      errors.push('outputMode 只能是 merge 或 first')
    }
    return errors
  },
  async execute(ctx) {
    // 合并的输出由引擎在 settle 时注入（引擎知道各入边来源的实际输出）；
    // handler 本身无事可做。
    void ctx
    return { status: 'succeeded', output: {} }
  },
}

// ==================== 变量赋值 ====================

const assignNode: WorkflowNodeHandler<any, 'assign'> = {
  type: 'assign',
  controlKind: 'control',
  cancellable: false,
  outputSchema: [{ key: 'values', type: 'json', desc: '赋值结果' }],
  validateConfig(config) {
    const cfg = config as { assignments?: Array<{ key: string; value: string }> }
    const errors: string[] = []
    if (!cfg.assignments || cfg.assignments.length === 0) {
      errors.push('至少需要一条赋值')
      return errors
    }
    for (const a of cfg.assignments) {
      if (!a.key || !a.key.trim()) errors.push('赋值键不能为空')
    }
    return errors
  },
  async execute(ctx) {
    const cfg = ctx.config as unknown as {
      assignments: Array<{ key: string; value: string }>
    }
    // value 已由引擎 resolveConfigDeep 解析（单占位透传保留类型）——直接使用，
    // 禁止二次解析（同 condition 的注入风险）
    const values: Record<string, unknown> = {}
    for (const a of cfg.assignments) {
      values[a.key] = a.value
    }
    return { status: 'succeeded', output: { values } }
  },
}

// ==================== 循环（引擎直接调度的特殊节点） ====================

/**
 * loop 的占位 handler：引擎 launchNode 对 type==='loop' 特判走 executeLoopNode，
 * 永不调用本 execute。占位的职责：注册表/目录一致性 + config 深度校验。
 */
const loopNode: WorkflowNodeHandler<any, 'loop'> = {
  type: 'loop',
  controlKind: 'control',
  cancellable: true,
  outputSchema: [
    { key: 'item', type: 'json', desc: '当前迭代元素（循环体内引用）' },
    { key: 'index', type: 'number', desc: '当前迭代下标（循环体内引用）' },
    { key: 'results', type: 'json', desc: '各迭代汇聚输出的数组' },
    { key: 'count', type: 'number', desc: '迭代总数' },
  ],
  validateConfig(config) {
    const cfg = config as { listExpression?: unknown }
    if (typeof cfg.listExpression !== 'string' || cfg.listExpression.trim() === '') {
      return ['listExpression 必须是非空模板表达式']
    }
    const policy = (config as { emptyPolicy?: string }).emptyPolicy
    if (policy !== undefined && !['skip', 'fail'].includes(policy)) {
      return ['emptyPolicy 只能是 skip 或 fail']
    }
    return []
  },
  async execute() {
    // 引擎特判在前，正常调度不可能到这里
    return { status: 'failed', error: '循环节点由引擎直接调度', retryable: false }
  },
}

/** 全部控制节点（注册表装配用） */
export const CONTROL_NODE_HANDLERS: WorkflowNodeHandler[] = [
  startNode,
  endNode,
  conditionNode,
  parallelNode,
  parallelMergeNode,
  assignNode,
  loopNode,
]
