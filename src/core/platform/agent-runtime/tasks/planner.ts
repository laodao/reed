/**
 * 任务规划器（26 号 M3 批2 / 01 号 §5.2 静态规划）
 * @module core/platform/agent-runtime/tasks/planner
 *
 * LLM 对根目标生成完整任务树（每节点 title/spec/executor/children）。
 * 硬性约束：产物整树 pending_review，人工批准后才执行（01 号 §M3 风险——
 * Planner 生成质量不稳定，静态规划必须人工批准，开放问题 3 采纳整树一次批准）。
 * LLM 输出容错：提取首个 JSON 对象；深度/节点数/字段校验 fail-fast。
 */

import { createLogger } from '@core/utils/logger'
import type { PlannedTaskNode } from '@shared/types/agent.types'

const logger = createLogger('AgentPlanner')

/** 规划深度上限（01 号 §5.1：防递归爆炸） */
export const MAX_TASK_DEPTH = 4
/** 单树节点数上限（DoS/失控防线） */
export const MAX_TASK_NODES = 20

/** 依赖端口：LLM 规划调用（宿主封装 resolveModel + generateText） */
export interface PlannerDeps {
  plan: (input: { goal: string; maxDepth: number; signal?: AbortSignal }) => Promise<string>
}

export const PLANNER_SYSTEM_PROMPT = `你是任务规划器。把用户目标分解为可执行的任务树。
输出严格 JSON（不要 markdown 代码块）：
{
  "title": "根任务标题",
  "children": [
    {
      "title": "子任务标题",
      "spec": { "goal": "具体目标（含输入来源与期望产出）", "acceptance": "可验证的验收标准", "toolWhitelist": ["http_get"] },
      "children": []
    }
  ]
}
规则：
- 每个叶节点的 spec.goal 必须自包含（一个 agent 独立可完成），acceptance 必须可客观验证
- 叶子数不超过 6 个；树的深度不超过 {maxDepth}（由宿主注入实际值）
- 不要编造工具，toolWhitelist 只用：http_get / web_search / wf_web_extract / wf_translate / wf_kb_retrieve（留空=无工具纯生成）
- 中间节点不需要 spec 的 toolWhitelist（它们只聚合子任务结果）`

/** LLM 输出 → 任务树（容错解析 + 结构校验） */
export function parsePlanTree(text: string, maxDepth = MAX_TASK_DEPTH): PlannedTaskNode {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('规划输出不含 JSON 对象')
  let raw: unknown
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch (e) {
    throw new Error(`规划 JSON 解析失败：${e instanceof Error ? e.message : String(e)}`)
  }
  return validateNode(raw, 0, maxDepth, { count: 0 })
}

function validateNode(raw: unknown, depth: number, maxDepth: number, counter: { count: number }): PlannedTaskNode {
  if (depth >= maxDepth) throw new Error(`任务树深度超过上限 ${maxDepth}`)
  counter.count++
  if (counter.count > MAX_TASK_NODES) throw new Error(`任务树节点数超过上限 ${MAX_TASK_NODES}`)
  if (!raw || typeof raw !== 'object') throw new Error('规划节点不是对象')
  const node = raw as Record<string, unknown>
  const title = String(node.title ?? '').trim()
  if (!title) throw new Error('规划节点缺少 title')
  const specRaw = (node.spec ?? {}) as Record<string, unknown>
  const goal = String(specRaw.goal ?? '').trim() || title // 缺 goal 回落标题（真模型输出容错；E2E 实证 qwen 会漏）
  const spec: PlannedTaskNode['spec'] = {
    goal,
    acceptance: String(specRaw.acceptance ?? '').trim() || undefined,
    toolWhitelist: Array.isArray(specRaw.toolWhitelist) ? specRaw.toolWhitelist.map(String).slice(0, 10) : undefined,
    verification: undefined,
  }
  let children: unknown[] = []
  if (node.children !== undefined && node.children !== null) {
    if (!Array.isArray(node.children)) throw new Error(`任务「${title}」的 children 必须是数组（review T16：静默降级曾使聚合节点变执行叶）`)
    children = node.children
  }
  return {
    title,
    spec,
    executor: 'agent_loop',
    children: children.map((c) => validateNode(c, depth + 1, maxDepth, counter)),
  }
}

export class Planner {
  private readonly deps: PlannerDeps

  constructor(deps: PlannerDeps) {
    this.deps = deps
  }

  /** LLM 静态规划（人工批准前的产物；失败结构化抛错——调用方转 IPC 错误）。
   *  maxDepth：剩余深度预算（重规划局部分解时按失败任务深度收紧——review T6） */
  async planTree(goal: string, signal?: AbortSignal, maxDepth: number = MAX_TASK_DEPTH): Promise<PlannedTaskNode> {
    const raw = await this.deps.plan({
      goal,
      maxDepth,
      signal,
    })
    const tree = parsePlanTree(raw, maxDepth)
    logger.info(`[planner] 规划完成：root=${tree.title}（${countNodes(tree)} 节点，深度 ${treeDepth(tree)}）`)
    return tree
  }
}

export function countNodes(node: PlannedTaskNode): number {
  return 1 + (node.children ?? []).reduce((s, c) => s + countNodes(c), 0)
}

export function treeDepth(node: PlannedTaskNode): number {
  return 1 + (node.children ?? []).reduce((s, c) => Math.max(s, treeDepth(c)), 0)
}
