/**
 * 主图重新生成 + 新旧对比保留 共享逻辑（方案A）
 * @module renderer/composables/use-main-regenerate-compare
 *
 * character / item / location 的 GalleryEditor「重生成主图」入口共用本 composable。
 *
 * 流程（解决"重新生成主图导致历史主图堆积、分镜界面显示多余图片"）：
 *   1. 生成前先取当前主图（old）。
 *   2. 调 generateMainFor 生成新主图（new）——后端会把 old 降级 isMain=0，
 *      新图落 isMain=1。
 *   3. 若原本有主图：弹出新旧对比对话框，让用户确认保留哪张（MainRegenerateCompareDialog）。
 *   4. 按选择执行方案A——删除被舍弃的那张（连同磁盘图片文件）：
 *      - 保留新图 → 删除旧主图（行 + 文件）
 *      - 保留旧图 → 删除新生成的主图（行 + 文件），并把旧主图恢复为 isMain=1
 *   5. 首张主图（原本无图）：不弹对比，直接成功。
 *
 * 双端兼容：走 window.electronAPI.episodeProduction.asset.image 的 delete / setAsMain；
 * Web 端由 channel-map / bridge 转 HTTP。
 */

import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { generateMainFor } from '@/api/main-image-generator'

type AssetType = 'character' | 'location' | 'item'

/** 对比所需的最小图片形态（old 来自编辑器 current main；new 来自 generateMainFor 返回值） */
export interface CompareImage {
  id: string
  imagePath: string
  thumbnailPath?: string | null
}

export interface MainRegenerateOptions {
  /** 取当前资产的 (assetType, assetId)——用 getter 避免 prop 变更后旧引用失效 */
  getAssetRef: () => { assetType: AssetType; assetId: string }
  /** 生成前取当前主图（无主图返回 null → 走首张生成，不弹对比） */
  getCurrentMain: () => CompareImage | null | undefined
  /** 用户在提示词框编辑的覆盖文本（可选）；无则用系统拼接 */
  getPromptOverride?: () => string | undefined
  /** 选择完成后刷新图谱（reload） */
  onAfterRegenerate?: () => void | Promise<void>
}

export function useMainRegenerateCompare(options: MainRegenerateOptions) {
  const compareVisible = ref(false)
  const oldImg = ref<CompareImage | null>(null)
  const newImg = ref<CompareImage | null>(null)
  let resolver: ((choice: 'old' | 'new') => void) | null = null

  function root() {
    return (window as any).electronAPI?.episodeProduction?.asset
  }

  /** 对话框「保留这张」回调：把选择交给 await 中的 regenerateMain */
  function choose(choice: 'old' | 'new'): void {
    if (resolver) {
      resolver(choice)
    }
    resolver = null
    compareVisible.value = false
  }

  /**
   * 执行一次"重生成主图 + 对比保留"。
   *
   * @throws 生成失败（effective 数据缺失 / IPC / provider 出错）
   */
  async function regenerateMain(): Promise<void> {
    const { assetType, assetId } = options.getAssetRef()
    const old = options.getCurrentMain()
    const override = options.getPromptOverride?.()

    const newMain = await generateMainFor(
      assetType,
      assetId,
      override ? { promptOverride: override } : undefined,
    )

    // 首张主图：原本无图，无关旧图可删，直接成功。
    if (!old || !old.imagePath) {
      ElMessage.success('主图已生成')
      await options.onAfterRegenerate?.()
      return
    }

    // 展示新旧对比，等待用户确认保留哪张
    oldImg.value = old
    newImg.value = newMain
    const choice = await new Promise<'old' | 'new'>((resolve) => {
      resolver = resolve
      compareVisible.value = true
    })

    const api = root()
    if (choice === 'old') {
      // 保留旧图：删除本次新生成的主图（行 + 文件），并恢复旧主图为 isMain=1
      const delResp = await api.image.delete(newMain.id)
      if (delResp?.success === false) {
        ElMessage.error('删除新图失败：' + (delResp?.error ?? '未知错误'))
        await options.onAfterRegenerate?.()
        return
      }
      await api.image.setAsMain(old.id)
      ElMessage.info('已保留原主图，本次重新生成的新图已删除')
    } else {
      // 保留新图：删除旧主图（行 + 文件）
      const delResp = await api.image.delete(old.id)
      if (delResp?.success === false) {
        ElMessage.error('删除旧图失败：' + (delResp?.error ?? '未知错误'))
        await options.onAfterRegenerate?.()
        return
      }
      ElMessage.success('已用新主图替换旧图')
    }
    await options.onAfterRegenerate?.()
  }

  return { compareVisible, oldImg, newImg, regenerateMain, choose }
}
