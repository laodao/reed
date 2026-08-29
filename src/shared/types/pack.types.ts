/**
 * 业务包（Business Pack）领域类型定义
 * @module shared/types/pack
 * @description 包内核（core/packs）、前端装配（renderer/packs）、IPC 三方共用的契约。
 *
 *              设计来源：tasks/2026-08-28-agent-loop-harness/18-business-pack.md，
 *              本期为第一期裁剪版——只实现"已有基础设施承载的子集"：
 *              元信息、依赖声明、启用/禁用、贡献点（IPC/路由/菜单）。
 *              工具白名单、规则集、质量策略、记忆命名空间等字段位预留在
 *              contributions 扩展中，待对应设施（14/15/17 号设计）落地后启用。
 *
 *              ⚠️ 三条设计纪律（cordis 评估吸收，见 20-cordis-evaluation.md §4）：
 *              1. effect 带逆操作：包的每个贡献注册必须返回 disposer，
 *                 禁用 = 逆操作栈反序执行，回到"未注册态"。
 *              2. 依赖未就绪 = pending（不是 failed）：依赖上线自动激活，
 *                 下线自动停用回 pending。
 *              3. schema 即校验器：validatePackManifest 在注册期 fail-fast，
 *                 非法 manifest 不得进入注册表。
 */

// ==================== 清单 ====================

/** 包 id 合法字符集：小写字母/数字/中划线，字母开头（与 LLM 工具名规范兼容） */
export const PACK_ID_REGEX = /^[a-z][a-z0-9-]*$/

/**
 * 包清单（声明式，可 JSON 序列化）。
 * 代码形态的贡献（handler 注册函数、路由组件等）不进清单，
 * 由包模块在注册时随清单一并交给内核。
 */
export interface PackManifest {
  /** 全局唯一 id，匹配 PACK_ID_REGEX；同时是 IPC channel 前缀、记忆命名空间前缀的基址 */
  id: string
  /** 显示名（菜单/管理界面用） */
  name: string
  /** 语义化版本 */
  version: string
  description?: string
  /** 依赖的其他包 id；依赖未启用时本包处于 pending（纪律 2） */
  dependencies?: string[]
  /** 未配置 binding 时的默认启用态（缺省 true） */
  defaultEnabled?: boolean
  /** 声明式贡献点（本期实现的子集） */
  contributions?: {
    /** 本包拥有的 IPC channel 前缀列表（如 ['diary:']），供 IPC 守卫按前缀裁决 */
    ipcChannelPrefixes?: string[]
    /** 本包贡献的前端路由 path 列表（元数据；实际 RouteRecordRaw 由前端包模块提供） */
    routePaths?: string[]
  }
}

// ==================== 状态 ====================

/**
 * 包状态机：
 *   registered ─依赖就绪且启用→ enabled
 *   registered ─依赖未就绪→ pending ─依赖就绪且启用→ enabled
 *   enabled ⇄ disabled（用户/管理员切换）
 *   任何注册期校验失败 → failed（注册即抛错，不入表）
 */
export type PackState = 'registered' | 'pending' | 'enabled' | 'disabled' | 'failed'

// ==================== 持久化记录 ====================

/** business_packs 表行（内置包快照，UPSERT by manifest_hash 幂等） */
export interface PackRecord {
  packId: string
  name: string
  version: string
  manifestJson: string
  manifestHash: string
  /** 本期恒为 'builtin'；第三方包留待后续 */
  source: 'builtin'
  /** 持久化的全局启用态（binding 解析的兜底） */
  enabled: boolean
  createdAt: string
  updatedAt: string
}

/** business_pack_bindings 表行（per-user 覆写；userId NULL = 全局默认行） */
export interface PackBindingRecord {
  packId: string
  userId: string | null
  enabled: boolean
  configJson: string | null
  createdAt: string
  updatedAt: string
}

// ==================== IPC ====================

/** pack:* IPC 命名空间的请求/响应契约 */
export interface PackInfo {
  id: string
  name: string
  version: string
  description?: string
  state: PackState
  enabled: boolean
  dependencies: string[]
  /** 导致 pending 的未就绪依赖（state='pending' 时有值） */
  missingDependencies?: string[]
}

/** 禁用包的 IPC 调用统一错误码（IPC 守卫返回） */
export const PACK_DISABLED_ERROR_CODE = 'PACK_DISABLED'

// ==================== 校验器（纪律 3：注册期 fail-fast） ====================

export class PackManifestError extends Error {
  constructor(
    message: string,
    readonly packId?: string
  ) {
    super(message)
    this.name = 'PackManifestError'
  }
}

/**
 * 校验包清单，非法即抛 PackManifestError（fail-fast）。
 * 只校验声明式内容；依赖存在性由注册表在装配期检查（需要全量包集合）。
 */
export function validatePackManifest(manifest: PackManifest): void {
  if (!manifest || typeof manifest !== 'object') {
    throw new PackManifestError('manifest 必须是对象')
  }
  const { id, name, version, dependencies, contributions } = manifest
  if (!id || typeof id !== 'string') {
    throw new PackManifestError('manifest.id 缺失或不是字符串')
  }
  if (!PACK_ID_REGEX.test(id)) {
    throw new PackManifestError(`manifest.id "${id}" 非法：须匹配 ${PACK_ID_REGEX}`, id)
  }
  if (!name || typeof name !== 'string') {
    throw new PackManifestError(`包 "${id}" 缺少 name`, id)
  }
  if (!version || typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new PackManifestError(`包 "${id}" 的 version 须为 x.y.z 语义化版本，当前: "${version}"`, id)
  }
  if (dependencies !== undefined) {
    if (!Array.isArray(dependencies) || dependencies.some((d) => typeof d !== 'string' || !PACK_ID_REGEX.test(d))) {
      throw new PackManifestError(`包 "${id}" 的 dependencies 须为合法包 id 数组`, id)
    }
    if (dependencies.includes(id)) {
      throw new PackManifestError(`包 "${id}" 不能依赖自身`, id)
    }
  }
  if (contributions?.ipcChannelPrefixes !== undefined) {
    const prefixes = contributions.ipcChannelPrefixes
    if (!Array.isArray(prefixes) || prefixes.some((p) => typeof p !== 'string' || !p.endsWith(':'))) {
      throw new PackManifestError(`包 "${id}" 的 ipcChannelPrefixes 须为以 ":" 结尾的字符串数组`, id)
    }
  }
  if (contributions?.routePaths !== undefined) {
    const paths = contributions.routePaths
    if (!Array.isArray(paths) || paths.some((p) => typeof p !== 'string' || !p.startsWith('/'))) {
      throw new PackManifestError(`包 "${id}" 的 routePaths 须为以 "/" 开头的字符串数组`, id)
    }
  }
}
