/**
 * 爬取礼貌调度器（抓取类节点共享工具，节点内显式调用——非引擎逻辑）
 * @module core/platform/workflow/nodes/http-politeness
 * @description 供全部 HTTP 抓取类节点（crawl-news / crawl-links / web-extract）共用的
 *              抓取调度：按 host（网站域名）串行 + 请求前随机间隔，避免对同一网站
 *              并发打爆、降低被反爬拦截概率。
 *
 *              - 这是**节点侧的共享执行工具**：由各节点在自己的 execute 里显式调用
 *                politeFetch（替代全局 fetch），引擎（调度/执行器）不感知也不介入
 *              - 同 host 并发受限（默认 1 = 同站单线程），不同 host 互不影响
 *              - 每次请求前随机等待 [delayMsMin, delayMsMax]（默认 WORKFLOW_DEFAULTS）
 *              - 队列跨节点共享（同一运行内 crawl-news 与 crawl-links 抓同站也会互相等待）
 *              - 参数走标准配置链：节点 config 覆盖 → WORKFLOW_DEFAULTS 默认 → WORKFLOW_LIMITS 上限
 */

import { WORKFLOW_DEFAULTS, WORKFLOW_LIMITS } from '@shared/types/workflow.types'
import { validateOutboundUrl } from '@core/utils/outbound-url'

/** 重定向逐跳上限（与 http-fetch executeHttpFetch 同款收口——review B1：
 *  redirect:'follow' 会对 302 目标自动重连，攻击页可跳内网/云元数据） */
const MAX_REDIRECTS = 5

/** 单 host 并发信号量（并发槽位） */
class HostThrottle {
  private slots: number
  private readonly waiters: Array<() => void> = []

  constructor(slots: number) {
    this.slots = slots
  }

  /** 占一个并发槽（满则排队等待） */
  async acquire(): Promise<void> {
    if (this.slots > 0) {
      this.slots--
      return
    }
    await new Promise<void>(resolve => this.waiters.push(resolve))
  }

  /** 释放槽位（唤醒下一个等待者） */
  release(): void {
    const next = this.waiters.shift()
    if (next) next()
    else this.slots++
  }
}

/** host → 节流器（模块级共享：一次进程内所有抓取统一按站限速） */
const throttles = new Map<string, HostThrottle>()

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))

/** 爬取礼貌参数（节点 config 可覆盖；缺省走 WORKFLOW_DEFAULTS） */
export interface PolitenessOptions {
  /** 随机间隔下限（毫秒；0 = 不等待） */
  delayMsMin?: number
  /** 随机间隔上限（毫秒；0 = 不等待） */
  delayMsMax?: number
  /** 同一 host 最大并发（默认 1 = 同站单线程；上限 WORKFLOW_LIMITS.crawlHostConcurrency） */
  hostConcurrency?: number
}

/**
 * 礼貌抓取：同 host 排队（默认单线程）+ 请求前随机间隔。
 * 签名与全局 fetch 兼容（url + RequestInit + 可选礼貌参数）。
 * SSRF：入口与每一跳重定向都过 validateOutboundUrl（redirect:'manual'
 * 手动跟随——review B1，URL 可能来自 LLM/模板注入，302 跳内网必须拦截）。
 */
export async function politeFetch(
  url: string,
  init?: RequestInit,
  opts: PolitenessOptions = {},
): Promise<Response> {
  const guard = validateOutboundUrl(url)
  if (!guard.ok) {
    throw new Error(`URL 校验失败：${guard.reason}`)
  }
  const host = hostOf(url)
  const concurrency = Math.min(
    Math.max(1, Math.floor(opts.hostConcurrency ?? WORKFLOW_DEFAULTS.crawlHostConcurrency)),
    WORKFLOW_LIMITS.crawlHostConcurrency,
  )
  let throttle = throttles.get(host)
  if (!throttle) {
    throttle = new HostThrottle(concurrency)
    throttles.set(host, throttle)
  }
  await throttle.acquire()
  try {
    // 随机间隔（每次请求前）
    const min = opts.delayMsMin ?? WORKFLOW_DEFAULTS.crawlDelayMsMin
    const max = Math.min(
      opts.delayMsMax ?? WORKFLOW_DEFAULTS.crawlDelayMsMax,
      WORKFLOW_LIMITS.crawlDelayMsMax,
    )
    if (max > 0 && min >= 0 && max >= min) {
      const ms = min + Math.floor(Math.random() * (max - min + 1))
      await sleep(ms)
    }
    try {
      let current = url
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const res = await fetch(current, { ...init, redirect: 'manual' })
        if (res.status < 300 || res.status >= 400) return res
        const location = res.headers.get('location')
        if (!location) return res
        const next = new URL(location, current).toString()
        const hopGuard = validateOutboundUrl(next)
        if (!hopGuard.ok) {
          throw new Error(`重定向目标被 SSRF 闸门拦截：${hopGuard.reason}`)
        }
        current = next
      }
      throw new Error(`重定向次数超过 ${MAX_REDIRECTS} 跳上限`)
    } catch (e) {
      // 包装网络错误：附 URL + 底层原因（如 DNS/TLS/超时），供节点错误信息与日志排查
      const cause = e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : String(e)
      throw new Error(`请求失败 ${host}（${cause}）`, { cause: e })
    }
  } finally {
    throttle.release()
  }
}

/** 重置所有 host 节流状态（测试用：避免跨用例排队残留） */
export function resetPolitenessThrottles(): void {
  throttles.clear()
}
