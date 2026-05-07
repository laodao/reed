/**
 * 资产图片下载 / 删除 共享逻辑
 * @module renderer/composables/use-asset-image-actions
 *
 * character / location / item 三个 GalleryEditor 共用：hover 工具条的下载与删除。
 * - download：双端兼容（PC 走 electronAPI.file.saveFile + copyFile；Web 走 fetch + a[download]）
 * - delete：含 ElMessageBox 确认 + ep:asset:image:delete IPC + reload 回调
 */
import { ElMessage, ElMessageBox } from 'element-plus'
import { toImageUrl } from '@/utils/asset-url'

export interface AssetImageRow {
  id: string
  category: string
  label: string | null
  imagePath: string
  isMain: number
}

export interface UseAssetImageActionsOptions {
  /** 删除成功后调用，用于刷新图谱 */
  onAfterDelete?: () => void | Promise<void>
  /** 删除主图时的警告文案（主图专用，isMain === 1） */
  mainDeleteWarning?: (img: AssetImageRow) => string
  /** 删除非主图时的确认文案 */
  itemDeleteConfirm?: (img: AssetImageRow) => string
}

export function useAssetImageActions(options: UseAssetImageActionsOptions = {}) {
  async function downloadImage(img: AssetImageRow | null | undefined): Promise<void> {
    if (!img?.imagePath) {
      ElMessage.error('图片路径无效')
      return
    }
    const fileName = (img.imagePath.split('/').pop() || 'image.png').trim()
    const isWeb =
      (window as any).__APP_PLATFORM__ === 'web' ||
      !(window as any).electronAPI?.file?.saveFile

    if (!isWeb) {
      try {
        const saveResult = await (window as any).electronAPI.file.saveFile({
          defaultPath: fileName,
          filters: [{ name: 'PNG 图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        })
        if (!saveResult?.success || !saveResult.filePath) return
        // imagePath 是相对路径，PC 端需要本地绝对路径
        const url = toImageUrl(img.imagePath)
        const abs = url.startsWith('local-image:///')
          ? url.replace('local-image:///', '')
          : img.imagePath
        const copyResult = await (window as any).electronAPI.file.copyFile(
          abs,
          saveResult.filePath,
        )
        if (copyResult?.success) ElMessage.success('已保存')
        else ElMessage.error(copyResult?.error || '保存失败')
      } catch (e: any) {
        ElMessage.error(e?.message || '下载失败')
      }
      return
    }

    // Web：fetch URL → blob → anchor download
    const url = toImageUrl(img.imagePath)
    if (!url) {
      ElMessage.error('图片 URL 无效')
      return
    }
    try {
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch (e: any) {
      ElMessage.error('下载失败：' + (e?.message ?? '未知错误'))
    }
  }

  async function onDeleteImage(img: AssetImageRow | null | undefined): Promise<void> {
    if (!img) return
    const api = (window as any).electronAPI?.episodeProduction?.asset
    if (!api?.image?.delete) {
      ElMessage.error('image.delete IPC 未暴露')
      return
    }
    const isMain = img.isMain === 1
    const defaultMainWarn = `当前要删除的是"主图"。删除后该资产将进入"缺主图"状态，是否继续？`
    const defaultItemConfirm = `确认删除"${img.label || img.category}"这张图？`
    const message = isMain
      ? (options.mainDeleteWarning?.(img) ?? defaultMainWarn)
      : (options.itemDeleteConfirm?.(img) ?? defaultItemConfirm)
    try {
      await ElMessageBox.confirm(message, '删除图片', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      })
    } catch {
      return
    }
    try {
      const resp = await api.image.delete(img.id)
      if (!resp?.success) {
        ElMessage.error(resp?.error || '删除失败')
        return
      }
      ElMessage.success('已删除')
      await options.onAfterDelete?.()
    } catch (e: any) {
      ElMessage.error(e?.message || '删除失败')
    }
  }

  return { downloadImage, onDeleteImage }
}
