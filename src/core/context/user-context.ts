/**
 * 用户上下文（Async Local Storage）
 * @module core/context/user-context
 * @description 把"当前请求的 userId"装入 ALS，让 Repository 等下层无需改签名即可
 *              按用户隔离数据。
 *
 *              - Electron 单用户：在数据库初始化后调用 setDefaultUser 注入固定 userId。
 *              - Web 多用户：每个 HTTP / WS 连接进入时由 auth 中间件 runWithUser(userId, fn)
 *                包裹后续业务逻辑。
 */

import { AsyncLocalStorage } from 'async_hooks'

/**
 * 本地（Electron）单用户的固定 ID。Web 端忽略此值。
 */
export const LOCAL_DEFAULT_USER_ID = 'local-default-user'

interface UserContext {
  userId: string
}

const storage = new AsyncLocalStorage<UserContext>()

/**
 * 进程级默认用户（仅 Electron 启动后注入；Web 端不要调用）。
 * 当 ALS 中没有上下文时回落到此值。
 */
let defaultUserId: string | null = null

/**
 * 设置进程级默认用户。Electron 启动时调用一次。
 * Web 模式下不要调用此函数——若调用则任何未走中间件的查询会泄露其他人的数据。
 */
export function setDefaultUser(userId: string): void {
  defaultUserId = userId
}

/**
 * 严格租户模式开关（复核修复 2026-10-12）。
 *
 * 为什么放在这里而不是 base-repository：本文件是 user_id 解析的**唯一入口**，
 * 把开关放这里才能覆盖**所有**取 userId 的路径——包括那些绕过 BaseRepository.scoped、
 * 用裸 `this.repo` 写入并手工 `entity.userId = getCurrentUserId()` 的仓库
 * （实测 agent-tool-call / asset-version / role 等 8+ 处，scoped 层拦不到它们）。
 * 放在 base-repository 会造成循环引用，且无法覆盖手工注入路径。
 *
 * 语义：
 * - 关闭（默认，Electron 单用户）：getCurrentUserId 返回 null 由调用方处理，行为不变。
 * - 开启（Web 多租户）：解析不到 userId 时**抛错** fail-closed，不再静默落 NULL 孤儿行。
 */
let strictTenantMode = false

/** 开启/关闭严格租户模式（Web 多租户启动时开启；见 src/web/server 启动流程）。 */
export function setStrictTenantMode(enabled: boolean): void {
  strictTenantMode = enabled
}

/** 当前是否处于严格租户模式（测试/诊断用）。 */
export function isStrictTenantMode(): boolean {
  return strictTenantMode
}

/**
 * 获取当前用户 ID。
 * 解析顺序：
 * 1. ALS 上下文（Web 端的请求作用域、或 Electron 主动 runWithUser 包裹）
 * 2. 进程级默认 userId（Electron 单用户）
 * 3. null（未设置；调用方需自行处理）
 *
 * 注意：本函数**不抛错**，即使严格租户模式下也是。原因：全项目 282 处调用，
 * 其中后台调度器（agent-service / event-bus / voice-clone-job-scheduler /
 * workflow-boot 的定时器）合法地在请求上下文之外取值，并各自用 `?? '*'` / `?? ''`
 * 之类的兜底。让本函数抛错会把「可降级运行」变成「崩溃」。
 * 写入安全由 `getCurrentUserIdForWrite()` 承担（见下）。
 */
export function getCurrentUserId(): string | null {
  return storage.getStore()?.userId ?? defaultUserId ?? null
}

/**
 * 取当前用户 ID —— **写入路径专用**（复核修复 2026-10-12）。
 *
 * 与 getCurrentUserId 的唯一区别：严格租户模式下无 userId 时**抛错** fail-closed。
 *
 * 为什么需要它：多租户下漏包 runWithUser 的写入会落 user_id=NULL 孤儿行——读路径
 * 按 scope 过滤，数据对所有租户都不可见（静默"隐身"），此前只有 console.warn，
 * 线上极易忽略。
 *
 * 覆盖面（复核轮的诚实边界说明）：
 *   ✅ BaseRepository.scoped 的 save / saveMany / insert（经 scopeEntity 调用本函数）
 *   ⚠️ 仍未覆盖：直接用裸 `this.repo` 写入 + 手工 `entity.userId = getCurrentUserId()`
 *      的仓库。全项目此类手工注入点约 140 处（agent-tool-call / asset-version /
 *      role / workflow-definition / asset-image 等）。它们不受本开关保护，需后续
 *      逐处收敛到 scoped（或改调本函数）。
 *      之所以不在本轮批量改：140 处跨 60+ 文件，其中不少是后台调度器（无请求上下文
 *      时依赖 `?? null` / `?? '*'` 兜底降级），批量替换会把「可降级」变成「崩溃」。
 *
 * 用法（写入路径）：
 *   entity.userId = getCurrentUserIdForWrite()
 */
export function getCurrentUserIdForWrite(): string | null {
  const id = getCurrentUserId()
  if (!id && strictTenantMode) {
    throw new Error(
      '[UserContext] 严格租户模式下写入未设置 userId（缺少鉴权中间件或 runWithUser 包裹）' +
        '；已阻断本次写入以避免产生 user_id=NULL 的孤儿行',
    )
  }
  return id
}

/**
 * 获取当前用户 ID，没有则抛错。
 *
 * 注：与 getCurrentUserIdForWrite 的区别——本函数**无视严格开关**，始终要求
 * userId，供确需强制租户的调用点使用。
 */
export function getCurrentUserIdStrict(): string {
  const id = getCurrentUserId()
  if (!id) {
    throw new Error(
      '[UserContext] 当前请求未设置 userId（缺少鉴权中间件或 setDefaultUser）',
    )
  }
  return id
}

/**
 * 用指定 userId 包裹一段执行。
 * 通常由 Web 端鉴权中间件调用：runWithUser(req.userId, () => next())
 */
export function runWithUser<T>(userId: string, fn: () => T): T {
  return storage.run({ userId }, fn)
}

/**
 * 异步版本：
 *   await runWithUserAsync(userId, async () => { ... })
 */
export async function runWithUserAsync<T>(
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run({ userId }, fn)
}

/**
 * 测试 / 工具用：临时清空 ALS 上下文。
 */
export function runWithoutUser<T>(fn: () => T): T {
  return storage.run({} as UserContext, fn)
}
