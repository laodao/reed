/**
 * episode-production · 故事板预览（thumbnails）IPC handler
 * @module core/packs/episode-production/handlers/narrative/storyboard-thumbnail.handler
 *
 * spec 2026-05-09 ep-redesign §3.2 B7 · P-18：剧本→分镜过渡的"先挑骨架再细化"路径。
 *
 * IPC：
 *   - ep:storyboard:generate-thumbnails  → 一张大图 → sharp 切片 9 张
 *   - ep:storyboard:create-from-thumbnails → 用户挑选骨架 → 创建 storyboards 行
 *   - ep:storyboard:cleanup-thumbnails → 用户取消时清理 temp 目录
 *
 * 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import path from 'path'
import type { DataSource } from 'typeorm'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import { StoryboardThumbnailGeneratorService } from '@core/platform/episode-production/narrative/ai/storyboard-thumbnail-generator'
import { createGalleryImageGenerator } from '@core/platform/episode-production/assets/services/image-provider-adapter'
import { ImportFromParsedShotsService } from '@core/platform/episode-production/narrative/import-from-parsed-shots.service'
import { AssetImageService } from '@core/platform/episode-production/assets/services/asset-image.service'
import { pickReferenceImage } from '@core/platform/episode-production/render/keyframe/reference-image-selector'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'

export function registerStoryboardThumbnailHandlers(): void {
  ipcBridge.handle('ep:storyboard:generate-thumbnails', handleGenerate)
  ipcBridge.handle('ep:storyboard:cleanup-thumbnails', handleCleanup)
  ipcBridge.handle('ep:storyboard:create-from-thumbnails', handleCreateFromThumbnails)
}

async function handleGenerate(
  _event: any,
  input: {
    episodeScriptId: string
    count?: 9 | 16 | 25
    storySynopsis: string
    styleAnchors?: string[]
    aspectRatio?: string
  },
): Promise<IpcResponse> {
  try {
    if (!input?.episodeScriptId || !input?.storySynopsis?.trim()) {
      return { success: false, error: '参数不完整：episodeScriptId / storySynopsis 必填' }
    }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('数据库未初始化')

    const tempBase = path.join(getPathProvider().getTempPath(), 'ep-thumbnails')
    const svc = new StoryboardThumbnailGeneratorService(
      tempBase,
      createGalleryImageGenerator(),
    )

    // §3.11：画幅取项目 config.aspectRatio（调用方显式传入优先）；
    // 一致性：取前 2 个出场角色的已确认主图作参考图，"同一角色每帧脸型一致"才有兑现输入
    const aspectRatio =
      input.aspectRatio ?? (await resolveProjectAspectRatio(db.dataSource, input.episodeScriptId))
    const referenceImagePaths = await resolveCharacterReferenceImages(db.dataSource, input.episodeScriptId)

    const data = await svc.generate({
      episodeScriptId: input.episodeScriptId,
      count: input.count ?? 9,
      storySynopsis: input.storySynopsis,
      styleAnchors: input.styleAnchors,
      aspectRatio,
      referenceImagePaths,
    })
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

/**
 * 项目画幅（§3.11）：episodeScript → episode → project.config.aspectRatio。
 * 任一环节缺失返回 undefined（service 回落 512×512 正方形）。
 */
async function resolveProjectAspectRatio(
  ds: DataSource,
  episodeScriptId?: string,
): Promise<string | undefined> {
  if (!episodeScriptId) return undefined
  try {
    const script = await ds.getRepository(EpisodeScriptEntity).findOne({ where: { id: episodeScriptId } })
    if (!script?.episodeId) return undefined
    const episode = await ds.getRepository(VideoEpisodeEntity).findOne({ where: { id: script.episodeId } })
    if (!episode?.projectId) return undefined
    const project = await ds.getRepository(VideoProjectEntity).findOne({ where: { id: episode.projectId } })
    const ratio = (project?.config as { aspectRatio?: string } | undefined)?.aspectRatio
    return typeof ratio === 'string' && ratio.trim() ? ratio : undefined
  } catch (err: any) {
    console.warn(`[storyboard-thumbnail] 解析项目画幅失败（回落正方形）：${err?.message ?? err}`)
    return undefined
  }
}

/**
 * 角色参考图（§3.11）：取该剧集剧本前 2 个出场角色的**已确认主图**。
 *
 * 优化前 `referenceImagePaths` 恒为 `[]`，"保持人物跨帧一致（同一角色每帧脸型一致）"
 * 是不可兑现的空指令——模型没有任何角色外观输入。
 *
 * 选图口径与关键帧/视频链路同源（`pickReferenceImage` 的 confirmed 闸门 + 主图优先）。
 */
async function resolveCharacterReferenceImages(
  ds: DataSource,
  episodeScriptId?: string,
): Promise<string[]> {
  if (!episodeScriptId) return []
  try {
    const script = await ds.getRepository(EpisodeScriptEntity).findOne({ where: { id: episodeScriptId } })
    if (!script) return []

    // 出场角色绑定 id：按场景顺序取，去重后前 2 个
    const bindingIds: string[] = []
    for (const scene of (script.scenes ?? []) as Array<{ characters?: Array<{ characterBindingId?: string | null }> }>) {
      for (const c of scene.characters ?? []) {
        const id = c?.characterBindingId
        if (typeof id === 'string' && id && !bindingIds.includes(id)) bindingIds.push(id)
        if (bindingIds.length >= 2) break
      }
      if (bindingIds.length >= 2) break
    }
    if (bindingIds.length === 0) return []

    const imageSvc = new AssetImageService(ds)
    const paths: string[] = []
    for (const bindingId of bindingIds) {
      const picked = await pickReferenceImage(imageSvc, { kind: 'character', bindingId, dims: {} })
      const imagePath = picked.image?.imagePath
      if (imagePath) paths.push(imagePath)
    }
    return paths
  } catch (err: any) {
    console.warn(`[storyboard-thumbnail] 解析角色参考图失败（不注入参考图）：${err?.message ?? err}`)
    return []
  }
}

async function handleCreateFromThumbnails(
  _event: any,
  input: {
    sceneScriptId: string
    thumbnails: Array<{ gridIndex: number; description?: string }>
  },
): Promise<IpcResponse> {
  try {
    if (!input?.sceneScriptId) {
      return { success: false, error: '参数不完整：sceneScriptId 必填' }
    }
    if (!Array.isArray(input.thumbnails) || input.thumbnails.length === 0) {
      return { success: false, error: '参数不完整：thumbnails 非空数组' }
    }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) throw new Error('数据库未初始化')
    const svc = new ImportFromParsedShotsService(db.dataSource)
    const data = await svc.importThumbnails({
      sceneScriptId: input.sceneScriptId,
      thumbnails: input.thumbnails,
    })
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

async function handleCleanup(
  _event: any,
  input: { sessionDir: string },
): Promise<IpcResponse> {
  try {
    if (!input?.sessionDir) {
      return { success: false, error: '参数不完整：sessionDir 必填' }
    }
    // 安全检查：sessionDir 必须在 temp/ep-thumbnails/ 下（防止误删）
    const tempBase = path.join(getPathProvider().getTempPath(), 'ep-thumbnails')
    if (!input.sessionDir.startsWith(tempBase)) {
      return { success: false, error: 'sessionDir 不在合法 temp 目录下' }
    }
    const svc = new StoryboardThumbnailGeneratorService(
      tempBase,
      createGalleryImageGenerator(),  // cleanup 不调 imageGen，但构造需要传
    )
    await svc.cleanup(input.sessionDir)
    return { success: true, data: { cleaned: true } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}
