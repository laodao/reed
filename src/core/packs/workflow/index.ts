/**
 * 工作流内置业务包（后端接线）
 * @module core/packs/workflow
 * @description 物理收拢式：handler 已搬入包目录（./handlers/workflow.handler，
 *              27 个 wf:* channel），本包在 activate 时调用其
 *              registerWorkflowHandlers()。
 *              工作流引擎本体（@core/platform/workflow：engine/nodes/trigger/boot 等）
 *              是平台内核能力（harness 设计：引擎业务无关，供各业务包复用），
 *              留在壳中不搬——本包只收编"工作流编排"这块用户业务的 IPC 与 UI。
 *              manifest 的 id/name/version 与前端骨架（renderer/packs/workflow）保持一致。
 *
 *              归属说明：handler 全部 27 个 channel 均为 wf:* 前缀，单前缀完整覆盖。
 *              M3 增补：agent-tasks.handler（26 号）——at:*（任务树）/ am:*（知识飞轮）。
 *
 *              禁用语义本期到"IPC 守卫统一拦截 wf:*"为止——引擎本身不停
 *              （在途 run 不受影响，cron/event 触发器仍由平台层调度），
 *              handler 注册保留、服务单例不卸载，故 activate 不返回 disposer。
 */

import { registerWorkflowHandlers } from './handlers/workflow.handler'
import { registerAgentTaskHandlers } from './handlers/agent-tasks.handler'
import { registerAgentConsoleHandlers } from './handlers/agent-console.handler'
import type { PackDefinition } from '../registry'

export const workflowPack: PackDefinition = {
  manifest: {
    id: 'workflow',
    name: '工作流',
    version: '1.0.0',
    description: '可视化流程编排与自动化执行——定义/版本/触发器/运行/分享',
    contributions: {
      ipcChannelPrefixes: ['wf:', 'at:', 'am:', 'ac:'],
    },
  },
  activate() {
    registerWorkflowHandlers()
    registerAgentTaskHandlers()
    registerAgentConsoleHandlers()
  },
}
