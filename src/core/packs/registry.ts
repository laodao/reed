/**
 * 业务包注册表（纯内存核心，不依赖 DB，便于单测）
 * @module core/packs/registry
 * @description 内核三纪律的内存侧实现（见 shared/types/pack.types.ts 头部）：
 *              1. effect 可逆：activate 每个贡献注册返回 disposer，禁用 = 逆操作栈 LIFO 反序执行；
 *              2. 依赖未就绪 = pending：依赖上线自动激活、下线自动回 pending（级联重算）；
 *              3. schema 即校验器：registerPack 先 validatePackManifest，非法/重复/成环 fail-fast。
 *
 *              持久化（快照 UPSERT / 启用态 binding）在 pack.service.ts，本模块只管内存状态机。
 */

import { createLogger } from '@core/utils/logger'
import {
  PackManifestError,
  validatePackManifest,
  type PackInfo,
  type PackManifest,
  type PackState,
} from '@shared/types/pack.types'

const logger = createLogger('PackRegistry')

/** 单个贡献注册的逆操作 */
export type PackDisposer = () => void | Promise<void>

/** activate 的返回形态：void / 单个 disposer / disposer 数组（每个贡献注册收集一个） */
export type PackActivateResult = void | PackDisposer | PackDisposer[]

/**
 * 包激活上下文（本期最小集：标识 + 日志）。
 * 后续分期按需扩展（服务访问器、配置等），包只消费内核公开接缝。
 */
export interface PackContext {
  packId: string
  logger: ReturnType<typeof createLogger>
}

/** 包定义：声明式 manifest + 代码形态贡献（activate 注册贡献并返回 disposer） */
export interface PackDefinition {
  manifest: PackManifest
  activate?: (ctx: PackContext) => PackActivateResult | Promise<PackActivateResult>
}

interface PackEntry {
  def: PackDefinition
  /** 期望启用态（用户/管理员开关的解析结果；缺省 manifest.defaultEnabled ?? true） */
  desiredEnabled: boolean
  state: PackState
  /** 激活期收集的 disposer 栈（禁用时 LIFO 反序执行） */
  disposers: PackDisposer[]
  /** 导致 pending 的未就绪依赖（state='pending' 时有值） */
  missingDependencies: string[]
}

export class PackRegistry {
  private readonly entries = new Map<string, PackEntry>()

  /**
   * 注册包（fail-fast：manifest 非法 / 重复注册 / 依赖成环 → 抛 PackManifestError，不入表）。
   * 注册后全量级联重算：依赖未就绪 → pending；依赖已启用且自身期望启用 → 立即激活。
   */
  async registerPack(def: PackDefinition): Promise<void> {
    validatePackManifest(def.manifest)
    const id = def.manifest.id
    if (this.entries.has(id)) {
      throw new PackManifestError(`包 "${id}" 重复注册`, id)
    }
    this.entries.set(id, {
      def,
      desiredEnabled: def.manifest.defaultEnabled ?? true,
      state: 'registered',
      disposers: [],
      missingDependencies: [],
    })
    try {
      this.topoOrder() // 成环检查（只沿已注册集合内的依赖边）
    } catch (e) {
      this.entries.delete(id) // 回滚：成环的注册不入表
      throw e
    }
    await this.recompute()
  }

  /** 切换期望启用态并级联重算（禁用 → disposer 栈 LIFO 执行；启用 → 拓扑序激活） */
  async setEnabled(packId: string, enabled: boolean): Promise<void> {
    const entry = this.mustGet(packId)
    entry.desiredEnabled = enabled
    await this.recompute()
  }

  /** 查包状态；未注册抛 PackManifestError（fail-fast，调用方据此区分"未登记"与"禁用"） */
  getPackState(packId: string): PackState {
    return this.mustGet(packId).state
  }

  /** 全量包信息（PackInfo.enabled = 运行时生效态 state==='enabled'；持久化语义由 service 层叠加） */
  listPacks(): PackInfo[] {
    return [...this.entries.values()].map((e) => this.toPackInfo(e))
  }

  /** 全量包定义（service 层物化快照用） */
  listDefinitions(): PackDefinition[] {
    return [...this.entries.values()].map((e) => e.def)
  }

  /** 取 manifest；未注册抛 PackManifestError */
  getManifest(packId: string): PackManifest {
    return this.mustGet(packId).def.manifest
  }

  /**
   * IPC 守卫用：channel 前缀归属裁决（manifest.contributions.ipcChannelPrefixes，
   * 最长前缀优先）。归属未知（任何包都未声明前缀）→ null，守卫放行。
   */
  getChannelOwner(channel: string): string | null {
    let owner: string | null = null
    let ownerPrefixLen = -1
    for (const e of this.entries.values()) {
      for (const prefix of e.def.manifest.contributions?.ipcChannelPrefixes ?? []) {
        if (channel.startsWith(prefix) && prefix.length > ownerPrefixLen) {
          owner = e.def.manifest.id
          ownerPrefixLen = prefix.length
        }
      }
    }
    return owner
  }

  // ==================== 内部：状态机 ====================

