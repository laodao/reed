/**
 * episode-production · 关键帧（分镜图像）生成 · IPC handler
 * @module electron/ipc/handlers/episode-production/render/keyframe.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 * 包含：风格预设（get-style-presets）、分镜图像生成（generate-storyboard-image、generate-scene-images）
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getBrowserWindowFromEvent } from '../../_platform'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import type { CharacterBinding, Storyboard } from '@shared/types/story-to-video.types'
import { StoryToVideoResourceService, PRESET_STYLES } from '@core/services/story-to-video-resource.service'
import { KeyframeGenerationService } from '@core/modules/episode-production/render/keyframe/keyframe-generation.service'
import { planRegenPropagation } from '@core/modules/episode-production/render/keyframe/keyframe-chain-strategy'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'

export function registerKeyframeHandlers(): void {
  // ==================== 资源生成（图像） ====================
  ipcBridge.handle('ep:get-style-presets', handleGetStylePresets)
  ipcBridge.handle('ep:generate-storyboard-image', handleGenerateStoryboardImage)
  ipcBridge.handle('ep:generate-scene-images', handleGenerateSceneImages)
  // P5-T8 多关键帧
  ipcBridge.handle('ep:generate-keyframes', handleGenerateKeyframes)
  ipcBridge.handle('ep:regenerate-keyframe', handleRegenerateKeyframe)
  ipcBridge.handle('ep:list-keyframes', handleListKeyframes)
  ipcBridge.handle('ep:plan-keyframe-regen', handlePlanKeyframeRegen)
  // 在两帧之间插入一帧
  ipcBridge.handle('ep:insert-keyframe-between', handleInsertKeyframeBetween)
  // 阶段 2：用户为某帧挑图 override
  ipcBridge.handle('ep:set-keyframe-reference-overrides', handleSetKeyframeReferenceOverrides)
  // 阶段 2 配套：列某资产下全部图（让前端"挑图"dialog 渲染网格）
  ipcBridge.handle('ep:list-asset-images', handleListAssetImages)
}

async function handleSetKeyframeReferenceOverrides(
  _event: any,
  keyframeId: string,
  overrides: Array<{ kind: 'character' | 'location' | 'item'; bindingId: string; imageId: string }>,
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }
    const svc = new KeyframeGenerationService(db.dataSource)
    const data = await svc.setReferenceOverrides(keyframeId, overrides ?? [])
    return { success: true, data }
  } catch (e: any) {
    console.error('[handleSetKeyframeReferenceOverrides] 失败:', e)
    return { success: false, error: e?.message ?? '保存挑图覆盖失败' }
  }
}

/**
 * 列某资产下全部 asset_image。
 * 前端"挑图"dialog 用此 IPC 拉每个资产的图谱网格让用户挑选。
 */
async function handleListAssetImages(
  _event: any,
  assetType: 'character' | 'location' | 'item',
  assetId: string,
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }
    const rows = await db.dataSource
      .getRepository(AssetImageEntity)
      .createQueryBuilder('ai')
      .where('ai.assetType = :assetType AND ai.assetId = :assetId', {
        assetType,
        assetId,
      })
      .orderBy('ai.isMain', 'DESC')
      .addOrderBy('ai.sortOrder', 'ASC')
      .addOrderBy('ai.createdAt', 'ASC')
      .getMany()
    return {
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        imagePath: r.imagePath,
        thumbnailPath: r.thumbnailPath ?? null,
        category: r.category,
        label: r.label ?? null,
        isMain: r.isMain === 1,
      })),
    }
  } catch (e: any) {
    console.error('[handleListAssetImages] 失败:', e)
    return { success: false, error: e?.message ?? '列资产图失败' }
  }
}

async function handleInsertKeyframeBetween(
  _event: any,
  storyboardId: string,
  afterKeyframeId: string,
  userPrompt?: string,
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }
    const svc = new KeyframeGenerationService(db.dataSource)
    const created = await svc.insertBetween({
      storyboardId,
      afterKeyframeId,
      userPrompt: userPrompt ?? null,
    })
    return { success: true, data: created }
  } catch (e: any) {
    console.error('[handleInsertKeyframeBetween] 失败:', e)
    return { success: false, error: e?.message ?? '插入关键帧失败' }
  }
}

