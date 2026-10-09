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
import { defaultIcRepos } from '../services/ic-defaults'
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

/** 来源行附带的统一资产概要（审阅台展示文件类型/大小；多模态 M1） */
export interface IcAssetSummary {
  name: string
  kind: string
  mimeType: string | null
  sizeBytes: number | null
}

/**
 * 给来源行补 asset 概要（assets 表里查；服务未装配/单卡失败时降级为 null，不阻断列表）。
 * IcSourceRow.assetId 由多模态 M1 建卡回写；webpage 来源恒为 null。
 */
async function attachAssetSummaries<T extends { assetId?: string | null }>(
  rows: T[],
): Promise<Array<T & { asset: IcAssetSummary | null }>> {
  const withNull = (r: T): T & { asset: IcAssetSummary | null } => ({ ...r, asset: null })
  const ids = [...new Set(rows.map(r => r.assetId).filter((v): v is string => !!v))]
  if (ids.length === 0) return rows.map(withNull)
  let svc: { getAsset(id: string): Promise<{ name: string; kind: string; mimeType?: string | null; sizeBytes?: number | null } | null> }
  try {
    svc = (await import('@core/platform/assets/asset-registry')).getAssetService()
  } catch {
    return rows.map(withNull) // 资产服务未装配（Web 端/测试环境）
  }
  const map = new Map<string, IcAssetSummary>()
  for (const id of ids) {
    try {
      const rec = await svc.getAsset(id)
      if (rec) map.set(id, { name: rec.name, kind: rec.kind, mimeType: rec.mimeType ?? null, sizeBytes: rec.sizeBytes ?? null })
    } catch {
      /* 单卡失败跳过 */
    }
  }
  return rows.map(r => ({ ...r, asset: (r.assetId && map.get(r.assetId)) || null }))
}

let collection: IcCollectionService | null = null

/** 服务惰性构造（首次调用时装配生产缺省；activate 早于 db boot） */
function services(): IcCollectionService {
  if (!collection) {
    collection = new IcCollectionService({
      repos: defaultIcRepos, // 仓储缺省必须显式接上（2026-10-08 实测：漏传导致界面全通道报"数据库尚未就绪"）
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
  // runTask 返回的 done 是 Promise（供测试/服务调用方等待）——**不能过 IPC**（结构化克隆不支持），
  // 通道只回 taskId；界面进度走 listTasks 轮询。2026-10-08 真机验收发现：原样透传导致
  // 「开始搜集」按钮必然报 "An object could not be cloned"。
  ipcBridge.handle('ic:run-task', (_e: unknown, p: { projectId: string }) =>
    wrap(async () => {
      const { taskId } = await s().runTask(p.projectId)
      return { taskId }
    }),
  )
  ipcBridge.handle('ic:list-tasks', (_e: unknown, p: { projectId: string }) => wrap(() => s().listTasks(p.projectId)))
  // 手动触发裁决（转载簇/冲突归因/孤证；任务结束会自动跑一次，失败可在此重跑）
  ipcBridge.handle('ic:adjudicate', (_e: unknown, p: { projectId: string }) => wrap(() => s().adjudicateProject(p.projectId)))
  // 生成整理报告（要点卡反查校验/数据表/时间线/引用清单/质量报告 + 第二模型审；入项目 kb）
  ipcBridge.handle('ic:generate-report', (_e: unknown, p: { projectId: string }) => wrap(() => s().generateReport(p.projectId)))

  // ---- 源与行（审阅工作台数据源） ----
  ipcBridge.handle('ic:list-sources', (_e: unknown, p: { projectId: string; reviewStatus?: 'staged' | 'confirmed' | 'rejected' | 'merged' }) =>
    wrap(async () => attachAssetSummaries(await s().listSources(p.projectId, p.reviewStatus))),
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