  /**
   * 全量级联重算（注册 / setEnabled 后调用）：
   * 1. 拓扑序求目标状态（依赖先于依赖方求值，pending 沿依赖链传导）
   * 2. 逆拓扑序停用（依赖方先于依赖下线，避免依赖方短暂调用到已下线的依赖）
   * 3. 拓扑序激活（依赖先于依赖方上线）
   */
  private async recompute(): Promise<void> {
    const order = this.topoOrder()
    const targets = new Map<string, { state: PackState; missing: string[] }>()
    for (const id of order) {
      const entry = this.entries.get(id)!
      if (!entry.desiredEnabled) {
        targets.set(id, { state: 'disabled', missing: [] })
        continue
      }
      // 依赖未注册 / 未启用 → 未就绪（纪律 2：pending，不是 failed）
      const missing = (entry.def.manifest.dependencies ?? []).filter((depId) => {
        const depTarget = targets.get(depId)
        return !depTarget || depTarget.state !== 'enabled'
      })
      targets.set(id, { state: missing.length > 0 ? 'pending' : 'enabled', missing })
    }

    // 2. 逆拓扑序停用
    for (const id of [...order].reverse()) {
      const entry = this.entries.get(id)!
      const target = targets.get(id)!
      if (entry.state === 'enabled' && target.state !== 'enabled') {
        await this.deactivate(id, entry)
      }
      if (target.state !== 'enabled') {
        entry.state = target.state
        entry.missingDependencies = target.missing
      }
    }

    // 3. 拓扑序激活
    for (const id of order) {
      const entry = this.entries.get(id)!
      const target = targets.get(id)!
      if (target.state !== 'enabled') continue // pass 2 已落目标态
      if (entry.state === 'enabled') {
        entry.missingDependencies = []
        continue
      }
      // 激活前按依赖的"实际运行时状态"复查：依赖激活失败（failed）会沿链传导为 pending，
      // 而不是带着未就绪的依赖强行激活
      const runtimeMissing = (entry.def.manifest.dependencies ?? []).filter(
        (depId) => this.entries.get(depId)!.state !== 'enabled',
      )
      if (runtimeMissing.length > 0) {
        entry.state = 'pending'
        entry.missingDependencies = runtimeMissing
        continue
      }
      await this.activate(id, entry)
      if (entry.state === 'enabled') {
        entry.missingDependencies = []
      }
    }
  }

  /** 激活：调 activate 收集 disposer（压栈顺序 = 注册顺序；禁用 LIFO 弹出） */
  private async activate(id: string, entry: PackEntry): Promise<void> {
    const ctx: PackContext = { packId: id, logger: createLogger(`Pack:${id}`) }
    try {
      const result = await entry.def.activate?.(ctx)
      entry.disposers = normalizeDisposers(result)
      entry.state = 'enabled'
      logger.info(`[pack-registry] 包 "${id}" 已激活（${entry.disposers.length} 个贡献）`)
    } catch (e) {
      // 激活异常：标 failed（依赖方视角 = 未启用 → pending）；下次重算仍会重试
      entry.state = 'failed'
      entry.disposers = []
      logger.error(`[pack-registry] 包 "${id}" 激活失败`, e)
    }
  }

  /** 停用：disposer 栈 LIFO 反序执行（纪律 1），单个 disposer 异常不阻断后续 */
  private async deactivate(id: string, entry: PackEntry): Promise<void> {
    const disposers = entry.disposers.splice(0).reverse()
    for (const dispose of disposers) {
      try {
        await dispose()
      } catch (e) {
        logger.error(`[pack-registry] 包 "${id}" 的 disposer 执行异常（继续执行其余逆操作）`, e)
      }
    }
    logger.info(`[pack-registry] 包 "${id}" 已停用（${disposers.length} 个逆操作已执行）`)
  }

  /**
   * 拓扑排序（Kahn，依赖先于依赖方）；只沿已注册集合内的依赖边走。
   * 成环 → 抛 PackManifestError（registerPack 据此回滚）。
   */
  private topoOrder(): string[] {
    const indegree = new Map<string, number>()
    const dependents = new Map<string, string[]>()
    for (const [id, e] of this.entries) {
      indegree.set(id, 0)
      for (const dep of e.def.manifest.dependencies ?? []) {
        if (!this.entries.has(dep)) continue // 未注册依赖：pending 语义，不参与成环判定
        indegree.set(id, (indegree.get(id) ?? 0) + 1)
        const list = dependents.get(dep) ?? []
        list.push(id)
        dependents.set(dep, list)
      }
    }
    const queue = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id)
    const order: string[] = []
    while (queue.length > 0) {
      const id = queue.shift()!
      order.push(id)
      for (const next of dependents.get(id) ?? []) {
        const d = indegree.get(next)! - 1
        indegree.set(next, d)
        if (d === 0) queue.push(next)
      }
    }
    if (order.length !== this.entries.size) {
      const cyclic = [...indegree.entries()].filter(([, d]) => d > 0).map(([id]) => id)
      throw new PackManifestError(`检测到循环依赖：${cyclic.join(' → ')}`, cyclic[0])
    }
    return order
  }

  private mustGet(packId: string): PackEntry {
    const entry = this.entries.get(packId)
    if (!entry) throw new PackManifestError(`包 "${packId}" 未注册`, packId)
    return entry
  }

  private toPackInfo(e: PackEntry): PackInfo {
    const m = e.def.manifest
    return {
      id: m.id,
      name: m.name,
      version: m.version,
      description: m.description,
      state: e.state,
      enabled: e.state === 'enabled',
      dependencies: m.dependencies ?? [],
      ...(e.state === 'pending' ? { missingDependencies: e.missingDependencies } : {}),
    }
  }
}

function normalizeDisposers(result: PackActivateResult | undefined): PackDisposer[] {
  if (!result) return []
  return Array.isArray(result) ? result : [result]
}