// ==================== 资源生成处理器（图像） ====================

async function handleGetStylePresets(): Promise<IpcResponse> {
  try {
    const presets = Object.keys(PRESET_STYLES).map(key => ({
      id: key,
      name: getStyleName(key),
      config: PRESET_STYLES[key]
    }))
    return { success: true, data: presets }
  } catch (error: any) {
    return { success: false, error: error.message || '获取风格预设失败' }
  }
}

function getStyleName(key: string): string {
  const names: Record<string, string> = {
    cinematic: '电影风格',
    anime: '动漫风格',
    realistic: '写实风格',
    fantasy: '奇幻风格',
    ancient_chinese: '古风仙侠'
  }
  return names[key] || key
}

async function handleGenerateStoryboardImage(
  event: any,
  storyboardId: string,
  styleName: string,
  providerConfigId?: string,
  modelId?: string
): Promise<IpcResponse> {
  try {
    console.log('[handleGenerateStoryboardImage] 参数:', {
      storyboardId,
      styleName,
      providerConfigId,
      modelId
    })

    const db = getCoreDatabaseManager()
    if (!db.storyboards || !db.sceneScripts || !db.characterBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    // 获取分镜
    const storyboard = await db.storyboards.getById(storyboardId)
    if (!storyboard) {
      return { success: false, error: '分镜不存在' }
    }

    // 获取场景
    const scene = await db.sceneScripts.getById(storyboard.sceneScriptId)
    if (!scene) {
      return { success: false, error: '场景不存在' }
    }

    // 获取角色绑定（需要从项目获取）
    const characterBindings: CharacterBinding[] = []
    const locationBindings: any[] = []
    // 通过 episodeScript -> episode -> project 获取
    if (db.episodeScripts) {
      const script = await db.episodeScripts.getById(scene.episodeScriptId)
      if (script && db.videoEpisodes) {
        const episode = await db.videoEpisodes.getById(script.episodeId)
        if (episode) {
          const charBindings = await db.characterBindings.getByProjectId(episode.projectId)
          characterBindings.push(...charBindings)

          // 获取地点绑定
          if (db.locationBindings) {
            const locBindings = await db.locationBindings.getByProjectId(episode.projectId)
            locationBindings.push(...locBindings)
          }
        }
      }
    }

    // 获取窗口
    const window = getBrowserWindowFromEvent(event)
    if (!window) {
      return { success: false, error: '窗口不存在' }
    }

    // 调用资源生成服务
    const resourceService = StoryToVideoResourceService.getInstance()
    const imageAsset = await resourceService.generateStoryboardImage(
      storyboard,
      scene,
      characterBindings,
      locationBindings,
      styleName,
      providerConfigId,
      modelId
    )

    if (imageAsset) {
      // 更新分镜的图片
      const updatedStoryboard = await db.storyboards.update(storyboardId, {
        frameImage: imageAsset,
        status: 'image_ready'
      })
      return { success: true, data: updatedStoryboard }
    }

    console.error('[handleGenerateStoryboardImage] 图像生成返回空结果')
    return { success: false, error: '生成图像失败，请检查模型配置是否正确' }
  } catch (error: any) {
    console.error('[handleGenerateStoryboardImage] 异常:', error)
    return { success: false, error: error.message || '生成分镜图像失败' }
  }
}

async function handleGenerateSceneImages(
  event: any,
  sceneId: string,
  styleName: string,
  providerConfigId?: string,
  modelId?: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.storyboards || !db.sceneScripts || !db.characterBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    // 获取场景
    const scene = await db.sceneScripts.getById(sceneId)
    if (!scene) {
      return { success: false, error: '场景不存在' }
    }

    // 获取分镜列表
    const storyboards = await db.storyboards.getBySceneScriptId(sceneId)
    if (storyboards.length === 0) {
      return { success: false, error: '该场景没有分镜' }
    }

    // 获取角色绑定和地点绑定
    const characterBindings: CharacterBinding[] = []
    const locationBindings: any[] = []
    if (db.episodeScripts) {
      const script = await db.episodeScripts.getById(scene.episodeScriptId)
      if (script && db.videoEpisodes) {
        const episode = await db.videoEpisodes.getById(script.episodeId)
        if (episode) {
          const charBindings = await db.characterBindings.getByProjectId(episode.projectId)
          characterBindings.push(...charBindings)

          // 获取地点绑定
          if (db.locationBindings) {
            const locBindings = await db.locationBindings.getByProjectId(episode.projectId)
            locationBindings.push(...locBindings)
          }
        }
      }
    }

    // 获取窗口
    const window = getBrowserWindowFromEvent(event)
    if (!window) {
      return { success: false, error: '窗口不存在' }
    }

    // 调用资源生成服务批量生成
    const resourceService = StoryToVideoResourceService.getInstance()
    const results = await resourceService.generateStoryboardImages(
      storyboards,
      scene,
      characterBindings,
      locationBindings,
      styleName,
      providerConfigId,
      modelId,
      (index, total) => {
        // 发送进度事件
        window.webContents.send('ep:image-progress', {
          sceneId,
          index,
          total
        })
      }
    )

    // 更新分镜记录
    const updatedStoryboards: Storyboard[] = []
    for (const [storyboardId, imageAsset] of results) {
      const updated = await db.storyboards.update(storyboardId, {
        frameImage: imageAsset,
        status: 'image_ready'
      })
      if (updated) {
        updatedStoryboards.push(updated)
      }
    }

    return { success: true, data: updatedStoryboards }
  } catch (error: any) {
    return { success: false, error: error.message || '批量生成场景图像失败' }
  }
}

