/**
 * Express 鉴权中间件
 * @module web/server/auth/middleware
 */

import type { Request, Response, NextFunction } from 'express'
import { JWT_COOKIE_NAME, verifyToken, type TokenPayload } from './jwt'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'

declare module 'express-serve-static-core' {
  interface Request {
    user?: TokenPayload
  }
}

/**
 * 解析 cookie 中的 JWT，把 user 信息放到 req.user。
 * 鉴权失败不直接拒绝，留给路由级 requireAuth 决定。
 *
 * 多租户加固：token 验签通过后回查用户表——被删除/停用的账号在 token
 * 存活期内立即失效（此前 isActive 仅在登录时检查，停用后 7 天内仍可访问）；
 * 角色以 DB 为准（避免旧 token 携带过期 role 提权）。
 * 用户表不可用时降级为纯 token 身份（fail-open 仅限基础设施故障窗口）。
 */
export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[JWT_COOKIE_NAME]
  if (typeof token === 'string' && token.length > 0) {
    const payload = verifyToken(token)
    if (payload) {
      try {
        const db = getCoreDatabaseManager()
        const user = db.users ? await db.users.getById(payload.userId) : null
        if (user && user.isActive) {
          req.user = { ...payload, role: user.role }
        }
        // 用户不存在 / 已停用 → 不挂 user，等同未登录
      } catch (e) {
        console.warn('[auth] 用户表回查失败，降级为 token 身份:', e)
        req.user = payload
      }
    }
  }
  next()
}

/**
 * 严格鉴权：未登录返回 401。
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ ok: false, error: '未登录' })
    return
  }
  next()
}

/**
 * 管理员鉴权：登录且 role === 'admin'（Web 多租户下的管理面门槛；
 * Electron 单用户默认账号即为 admin，不受影响）。
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ ok: false, error: '未登录' })
    return
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ ok: false, error: '需要管理员权限' })
    return
  }
  next()
}
