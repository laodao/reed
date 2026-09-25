/**
 * 关键帧删除回收（2026-09-19 review P2-14c 抽共享）
 * @module platform/episode-production/render/keyframe/keyframe-cleanup
 *
 * 原 KeyframeGenerationService.deleteKeyframeWithAsset（private）抽成共享函数：
 * 删 storyboard_keyframe 行 + 其 image_assets 行 + 磁盘文件。
 * 供 keyframe-generation.service（重生成回收旧帧）与 narrative/storyboard-cleanup
 * （删分镜级联）共用，避免删除路径各自手写漏掉资产/磁盘回收。
 *
 * dbOrTx 接受 DataSource 或事务内 EntityManager（caller 在事务里时传 manager）。
 * user_id 过滤与 BaseRepository.scoped 同语义（ALS userId；null → IS NULL）。
 * 文件/资产回收失败静默——不阻塞关键帧主流程。
 *
 * 一致性修复第二批 E1（2026-09-25）：磁盘文件不再在事务内物理删除——
 * 事务内只把待删绝对路径登记进 ALS 收集器（withPendingKeyframeFileDeletions
 * 包裹事务代码），事务提交成功后统一删除，回滚则整批丢弃（DB 行恢复、
 * 文件也还在，imagePath 不悬空）。无活跃收集器（非事务路径）保持立即删除。
 */

import type { DataSource, EntityManager } from 'typeorm'
import { IsNull } from 'typeorm'
import { AsyncLocalStorage } from 'async_hooks'
import * as fs from 'fs'
import * as path from 'path'
import { getPathProvider } from '@core/interfaces/path.interface'
import { getCurrentUserId } from '@core/context/user-context'
import { StoryboardKeyframeEntity } from '@core/database/entities/episode-production/storyboard-keyframe.entity'
import { ImageAssetEntity } from '@core/database/entities/image-asset.entity'

/** ALS userId 对应的 where 片段（与 BaseRepository.scopeWhere 同语义） */
export function userScopeWhere(): { userId: string | ReturnType<typeof IsNull> } {
  const userId = getCurrentUserId()
  return { userId: userId === null ? IsNull() : userId }
}

/*
 * E1 待删文件收集器：每个事务一个独立 string[]，ALS 保证并发事务互不串扰
 * （与 user-context 同手法）。
 */
const pendingFileDeletionStorage = new AsyncLocalStorage<string[]>()

function deleteFileNow(absPath: string): void {
  try {
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath)
  } catch { /* 单个文件清理失败不阻塞 */ }
}

/**
 * 用「待删文件收集器」包裹一段事务代码：
 * - fn 成功返回（其内部事务已提交）→ 统一删除收集到的文件，单个失败只 warn 不阻断；
 * - fn 抛错（事务回滚）→ 丢弃待删清单，磁盘文件与回滚后的 DB 行一并保留。
 * 已有外层收集器时（被并入外层事务）直接复用，由外层提交点统一 flush。
 */
export async function withPendingKeyframeFileDeletions<T>(fn: () => Promise<T>): Promise<T> {
  if (pendingFileDeletionStorage.getStore()) return fn()
  const pending: string[] = []
  // fn 抛错（事务回滚）时待删清单随异常丢弃：DB 行已恢复，磁盘文件同步保留
  const result = await pendingFileDeletionStorage.run(pending, fn)
  for (const abs of pending) {
    try {
      if (fs.existsSync(abs)) fs.unlinkSync(abs)
    } catch (e) {
      console.warn(`[keyframe-cleanup] 事务提交后删除文件失败（不阻断）: ${abs}`, e)
    }
  }
  return result
}

/** 当前是否有活跃的待删文件收集器（供上层做「漏接收集器」自检告警） */
export function hasPendingKeyframeFileDeletionScope(): boolean {
  return pendingFileDeletionStorage.getStore() !== undefined
}

/**
 * 登记一个待删磁盘文件（绝对路径）：有活跃收集器（事务路径）则入列、提交后
 * 统一删；无收集器（非事务路径，如关键帧重生成的 DataSource 直调）立即删。
 */
export function deferKeyframeFileDeletion(absPath: string): void {
  const pending = pendingFileDeletionStorage.getStore()
  if (pending) {
    pending.push(absPath)
    return
  }
  deleteFileNow(absPath)
}

/** 删关键帧行并回收其 image_assets 行；磁盘文件登记待删（事务提交后统一删，见模块头 E1）。 */
export async function deleteKeyframeWithAsset(
  dbOrTx: DataSource | EntityManager,
  keyframeId: string,
): Promise<void> {
  const kfRepo = dbOrTx.getRepository(StoryboardKeyframeEntity)
  const imgRepo = dbOrTx.getRepository(ImageAssetEntity)
  const scope = userScopeWhere()
  const row = await kfRepo.findOne({ where: { id: keyframeId, ...scope } as any })
  if (!row) return
  await kfRepo.delete({ id: keyframeId, ...scope } as any)
  const assetId = row.imageAssetId
  if (!assetId) return
  try {
    const asset = await imgRepo.findOne({ where: { id: assetId, ...scope } as any })
    if (!asset) return
    await imgRepo.delete({ id: assetId, ...scope } as any)
    const dataPath = getPathProvider().getDataPath()
    for (const p of [asset.imagePath, asset.thumbnailPath]) {
      if (!p) continue
      deferKeyframeFileDeletion(path.isAbsolute(p) ? p : path.join(dataPath, p))
    }
  } catch { /* 资产行清理失败不阻塞 */ }
}
