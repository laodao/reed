/**
 * 通用资产模块 IPC 处理器
 * @module core/packs/asset-center/handlers/asset.handler
 * @description 薄适配层：asset:* 通道统一"单对象参数 → IpcResponse"，
 *              业务在 core 的 AssetService（架构铁律：handler 不写业务）。
 *              与 app.handler 同 via ipcBridge（Electron + Web 双端注册）；
 *              open-folder 依赖桌面 shell，Web 端返回不可用错误。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getAssetService, getWebCollectService } from '@core/platform/assets'
import type { SaveAssetCategoryInput, SaveAssetInput, UpdateAssetCategoryInput } from '@shared/types/asset.types'
import type { IpcResponse } from '@shared/types/ipc.types'

const isElectron = !!(process.versions as Record<string, string | undefined>)?.electron

export function registerAssetHandlers(): void {
  ipcBridge.handle('asset:list', (_e, p: { category?: string; subCategory?: string; excludeSubCategory?: string; keyword?: string; page: number; pageSize: number }) =>
    wrap(() => getAssetService().listAssets({
      category: (p.category || '') as never,
      subCategory: p.subCategory || '',
      excludeSubCategory: p.excludeSubCategory || '',
      keyword: p.keyword,
      page: p.page ?? 1,
      pageSize: p.pageSize ?? 20,
    }))
  )
  // 网页收藏「更新快照」：按收藏记录的 sourceUrl 重新抓取并就地刷新（资产 ID 不变）
  ipcBridge.handle('asset:webpage-refresh', (_e, p: { assetId: string }) =>
    wrap(async () => {
      const r = await getWebCollectService().refreshExisting(p.assetId)
      return {
        assetId: r.record.id,
        name: r.record.name,
        fetchedAt: (r.record.metadata as Record<string, unknown> | null)?.fetchedAt ?? null,
        warnings: r.warnings,
      }
    })
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
  // 组文件夹（套图/组图：组内首个文件成员定位；Web 端不可用）
  ipcBridge.handle('asset:group-open-folder', (_e, p: { groupId: string }) =>
    wrap(() => openGroupFolder(p.groupId))
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
  // 把文本报告资产固化为长图图片资产（桌面端渲染；Web 端返回 null）。
  // 存量报告补图 / 未来"文本→图片资产"复用同一服务能力。
  ipcBridge.handle('asset:materialize-image', (_e, p: { assetId: string; templateId?: string; subCategory?: string; name?: string; tags?: string[] }) =>
    wrap(async () => {
      const record = await getAssetService().getAsset(p.assetId)
      if (!record) throw new Error('资产不存在')
      return getAssetService().materializeTextAsImage(record, {
        templateId: p.templateId,
        subCategory: p.subCategory,
        name: p.name,
        tags: p.tags,
      })
    })
  )
  ipcBridge.handle('asset:preview-templates', () =>
    wrap(() => getAssetService().listPreviewTemplates())
  )
  // 资产来源跳转（需求 3：资产 → 产出它的应用/工作流执行历史）
  ipcBridge.handle('asset:source-link', (_e, p: { assetId: string }) =>
    wrap(async () => {
      const record = await getAssetService().getAsset(p.assetId)
      if (!record) return null
      return getAssetService().resolveSourceLink(record)
    })
  )
  // 资产组详情（需求 2：组卡片 → 组内成员画廊）
  ipcBridge.handle('asset:group-detail', (_e, p: { groupId: string }) =>
    wrap(() => getAssetService().getGroupDetail(p.groupId))
  )
  // 资产下载（桌面端弹保存对话框 + 复制/写文件；Web 端由浏览器直接下载，不经过本通道）
  // view：'preview'=预览态（看图片下图片，figure/report 长图下载渲染 PNG）；'source'/缺省=按存储形态
  ipcBridge.handle('asset:download', (_e, p: { id: string; view?: string }) =>
    wrap(async () => {
      if (!isElectron) {
        throw new Error('下载仅桌面端可用（Web 端由浏览器直接下载）')
      }
      const record = await getAssetService().getAsset(p.id)
      if (!record) throw new Error('资产不存在')
      const payload = await getAssetService().buildDownloadPayload(record, (p.view ?? undefined) as never)
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const { dialog } = require('electron')
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const fs = require('fs/promises')
      const filters = payload.kind === 'file'
        ? [{ name: '文件', extensions: ['*'] }]
        : payload.kind === 'image'
          ? [{ name: 'PNG 图片', extensions: ['png'] }]
          : payload.fileName.endsWith('.url')
            ? [{ name: 'URL 快捷方式', extensions: ['url'] }]
            : payload.fileName.endsWith('.json')
              ? [{ name: 'JSON', extensions: ['json'] }]
              : [{ name: 'Markdown / 文本', extensions: ['md', 'txt'] }]
      const res = await dialog.showSaveDialog({ defaultPath: payload.fileName, filters })
      if (res.canceled || !res.filePath) return { canceled: true }
      if (payload.kind === 'file') {
        await fs.copyFile(payload.sourcePath!, res.filePath)
      } else if (payload.kind === 'image') {
        await fs.writeFile(res.filePath, Buffer.from(payload.base64Data!, 'base64'))
      } else {
        await fs.writeFile(res.filePath, payload.content!, 'utf-8')
      }
      return { filePath: res.filePath }
    })
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
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const { shell } = require('electron')
  shell.showItemInFolder(absPath)
  return { opened: true }
}

/** 打开套图/组图所在目录（组内首个文件成员定位；Web 端不可用） */
async function openGroupFolder(groupId: string): Promise<{ opened: boolean }> {
  if (!isElectron) {
    throw new Error('打开所在目录仅桌面端可用')
  }
  const absPath = await getAssetService().resolveGroupFolderPath(groupId)
  if (!absPath) throw new Error('该组内无本地文件（套图文件可能已删除）')
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
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