// ==================== P5-T8 多关键帧 ====================

/**
 * 生成单个分镜的全部关键帧（spec §4.3 链式：start → end → middle）
 */
async function handleGenerateKeyframes(
  _event: any,
  storyboardId: string,
  styleName?: string,
  keyframeCountOverride?: number,
  /** P5-T26 用户额外提示词（spec §4.5.7），可选 */
  userPrompt?: string,
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }
    const svc = new KeyframeGenerationService(db.dataSource)
    const data = await svc.generateKeyframesForStoryboard({
      storyboardId,
      styleName: styleName as any,
      keyframeCountOverride,
      userPrompt,
    })
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e?.message || '生成关键帧失败' }
  }
}

/** 重生成单帧（不级联；级联由 UI 拿 plan-keyframe-regen 决定） */
async function handleRegenerateKeyframe(
  _event: any,
  keyframeId: string,
  styleName?: string,
  /** P5-T26 用户在 RegenerateDialog 输入的"如何修改"提示词 */
  userPrompt?: string,
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }
    const svc = new KeyframeGenerationService(db.dataSource)
    const data = await svc.regenerateKeyframe({
      keyframeId,
      styleName: styleName as any,
      userPrompt,
    })
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e?.message || '重生成关键帧失败' }
  }
}

/**
 * 列出某分镜的全部关键帧（按 frame_index 升序）。
 *
 * 附带 imageAssets[].imagePath：UI（KeyframeGrid）需要 imagePath 才能显示生成的图。
 * 不在 service 层强行 join 是为了 service 保持纯净；handler 在边界处装配。
 */
