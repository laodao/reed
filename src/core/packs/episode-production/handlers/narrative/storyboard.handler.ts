/**
 * episode-production · 分镜管理 · IPC handler
 * @module core/packs/episode-production/handlers/narrative/storyboard.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 * 包含：分镜管理（list/get/update-storyboard）、AI分镜生成（generate-storyboard、generate-storyboards）
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getBrowserWindowFromEvent } from '@electron/ipc/handlers/_platform'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import type { Storyboard } from '@shared/types/story-to-video.types'
import { StoryToVideoAIService } from '@core/packs/episode-production/services/story-to-video-ai.service'
import { StoryboardService, normalizeShotNumbers, collectUnboundCharacters } from '@core/platform/episode-production/narrative/services/storyboard.service'
import { StoryboardCogenService } from '@core/platform/episode-production/narrative/services/storyboard-cogen.service'
import { cleanupStoryboards, invalidateStoryboardVisuals } from '@core/platform/episode-production/narrative/storyboard-cleanup.service'
import { insertStoryboardIn } from '@core/platform/episode-production/narrative/storyboard-insert'
import { withPendingKeyframeFileDeletions } from '@core/platform/episode-production/render/keyframe/keyframe-cleanup'
import { rebuildStoryboardDialogueLinks } from '@core/platform/episode-production/narrative/storyboard-dialogue-links'

export function registerStoryboardHandlers(): void {
  // ==================== 分镜管理 ====================
  ipcBridge.handle('ep:list-storyboards', handleListStoryboards)
  ipcBridge.handle('ep:get-storyboard', handleGetStoryboard)
  ipcBridge.handle('ep:update-storyboard', handleUpdateStoryboard)
  ipcBridge.handle('ep:reorder-storyboards', handleReorderStoryboards)
  ipcBridge.handle('ep:delete-storyboard', handleDeleteStoryboard)
  // 台词编辑（2026-10-05）：分镜编辑器台词 chip 写回 scene_dialogues（字幕/视频 prompt 共同数据源）
  ipcBridge.handle('ep:update-scene-dialogue', handleUpdateSceneDialogue)

  // ==================== AI 生成（分镜） ====================
  ipcBridge.handle('ep:generate-storyboard', handleGenerateStoryboard)
  ipcBridge.handle('ep:generate-storyboards', handleGenerateStoryboards)
  // 2026-09-16 联合生成（D1/D2/D8）：分镜 + 资产识别单次 LLM 调用，绑定由代码构造
  ipcBridge.handle('ep:cogen-storyboards', handleCogenStoryboards)
  // S-06：单场景分镜重拆（cogen 场景级入口，替换式重写该场景分镜）
  ipcBridge.handle('ep:cogen-scene-storyboards', handleCogenSceneStoryboards)
  // spec 2026-05-27：单分镜 AI 填充
  ipcBridge.handle('ep:fill-storyboard', handleFillStoryboard)

  // ==================== FU5-A9-L2 · 分镜背景 ref 图（panorama_snapshot 绑入分镜） ==
  ipcBridge.handle('ep:storyboard:set-background-ref', handleSetBackgroundRef)
  ipcBridge.handle('ep:storyboard:get-background-ref', handleGetBackgroundRef)
}

// ==================== FU5-A9-L2 background ref handlers ====================

function getStoryboardSvc(): StoryboardService {
  const db = getCoreDatabaseManager()
  if (!db.dataSource) throw new Error('数据库未初始化')
  return new StoryboardService(db.dataSource)
}

async function handleSetBackgroundRef(
  _event: any,
  storyboardId: string,
  imageId: string | null,
): Promise<IpcResponse> {
  try {
    if (!storyboardId) return { success: false, error: 'storyboardId 不能为空' }
    await getStoryboardSvc().setBackgroundRefImage(storyboardId, imageId)
    return { success: true, data: { storyboardId, imageId } }
  } catch (e: any) {
    return { success: false, error: e?.message ?? '绑定背景 ref 失败' }
  }
}

async function handleGetBackgroundRef(
  _event: any,
  storyboardId: string,
): Promise<IpcResponse> {
  try {
    const imageId = await getStoryboardSvc().getBackgroundRefImageId(storyboardId)
    return { success: true, data: { storyboardId, imageId } }
  } catch (e: any) {
    return { success: false, error: e?.message ?? '读取背景 ref 失败' }
  }
}

// ==================== 分镜管理处理器 ====================

/**
 * 台词编辑写回（2026-10-05 台词可编辑）：更新 scene_dialogues.text。
 * scene_dialogues 是字幕与视频 prompt 注入的共同数据源（经 links 读取），
 * 改这一处即全链路一致；写回后前端本地同步 shots[].dialogues，无需整表重载。
 */
