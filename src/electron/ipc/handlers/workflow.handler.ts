/**
 * 工作流 IPC 处理器（双端共用：ipcBridge 同时注册 Electron ipcMain 与 Web 路由表）
 * @module electron/ipc/handlers/workflow.handler
 * @description 薄适配层：全部通道统一"单对象参数 → IpcResponse"契约，
 *              业务在 core 的 definition/run 服务（架构铁律：handler 不写业务）。
 *              子系统未初始化（boot 失败）时返回明确错误而非崩溃。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getWorkflowSubsystem } from '@core/modules/workflow/workflow-boot'
import { getCurrentUserId, LOCAL_DEFAULT_USER_ID } from '@core/context/user-context'
import { WORKFLOW_RUN_EVENT_CHANNEL, WORKFLOW_RUN_STATUSES, WORKFLOW_TRIGGER_TYPES } from '@shared/types/workflow.types'
import type { IpcResponse } from '@shared/types/ipc.types'
import { previewCronExpression } from '@core/modules/workflow/trigger/workflow-trigger-scheduler.service'
import type { WorkflowGraph, WorkflowTrigger, WorkflowExecutionSettings } from '@shared/types/workflow.types'

/** 子系统就绪守卫：取实例或抛可读错误 */
function subsystem() {
  return getWorkflowSubsystem()
}

