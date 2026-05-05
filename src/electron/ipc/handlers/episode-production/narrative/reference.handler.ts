/**
 * episode-production · 叙事域引用解析 + 完整性校验 IPC handler（P4-T6）
 * @module electron/ipc/handlers/episode-production/narrative/reference.handler
 *
 * 暴露给 UI 的 channel：
 *   - ep:resolve-reference        → 单个 binding 解析
 *   - ep:resolve-references-batch → 批量解析
 *   - ep:validate-scene           → 单场景完整性
 *   - ep:validate-episode-script  → 整剧本完整性
 *
 * 双端共用 handler，PC + Web 同一份代码。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import { ReferenceResolver } from '@core/modules/episode-production/narrative/reference-resolver'
import { SceneScriptService } from '@core/modules/episode-production/narrative/services/scene-script.service'
import type { ReferenceRef } from '@core/modules/episode-production/narrative/reference-resolver'

export function registerReferenceHandlers(): void {
  ipcBridge.handle('ep:resolve-reference', handleResolveReference)
  ipcBridge.handle('ep:resolve-references-batch', handleResolveReferencesBatch)
  ipcBridge.handle('ep:validate-scene', handleValidateScene)
  ipcBridge.handle('ep:validate-episode-script', handleValidateEpisodeScript)
}

function getDataSource() {
  const db = getCoreDatabaseManager()
  return db.dataSource
}

/** 单个 binding 解析 */
async function handleResolveReference(
  _event: any,
  kind: 'character' | 'location' | 'item',
  bindingId: string,
): Promise<IpcResponse> {
  try {
    const ds = getDataSource()
    if (!ds) return { success: false, error: '数据库未初始化' }
    const resolver = new ReferenceResolver(ds)
    let result
    if (kind === 'character') result = await resolver.resolveCharacter(bindingId)
    else if (kind === 'location') result = await resolver.resolveLocation(bindingId)
    else if (kind === 'item') result = await resolver.resolveItem(bindingId)
    else return { success: false, error: `未知的 kind: ${kind}` }
    return { success: true, data: result }
  } catch (e: any) {
    return { success: false, error: e?.message || '解析引用失败' }
  }
}

/** 批量解析 */
async function handleResolveReferencesBatch(
  _event: any,
  refs: ReferenceRef[],
): Promise<IpcResponse> {
  try {
    if (!Array.isArray(refs)) {
      return { success: false, error: 'refs 必须是数组' }
    }
    const ds = getDataSource()
    if (!ds) return { success: false, error: '数据库未初始化' }
    const resolver = new ReferenceResolver(ds)
    const result = await resolver.resolveBatch(refs)
    return { success: true, data: result }
  } catch (e: any) {
    return { success: false, error: e?.message || '批量解析失败' }
  }
}

/** 单场景完整性校验 */
async function handleValidateScene(
  _event: any,
  sceneScriptId: string,
): Promise<IpcResponse> {
  try {
    const ds = getDataSource()
    if (!ds) return { success: false, error: '数据库未初始化' }
    const svc = new SceneScriptService(ds)
    const report = await svc.validateCompleteness(sceneScriptId)
    return { success: true, data: report }
  } catch (e: any) {
    return { success: false, error: e?.message || '场景校验失败' }
  }
}

/** 整剧本完整性校验 */
async function handleValidateEpisodeScript(
  _event: any,
  episodeScriptId: string,
): Promise<IpcResponse> {
  try {
    const ds = getDataSource()
    if (!ds) return { success: false, error: '数据库未初始化' }
    const svc = new SceneScriptService(ds)
    const report = await svc.validateEpisodeCompleteness(episodeScriptId)
    return { success: true, data: report }
  } catch (e: any) {
    return { success: false, error: e?.message || '剧本校验失败' }
  }
}
