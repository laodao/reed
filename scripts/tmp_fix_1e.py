# -*- coding: utf-8 -*-
"""批次 1e：引擎状态类/纯函数拆分到 run-execution.ts（纯移动，零行为变化）"""

p = 'src/core/modules/workflow/engine/workflow-engine.service.ts'
s = open(p, encoding='utf-8').read()

def cut(start_marker, end_marker):
    """按标记切块（含头不含尾）"""
    global s
    i = s.index(start_marker)
    j = s.index(end_marker, i)
    block = s[i:j]
    s = s[:i] + s[j:]
    return block

# 按依赖顺序抽取
blocks = []
blocks.append(cut("/** 运行统计（落库 stats 列的形状） */", "/** 引擎执行入参（运行记录已由服务层建好） */"))  # RunExecutionStats
blocks.append(cut("/** 引擎执行入参（运行记录已由服务层建好） */", "/** 审核决策输入 */"))  # ExecuteRunInput
blocks.append(cut("/** 审核决策输入 */", "/** 节点内存态（作用域内以 nodeId 为键） */"))  # ReviewDecisionInput
blocks.append(cut("/** 节点内存态（作用域内以 nodeId 为键） */", "interface Deferred {"))  # NodeExecutionState
blocks.append(cut("interface Deferred {", "/** 根作用域键 */"))  # Deferred + makeDeferred
blocks.append(cut("/** 根作用域键 */", "/** 循环驱动进度（挂起后续驱用） */"))  # scope key helpers
blocks.append(cut("/** 循环驱动进度（挂起后续驱用） */", "/** 一次运行的完整内存态 */"))  # LoopDriver
# RunExecution 类到 export class 前的截断（RunExecution 与 matchRouteEdge 相邻顺序不定，按实际切）
blocks.append(cut("/** 一次运行的完整内存态 */", "export class WorkflowEngineService"))  # RunExecution + matchRouteEdge + truncate
body = '\n'.join(b.rstrip() + '\n\n' for b in blocks)

header = '''/**
 * 工作流引擎执行状态（RunExecution / ScopeState 与纯函数）
 * @module core/modules/workflow/engine/run-execution
 * @description 自 workflow-engine.service 拆出的状态层：
 *              一次运行的作用域树（根作用域 + 循环迭代作用域）、节点内存态、
 *              route→边匹配、输出截断等纯函数——引擎调度器只做调度决策，
 *              状态形状与不变量集中在此文件。
 */

import type {
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNodeRunStatus,
  WorkflowRunStatus,
} from '@shared/types/workflow.types'
import { encodeWorkflowHandleId } from '@shared/types/workflow.types'
import { VariableResolver, stringifyValue } from './variable-resolver'
import { resolveExecutionSettings, type ResolvedExecutionSettings } from './execution-settings'
import { buildNodeMap, computeLoopBody, type LoopBodyInfo } from './graph-topology'

'''
open('src/core/modules/workflow/engine/run-execution.ts', 'w', encoding='utf-8').write(header + body)
print('run-execution.ts written')

# engine service：import + re-export（保持外部导入兼容）
old = "import { buildNodeMap, computeLoopBody, type LoopBodyInfo } from './graph-topology'\nimport { errorMessage, sleepAbortable } from './async-utils'"
assert old in s, 'eng import'
s = s.replace(old, """import { errorMessage, sleepAbortable } from './async-utils'
import {
  ROOT_SCOPE_KEY,
  makeScopeKey,
  parseScopeLoopNodeId,
  matchRouteEdge,
  truncateOutput,
  RunExecution,
  ScopeState,
  type ExecuteRunInput,
  type LoopDriver,
  type NodeExecutionState,
  type ReviewDecisionInput,
  type RunExecutionStats,
} from './run-execution'

// 兼容既有外部导入（engine.service 曾是这些类型的定义处）
export type { ExecuteRunInput, ReviewDecisionInput, RunExecutionStats }""", 1)
open(p, 'w', encoding='utf-8').write(s)
print('engine import done')
