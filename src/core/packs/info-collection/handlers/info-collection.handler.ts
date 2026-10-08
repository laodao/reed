/**
 * 信息搜集 IPC 处理器（双端共用：ipcBridge 同时注册 Electron ipcMain 与 Web 路由表）
 * @module core/packs/info-collection/handlers/info-collection.handler
 *
 * ic: 前缀全部通道的薄壳——参数透传 + IpcResponse 包装（dl.handler 同款模式）。
 * 服务实例惰性构造（activate 早于 db boot，不能在 activate 里拿 db 单例）。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { createLogger } from '@core/utils/logger'
import type { IpcResponse } from '@shared/types/ipc.types'
import type { IcBlueprint } from '@shared/types/info-collection.types'
import { checkBlueprint } from '@shared/utils/info-collection-blueprint'
import { draftBlueprint } from '../services/ic-blueprint.service'
import { IcCollectionService } from '../services/ic-collection.service'
import { IcSnapshotFileStore } from '../services/ic-snapshot-store'

const logger = createLogger('IcHandlers')

function friendlyError(msg: string): string {
  if (/UNIQUE constraint failed|duplicate key value/i.test(msg)) return '这条数据已存在，已跳过重复写入'
  if (/FOREIGN KEY constraint failed/i.test(msg)) return '关联的数据不存在，操作未完成'
  if (/SQLITE_|better-sqlite3|TypeORM|QueryFailedError/i.test(msg)) return '内部数据处理出错，请重试（详情见日志）'
  if (/ECONNREFUSED|ETIMEDOUT|fetch failed|socket hang up/i.test(msg)) return '外部服务连接失败，请检查网络或资料源后重试'
  return msg
}

async function wrap<T>(fn: () => Promise<T>): Promise<IpcResponse<T>> {
  try {
    return { success: true, data: await fn() }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const stack = e instanceof Error && e.stack ? `\n${e.stack}` : ''
    logger.warn(`[ic] handler 失败：${msg}${stack}`)
    return { success: false, error: friendlyError(msg) }
  }
}

let collection: IcCollectionService | null = null

/** 服务惰性构造（首次调用时装配生产缺省；activate 早于 db boot） */
function services(): IcCollectionService {
  if (!collection) {
    collection = new IcCollectionService({
      // 生产快照落盘（<dataPath>/info-collection/snapshots/；web 端无 dataPath 时自动降级跳过）
      snapshotStore: new IcSnapshotFileStore(),
    })
  }
  return collection
}

/** 测试注入点：替换服务实例（生产恒为 null → 惰性构造） */
export function setIcCollectionServiceForTests(service: IcCollectionService | null): void {
  collection = service
}

let registered = false

/** ic: 全通道注册（pack activate 时调用；幂等） */
export function registerInfoCollectionHandlers(): void {
  if (registered) return
  registered = true
  const s = (): IcCollectionService => services()

  // ---- 项目与蓝图 ----
  ipcBridge.handle('ic:create-project', (_e: unknown, p: { name: string; goal: string; mode?: 'quick' | 'review' }) =>
    wrap(() => s().createProject(p)),
  )
  ipcBridge.handle('ic:draft-blueprint', (_e: unknown, p: { goal: string }) => wrap(() => draftBlueprint(p.goal)))
  ipcBridge.handle('ic:check-blueprint', (_e: unknown, p: { blueprint: IcBlueprint }) =>
    wrap(async () => checkBlueprint(p.blueprint)),
  )
  ipcBridge.handle('ic:confirm-blueprint', (_e: unknown, p: { projectId: string }) =>
    wrap(() => s().confirmBlueprint(p.projectId)),
  )
  ipcBridge.handle('ic:list-projects', (_e: unknown, p?: { status?: 'active' | 'archived' }) =>
    wrap(() => s().listProjects(p?.status)),
  )
  ipcBridge.handle('ic:get-project', (_e: unknown, p: { id: string }) => wrap(() => s().getProject(p.id)))
  ipcBridge.handle('ic:set-project-kb', (_e: unknown, p: { id: string; kbId: string | null }) =>
    wrap(() => s().setProjectKb(p.id, p.kbId)),
  )

  // ---- 任务 ----
  ipcBridge.handle('ic:run-task', (_e: unknown, p: { projectId: string }) => wrap(() => s().runTask(p.projectId)))
  ipcBridge.handle('ic:list-tasks', (_e: unknown, p: { projectId: string }) => wrap(() => s().listTasks(p.projectId)))
  // 手动触发裁决（转载簇/冲突归因/孤证；任务结束会自动跑一次，失败可在此重跑）
  ipcBridge.handle('ic:adjudicate', (_e: unknown, p: { projectId: string }) => wrap(() => s().adjudicateProject(p.projectId)))

  // ---- 源与行（审阅工作台数据源） ----
  ipcBridge.handle('ic:list-sources', (_e: unknown, p: { projectId: string; reviewStatus?: 'staged' | 'confirmed' | 'rejected' | 'merged' }) =>
    wrap(() => s().listSources(p.projectId, p.reviewStatus)),
  )
  ipcBridge.handle('ic:list-rows', (_e: unknown, p: { projectId: string; schemaId?: string; status?: 'draft' | 'confirmed' | 'superseded' | 'stale' }) =>
    wrap(() => s().listRows(p.projectId, p)),
  )
  ipcBridge.handle('ic:confirm-batch', (_e: unknown, p: { projectId: string; sourceIds: string[] }) =>
    wrap(() => s().confirmBatch(p.projectId, p.sourceIds)),
  )
  ipcBridge.handle('ic:reject-batch', (_e: unknown, p: { projectId: string; sourceIds: string[]; reason?: string }) =>
    wrap(() => s().rejectBatch(p.projectId, p.sourceIds, p.reason)),
  )
}
