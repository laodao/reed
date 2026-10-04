/**
 * 业务包子系统装配入口（双端共用）
 * @module core/packs/kernel
 * @description 照 workflow-boot 模板：Electron 与 Web 启动序列各调一次 initPackSubsystem()：
 *              建注册表 → 注册内置包（manifest fail-fast）→ 物化快照 →
 *              恢复启用态 → 接 IPC 守卫。模块级单例 + getPackSubsystem() 未初始化抛错。
 *
 *              挂点：Electron src/electron/index.ts 与 Web src/web/server/index.ts
 *              各加一行调用（workflow 子系统初始化之前——包内核不依赖 workflow，
 *              反而后续 P4 业务包的 activate 会复用 workflow 等设施，故放其前）。
 *
 *              失败不致命：宿主调用处 try/catch（与 VoiceCloneJobScheduler 同策略），
 *              包内核故障不阻断应用启动；但仓储缺失等装配错误本函数直接抛（fail-fast，
 *              避免 as any 掩盖 null 至首个调用才崩）。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import { createBootTrace } from '@core/utils/boot-trace'
import { PackRegistry, type PackDefinition } from './registry'
import { PackService } from './pack.service'
import { bindPackGuardResolver } from './ipc-guard'

const logger = createLogger('PackKernel')

/** 子系统单例（boot 后可用；未 boot 时 getter 抛错提示） */
export interface PackSubsystem {
  registry: PackRegistry
  service: PackService
}

let subsystem: PackSubsystem | null = null

/**
 * 初始化业务包子系统（幂等；重复调用返回既有实例）。
 * 必须在数据库管理器注册之后调用。
 * @param builtinPacks 内置包定义清单（见 ./builtin-packs；现有业务在 P4 逐批迁移接入）
 */
export async function initPackSubsystem(builtinPacks: PackDefinition[] = []): Promise<PackSubsystem> {
  if (subsystem) return subsystem

  // 分段计时：包内核装配是启动关键路径上的同步工作，需知道每个包与每个阶段各占多久
  const trace = createBootTrace('PackKernel.init')

  const db = getCoreDatabaseManager()
  if (!db.packs || !db.packBindings) {
    throw new Error('业务包数据仓库未初始化（数据库管理器缺少 packs/packBindings 仓库）')
  }

  // 1. 注册内置包（manifest 非法 / 重复 / 依赖成环 → 抛 PackManifestError，fail-fast）
  const registry = new PackRegistry()
  for (const def of builtinPacks) {
    await registry.registerPack(def)
    trace.mark(`register:${def.manifest.id}`)
  }

  // 2. 物化快照（business_packs 幂等 UPSERT by manifest_hash）
  const service = new PackService({ packs: db.packs, packBindings: db.packBindings, registry })
  try {
    await service.materializeSnapshot()
  } catch (e) {
    logger.error('[pack-kernel] 内置包快照物化失败（继续启动，启用解析将退化为 manifest 默认）', e)
  }
  trace.mark('materializeSnapshot')

  // 3. 恢复启用态：全局解析链（binding 全局行 ?? record.enabled ?? manifest.defaultEnabled ?? true）
  for (const def of registry.listDefinitions()) {
    try {
      const enabled = await service.resolveEnabled(def.manifest.id, null)
      await registry.setEnabled(def.manifest.id, enabled)
    } catch (e) {
      logger.error(`[pack-kernel] 包 "${def.manifest.id}" 启用态恢复失败（保持 manifest 默认）`, e)
    }
    trace.mark(`resolveEnabled:${def.manifest.id}`)
  }

  // 4. 接 IPC 守卫：channel 前缀归属 + 启用态裁决（bridge-adapter 注册点已包 guardIpcHandler）
  bindPackGuardResolver((channel) => {
    const owner = registry.getChannelOwner(channel)
    if (!owner) return null // 归属未知 → 放行
    return { packId: owner, state: registry.getPackState(owner) }
  })
  trace.mark('bindGuard')

  subsystem = { registry, service }
  logger.info(`[pack-kernel] 业务包子系统已启动（${builtinPacks.length} 个内置包）`)
  trace.report(undefined, 30)
  return subsystem
}

/** 取子系统（未初始化抛错——IPC 层据此返回明确错误） */
export function getPackSubsystem(): PackSubsystem {
  if (!subsystem) {
    throw new Error('业务包子系统未初始化（initPackSubsystem 未调用）')
  }
  return subsystem
}

/** 测试/关停用：清空单例并解绑 IPC 守卫 */
export function resetPackSubsystem(): void {
  bindPackGuardResolver(null)
  subsystem = null
}
