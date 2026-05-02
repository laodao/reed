/**
 * Web 端 E2E - API 桥与 WebSocket 健康检查
 * @description 不通过 UI，单独验证 web-server 暴露的关键 API 路径与权限。
 */

import { test, expect } from '@playwright/test'
import { loginViaApi, invokeIpc, invokeIpcUnwrap, WEB_API_BASE } from './helpers/auth'

test.describe('Web 端 - API 桥', () => {
  test('未授权时 IPC 桥返回 401/403', async ({ request }) => {
    const resp = await request.post(`${WEB_API_BASE}/api/ipc/settings:get`, {
      headers: { 'Content-Type': 'application/json', Cookie: '' },
      data: { args: [] },
    })
    expect([401, 403]).toContain(resp.status())
  })

  test('登录后 IPC settings:get 返回 ok=true', async ({ page }) => {
    await loginViaApi(page)
    const env = await invokeIpc(page.context().request, 'settings:get')
    expect(env.ok).toBe(true)
  })

  test('登录后 IPC role:list 可调用', async ({ page }) => {
    await loginViaApi(page)
    const data = await invokeIpcUnwrap<unknown[]>(
      page.context().request,
      'role:list',
    )
    expect(Array.isArray(data)).toBe(true)
  })

  test('登录后 IPC search-engine:templates 返回模板数组', async ({ page }) => {
    await loginViaApi(page)
    const data = await invokeIpcUnwrap<unknown[]>(
      page.context().request,
      'search-engine:templates',
    )
    expect(Array.isArray(data)).toBe(true)
  })

  test('登录后 IPC api-key:list 可调用', async ({ page }) => {
    await loginViaApi(page)
    const data = await invokeIpcUnwrap<unknown[]>(
      page.context().request,
      'api-key:list',
    )
    expect(Array.isArray(data)).toBe(true)
  })

  test('未知 channel 应返回 ok=false 或 500', async ({ page }) => {
    await loginViaApi(page)
    const resp = await page.context().request.post(
      `${WEB_API_BASE}/api/ipc/this-channel-does-not-exist:foo`,
      { data: { args: [] }, headers: { 'Content-Type': 'application/json' } },
    )
    if (resp.status() === 200) {
      const body = await resp.json()
      expect(body.ok).toBe(false)
    } else {
      expect(resp.status()).toBeGreaterThanOrEqual(400)
    }
  })
})