export function registerWorkflowHandlers(): void {
  // ==================== 定义 ====================
  ipcBridge.handle('wf:list-definitions', (_e, p: { keyword?: string; page: number; pageSize: number }) =>
    wrap(() => subsystem().definitionService.list(p ?? { page: 1, pageSize: 20 }))
  )
  ipcBridge.handle('wf:get-definition', (_e, p: { id: string }) =>
    wrap(() => subsystem().definitionService.getById(p.id))
  )
  ipcBridge.handle('wf:create-definition', (_e, p: { name: string; description?: string }) =>
    wrap(() => subsystem().definitionService.create(p))
  )
  ipcBridge.handle('wf:update-definition', (_e, p: { id: string; patch: Record<string, unknown> }) =>
    wrap(() => subsystem().definitionService.update(p.id, p.patch as never))
  )
  ipcBridge.handle('wf:save-draft', (_e, p: { id: string; graph: WorkflowGraph }) =>
    wrap(() => subsystem().definitionService.saveDraft(p.id, p.graph))
  )
  ipcBridge.handle('wf:delete-definition', (_e, p: { id: string }) =>
    wrap(async () => {
      await subsystem().definitionService.delete(p.id)
      return { deleted: true }
    })
  )
  ipcBridge.handle(
    'wf:publish-definition',
    (_e, p: { id: string; triggers?: WorkflowTrigger[]; settings?: WorkflowExecutionSettings }) =>
      wrap(async () => {
        const result = await subsystem().definitionService.publish(p.id, p.triggers, p.settings)
        if (!result.success) throw new Error(result.error)
        return result.definition
      })
  )
  ipcBridge.handle('wf:validate-graph', (_e, p: { graph: WorkflowGraph }) =>
    wrap(() => subsystem().definitionService.validate(p.graph))
  )
  ipcBridge.handle('wf:validate-triggers', (_e, p: { triggers: WorkflowTrigger[] }) =>
    wrap(() => subsystem().definitionService.validateTriggers(p.triggers))
  )
  ipcBridge.handle('wf:export-definition', (_e, p: { id: string }) =>
    wrap(async () => {
      const data = await subsystem().definitionService.exportDefinition(p.id)
      if (!data) throw new Error('工作流不存在或没有可导出的草稿图')
      return { name: data.name, content: JSON.stringify(data, null, 2) }
    })
  )
  ipcBridge.handle(
    'wf:import-definition',
    (_e, p: { content: string; duplicatePolicy?: 'copy' | 'overwrite' }) =>
      wrap(async () => {
        const result = await subsystem().definitionService.importDefinition(p.content, {
          duplicatePolicy: p.duplicatePolicy,
        })
        if (!result.success) throw new Error(result.error)
        return result.definition
      })
  )

  // ==================== 分享（C3 免登录独立页） ====================
  ipcBridge.handle('wf:enable-share', (_e, p: { id: string }) =>
    wrap(() => subsystem().definitionService.enableShare(p.id))
  )
  ipcBridge.handle('wf:disable-share', (_e, p: { id: string }) =>
    wrap(() => subsystem().definitionService.disableShare(p.id))
  )

  // 报告导出 PDF（文档工具层：markdown → 排版 PDF，Electron 平台渲染器）
  ipcBridge.handle('wf:report-to-pdf', (_e, p: { markdown: string; title?: string }) =>
    wrap(async () => {
      const { getDocumentTools } = await import('@core/services/document-tools/document-tools')
      const rendered = await getDocumentTools().renderPdf({ markdown: p.markdown, title: p.title })
      if (rendered.format !== 'pdf') throw new Error('当前环境不支持 PDF 渲染')
      return { base64: rendered.buffer.toString('base64') }
    })
  )

  // ==================== 运行 ====================
  ipcBridge.handle(
    'wf:start-run',
    (_e, p: { definitionId: string; inputs?: Record<string, unknown> }) =>
      wrap(() =>
        subsystem().runService.startRun({
          definitionId: p.definitionId,
          triggerType: WORKFLOW_TRIGGER_TYPES.manual,
          inputs: p.inputs,
        })
      )
  )
  ipcBridge.handle('wf:cancel-run', (_e, p: { runId: string }) =>
    wrap(async () => {
      const ok = await subsystem().runService.cancelRun(p.runId, currentUserId())
      return { cancelled: ok }
    })
  )
  ipcBridge.handle('wf:resume-run', (_e, p: { runId: string; forceRerunNodeIds?: string[] }) =>
    wrap(() => subsystem().runService.resumeRun(p.runId, p.forceRerunNodeIds))
  )
  ipcBridge.handle(
    'wf:review-decide',
    (_e, p: { runId: string; nodeId: string; decision: string; comment?: string; editedValues?: Record<string, unknown> }) =>
      wrap(async () => {
        const result = await subsystem().runService.reviewDecide(
          p.runId,
          p.nodeId,
          { decision: p.decision as never, comment: p.comment, editedValues: p.editedValues },
          currentUserId()
        )
        if (!result.success) throw new Error(result.error)
        return { applied: true }
      })
  )
  ipcBridge.handle('wf:get-run', (_e, p: { runId: string }) =>
    wrap(() => subsystem().runService.getRunDetail(p.runId))
  )
  ipcBridge.handle(
    'wf:list-runs',
    (_e, p: { definitionId?: string; status?: string; page: number; pageSize: number }) =>
      wrap(() =>
        p.definitionId
          ? subsystem().runService.listByDefinition(p.definitionId, {
              status: p.status as never,
              page: p.page ?? 1,
              pageSize: p.pageSize ?? 20,
            })
          : subsystem().runService.list({
              status: p.status as never,
              page: p.page ?? 1,
              pageSize: p.pageSize ?? 20,
            })
      )
  )
  ipcBridge.handle('wf:delete-run', (_e, p: { runId: string }) =>
    wrap(async () => {
      await subsystem().runService.deleteRun(p.runId)
      return { deleted: true }
    })
  )
  ipcBridge.handle('wf:get-pending-reviews', () =>
    wrap(() => subsystem().runService.findWaitingReviews())
  )

  // ==================== 触发器 ====================
  ipcBridge.handle('wf:trigger-preview', (_e, p: { expression: string }) =>
    wrap(() => previewCronExpression(p.expression ?? ''))
  )
}

/** 当前用户（Web 端 ALS 由 ipc-router 注入；Electron 端进程默认值） */
function currentUserId(): string {
  return getCurrentUserId() ?? LOCAL_DEFAULT_USER_ID
}

/** 统一 { success, data, error } 包装 */
async function wrap<T>(fn: () => Promise<T>): Promise<IpcResponse<T>> {
  try {
    return { success: true, data: await fn() }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** 运行事件通道名（片 7 前端 store 订引用；常量再导出防裸字符串） */
export const WORKFLOW_EVENT_CHANNEL = WORKFLOW_RUN_EVENT_CHANNEL
/** 可筛选的运行状态白名单（前端下拉用） */
export const RUN_STATUS_FILTERS = [...Object.values(WORKFLOW_RUN_STATUSES)] as string[]
