/**
 * 认证路由
 * @module web/server/auth/routes
 */

import { Router, type Request, type Response } from 'express'
import bcrypt from 'bcryptjs'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { JWT_COOKIE_NAME, JWT_TTL_SECONDS, signToken } from './jwt'
import { requireAuth } from './middleware'

const router = Router()

/**
 * 注册
 * POST /api/auth/register { email, password, displayName? }
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, displayName } = req.body ?? {}
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ ok: false, error: '邮箱和密码必填' })
      return
    }
    if (password.length < 6) {
      res.status(400).json({ ok: false, error: '密码至少 6 位' })
      return
    }
    const db = getCoreDatabaseManager()
    if (!db.users) {
      res.status(500).json({ ok: false, error: '数据库未初始化' })
      return
    }
    const existing = await db.users.getByEmail(email)
    if (existing) {
      res.status(409).json({ ok: false, error: '该邮箱已注册' })
      return
    }
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await db.users.create({
      email,
      displayName,
      passwordHash,
      role: 'user',
    })
    const token = signToken({ userId: user.id, email: user.email })
    setSessionCookie(res, token)
    res.json({ ok: true, data: { id: user.id, email: user.email, displayName: user.displayName } })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

/**
 * 登录
 * POST /api/auth/login { email, password }
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body ?? {}
    if (!email || !password) {
      res.status(400).json({ ok: false, error: '邮箱和密码必填' })
      return
    }
    const db = getCoreDatabaseManager()
    if (!db.users) {
      res.status(500).json({ ok: false, error: '数据库未初始化' })
      return
    }
    const user = await db.users.getByEmail(email)
    if (!user || !user.passwordHash) {
      res.status(401).json({ ok: false, error: '邮箱或密码错误' })
      return
    }
    const match = await bcrypt.compare(password, user.passwordHash)
    if (!match) {
      res.status(401).json({ ok: false, error: '邮箱或密码错误' })
      return
    }
    if (!user.isActive) {
      res.status(403).json({ ok: false, error: '账号已停用' })
      return
    }
    await db.users.updateLastLogin(user.id)
    const token = signToken({ userId: user.id, email: user.email })
    setSessionCookie(res, token)
    res.json({
      ok: true,
      data: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

/**
 * 退出
 * POST /api/auth/logout
 */
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie(JWT_COOKIE_NAME)
  res.json({ ok: true })
})

/**
 * 当前登录用户
 * GET /api/auth/me
 */
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const db = getCoreDatabaseManager()
    if (!db.users) {
      res.status(500).json({ ok: false, error: '数据库未初始化' })
      return
    }
    const user = await db.users.getById(req.user!.userId)
    if (!user) {
      res.status(404).json({ ok: false, error: '用户不存在' })
      return
    }
    res.json({
      ok: true,
      data: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

function setSessionCookie(res: Response, token: string): void {
  res.cookie(JWT_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: JWT_TTL_SECONDS * 1000,
    path: '/',
  })
}

export default router