async function handleUpdateSceneDialogue(
  _event: any,
  dialogueId: string,
  text: string,
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) {
      return { success: false, error: '数据库未初始化' }
    }
    const { updateSceneDialogueText } = await import(
      '@core/platform/episode-production/narrative/scene-dialogues'
    )
    const updated = await updateSceneDialogueText(db.dataSource, dialogueId, text)
    if (!updated) return { success: false, error: '台词不存在（可能已被重新生成）' }
    return { success: true, data: { dialogueId, text: (text ?? '').trim() } }
  } catch (error: any) {
    return { success: false, error: error.message || '更新台词失败' }
  }
}

async function handleListStoryboards(
  _event: any,
  sceneScriptId: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.storyboards) {
      return { success: false, error: '数据库未初始化' }
    }

    const storyboards = await db.storyboards.getBySceneScriptId(sceneScriptId)

    /*
     * 台词可见性（2026-10-05）：附带每个镜头承接的台词（说话人+原文），
     * 与视频 prompt 注入共用 loadShotDialogues 同一数据口径（links 表优先、
     * dialogue_ids JSON 兜底），前端分镜编辑器逐行只读展示，便于核对台词归属。
     * 台词解析失败不阻断分镜列表（降级为无台词展示）。
     */
    if (db.dataSource && storyboards.length > 0) {
      try {
        const { loadShotDialogues } = await import(
          '@core/platform/episode-production/render/video/shot-dialogue-loader'
        )
        const byShot = await loadShotDialogues(
          db.dataSource,
          storyboards.map((sb) => ({ id: sb.id, dialogueIds: sb.dialogueIds })),
        )
        for (const sb of storyboards) {
          const list = byShot.get(sb.id)
          if (list?.length) (sb as Storyboard).dialogues = list
        }
      } catch (e) {
        console.warn('[handleListStoryboards] 台词附带失败（降级为不展示台词）:', e)
      }
    }

    return { success: true, data: storyboards }
  } catch (error: any) {
    return { success: false, error: error.message || '获取分镜列表失败' }
  }
}

async function handleGetStoryboard(
  _event: any,
  storyboardId: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.storyboards) {
      return { success: false, error: '数据库未初始化' }
    }

    const storyboard = await db.storyboards.getById(storyboardId)
    if (!storyboard) {
      return { success: false, error: '分镜不存在' }
    }

    return { success: true, data: storyboard }
  } catch (error: any) {
    return { success: false, error: error.message || '获取分镜失败' }
  }
}

async function handleReorderStoryboards(
  _event: any,
  sceneScriptId: string,
  orderedIds: string[],
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.storyboards) {
      return { success: false, error: '数据库未初始化' }
    }
    await db.storyboards.reorderInScene(sceneScriptId, orderedIds)
    return { success: true, data: { reordered: orderedIds.length } }
  } catch (error: any) {
    return { success: false, error: error.message || '调序失败' }
  }
}

/*
 * 删除单个分镜：cleanupStoryboards 级联清 keyframes（含 image_assets 行与磁盘
 * 文件）+ storyboard_characters + 受影响片段置 superseded，再删 storyboard
 * 本身；最后把场景内剩余分镜按当前 shotNumber 升序重排为 1..N（避免出现
 * 1,3,4 这种缝隙）。
 */
