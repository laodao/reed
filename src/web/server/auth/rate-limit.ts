/**
 * 轻量内存限流中间件（多租户复核修复 P1-15）
 * @module web/server/auth/rate-limit
 * @description 固定窗口计数器（按 IP）。注册/登录是完全开放的入口，此前无任何
 *              限流——匿名可批量开户 / 无限撞库。不引第三方依赖（express-rate-limit），
 *              单进程内存版对单实例部署足够；多实例部署需换 Redis。
 */

import type { Request, Response, NextFunction } from 'express'

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/** 周期性清理过期桶，防止 Map 无限增长 */
const CLEANUP_INTERVAL_MS = 10 * 60_000
let lastCleanup = Date.now()

export interface RateLimitOptions {
  /** 窗口时长（毫秒） */
  windowMs: number
  /** 窗口内最大请求数 */
  max: number
  /** 命中限流时的提示语 */
  message?: string
}

export function rateLimit(opts: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now()

    if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
      for (const [k, b] of buckets) {
        if (b.resetAt <= now) buckets.delete(k)
      }
      lastCleanup = now
    }

    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown'
    const key = `${ip}:${req.path}`
    const bucket = buckets.get(key)

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs })
      next()
      return
    }

    bucket.count++
    if (bucket.count > opts.max) {
      const retrySec = Math.ceil((bucket.resetAt - now) / 1000)
      res.status(429).json({
        ok: false,
        error: `${opts.message ?? '请求过于频繁'}，请 ${retrySec} 秒后重试`,
      })
      return
    }
    next()
  }
}
