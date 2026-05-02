/**
 * Web E2E 公共 helper
 * @module tests/e2e/web/helpers/auth
 * @description 登录、注册、跳转、IPC 调用等通用工具，供各 spec 复用。
 */

import { type Page, type APIRequestContext, expect } from '@playwright/test'

/** 默认测试账号。需要 the_bot_web 库里已有该用户。 */
export const DEFAULT_USER = {
  email: process.env.E2E_WEB_EMAIL ?? 'alice@example.com',
  password: process.env.E2E_WEB_PASSWORD ?? 'password123',
} as const

/** Web 端 API 服务器地址（cookie / IPC 桥所在）。 */
export const WEB_API_BASE = process.env.WEB_API_BASE ?? 'http://localhost:4201'

/** Vite dev 前端地址（含 /#/ 路由）。 */
export const WEB_FRONT_BASE = process.env.WEB_BASE_URL ?? 'http://localhost:5174'

/**
 * 登录（直接调用 /api/auth/login，把 session cookie 注入到 page context）
 * 比走 UI 表单快且稳定，用于不直接测登录表单的 spec。
 */
export async function loginViaApi(
  page: Page,
  email: string = DEFAULT_USER.email,
  password: string = DEFAULT_USER.password,
): Promise<void> {
  const ctx = page.context()
  const resp = await ctx.request.post(`${WEB_API_BASE}/api/auth/login`, {
    data: { email, password },
    headers: { 'Content-Type': 'application/json' },
  })
  expect(resp.status(), `登录失败 status=${resp.status()}`).toBe(200)
  const body = await resp.json()
  expect(body.ok, `登录失败 body=${JSON.stringify(body)}`).toBe(true)
}

/**
 * 通过 UI 登录页面表单登录。仅 auth.spec 使用。
 */
export async function loginViaUI(
  page: Page,
  email: string = DEFAULT_USER.email,
  password: string = DEFAULT_USER.password,
): Promise<void> {
  await page.goto(WEB_FRONT_BASE)
  await page.getByRole('textbox', { name: '邮箱' }).fill(email)
  await page.getByRole('textbox', { name: /密码/ }).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
}

/**
 * 通过 API 登出（清除当前 session cookie）
 */
export async function logoutViaApi(page: Page): Promise<void> {
  await page.context().request.post(`${WEB_API_BASE}/api/auth/logout`).catch(() => {
    /* 忽略 */
  })
}

/**
 * 进入应用内某个 hash 路由，等待页面 ready。
 * - 已登录前提下使用
 * - 通过 hash route 切换避免 reload 闪烁
 */
export async function gotoApp(page: Page, hashPath: string): Promise<void> {
  const url = `${WEB_FRONT_BASE}/#${hashPath.startsWith('/') ? hashPath : `/${hashPath}`}`
  await page.goto(url)
  // main 区域出现即认为外壳渲染完成
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 15_000 })
}

/**
 * web-server IPC 桥的外层响应结构。
 * - ok=true 时 data 是 handler 的原始返回值（可能本身又是 { success, data, error }）
 */
export interface IpcEnvelope<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

/**
 * 通过 web-server 的通用 IPC 桥调用接口。
 * 依赖 page 已经登录（cookie 在 context 里）。
 *
 * 返回外层 envelope。如果 handler 自身又有 { success, data, error } 结构，
 * 调用方需要从 envelope.data 进一步取值。
 */
export async function invokeIpc<T = unknown>(
  request: APIRequestContext,
  channel: string,
  args: unknown[] = [],
): Promise<IpcEnvelope<T>> {
  const resp = await request.post(`${WEB_API_BASE}/api/ipc/${channel}`, {
    data: { args },
    headers: { 'Content-Type': 'application/json' },
  })
  expect(resp.status(), `${channel} HTTP ${resp.status()}`).toBe(200)
  return (await resp.json()) as IpcEnvelope<T>
}

/**
 * 调用 IPC 桥并返回 handler 内层对象（剥掉外层 envelope）。
 * 内层结构由各 handler 自定义，例如：
 * - { success, data, error }（translation:providers）
 * - { success, configs }（provider-config:list）
 * - { success, templates }（provider-template:list）
 * - { success, roles } / { success, voices } / 等
 *
 * 调用方需自己取期望字段。如果内层有 success 字段且为 false，会抛错。
 */
export async function invokeIpcInner<R = Record<string, unknown>>(
  request: APIRequestContext,
  channel: string,
  args: unknown[] = [],
): Promise<R> {
  const env = await invokeIpc<R>(request, channel, args)
  if (!env.ok) throw new Error(`${channel} envelope failed: ${env.error}`)
  const inner = (env.data ?? {}) as R & { success?: boolean; error?: string }
  if (inner && typeof inner === 'object' && inner.success === false) {
    throw new Error(`${channel} inner failed: ${inner.error ?? '(no error)'}`)
  }
  return inner as R
}

/**
 * 兼容旧 API：尝试常见的复数键解包成数组。
 * 对应 handler 返回 { success, data } / { success, items } / { success, configs } 等。
 */
export async function invokeIpcUnwrap<T = unknown>(
  request: APIRequestContext,
  channel: string,
  args: unknown[] = [],
): Promise<T> {
  const inner = (await invokeIpcInner(request, channel, args)) as Record<string, unknown>
  // 优先 data > items > 任意值为数组的键
  if ('data' in inner) return inner.data as T
  if ('items' in inner) return inner.items as T
  for (const k of Object.keys(inner)) {
    if (k === 'success' || k === 'error') continue
    const v = inner[k]
    if (Array.isArray(v) || (v && typeof v === 'object')) return v as T
  }
  return inner as unknown as T
}

/**
 * 等待断言：侧边栏菜单已渲染，主区域出现指定文本。
 */
export async function expectMainVisible(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('main').first()).toBeVisible()
  await expect(page.getByText(text).first()).toBeVisible()
}

/**
 * 收集页面 console 错误，调用方可在测试结束时断言。
 * 过滤已知良性错误（favicon、首次未登录的 401）
 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (/favicon\.ico/.test(text)) return
    if (/\/api\/auth\/me.*401/.test(text)) return
    errors.push(text)
  })
  return errors
}
