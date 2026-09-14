/**
 * lw_projects.wizard_state 读-改-写原语（复核修复：新增的 conflict-gate
 * acknowledgeConflict 在队列外裸读改写 wizardState，与研讨室轮次写并发丢更新）
 * @module core/platform/services/longwriting/wizard-state-rmw
 *
 * 机制/策略分离：per-project 写串行队列原本在 story-room/room-state.ts（pack 层），
 * 而 wizardState 现有多个写方（room 键、conflictResolutions 键），队列必须对
 * platform 层开放——否则每个新写方都会重演丢更新窗口。room-state.ts 已改为
 * 委托本模块（导出签名不变，消费方无感）。
 *
 * 同进程内同项目写严格串行；跨进程并发由单机单用户约定兜底（同 room-state 原语义）。
 */

import type { WizardStateFull } from '@shared/types/longwriting.types'

/** per-project 写串行队列（同项目写严格按提交顺序执行，消除读-合并-写丢更新） */
const writeChains = new Map<string, Promise<unknown>>()

export function enqueueWizardWrite<T>(projectId: string, task: () => Promise<T>): Promise<T> {
  const prev = writeChains.get(projectId) ?? Promise.resolve()
  const next = prev.then(task, task)
  writeChains.set(projectId, next.catch(() => undefined))
  return next
}

export interface WizardRmW<T> {
  next: WizardStateFull
  result: T
}

/**
 * 队列内读-改-写：mutator 拿到队列内最新 wizardState 做增量变换（可异步——
 * 异步 mutator 同样在队列内 await，串行语义保持），返回 { next, result }；
 * next 全量写回，result 透传给调用方。
 */
export async function mutateWizardState<T>(
  db: any,
  projectId: string,
  mutator: (wizard: WizardStateFull) => WizardRmW<T> | Promise<WizardRmW<T>>,
): Promise<T> {
  return enqueueWizardWrite(projectId, async () => {
    const project = await db?.lwProjects?.getById(projectId)
    if (!project) throw new Error(`长文项目不存在：${projectId}`)
    const current: WizardStateFull = project.wizardState || {}
    const { next, result } = await mutator(current)
    const updated = await db.lwProjects.update(projectId, { wizardState: next })
    if (!updated) throw new Error(`wizardState 保存失败（项目不存在）：${projectId}`)
    return result
  })
}
