/**
 * 剧本/场景覆盖式重建 service（2026-09-25 一致性修复第二批 · S4+S5）
 * @module platform/episode-production/narrative/services/script-scene-rebuild
 *
 * 「重新生成剧本」「重新拆分场景」都是覆盖式：删旧场景（级联清旧分镜/关键帧/
 * 片段 supersede）→ 建新场景 → 更新剧本行 → 收敛剧集状态。修复前 handler 与
 * agent 各写一份且防线不一：
 * - S4：handler 的 episode_scripts upsert 在删建场景事务之外，场景事务失败留下
 *   「新正文+旧场景」脱节
 * - S5：agent 路径 deleteByEpisodeScriptId 裸删（无级联、无事务），状态只在
 *   pending/asset_prep 才动（晚于 scripting 不回退）
 *
 * 本模块把完整防线抽成单事务公共入口，handler 与 agent 两侧共用：
 *   1. 同一 ds.transaction 内：剧本行 upsert（含新建时 episode.scriptId 回写）+
 *      cleanupStoryboards 级联 + 删旧场景 + createScenesWithBindingsIn 建新
 *   2. 事务提交后：状态收敛到 scripting（advance + regress 两个方向互斥的原语，
 *      一次只有一个真正写入——pending/asset_prep 推进、storyboarding+ 含
 *      completed 回退，与修复前 handler 无条件置 scripting 等价）
 *
 * E1：两个事务都包在 withPendingKeyframeFileDeletions 收集器里——级联删到的
 * 关键帧磁盘文件在提交成功后统一删除，回滚时随旧数据一并保留。
 *
 * 串行门约束：事务回调内禁止全局 manager/仓库调用，统一走事务 manager；
 * userId 手工注入（裸 manager 不走 BaseRepository 的 ALS 注入）。
 */

import { In, IsNull, type DataSource, type EntityManager } from 'typeorm'
import { getCurrentUserId } from '@core/context/user-context'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import type { GeneratedScene, SceneScript } from '@shared/types/episode-production'
import { SceneBindingWriter } from '@core/platform/episode-production/narrative/scene-binding-writer'
import { cleanupStoryboards } from '@core/platform/episode-production/narrative/storyboard-cleanup.service'
import { withPendingKeyframeFileDeletions } from '@core/platform/episode-production/render/keyframe/keyframe-cleanup'
import {
  advanceEpisodeStatus,
  regressEpisodeStatus,
} from '@core/platform/episode-production/workflow/episode-status-advance'

/** 覆盖式重建所需的剧集字段 */
export interface RebuildEpisodeRef {
  id: string
  projectId: string
  outlineId?: string | null
}

/** 全剧本生成结果（与 FullScriptGenerationResult 结构一致） */
export interface GeneratedScriptPayload {
  synopsis: string
  scriptContent: string
  scenes: GeneratedScene[]
}

export interface RebuildScriptAndScenesResult {
  scriptId: string
  scenes: SceneScript[]
}

/**
 * 剧本行 upsert + 删旧场景（级联清旧分镜）+ 建新场景，单事务；
 * 提交后把剧集状态收敛到 scripting。
 */
