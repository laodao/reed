/**
 * 通用资产模块 IPC 处理器
 * @module electron/ipc/handlers/asset.handler
 * @description 薄适配层：asset:* 通道统一"单对象参数 → IpcResponse"，
 *              业务在 core 的 AssetService（架构铁律：handler 不写业务）。
 *              与 app.handler 同 via ipcBridge（Electron + Web 双端注册）；
 *              open-folder 依赖桌面 shell，Web 端返回不可用错误。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getAssetService } from '@core/modules/assets'
import type { SaveAssetCategoryInput, SaveAssetInput, UpdateAssetCategoryInput } from '@shared/types/asset.types'
import type { IpcResponse } from '@shared/types/ipc.types'

const isElectron = !!(process.versions as Record<string, string | undefined>)?.electron

export function registerAssetHandlers(): void {
  ipcBridge.handle('asset:list', (_e, p: { category?: string; subCategory?: string; keyword?: string; page: number; pageSize: number }) =>
    wrap(() => getAssetService().listAssets({
      category: (p.category || '') as never,
      subCategory: p.subCategory || '',
      keyword: p.keyword,
      page: p.page ?? 1,
      pageSize: p.pageSize ?? 20,
    }))
  )
  ipcBridge.handle('asset:get', (_e, p: { id: string }) =>
    wrap(() => getAssetService().getAsset(p.id))
  )
  ipcBridge.handle('asset:create', (_e, p: SaveAssetInput) =>
    wrap(() => getAssetService().createAsset(p))
  )
  ipcBridge.handle('asset:update', (_e, p: { id: string; name?: string; description?: string | null; tags?: string[]; category?: string; subCategory?: string | null }) =>
    wrap(() => getAssetService().updateAsset(p.id, {
      name: p.name,
      description: p.description,
      tags: p.tags,
      category: p.category as never,
      subCategory: p.subCategory,
    }))
  )
  ipcBridge.handle('asset:delete', (_e, p: { id: string }) =>
    wrap(async () => ({ deleted: await getAssetService().deleteAsset(p.id) }))
  )
  ipcBridge.handle('asset:stats', () =>
    wrap(() => getAssetService().getStats())
  )
  ipcBridge.handle('asset:sub-category-stats', (_e, p: { category: string }) =>
    wrap(() => getAssetService().getSubCategoryStats(p.category as never))
  )
  ipcBridge.handle('asset:open-folder', (_e, p: { id: string }) =>
    wrap(() => openAssetFolder(p.id))
  )

  // ==================== 分类定义（业务分类实体：分组与预览驱动） ====================
  ipcBridge.handle('asset:categories-list', (_e, p: { category?: string }) =>
    wrap(() => getAssetService().listAssetCategories((p.category || undefined) as never))
  )
  ipcBridge.handle('asset:category-create', (_e, p: SaveAssetCategoryInput) =>
    wrap(() => getAssetService().createAssetCategory(p))
  )
  ipcBridge.handle('asset:category-update', (_e, p: { id: string } & UpdateAssetCategoryInput) =>
    wrap(() => getAssetService().updateAssetCategory(p.id, {
      name: p.name,
      code: p.code,
      allowedKinds: p.allowedKinds,
      allowedCategories: p.allowedCategories,
      previewable: p.previewable,
      previewMode: p.previewMode,
      previewTemplateId: p.previewTemplateId,
      sortOrder: p.sortOrder,
    }))
  )
  ipcBridge.handle('asset:category-delete', (_e, p: { id: string }) =>
    wrap(async () => ({ deleted: await getAssetService().deleteAssetCategory(p.id) }))
  )
  // 分类预览渲染（早报/周报 → 长图；Web 降级 HTML）
  ipcBridge.handle('asset:preview-render', (_e, p: { assetId: string }) =>
    wrap(async () => {
      const record = await getAssetService().getAsset(p.assetId)
      if (!record) throw new Error('资产不存在')
      return getAssetService().renderAssetPreview(record)
    })
  )
  ipcBridge.handle('asset:preview-templates', () =>
    wrap(() => getAssetService().listPreviewTemplates())
  )
}

/** 打开资产所在目录（桌面端 shell.showItemInFolder；Web 端不可用） */
async function openAssetFolder(id: string): Promise<{ opened: boolean }> {
  if (!isElectron) {
    throw new Error('打开所在目录仅桌面端可用')
  }
  const record = await getAssetService().getAsset(id)
  if (!record) throw new Error('资产不存在')
  const absPath = getAssetService().resolveAssetPath(record)
  if (!absPath) throw new Error('该资产无本地文件')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { shell } = require('electron')
  shell.showItemInFolder(absPath)
  return { opened: true }
}

/** 统一 IpcResponse 包裹（与 app.handler.wrap 同构） */
function wrap<T>(fn: () => Promise<T>): Promise<IpcResponse<T>> {
  return Promise.resolve()
    .then(fn)
    .then((data) => ({ success: true, data }))
    .catch((e: unknown) => ({ success: false, error: e instanceof Error ? e.message : String(e) }))
}