async function handleDeleteStoryboard(
  _event: any,
  storyboardId: string,
): Promise<IpcResponse> {
  try {
    if (!storyboardId) return { success: false, error: 'storyboardId 不能为空' }

    const db = getCoreDatabaseManager()
    if (!db.storyboards || !db.dataSource) {
      return { success: false, error: '数据库未初始化' }
    }

    const target = await db.storyboards.getById(storyboardId)
    if (!target) {
      return { success: false, error: '分镜不存在' }
    }

    // 级联清理子表 + 资产/磁盘回收（P2-14，FK 未配 cascade）
    await cleanupStoryboards(db.dataSource, [storyboardId])

    /*
     * 不依赖 repo.delete() 的 boolean —— 部分 typeorm 驱动（PG 某些版本）
     * 不可靠地填充 result.affected，导致已成功 DELETE 但返回 false。
     * cleanupStoryboards 删完后用 getById 复查：拿不到 → 判定删除成功。
     */
    const stillExists = await db.storyboards.getById(storyboardId)
    if (stillExists) {
      console.error(
        `[handleDeleteStoryboard] 分镜 ${storyboardId} 删除后仍存在（可能 user_id scope 不匹配）`,
      )
      return { success: false, error: '删除分镜失败：DB 未真正删除（user_id scope 可能不匹配）' }
    }

    // 重排剩余分镜，让 shotNumber 重新连续 1..N
    const remaining = await db.storyboards.getBySceneScriptId(target.sceneScriptId)
    if (remaining.length > 0) {
      await db.storyboards.reorderInScene(
        target.sceneScriptId,
        remaining.map((sb) => sb.id),
      )
    }

    return {
      success: true,
      data: {
        deletedId: storyboardId,
        sceneScriptId: target.sceneScriptId,
        remaining: remaining.length,
      },
    }
  } catch (error: any) {
    console.error('[handleDeleteStoryboard] 异常：', error)
    return {
      success: false,
      error: error?.message ? `删除分镜失败：${error.message}` : '删除分镜失败（未知异常）',
    }
  }
}

/*
 * X3（2026-09-24 审计）画面内容字段白名单：这些字段进关键帧/视频生成的
 * prompt 或选图逻辑，改动后旧画面产物（关键帧 + 视频）即过期，需级联作废。
 * 不收录的：dialogueIds（只重建 links，不动画面）、duration/transition/
 * shotType/cameraAngle/cameraMovement 等镜头元信息（时长/转场不影响已生成
 * 画面；镜头参数按任务口径与 shotType 同列，避免微调参数即作废全部产物）。
 */
function visualContentChanged(before: Storyboard, patch: Partial<Storyboard>): boolean {
  const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
  const arr = (v: unknown) => JSON.stringify(Array.isArray(v) ? v : [])
  const obj = (v: unknown) => JSON.stringify(v ?? null)

  if (patch.frameDescription !== undefined && str(patch.frameDescription) !== str(before.frameDescription)) return true
  if (patch.subject !== undefined && str(patch.subject) !== str(before.subject)) return true
  if (patch.composition !== undefined && str(patch.composition) !== str(before.composition)) return true
  if (patch.characters !== undefined && arr(patch.characters) !== arr(before.characters)) return true
  if (patch.locationBindingIds !== undefined && arr(patch.locationBindingIds) !== arr(before.locationBindingIds)) return true
  if (patch.itemBindingIds !== undefined && arr(patch.itemBindingIds) !== arr(before.itemBindingIds)) return true
  if (patch.referenceImageIds !== undefined && obj(patch.referenceImageIds) !== obj(before.referenceImageIds)) return true
  return false
}

