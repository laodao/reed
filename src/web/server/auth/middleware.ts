/**
 * Express 鉴权中间件
 * @module web/server/auth/middleware
 */

import type { Request, Response, NextFunction } from 'express'
import { JWT_COOKIE_NAME, verifyToken, type TokenPayload } from './jwt'

declare module 'express-serve-static-core' {
  interface Request {
    user?: TokenPayload
  }
}

/**
 * 解析 cookie 中的 JWT，把 user 信息放到 req.user。
 * 鉴权失败不直接拒绝，留给路由级 requireAuth 决定。
 */
export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[JWT_COOKIE_NAME]
  if (typeof token === 'string' && token.length > 0) {
    const payload = verifyToken(token)
    if (payload) req.user = payload
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
