/**
 * 业务包 IPC 处理器
 * @module ipc/handlers/pack.handler
 * @description pack:* 命名空间：对 PackService 直接包一层（service 的方法签名即按此设计）。
 *              注意：本 handler 自身不归属任何业务包——IPC 守卫按 channel 前缀裁决，
 *              无包声明 `pack:` 前缀时 getChannelOwner 返回 null → 放行
 *              （包管理通道必须永远可用，否则禁用后无法恢复）。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getPackSubsystem } from '@core/packs/kernel'
import type { IpcResponse } from '@shared/types/ipc.types'
import type { PackInfo, SetPackEnabledRequest } from '@shared/types/pack.types'

function wrap<T>(fn: () => Promise<T>): Promise<IpcResponse<T>> {
  return fn().then(
    data => ({ success: true, data }),
    (error: any) => ({ success: false, error: error?.message || '操作失败' }),
  )
}

/** 注册业务包 IPC 处理器（Electron initIpcHandlers 与 Web registerAllWebChannels 双端登记） */
export function registerPackHandlers(): void {
  // 列出全部包：registry 运行时状态 + 按解析链叠加的启用态
  ipcBridge.handle('pack:list', () => wrap(async () => {
    return await getPackSubsystem().service.listPacks()
  }))

  // 切换全局启用态，返回更新后的 PackInfo（找不到视为失败由调用方兜底）
  ipcBridge.handle('pack:setEnabled', (_e: any, req: SetPackEnabledRequest) => wrap(async () => {
    const { service } = getPackSubsystem()
    await service.setEnabled(req.packId, req.enabled)
    const infos = await service.listPacks()
    const updated = infos.find(info => info.id === req.packId)
    if (!updated) throw new Error(`包 "${req.packId}" 不存在`)
    return updated as PackInfo
  }))

  console.log('[PackHandlers] 业务包 IPC 处理器已注册')
}