async function handleUpdateStoryboard(
  _event: any,
  storyboardId: string,
  data: Partial<Storyboard>
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.storyboards) {
      return { success: false, error: '数据库未初始化' }
    }

    // 先取旧值：C2 links 同步（dialogueIds 比对）与 X3 画面内容变更判定共用
    const before = await db.storyboards.getById(storyboardId)
    if (!before) {
      return { success: false, error: '分镜不存在' }
    }
    const dialogueIdsTouched = data.dialogueIds !== undefined
    const visualsChanged = visualContentChanged(before, data)

    /*
     * X3：画面内容变更 → 先作废旧画面产物（关键帧行/图/磁盘文件、自身
     * videoPath+status、所属未 superseded 片段），再落新内容。顺序保证失败
     * 方向安全：作废失败则整体不动可直接重试；落库失败也不会有「新内容+
     * 旧画面」的脱钩状态。磁盘文件走收集器，事务提交成功后统一删。
     */
    if (visualsChanged && db.dataSource) {
      await withPendingKeyframeFileDeletions(() =>
        db.dataSource!.transaction((manager) =>
          invalidateStoryboardVisuals(manager, storyboardId),
        ),
      )
    }

    const storyboard = await db.storyboards.update(storyboardId, data)
    if (!storyboard) {
      return { success: false, error: '分镜不存在' }
    }

    // C2：仅当本次保存动了 dialogueIds 且值确实变化时才同步 links（未变不重建）
    if (
      dialogueIdsTouched &&
      db.dataSource &&
      JSON.stringify(before.dialogueIds ?? []) !== JSON.stringify(storyboard.dialogueIds ?? [])
    ) {
      await rebuildStoryboardDialogueLinks(db.dataSource, storyboard).catch((e) => {
        console.error('[handleUpdateStoryboard] 重建对白承接 links 失败:', e)
      })
    }

    return { success: true, data: storyboard }
  } catch (error: any) {
    return { success: false, error: error.message || '更新分镜失败' }
  }
}

// ==================== AI 生成处理器（分镜） ====================

async function handleGenerateStoryboard(
  event: any,
  sceneId: string,
  providerConfigId?: string,
  modelId?: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.sceneScripts || !db.storyboards || !db.dataSource) {
      return { success: false, error: '数据库未初始化' }
    }

    // 获取场景
    const scene = await db.sceneScripts.getById(sceneId)
    if (!scene) {
      return { success: false, error: '场景不存在' }
    }

    // 获取窗口用于发送进度事件
    const window = getBrowserWindowFromEvent(event)

    // 调用 AI 生成分镜（使用逐个生成模式）
    const aiService = StoryToVideoAIService.getInstance()
    const result = await aiService.generateStoryboardsIncremental(
      scene,
      providerConfigId,
      modelId,
      (shotNumber, total, storyboard) => {
        // 发送进度事件
        if (window) {
          window.webContents.send('ep:storyboard-progress', {
            sceneId,
            shotNumber,
            total,
            storyboard: storyboard || null
          })
        }
      }
    )

    /*
     * 创建分镜记录（shotNumber 按 AI 返回顺序强制重排为 1..N，AI 返回可能跳号）。
     * 一致性修复 M2（第二批）：先删该场景旧分镜（cleanupStoryboards 级联清
     * 关键帧/图、characters、受影响片段置 superseded），删旧 + 插新 + links
     * 包进同一个事务——重复生成不再残留双份分镜/双份 links，中途失败整体回滚
     * （旧分镜完整保留，同 B2-Task3 replaceSceneStoryboards 口径）。
     * SQLite 串行门约束：事务回调内禁止全局 manager/仓库方法（db.storyboards
     * 走 DataSource 全局 manager 会被门拒），一律走事务 manager 的
     * getRepository；裸 manager 不注入 user_id（复核修复 P0-3），userId 手工
     * 注入（同 scoped 语义）。
     *
     * S1 同型缺陷守卫：AI 空结果不进删建事务，保留原分镜（空结果≠用户要清空）。
     */
    const shots = normalizeShotNumbers(result.storyboards)
    if (shots.length === 0) {
      return { success: false, error: 'AI 未返回有效分镜，已保留原分镜' }
    }

    // 旧分镜 id 列表只读，在事务外读取（串行门不拦）
    // E1：收集器包住事务——旧分镜关键帧磁盘文件在提交成功后统一删，回滚则随旧分镜一并保留
    const oldStoryboards = await db.storyboards.getBySceneScriptId(sceneId)
    await withPendingKeyframeFileDeletions(() => db.dataSource!.transaction(async (manager) => {
      await cleanupStoryboards(manager, oldStoryboards.map((sb) => sb.id))

      for (const sb of shots) {
        // 调试日志
        console.log(`[Handler] 分镜 ${sb.shotNumber} dialogueIds:`, sb.dialogueIds)

        const storyboard = await insertStoryboardIn(manager, {
          sceneScriptId: sceneId,
          shotNumber: sb.shotNumber,
          shotType: sb.shotType,
          cameraAngle: sb.cameraAngle,
          cameraMovement: sb.cameraMovement,
          movementDuration: sb.movementDuration,
          frameDescription: sb.frameDescription,
          subject: sb.subject,
          composition: sb.composition,
          characters: sb.characters as unknown[],
          narrationId: sb.narrationId,
          dialogueIds: sb.dialogueIds,
          actionIds: sb.actionIds,
          duration: sb.duration,
          transition: sb.transition,
        })

        // 一致性修复 v3（A3）：对白承接落库 links（字幕镜头级分配数据源）
        await rebuildStoryboardDialogueLinks(manager, {
          id: storyboard.id,
          dialogueIds: sb.dialogueIds,
        })
      }
    }))

    // 事务提交后复读（DTO 口径同原 create 返回值：transition 解析、时间戳 epoch 化）
    const storyboardRecords: Storyboard[] = await db.storyboards.getBySceneScriptId(sceneId)

    // P1-13：单场景分镜生成也推进 episode → storyboarding（与批量路径 :369 一致）
    try {
      const { advanceEpisodeStatus } = await import(
        '@core/platform/episode-production/workflow/episode-status-advance'
      )
      const script = await db.episodeScripts?.getById(scene.episodeScriptId)
      if (script?.episodeId && db.dataSource) {
        await advanceEpisodeStatus(db.dataSource, script.episodeId, 'storyboarding')
      }
    } catch {
      /* 状态推进失败不阻断分镜结果 */
    }

    return { success: true, data: storyboardRecords }
  } catch (error: any) {
    return { success: false, error: error.message || '生成分镜失败' }
  }
}