export async function upsertScriptAndRebuildScenes(
  ds: DataSource,
  episode: RebuildEpisodeRef,
  generated: GeneratedScriptPayload,
): Promise<RebuildScriptAndScenesResult> {
  const userId = getCurrentUserId()
  const scope = userId ? { userId } : { userId: IsNull() }

  // 既有剧本行在事务外只读解析（全局 manager 只读不进事务，串行门不拦）
  const existing = await ds
    .getRepository(EpisodeScriptEntity)
    .findOne({ where: { episodeId: episode.id, ...scope } as any })

  // E1：收集器包住事务——旧分镜关键帧磁盘文件在提交成功后统一删，回滚则随旧数据一并保留
  const result = await withPendingKeyframeFileDeletions(() => ds.transaction(async manager => {
    const scriptRepo = manager.getRepository(EpisodeScriptEntity)
    const now = new Date()
    let scriptId: string
    if (existing) {
      // 字段口径与原 handler/agent 的 episodeScripts.update 一致
      await scriptRepo.update({ id: existing.id, ...scope } as any, {
        synopsis: generated.synopsis,
        scriptContent: generated.scriptContent,
        scriptFormat: 'standard',
        status: 'reviewing',
        updatedAt: now,
      } as any)
      scriptId = existing.id
    } else {
      // 原实现 create(status pending) → update(status reviewing) → 回写
      // episode.scriptId 三步；同事务内合并为一次插入 + 回写，净效果等价
      scriptId = generateScriptId()
      await scriptRepo.save(
        scriptRepo.create({
          id: scriptId,
          userId: userId ?? null,
          projectId: episode.projectId,
          episodeId: episode.id,
          outlineId: episode.outlineId ?? null,
          status: 'reviewing',
          synopsis: generated.synopsis,
          scriptContent: generated.scriptContent,
          scriptFormat: 'standard',
          scenes: [] as unknown[],
          totalDuration: 0,
          characterAppearances: [] as string[],
          createdAt: now,
          updatedAt: now,
        }),
      )
      await manager
        .getRepository(VideoEpisodeEntity)
        .update({ id: episode.id, ...scope } as any, { scriptId, updatedAt: now } as any)
    }

    await deleteScenesWithCascadeIn(manager, scriptId, scope)
    const scenes = await SceneBindingWriter.createScenesWithBindingsIn(
      manager,
      scriptId,
      generated.scenes,
    )
    return { scriptId, scenes }
  }))

  await convergeToScripting(ds, episode.id)
  return result
}

/**
 * 删旧场景（级联清旧分镜）+ 建新场景，单事务（不动剧本行）；
 * 提交后状态晚于 scripting 时回退。
 */
export async function rebuildScenesForScript(
  ds: DataSource,
  episodeId: string,
  scriptId: string,
  scenes: GeneratedScene[],
): Promise<SceneScript[]> {
  const userId = getCurrentUserId()
  const scope = userId ? { userId } : { userId: IsNull() }
  // E1：收集器包住事务（同 upsertScriptAndRebuildScenes）
  const created = await withPendingKeyframeFileDeletions(() => ds.transaction(async manager => {
    await deleteScenesWithCascadeIn(manager, scriptId, scope)
    return SceneBindingWriter.createScenesWithBindingsIn(manager, scriptId, scenes)
  }))

  try {
    await regressEpisodeStatus(ds, episodeId, 'scripting')
  } catch { /* 状态回退失败不阻断重拆结果 */ }
  return created
}

/** 事务内删旧场景：先级联清旧分镜（关键帧/图/片段 supersede），再删场景行 */
async function deleteScenesWithCascadeIn(
  manager: EntityManager,
  scriptId: string,
  scope: Record<string, unknown>,
): Promise<void> {
  const oldScenes = await manager
    .getRepository(SceneScriptEntity)
    .find({ where: { episodeScriptId: scriptId, ...scope } as any })
  if (oldScenes.length > 0) {
    const oldStoryboards = await manager
      .getRepository(StoryboardEntity)
      .find({ where: { sceneScriptId: In(oldScenes.map(sc => sc.id)), ...scope } as any })
    await cleanupStoryboards(manager, oldStoryboards.map(sb => sb.id))
  }
  await manager
    .getRepository(SceneScriptEntity)
    .delete({ episodeScriptId: scriptId, ...scope } as any)
}

/**
 * 状态收敛到 scripting：advance 与 regress 方向互斥，一次只有一个真正写入。
 * 与原 handler 事务后无条件置 scripting 等价（pending/asset_prep 推进，
 * storyboarding+ 含 completed 回退）。状态写失败不阻断生成结果（同 :407/:671 口径）。
 */
async function convergeToScripting(ds: DataSource, episodeId: string): Promise<void> {
  try {
    await advanceEpisodeStatus(ds, episodeId, 'scripting')
  } catch (e) {
    console.warn(`[script-scene-rebuild] episode ${episodeId} 状态推进 scripting 失败（不阻断）:`, e)
  }
  try {
    await regressEpisodeStatus(ds, episodeId, 'scripting')
  } catch (e) {
    console.warn(`[script-scene-rebuild] episode ${episodeId} 状态回退 scripting 失败（不阻断）:`, e)
  }
}

function generateScriptId(): string {
  return `es_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}