async function handleListKeyframes(
  _event: any,
  storyboardId: string,
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.storyboardKeyframes || !db.imageAssets || !db.dataSource) {
      return { success: false, error: '数据库未初始化（仓库不可用）' }
    }
    const ds = db.dataSource
    const keyframes = await db.storyboardKeyframes.listByStoryboard(storyboardId)

    // 资产引用展示（阶段 1）：每帧从 image_assets.metadata.referenceImageIds 解析
    // 出真实用过的 asset_image 行 → join binding 拿名字 → UI 渲染"基于：地点-茶馆 / 角色-老者"
    const assetImageRepo = ds.getRepository(AssetImageEntity)

    const enriched = await Promise.all(
      keyframes.map(async (kf) => {
        let imagePath: string | null = null
        let references: KeyframeReferenceRef[] = []
        if (kf.imageAssetId) {
          const ia = await db.imageAssets!.getById(kf.imageAssetId)
          imagePath = ia?.imagePath ?? null

          const refIds = extractReferenceImageIds(ia?.metadata)
          if (refIds.length > 0) {
            const refRows = await assetImageRepo
              .createQueryBuilder('ai')
              .where('ai.id IN (:...ids)', { ids: refIds })
              .getMany()

            // 按 assetType 分组、批量查 binding 拿名字
            const charIds = new Set(refRows.filter(r => r.assetType === 'character').map(r => r.assetId))
            const locIds = new Set(refRows.filter(r => r.assetType === 'location').map(r => r.assetId))
            const itemIds = new Set(refRows.filter(r => r.assetType === 'item').map(r => r.assetId))

            const charNames = await batchLoadNames(
              [...charIds],
              (id) => db.characterBindings?.getById(id) ?? Promise.resolve(null),
              (b: any) => b.standaloneName ?? b.overrideName ?? null,
            )
            const locNames = await batchLoadNames(
              [...locIds],
              (id) => db.locationBindings?.getById(id) ?? Promise.resolve(null),
              (b: any) => b.standaloneName ?? b.overrideName ?? b.locationName ?? null,
            )
            const itemNames = await batchLoadNames(
              [...itemIds],
              (id) => db.itemBindings?.getById(id) ?? Promise.resolve(null),
              (b: any) => b.standaloneName ?? b.overrideName ?? b.itemName ?? null,
            )

            references = refRows.map((r) => ({
              id: r.id,
              imagePath: r.imagePath,
              thumbnailPath: r.thumbnailPath ?? null,
              assetType: r.assetType,
              assetId: r.assetId,
              assetName:
                r.assetType === 'character'
                  ? charNames.get(r.assetId) ?? '(角色)'
                  : r.assetType === 'location'
                    ? locNames.get(r.assetId) ?? '(地点)'
                    : itemNames.get(r.assetId) ?? '(物品)',
              category: r.category,
              label: r.label ?? null,
              isMain: r.isMain === 1,
            }))
          }
        }
        return { ...kf, imagePath, references }
      }),
    )
    return { success: true, data: enriched }
  } catch (e: any) {
    return { success: false, error: e?.message || '列关键帧失败' }
  }
}

interface KeyframeReferenceRef {
  id: string
  imagePath: string | null
  thumbnailPath: string | null
  assetType: string
  assetId: string
  assetName: string
  category: string
  label: string | null
  isMain: boolean
}

/** 从 image_assets.metadata 解析出 referenceImageIds（兼容 string / object） */
function extractReferenceImageIds(metadata: unknown): string[] {
  if (!metadata) return []
  let obj: any = metadata
  if (typeof metadata === 'string') {
    try {
      obj = JSON.parse(metadata)
    } catch {
      return []
    }
  }
  if (!obj || typeof obj !== 'object') return []
  const ids = obj.referenceImageIds
  if (!Array.isArray(ids)) return []
  return ids.filter((x: any): x is string => typeof x === 'string' && x.length > 0)
}

/** 批量按 id 查 binding 拿名字，结果按 id → name 映射；查不到 / 名字空 → 不入 map */
async function batchLoadNames<T>(
  ids: string[],
  load: (id: string) => Promise<T | null>,
  pickName: (b: T) => string | null,
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (ids.length === 0) return result
  const rows = await Promise.all(ids.map((id) => load(id)))
  ids.forEach((id, i) => {
    const row = rows[i]
    if (!row) return
    const name = pickName(row)
    if (name && name.trim()) result.set(id, name.trim())
  })
  return result
}

/**
 * 计算重生成传播范围（pure，不调 image provider）。
 * UI 用此结果决定弹"是否级联重生成 X / Y / Z 帧"对话框。
 */
async function handlePlanKeyframeRegen(
  _event: any,
  changedFrameIndex: number,
  keyframeCount: number,
): Promise<IpcResponse> {
  try {
    const data = planRegenPropagation(changedFrameIndex, keyframeCount)
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e?.message || '计算传播范围失败' }
  }
}