async function handleGenerateStoryboards(
  event: any,
  scriptId: string,
  providerConfigId?: string,
  modelId?: string
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.sceneScripts || !db.storyboards || !db.dataSource) {
      return { success: false, error: '数据库未初始化' }
    }

    // 获取所有场景
    const scenes = await db.sceneScripts.getByEpisodeScriptId(scriptId)
    if (scenes.length === 0) {
      return { success: false, error: '没有场景，请先生成场景' }
    }

    // 获取窗口用于发送进度事件
    const window = getBrowserWindowFromEvent(event)

    // 调用 AI 批量生成分镜（使用逐个分镜生成模式）
    const aiService = StoryToVideoAIService.getInstance()
    const results = await aiService.generateStoryboards(
      scenes,
      providerConfigId,
      modelId,
      (sceneIndex, total, shotProgress) => {
        // 发送进度事件
        if (window) {
          window.webContents.send('ep:storyboards-progress', {
            scriptId,
            sceneIndex,
            total,
            shotProgress: shotProgress || null
          })
        }
      }
    )

    // 创建分镜记录
    const allStoryboards: Storyboard[] = []
    // S1 同型缺陷守卫：AI 空结果的场景跳过删建、保留旧分镜（单场景空结果不让整批失败）
    const skippedScenes: string[] = []
    /*
     * 一致性修复第三批 Task 2：与单场景路径同构——per-scene 单事务（删旧 + 插新
     * + links），中途失败该场景整体回滚（旧分镜完整保留）、计入 failedScenes，
     * 不影响其他场景；不再静默吞 links 错误（旧 .catch(() => {})）。失败语义：
     * B3-Task1 后 rebuild 已过滤悬空 id（不再因悬空 id FK 抛错），真正失败源是
     * DB 错误/触发器等，出现即表面化。
     */
    const failedScenes: Array<{ sceneId: string; error: string }> = []
    for (const [sceneId, result] of results) {
      const shots = normalizeShotNumbers(result.storyboards)
      if (shots.length === 0) {
        console.warn(`[handleGenerateStoryboards] 场景 ${sceneId} AI 未返回有效分镜，跳过删建、保留旧分镜`)
        skippedScenes.push(sceneId)
        continue
      }

      // 旧分镜 id 列表只读，在事务外读取（串行门不拦）
      // E1：收集器包住事务——旧分镜关键帧磁盘文件在提交成功后统一删，回滚则随旧分镜一并保留
      const oldStoryboards = await db.storyboards.getBySceneScriptId(sceneId)
      try {
        await withPendingKeyframeFileDeletions(() => db.dataSource!.transaction(async (manager) => {
          await cleanupStoryboards(manager, oldStoryboards.map((sb) => sb.id))

          // 创建新分镜（shotNumber 按 AI 返回顺序强制重排为 1..N，AI 返回可能跳号）
          for (const sb of shots) {
            const storyboard = await insertStoryboardIn(manager, {
              sceneScriptId: sceneId,
              shotNumber: sb.shotNumber,
              shotType: sb.shotType,
              cameraAngle: sb.cameraAngle,
              cameraMovement: sb.cameraMovement,
              movementDuration: sb.movementDuration,
              frameDescription: sb.frameDescription,
              subject: sb.subject,
              composition: sb.composition,
              characters: sb.characters as unknown[],
              narrationId: sb.narrationId,
              dialogueIds: sb.dialogueIds,
              actionIds: sb.actionIds,
              duration: sb.duration,
              transition: sb.transition,
            })

            // 一致性修复 C1：批量路径同样落库对白承接 links（与单场景路径同口径，
            // 失败即抛 → 本场景整体回滚并计入 failedScenes，不静默吞）
            await rebuildStoryboardDialogueLinks(manager, {
              id: storyboard.id,
              dialogueIds: sb.dialogueIds,
            })
          }
        }))
      } catch (e: any) {
        console.error(`[handleGenerateStoryboards] 场景 ${sceneId} 写库失败，已回滚保留旧分镜:`, e)
        failedScenes.push({ sceneId, error: e?.message ?? '写库失败（未知异常）' })
        continue
      }

      // 事务提交后复读（DTO 口径同单场景路径：transition 解析、时间戳 epoch 化）
      allStoryboards.push(...(await db.storyboards.getBySceneScriptId(sceneId)))
    }

    /*
     * 全灭守卫（第三批 Task 2 评审 Important）：全部场景写库失败（无任何成功场景）
     * 时 success:false + error 汇总——否则 success:true + storyboards:[] + 状态推进，
     * 用户侧无任何失败信号。skippedScenes 的空结果跳过不算失败（部分成功/部分跳过
     * 仍 success:true 并推进状态）。
     */
    if (allStoryboards.length === 0 && failedScenes.length > 0) {
      const detail = failedScenes.map((f) => `${f.sceneId}: ${f.error}`).join('；')
      return {
        success: false,
        error: `批量生成分镜失败：${failedScenes.length} 个场景写库失败（已回滚保留旧分镜）——${detail}`,
      }
    }

    // 状态闭环（2026-09-16 P0-CM2）：分镜已生成 → episode.storyboarding
    try {
      const { advanceEpisodeStatus } = await import(
        '@core/platform/episode-production/workflow/episode-status-advance'
      )
      const script = await db.episodeScripts?.getById(scriptId)
      if (script?.episodeId && db.dataSource) {
        await advanceEpisodeStatus(db.dataSource, script.episodeId, 'storyboarding')
      }
    } catch {
      /* 状态推进失败不阻断分镜结果 */
    }

    // H10（2026-09-16 ep-hardening）：统计未绑定资产的角色（characterId 为空），
    // 随结果返回 unboundCharacters（去重角色名，能从 scene 名单推就推）+ unboundCount，
    // 供 renderer toast 告警"将影响画面一致性"。
    const unbound = collectUnboundCharacters(allStoryboards, scenes)

    return {
      success: true,
      data: {
        storyboards: allStoryboards,
        unboundCharacters: unbound.names,
        unboundCount: unbound.count,
        // AI 空结果而跳过删建、保留旧分镜的场景（供 renderer 提示用户重生）
        skippedScenes,
        // 写库失败已整体回滚（旧分镜完整保留）的场景（第三批 Task 2：不再静默吞错）
        failedScenes,
      },
    }
  } catch (error: any) {
    return { success: false, error: error.message || '批量生成分镜失败' }
  }
}

