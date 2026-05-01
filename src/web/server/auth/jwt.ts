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
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: TOKEN_TTL_SECONDS })
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as any
    if (decoded && typeof decoded.userId === 'string') {
      return { userId: decoded.userId, email: decoded.email ?? '' }
    }
    return null
  } catch {
    return null
  }
}

export const JWT_COOKIE_NAME = 'tb_session'
export const JWT_TTL_SECONDS = TOKEN_TTL_SECONDS
