/**
 * Web 端限流中间件单测（review M1 回归）
 *
 * 背景：桶 key 原为 `${ip}:${req.path}`（原始路径），Express 默认大小写不敏感 +
 * 非严格路由下 /login、/login/、/Login 命中同一路由却各自成桶，登录/注册限流
 * 可被路径变体击穿。修复后用路由模板（req.route.path）作 key。
 */
import { describe, it, expect, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { rateLimit } from '../../../../src/web/server/auth/rate-limit'

interface FakeReqInit {
  ip?: string
  path: string
  routePath?: string
}

function fakeReq({ ip = '1.2.3.4', path, routePath }: FakeReqInit): Request {
  return {
    ip,
    socket: { remoteAddress: ip },
    path,
    ...(routePath !== undefined ? { route: { path: routePath } } : {})
  } as unknown as Request
}

function fakeRes() {
  const status = vi.fn().mockReturnThis()
  const json = vi.fn().mockReturnThis()
  return { status, json, mockStatus: status, mockJson: json } as unknown as Response & {
    mockStatus: ReturnType<typeof vi.fn>
    mockJson: ReturnType<typeof vi.fn>
  }
}

function run(limiter: ReturnType<typeof rateLimit>, req: Request): Response {
  const res = fakeRes()
  limiter(req, res, (() => {}) as NextFunction)
  return res
}

describe('rateLimit 桶 key 用路由模板（M1）', () => {
  it('同一 IP 的 /login、/login/、/Login 变体共享同一个桶', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 2, message: '太频繁' })

    // 路由级中间件场景：req.route.path 恒为注册模板 '/login'
    const r1 = run(limiter, fakeReq({ path: '/login', routePath: '/login' }))
    const r2 = run(limiter, fakeReq({ path: '/login/', routePath: '/login' }))
    const r3 = run(limiter, fakeReq({ path: '/Login', routePath: '/login' }))

    expect((r1 as any).mockStatus).not.toHaveBeenCalledWith(429)
    expect((r2 as any).mockStatus).not.toHaveBeenCalledWith(429)
    // 第 3 次命中同一路由桶（max=2）→ 429；修复前三个变体各自成桶不会触发
    expect((r3 as any).mockStatus).toHaveBeenCalledWith(429)
  })

  it('不同 IP 各自成桶', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1, message: '太频繁' })
    const a1 = run(limiter, fakeReq({ ip: '1.1.1.1', path: '/login', routePath: '/login' }))
    const b1 = run(limiter, fakeReq({ ip: '2.2.2.2', path: '/login', routePath: '/login' }))
    expect((a1 as any).mockStatus).not.toHaveBeenCalledWith(429)
    expect((b1 as any).mockStatus).not.toHaveBeenCalledWith(429)
  })

  it('不同路由仍是独立桶', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1, message: '太频繁' })
    const login = run(limiter, fakeReq({ ip: '3.3.3.3', path: '/login', routePath: '/login' }))
    const register = run(limiter, fakeReq({ ip: '3.3.3.3', path: '/register', routePath: '/register' }))
    expect((login as any).mockStatus).not.toHaveBeenCalledWith(429)
    expect((register as any).mockStatus).not.toHaveBeenCalledWith(429)
  })

  it('无 route 信息（app 级挂载兜底）退回 req.path，窗口过期后桶重置', () => {
    const limiter = rateLimit({ windowMs: 20, max: 1, message: '太频繁' })
    const r1 = run(limiter, fakeReq({ ip: '4.4.4.4', path: '/x' }))
    const r2 = run(limiter, fakeReq({ ip: '4.4.4.4', path: '/x' }))
    expect((r1 as any).mockStatus).not.toHaveBeenCalledWith(429)
    expect((r2 as any).mockStatus).toHaveBeenCalledWith(429)
    // 窗口（20ms）过后重置
    return new Promise((resolve) => setTimeout(resolve, 30)).then(() => {
      const r3 = run(limiter, fakeReq({ ip: '4.4.4.4', path: '/x' }))
      expect((r3 as any).mockStatus).not.toHaveBeenCalledWith(429)
    })
  })
})