/**
 * 2026-09-16 联合生成（tasks/2026-09-16-storyboard-asset-cogen · D1/D2/D8）：
 * 整集逐场景一次 LLM 调用同时产出资产清单 + 分镜，代码侧建/复用 binding 并
 * 回填全部 ID。未配置 scriptModel 时返回明确报错（引导去项目设置配置模型）。
 *
 * H13：每场景开始/完成/失败时通过 ep:cogen-progress 推送进度（同
 * ep:storyboards-progress 的 getBrowserWindowFromEvent + webContents.send 机制；
 * Web 模式 window 为 null 时静默跳过）。
 */
async function handleCogenStoryboards(
  event: any,
  episodeId: string,
  opts?: { force?: boolean },
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) {
      return { success: false, error: '数据库未初始化' }
    }
    if (!episodeId) return { success: false, error: 'episodeId 不能为空' }

    const window = getBrowserWindowFromEvent(event)
    // O2：opts.force 透传（renderer 批量按钮恒 true=全量重写；缺省=增量跳过合格场景）
    const result = await new StoryboardCogenService(db.dataSource).cogenStoryboardsForEpisode(
      episodeId,
      opts,
      (progress) => {
        if (window) {
          window.webContents.send('ep:cogen-progress', progress)
        }
      },
    )
    return { success: true, data: result }
  } catch (error: any) {
    return { success: false, error: error.message || '联合生成分镜失败' }
  }
}

