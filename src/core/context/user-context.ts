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
 * 获取当前用户 ID。
 * 解析顺序：
 * 1. ALS 上下文（Web 端的请求作用域、或 Electron 主动 runWithUser 包裹）
 * 2. 进程级默认 userId（Electron 单用户）
 * 3. null（未设置；调用方需自行处理）
 */
export function getCurrentUserId(): string | null {
  return storage.getStore()?.userId ?? defaultUserId ?? null
}

/**
 * 获取当前用户 ID，没有则抛错。
 * Repository 在严格模式下应使用此函数（防止数据越权）。
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
