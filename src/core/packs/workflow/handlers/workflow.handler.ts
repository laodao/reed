/**
 * 工作流 IPC 处理器（双端共用：ipcBridge 同时注册 Electron ipcMain 与 Web 路由表）
 * @module core/packs/workflow/handlers/workflow.handler
 * @description 薄适配层：全部通道统一"单对象参数 → IpcResponse"契约，
 *              业务在 core 的 definition/run 服务（架构铁律：handler 不写业务）。
 *              子系统未初始化（boot 失败）时返回明确错误而非崩溃。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getWorkflowSubsystem } from '@core/platform/workflow/workflow-boot'
import { getWebCollectService } from '@core/platform/assets/web-collect-registry'
import { getAssetService } from '@core/platform/assets/asset-registry'
import { getCurrentUserId, LOCAL_DEFAULT_USER_ID } from '@core/context/user-context'
import { WORKFLOW_RUN_EVENT_CHANNEL, WORKFLOW_RUN_STATUSES, WORKFLOW_TRIGGER_TYPES } from '@shared/types/workflow.types'
import type { IpcResponse } from '@shared/types/ipc.types'
import { previewCronExpression } from '@core/platform/workflow/trigger/workflow-trigger-scheduler.service'
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
  ipcBridge.handle('wf:create-definition', (_e, p: { name: string; description?: string; settings?: Record<string, unknown> }) =>
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
  ipcBridge.handle('wf:update-triggers', (_e, p: { id: string; triggers: WorkflowTrigger[] }) =>
    wrap(async () => {
      const result = await subsystem().definitionService.updateTriggers(p.id, p.triggers)
      if (!result.success) throw new Error(result.error)
      return { updated: true }
    })
  )
  // ==================== 版本历史（发布快照 + 恢复） ====================
  ipcBridge.handle('wf:list-versions', (_e, p: { definitionId: string }) =>
    wrap(() => subsystem().definitionService.listVersions(p.definitionId))
  )
  ipcBridge.handle('wf:restore-version', (_e, p: { definitionId: string; versionId: string }) =>
    wrap(async () => {
      const result = await subsystem().definitionService.restoreVersion(p.definitionId, p.versionId)
      if (!result.success) throw new Error(result.error)
      return result.definition
    })
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

  // 表单文件上传（E1 form-collect：落盘 workflow-uploads + 尽力解析文本）
  ipcBridge.handle('wf:form-upload', (_e, p: { runId: string; nodeId: string; fileName: string; base64: string }) =>
    wrap(async () => {
      const path = await import('path')
      const { mkdirSync, writeFileSync } = await import('fs')
      const { getPathProvider } = await import('@core/interfaces/path.interface')
      const { extractTextFromFile, inferFileType } = await import('@core/utils/extract-text')
      // 安全净化：runId/nodeId 只允许安全标识符（系统生成的 run/node id），
      // 否则 '../../x' 之类可逃逸 workflow-uploads 目录任意写文件（Web 端任意登录用户可达）
      if (!/^[A-Za-z0-9_-]+$/.test(p.runId)) throw new Error('非法 runId')
      if (!/^[A-Za-z0-9_-]+$/.test(p.nodeId)) throw new Error('非法 nodeId')
      // base64 解码后大小上限 10MB（防内存/磁盘 DoS）
      const buffer = Buffer.from(p.base64, 'base64')
      if (buffer.byteLength > 10 * 1024 * 1024) throw new Error('文件超过 10MB 上限')
      const dataPath = getPathProvider().getDataPath()
      const uploadBase = path.resolve(dataPath, 'workflow-uploads')
      const dir = path.resolve(uploadBase, p.runId)
      // 解析后必须仍在 workflow-uploads 内（双保险）
      if (dir !== uploadBase && !dir.startsWith(uploadBase + path.sep)) {
        throw new Error('非法上传目录')
      }
      mkdirSync(dir, { recursive: true })
      const safeName = p.fileName.replace(/[/:*?"<>|]/g, '_')
      const filePath = path.join(dir, `${p.nodeId}_${Date.now().toString(36)}_${safeName}`)
      writeFileSync(filePath, buffer)
      // 尽力解析文本（pdf/docx/xlsx/txt...）；解析失败不影响上传（值仍有 path/name）
      let text: string | undefined
      try {
        const type = inferFileType(p.fileName)
        if (type) text = await extractTextFromFile(filePath, type)
      } catch {
        // 二进制/不支持类型：无文本
      }
      return { path: filePath, name: p.fileName, text }
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
      const { getDocumentTools } = await import('@core/platform/services/document-tools/document-tools')
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
  // 运行页"一键收藏"：把网页型节点的执行结果归档为资产中心「网页收藏」资产。
  // 后端直读 node_run 记录（不走 IPC 传大正文），html 完整且未截断时直接归档，
  // 否则（web-extract 文本型 / 大页被截断）按 url 重新抓取归档。
  ipcBridge.handle(
    'wf:collect-node-output',
    (_e, p: { runId: string; nodeId: string; iterationIndex?: number }) =>
      wrap(async () => {
        const detail = await subsystem().runService.getRunDetail(p.runId)
        const nodeRuns = detail?.nodeRuns ?? []
        const nodeRun = nodeRuns.find(
          n => n.nodeId === p.nodeId && (p.iterationIndex === undefined || n.iterationIndex === p.iterationIndex),
        )
        if (!nodeRun || nodeRun.status !== 'succeeded') {
          throw new Error('未找到已成功的节点执行结果，无法收藏')
        }
        const input = (nodeRun.input ?? {}) as Record<string, unknown>
        const output = (nodeRun.output ?? {}) as Record<string, unknown>
        const url = pickCollectUrl(input, output)
        if (!url) throw new Error('该节点没有网页 URL（仅网页抓取类节点可收藏）')

        const result = await getWebCollectService().collectWebpage({
          url,
          title: typeof input.title === 'string' && input.title.trim() ? input.title : undefined,
          html: pickHtmlSnapshot(output) ?? undefined,
          sourceType: 'workflow',
          sourceRef: p.runId,
          tags: [String(nodeRun.nodeType ?? 'workflow')],
        })
        return {
          assetId: result.record.id,
          name: result.record.name,
          category: result.record.category,
          subCategory: result.record.subCategory ?? '',
          url: getAssetService().assetPreviewUrl(result.record),
          markdownChars: result.markdown.length,
          warnings: result.warnings,
        }
      })
  )
  // 运行执行日志（时间线：每步开始/完成/审核/错误；见 workflow-run-logger）
  ipcBridge.handle('wf:list-run-logs', (_e, p: { runId: string }) =>
    wrap(async () => {
      const logs = subsystem().runLogger.readRun(p.runId)
      return { total: logs.length, logs }
    })
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

/** 收藏目标 URL：节点已解析 config 的 url 优先，其次输出 url */
function pickCollectUrl(input: Record<string, unknown>, output: Record<string, unknown>): string {
  const fromInput = typeof input.url === 'string' ? input.url.trim() : ''
  if (/^https?:\/\//i.test(fromInput)) return fromInput
  const fromOutput = typeof output.url === 'string' ? output.url.trim() : ''
  return /^https?:\/\//i.test(fromOutput) ? fromOutput : ''
}

/**
 * 运行记录里的可归档页面 HTML 快照：
 * http-request 类节点 output.body 是完整响应体——仅当它确实是 HTML 且未被引擎截断时采用
 * （截断会追加「…[已截断]」并打 __truncated；大页快照不全时改为按 url 重新抓取）。
 */
function pickHtmlSnapshot(output: Record<string, unknown>): string | null {
  if (output.__truncated === true) return null
  const body = typeof output.body === 'string' ? output.body : ''
  const mime = typeof output.mimeType === 'string' ? output.mimeType.toLowerCase() : ''
  const looksHtml = mime.includes('html')
    || /^\s*(<!doctype\s+html|<html[\s>])/i.test(body)
  if (!looksHtml || body.includes('…[已截断]')) return null
  return body || null
}

/** 运行事件通道名（片 7 前端 store 订引用；常量再导出防裸字符串） */
export const WORKFLOW_EVENT_CHANNEL = WORKFLOW_RUN_EVENT_CHANNEL
/** 可筛选的运行状态白名单（前端下拉用） */
export const RUN_STATUS_FILTERS = [...Object.values(WORKFLOW_RUN_STATUSES)] as string[]