/**
 * S-06 场景级局部重生（tasks/2026-09-16-ep-studio-polish）：
 * 只重拆指定场景的分镜（cogen 单次 LLM 调用，替换式重写；绑定由代码侧构造回填）。
 * 失败返回 error 且旧分镜保留。关联片段由 ep-segmentation 的 superseded 逻辑收敛。
 */
async function handleCogenSceneStoryboards(
  _event: any,
  sceneId: string,
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) {
      return { success: false, error: '数据库未初始化' }
    }
    if (!sceneId) return { success: false, error: 'sceneId 不能为空' }

    const result = await new StoryboardCogenService(db.dataSource).cogenStoryboardsForScene(sceneId)
    return { success: true, data: result }
  } catch (error: any) {
    return { success: false, error: error.message || '重新生成场景分镜失败' }
  }
}

/**
 * spec 2026-05-28：单分镜 AI 填充（扩展版）
 * 调 AI 推荐所有镜头参数，一键填充所有空白字段
 * 覆盖：镜头核心参数 + metadata参数 + 转场参数 + 关键帧数
 */
async function handleFillStoryboard(
  _event: any,
  _storyboardId: string,
  fillInput: {
    shotNumber: number
    sceneContext: string
    location?: string
    timeOfDay?: string
    mood?: string
    existingFields: {
      shotType?: string | null
      cameraAngle?: string | null
      cameraMovement?: string | null
      duration?: number | null
      frameDescription?: string | null
      // 扩展字段（2026-05-28）
      lensFocalMm?: number | null
      aperture?: string | null
      cameraStyle?: string | null
      lighting?: string | null
      transitionType?: string | null
      transitionDuration?: number | null
      transitionDirection?: string | null
      keyframeCount?: number | null
    }
  },
  providerConfigId?: string,
  modelId?: string
): Promise<IpcResponse> {
  console.log('[handleFillStoryboard] 收到IPC调用')
  console.log('[handleFillStoryboard] fillInput:', JSON.stringify(fillInput).substring(0, 500))
  console.log('[handleFillStoryboard] providerConfigId:', providerConfigId)
  console.log('[handleFillStoryboard] modelId:', modelId)
  try {
    // 调 storyboard-generator 的 fill 方法
    console.log('[handleFillStoryboard] 开始调用EpisodeStoryboardGenerator...')
    const { EpisodeStoryboardGenerator } = await import('@core/platform/episode-production/narrative/ai/storyboard-generator')
    const result = await EpisodeStoryboardGenerator.getInstance().fillStoryboardFields(
      fillInput,
      providerConfigId,
      modelId
    )
    console.log('[handleFillStoryboard] AI返回结果:', JSON.stringify(result))
    return { success: true, data: result }
  } catch (error: any) {
    console.log('[handleFillStoryboard] 错误:', error.message)
    return { success: false, error: error.message || 'AI 填充失败' }
  }
}
