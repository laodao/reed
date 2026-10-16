/**
 * JWT 工具
 * @module web/server/auth/jwt
 */

import jwt from 'jsonwebtoken'

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days

let secret: string | null = null

export function configureJwtSecret(s: string): void {
  secret = s
}

function getSecret(): string {
  if (!secret) {
    throw new Error('[JWT] secret 未配置；请在启动时调用 configureJwtSecret(...)')
  }
  return secret
}

export interface TokenPayload {
  userId: string
  email: string
  /** 角色快照（login/register 时刻）；管理面权限以 attachUser 的 DB 回查为准 */
  role?: string
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: TOKEN_TTL_SECONDS })
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as any
    if (decoded && typeof decoded.userId === 'string') {
      return { userId: decoded.userId, email: decoded.email ?? '', role: decoded.role }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Session cookie 名。默认 'tb_session'，可通过 `JWT_COOKIE_NAME` 环境变量覆盖。
 *
 * 同机并存多套部署（如本地 dev + Docker staging）时，浏览器按 domain（不含 port）
 * 隔离 cookie：localhost:5174 和 localhost:4291 共用同一份 cookie。如果两边都用
 * 默认名 'tb_session' + 不同 JWT_SECRET，登录一边就会让另一边的 cookie 失效（验签失败）。
 * 给本地 dev 设 `JWT_COOKIE_NAME=tb_session_dev` 即可让两套环境互不踢线。
 */
export const JWT_COOKIE_NAME = process.env.JWT_COOKIE_NAME ?? 'tb_session'
export const JWT_TTL_SECONDS = TOKEN_TTL_SECONDS
