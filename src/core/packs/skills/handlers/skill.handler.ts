/**
 * 技能 IPC 处理器（双端共用：ipcBridge 同时注册 Electron ipcMain 与 Web 路由表）
 * @module core/packs/skills/handlers/skill.handler
 * @description 技能库管理（list/get/resolve/CRUD/导入导出/内置复制）与 skill-call 节点
 *              取用共用 SkillService；蒸馏（distill-run/status/list/cancel）走
 *              SkillDistillService。handler 只做参数透传与 IpcResponse 包装。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getSkillService } from '@core/platform/workflow/skills/skill-registry'
import type { UpsertSkillInput } from '@core/platform/workflow/skills/skill.service'
import { getSkillDistillService } from '@core/platform/workflow/skills/skill-distill-registry'
import type { IpcResponse } from '@shared/types/ipc.types'
import type { SkillDistillRequest } from '@shared/types/skill-distill.types'

/** 统一 { success, data, error } 包装（同步返回也接受——list/get 等为同步服务方法） */
async function wrap<T>(fn: () => T | Promise<T>): Promise<IpcResponse<T>> {
  try {
    return { success: true, data: await fn() }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function registerSkillHandlers(): void {
  /** 技能列表（内置 + 用户，含 inputs schema——参数区联动用） */
  ipcBridge.handle('skill:list', () => wrap(() => getSkillService().list()))
  /** 技能详情（不含 references） */
  ipcBridge.handle('skill:get', (_e, p: { id: string }) => wrap(() => getSkillService().get(p.id)))
  /** 技能完整定义（含 references，执行用） */
  ipcBridge.handle('skill:resolve', (_e, p: { id: string }) => wrap(() => getSkillService().resolveSkill(p.id)))
  /** 新建用户技能 */
  ipcBridge.handle('skill:create', (_e, p: { input: UpsertSkillInput }) => wrap(() => getSkillService().create(p.input)))
  /** 更新用户技能 */
  ipcBridge.handle('skill:update', (_e, p: { id: string; patch: Partial<UpsertSkillInput> }) =>
    wrap(() => getSkillService().update(p.id, p.patch))
  )
  /** 删除用户技能 */
  ipcBridge.handle('skill:remove', (_e, p: { id: string }) =>
    wrap(async () => {
      getSkillService().remove(p.id)
      return { removed: true }
    })
  )
  /** 导入技能包（目录或 .md 文件路径） */
  ipcBridge.handle('skill:import', (_e, p: { path: string }) => wrap(() => getSkillService().importFromPath(p.path)))
  /** 导出技能包到目标目录 */
  ipcBridge.handle('skill:export', (_e, p: { id: string; destDir: string }) =>
    wrap(async () => ({ path: getSkillService().exportToPath(p.id, p.destDir) }))
  )
  /** 内置技能复制为自定义 */
  ipcBridge.handle('skill:fork', (_e, p: { id: string }) => wrap(() => getSkillService().forkBuiltin(p.id)))

  // ==================== 技能蒸馏（内容 → Skill） ====================

  /** 发起蒸馏：立即返回 taskId，进度经 distill-status 轮询（Promise 不能过 IPC 结构化克隆） */
  ipcBridge.handle('skill:distill-run', (_e, p: { request: SkillDistillRequest }) =>
    wrap(() => getSkillDistillService().createTask(p.request))
  )
  /** 蒸馏任务快照（stage/progress/stats/issues） */
  ipcBridge.handle('skill:distill-status', (_e, p: { taskId: string }) =>
    wrap(() => getSkillDistillService().getTask(p.taskId))
  )
  /** 最近蒸馏任务列表（内存注册表，进程级） */
  ipcBridge.handle('skill:distill-list', () => wrap(() => getSkillDistillService().listTasks()))
  /** 取消蒸馏（当前 LLM 调用返回后生效） */
  ipcBridge.handle('skill:distill-cancel', (_e, p: { taskId: string }) =>
    wrap(() => {
      getSkillDistillService().cancelTask(p.taskId)
      return { cancelled: true }
    })
  )
}
