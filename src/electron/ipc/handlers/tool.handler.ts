/**
 * 工具模块 IPC 处理器（P0 片1）
 * @module electron/ipc/handlers/tool.handler
 * @description 薄适配层：tool:* 通道 → ToolService（凭据/自定义工具/预设工具）。
 *              业务在 core 的 tool.service（架构铁律：handler 不写业务）。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getToolService } from '@core/modules/workflow/tools/tool-registry'
import type { IpcResponse } from '@shared/types/ipc.types'

function svc() {
  return getToolService()
}

export function registerToolHandlers(): void {
  // ==================== 凭据 ====================
  ipcBridge.handle('tool:list-credentials', () =>
    wrap(() => svc().listCredentials())
  )
  ipcBridge.handle('tool:save-credential', (_e, p: { name: string; apiKey: string; baseUrl?: string }) =>
    wrap(() => svc().saveCredential({ name: p.name, apiKey: p.apiKey, baseUrl: p.baseUrl }))
  )
  ipcBridge.handle('tool:delete-credential', (_e, p: { id: string }) =>
    wrap(async () => { await svc().deleteCredential(p.id); return { deleted: true } })
  )

  // ==================== 自定义工具 ====================
  ipcBridge.handle('tool:list-custom', () =>
    wrap(() => svc().listCustomTools())
  )
  ipcBridge.handle('tool:scan-installed', () =>
    wrap(() => svc().scanInstalledCommands())
  )
  ipcBridge.handle('tool:save-custom', (_e, p: {
    name: string
    description?: string
    kind?: 'api' | 'cli'
    method: string
    url: string
    headers?: Array<{ key: string; value: string }>
    paramsSchema?: Array<{ key: string; label?: string; type?: string; required?: boolean; options?: Array<{ label: string; value: string | number }>; default?: unknown }>
    authType?: string
    credentialId?: string | null
    command?: string
    argsTemplate?: string
    cwd?: string
    timeoutMs?: number
    stdoutType?: 'text' | 'json'
  }) =>
    wrap(() => svc().saveCustomTool(p))
  )
  ipcBridge.handle('tool:update-custom', (_e, p: { id: string; patch: Record<string, unknown> }) =>
    wrap(() => svc().updateCustomTool(p.id, p.patch))
  )
  ipcBridge.handle('tool:delete-custom', (_e, p: { id: string }) =>
    wrap(async () => { await svc().deleteCustomTool(p.id); return { deleted: true } })
  )

  // ==================== 预设工具 ====================
  ipcBridge.handle('tool:presets', () =>
    wrap(() => svc().listPresets())
  )
}

/** 统一 IpcResponse 包裹（与 workflow.handler.wrap 同构） */
function wrap<T>(fn: () => Promise<T>): Promise<IpcResponse<T>> {
  return Promise.resolve()
    .then(fn)
    .then((data) => ({ success: true, data }))
    .catch((e: unknown) => ({ success: false, error: e instanceof Error ? e.message : String(e) }))
}
